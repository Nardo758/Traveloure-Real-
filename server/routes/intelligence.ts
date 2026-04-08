import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { eq, and, or, like, sql, desc, count, ne, inArray, isNotNull, asc, gte, lte } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { amadeusService } from "../services/amadeus.service";
import { viatorService } from "../services/viator.service";
import { cacheService } from "../services/cache.service";
import { claudeService } from "../services/claude.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService, type SocialFeedPost } from "../services/grok.service";
import { feverService } from "../services/fever.service";
import { feverCacheService } from "../services/fever-cache.service";
import { coordinationService } from "../services/coordination.service";
import { vendorManagementService } from "../services/vendor-management.service";
import { budgetService } from "../services/budget.service";
import { aiUsageService } from "../services/ai-usage.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "../utils/data-sanitizer";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "../services/transport-leg-calculator";
import { buildGoogleNavUrl, buildAppleNavUrl } from "../services/maps-url-builder";
import { generateKml } from "../services/kml-generator";
import { generateGpx } from "../services/gpx-generator";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "../infrastructure";
import { 
  users, helpGuideTrips, touristPlaceResults, touristPlacesSearches, 
  aiBlueprints, vendors, insertVendorSchema,
  insertLocalExpertFormSchema, insertServiceProviderFormSchema,
  insertProviderServiceSchema, insertServiceCategorySchema,
  insertServiceSubcategorySchema, insertFaqSchema,
  insertServiceTemplateSchema, insertServiceBookingSchema, insertServiceReviewSchema,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  userExperienceItems, userExperiences, providerServices, cartItems, trips,
  serviceBookings, serviceReviews, notifications, wallets, creditTransactions, serviceProviderForms,
  insertCustomVenueSchema, insertGeneratedItinerarySchema,
  insertTemporalAnchorSchema, insertDayBoundarySchema, insertEnergyTrackingSchema,
  temporalAnchors, itineraryItems, generatedItineraries,
  userAndExpertChats, insertUserAndExpertChatSchema,
  expertPayouts, providerPayouts, platformSettings,
  expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow,
  transportLegs, sharedItineraries, mapsExportCache, expertUpdatedItineraries,
  accessAuditLogs, contentRegistry,
  hotelCache, hotelOfferCache, feverEventCache,
  activityCache, safetyCache
} from "@shared/schema";
import { 
  insertTripParticipantSchema, 
  insertVendorContractSchema, 
  insertTripTransactionSchema,
  insertItineraryItemSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema
} from "@shared/schema";
import { api } from "@shared/routes";
import Stripe from "stripe";
import { verifyTripOwnership, logItineraryChange, sanitizeInput, sanitizeObject, mapFeverCategoryToEventType, requireAdmin, checkAIRateLimit } from "./route-utils";
import { travelPulseService } from "../services/travelpulse.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "../services/routes.service";
import { itineraryIntelligenceService } from "../services/itinerary-intelligence.service";
import { emergencyService } from "../services/emergency.service";
import { experienceCatalogService } from "../services/experience-catalog.service";
import { opportunityEngineService } from "../services/opportunity-engine.service";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "../itinerary-optimizer";
import { travelPulseScheduler } from "../services/travelpulse-scheduler.service";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Module-scoped caches for Live tab social feeds (persist across requests, survive route re-registration)
const _socialFeedCacheGlobal = new Map<string, { data: SocialFeedPost[]; expiresAt: number }>();

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(2000),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
});

export function registerIntelligenceRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/destination-calendar/countries", async (req, res) => {
    try {
      const countries = await storage.getCalendarCountries();
      res.json(countries);
    } catch (err) {
      console.error("Error fetching calendar countries:", err);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  app.get("/api/destination-calendar/events", async (req, res) => {
    try {
      const country = req.query.country as string;
      const city = req.query.city as string | undefined;
      
      if (!country) {
        return res.status(400).json({ message: "Country is required" });
      }
      
      const events = await storage.getApprovedDestinationEvents(country, city);
      res.json(events);
    } catch (err) {
      console.error("Error fetching destination events:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.get("/api/destination-calendar/seasons", async (req, res) => {
    try {
      const country = req.query.country as string;
      const city = req.query.city as string | undefined;
      
      if (!country) {
        return res.status(400).json({ message: "Country is required" });
      }
      
      const seasons = await storage.getDestinationSeasons(country, city);
      res.json(seasons);
    } catch (err) {
      console.error("Error fetching destination seasons:", err);
      res.status(500).json({ message: "Failed to fetch seasons" });
    }
  });

  app.get("/api/destination-calendar/my-events", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const events = await storage.getContributorDestinationEvents(userId);
      res.json(events);
    } catch (err) {
      console.error("Error fetching contributor events:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/destination-calendar/events", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.createDestinationEvent({
        ...req.body,
        contributorId: userId,
        status: "draft",
        sourceType: "manual"
      });
      res.json(event);
    } catch (err) {
      console.error("Error creating destination event:", err);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  app.put("/api/destination-calendar/events/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.getDestinationEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.contributorId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this event" });
      }
      if (event.status !== "draft" && event.status !== "rejected") {
        return res.status(400).json({ message: "Can only update draft or rejected events" });
      }

      const updated = await storage.updateDestinationEvent(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating destination event:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.post("/api/destination-calendar/events/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.getDestinationEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.contributorId !== userId) {
        return res.status(403).json({ message: "Not authorized to submit this event" });
      }
      if (event.status !== "draft" && event.status !== "rejected") {
        return res.status(400).json({ message: "Can only submit draft or rejected events" });
      }

      const submitted = await storage.submitDestinationEvent(req.params.id);
      res.json(submitted);
    } catch (err) {
      console.error("Error submitting destination event:", err);
      res.status(500).json({ message: "Failed to submit event" });
    }
  });

  app.delete("/api/destination-calendar/events/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const event = await storage.getDestinationEventById(req.params.id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.contributorId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this event" });
      }
      if (event.status === "approved") {
        return res.status(400).json({ message: "Cannot delete approved events" });
      }

      await storage.deleteDestinationEvent(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting destination event:", err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  app.get("/api/recommendations/expert", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const limit = parseInt(req.query.limit as string) || 10;
      
      // Get expert's profile to find their markets/destinations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      const expertCity = expertProfile?.city;
      
      // Build cities list from expert's markets
      const cities = expertDestinations.length > 0 
        ? expertDestinations 
        : expertCity ? [expertCity] : [];
      
      if (cities.length === 0) {
        return res.json({ 
          recommendations: [],
          message: "Set your destination markets in your expert profile to receive recommendations" 
        });
      }

      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      const recommendations = await serviceRecommendationEngine.getExpertRecommendations(userId, cities, limit);
      
      res.json({ recommendations });
    } catch (err) {
      console.error("Error fetching expert recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.get("/api/recommendations/provider", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const limit = parseInt(req.query.limit as string) || 10;
      
      // Get provider's service locations
      const services = await storage.getProviderServicesByStatus(userId);
      const locations = Array.from(new Set(services.map(s => s.location).filter((l): l is string => Boolean(l))));
      const location = locations[0] || (req.query.city as string);
      
      if (!location) {
        return res.json({ 
          recommendations: [],
          message: "Create a service or specify a city to receive recommendations" 
        });
      }

      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      const recommendations = await serviceRecommendationEngine.getProviderRecommendations(userId, location, limit);
      
      res.json({ recommendations, location });
    } catch (err) {
      console.error("Error fetching provider recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.get("/api/recommendations/user", async (req, res) => {
    try {
      const city = req.query.city as string | undefined;
      const experienceType = req.query.experienceType as string | undefined;
      const preferences = req.query.preferences ? (req.query.preferences as string).split(",") : undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const userId = (req.user as any)?.claims?.sub || "anonymous";
      
      // If no city provided, return trending destinations as recommendations
      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      
      if (!city) {
        // Return general trending recommendations without city filter
        const recommendations = await serviceRecommendationEngine.getTrendingRecommendations(experienceType, limit);
        return res.json({ recommendations, message: "Showing trending destinations" });
      }

      const recommendations = await serviceRecommendationEngine.getUserRecommendations(
        userId, 
        city, 
        preferences || (experienceType ? [experienceType] : undefined), 
        limit
      );
      
      res.json({ recommendations, city });
    } catch (err) {
      console.error("Error fetching user recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.get("/api/recommendations/market-intelligence/:city", async (req, res) => {
    try {
      const { city } = req.params;
      
      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      const intelligence = await serviceRecommendationEngine.getMarketIntelligence(city);
      
      res.json(intelligence);
    } catch (err) {
      console.error("Error fetching market intelligence:", err);
      res.status(500).json({ message: "Failed to fetch market intelligence" });
    }
  });

  app.get("/api/recommendations/seasonal/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      
      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      const opportunities = await serviceRecommendationEngine.getSeasonalOpportunities(city, month);
      
      res.json({ opportunities, city, month: month || new Date().getMonth() + 1 });
    } catch (err) {
      console.error("Error fetching seasonal opportunities:", err);
      res.status(500).json({ message: "Failed to fetch seasonal opportunities" });
    }
  });

  app.post("/api/recommendations/refresh/:city", isAuthenticated, async (req, res) => {
    try {
      const { city } = req.params;
      const country = req.query.country as string;
      
      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      const count = await serviceRecommendationEngine.refreshDemandSignalsForCity(city);
      
      res.json({ message: `Generated ${count} demand signals for ${city}`, count });
    } catch (err) {
      console.error("Error refreshing demand signals:", err);
      res.status(500).json({ message: "Failed to refresh demand signals" });
    }
  });

  app.post("/api/recommendations/:id/convert", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any).claims.sub;
      
      // Validate request body
      const conversionSchema = z.object({
        conversionType: z.string().min(1, "Conversion type is required"),
        resultId: z.string().optional(),
        revenueGenerated: z.number().optional(),
      });
      
      const validatedBody = conversionSchema.safeParse(req.body);
      if (!validatedBody.success) {
        return res.status(400).json({ message: "Invalid request body", errors: validatedBody.error.errors });
      }
      
      const { conversionType, resultId, revenueGenerated } = validatedBody.data;
      
      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      await serviceRecommendationEngine.recordConversion(id, userId, conversionType, resultId, revenueGenerated);
      
      res.json({ message: "Conversion recorded" });
    } catch (err) {
      console.error("Error recording conversion:", err);
      res.status(500).json({ message: "Failed to record conversion" });
    }
  });

  app.post("/api/recommendations/:id/dismiss", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      await serviceRecommendationEngine.dismissRecommendation(id);
      
      res.json({ message: "Recommendation dismissed" });
    } catch (err) {
      console.error("Error dismissing recommendation:", err);
      res.status(500).json({ message: "Failed to dismiss recommendation" });
    }
  });

  app.get("/api/travelpulse/trending/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const trending = await travelPulseService.getTrendingDestinations(city, limit);
      res.json({ trending, city, count: trending.length });
    } catch (error: any) {
      console.error("Error fetching trending destinations:", error);
      res.status(500).json({ message: "Failed to fetch trending destinations", error: error.message });
    }
  });

  app.post("/api/travelpulse/truth-check", async (req, res) => {
    try {
      const { query, city } = req.body;
      
      if (!query) {
        return res.status(400).json({ message: "Query is required" });
      }
      
      const result = await travelPulseService.getTruthCheck(query, city);
      res.json(result);
    } catch (error: any) {
      console.error("Error performing truth check:", error);
      res.status(500).json({ message: "Failed to perform truth check", error: error.message });
    }
  });

  app.get("/api/travelpulse/destination/:city/:name", async (req, res) => {
    try {
      const { city, name } = req.params;
      
      const intelligence = await travelPulseService.getDestinationIntelligence(
        decodeURIComponent(name),
        city
      );
      res.json(intelligence);
    } catch (error: any) {
      console.error("Error fetching destination intelligence:", error);
      res.status(500).json({ message: "Failed to fetch destination intelligence", error: error.message });
    }
  });

  app.get("/api/travelpulse/livescore/:city/:entity", async (req, res) => {
    try {
      const { city, entity } = req.params;
      
      const liveScore = await travelPulseService.getLiveScore(
        decodeURIComponent(entity),
        city
      );
      res.json(liveScore);
    } catch (error: any) {
      console.error("Error fetching LiveScore:", error);
      res.status(500).json({ message: "Failed to fetch LiveScore", error: error.message });
    }
  });

  app.get("/api/travelpulse/calendar/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const startDate = new Date(req.query.startDate as string || new Date());
      const endDate = new Date(req.query.endDate as string || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
      
      const events = await travelPulseService.getCalendarEvents(city, startDate, endDate);
      res.json({ events, city, startDate, endDate });
    } catch (error: any) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar events", error: error.message });
    }
  });

  app.get("/api/travelpulse/help-decide", async (req, res) => {
    try {
      const { query, city } = req.query;
      
      if (!query) {
        return res.status(400).json({ message: "Query parameter is required" });
      }
      
      const truthCheck = await travelPulseService.getTruthCheck(query as string, city as string);
      res.json({
        question: query,
        answer: truthCheck,
        timestamp: new Date(),
      });
    } catch (error: any) {
      console.error("Error in help-decide:", error);
      res.status(500).json({ message: "Failed to process query", error: error.message });
    }
  });

  app.get("/api/travelpulse/cities", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const cities = await travelPulseService.getTrendingCities(limit);
      res.json({ cities, count: cities.length });
    } catch (error: any) {
      console.error("Error fetching trending cities:", error);
      res.status(500).json({ message: "Failed to fetch trending cities", error: error.message });
    }
  });

  app.get("/api/travelpulse/cities/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      const intelligence = await travelPulseService.getCityIntelligence(cityName);
      
      if (!intelligence) {
        return res.status(404).json({ message: "City not found" });
      }

      // LiveScore enrichment: boost trendingScore based on persisted Instagram hashtag volume
      // Volume is written to DB when Live tab fetches Instagram feed; max +5 points bonus
      // Wrapped in try/catch so city detail never 500s if instagram_city_cache table is missing
      try {
        const cacheKey = cityName.toLowerCase().replace(/\s+/g, "-");
        const volume = await storage.getInstagramVolume(cacheKey);
        if (volume > 0 && intelligence.city) {
          const volumeBonus = Math.min(5, Math.floor(volume / 3));
          return res.json({
            ...intelligence,
            city: {
              ...intelligence.city,
              trendingScore: Math.min(100, (intelligence.city.trendingScore || 0) + volumeBonus),
              instagramVolume: volume,
            },
          });
        }
      } catch (volumeErr: any) {
        // Non-fatal — city data still returned without volume enrichment
        console.warn("Instagram volume enrichment skipped:", volumeErr?.message);
      }

      res.json(intelligence);
    } catch (error: any) {
      console.error("Error fetching city intelligence:", error);
      res.status(500).json({ message: "Failed to fetch city intelligence", error: error.message });
    }
  });

  app.get("/api/travelpulse/cities/:cityName/hidden-gems", async (req, res) => {
    try {
      const { cityName } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      const gems = await travelPulseService.getHiddenGems(cityName, limit);
      res.json({ gems, city: cityName, count: gems.length });
    } catch (error: any) {
      console.error("Error fetching hidden gems:", error);
      res.status(500).json({ message: "Failed to fetch hidden gems", error: error.message });
    }
  });

  app.get("/api/travelpulse/cities/:cityName/activity", async (req, res) => {
    try {
      const { cityName } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const activities = await travelPulseService.getLiveActivity(cityName, limit);
      res.json({ activities, city: cityName, count: activities.length });
    } catch (error: any) {
      console.error("Error fetching live activity:", error);
      res.status(500).json({ message: "Failed to fetch live activity", error: error.message });
    }
  });

  app.get("/api/travelpulse/cities/:cityName/alerts", async (req, res) => {
    try {
      const { cityName } = req.params;
      const alerts = await travelPulseService.getCityAlerts(cityName);
      res.json({ alerts, city: cityName, count: alerts.length });
    } catch (error: any) {
      console.error("Error fetching city alerts:", error);
      res.status(500).json({ message: "Failed to fetch city alerts", error: error.message });
    }
  });

  app.get("/api/travelpulse/cities/:cityName/happening-now", async (req, res) => {
    try {
      const { cityName } = req.params;
      const events = await travelPulseService.getHappeningNow(cityName);
      res.json({ events, city: cityName, count: events.length });
    } catch (error: any) {
      console.error("Error fetching happening now events:", error);
      res.status(500).json({ message: "Failed to fetch happening now events", error: error.message });
    }
  });

  app.get("/api/travelpulse/activity/global", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const activities = await travelPulseService.getGlobalLiveActivity(limit);
      res.json({ activities, count: activities.length });
    } catch (error: any) {
      console.error("Error fetching global activity:", error);
      res.status(500).json({ message: "Failed to fetch global activity", error: error.message });
    }
  });

  app.post("/api/travelpulse/seed", isAuthenticated, async (req, res) => {
    try {
      await travelPulseService.seedTrendingCities();
      res.json({ message: "Cities seeded successfully" });
    } catch (error: any) {
      console.error("Error seeding cities:", error);
      res.status(500).json({ message: "Failed to seed cities", error: error.message });
    }
  });

  app.get("/api/travelpulse/ai/status", requireAdmin, async (req, res) => {
    try {
      const status = travelPulseScheduler.getStatus();
      const citiesNeedingRefresh = await travelPulseService.getCitiesNeedingRefresh();
      res.json({
        scheduler: status,
        citiesNeedingRefresh: citiesNeedingRefresh.length,
        cities: citiesNeedingRefresh.map(c => ({ name: c.cityName, country: c.country, lastAiUpdate: c.aiGeneratedAt })),
      });
    } catch (error: any) {
      console.error("Error getting AI status:", error);
      res.status(500).json({ message: "Failed to get AI status", error: error.message });
    }
  });

  app.post("/api/travelpulse/ai/refresh/:cityName/:country", requireAdmin, checkAIRateLimit, async (req, res) => {
    try {
      const { cityName, country } = req.params;
      
      // Per-city rate limiting check - prevent refresh if city was updated in last hour
      const city = await travelPulseService.getCityByName(cityName);
      if (city?.aiGeneratedAt) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (city.aiGeneratedAt > oneHourAgo) {
          return res.status(429).json({
            message: "City was recently updated. Please wait before refreshing again.",
            lastUpdate: city.aiGeneratedAt,
            nextAllowedRefresh: new Date(city.aiGeneratedAt.getTime() + 60 * 60 * 1000),
          });
        }
      }
      
      const result = await travelPulseScheduler.triggerManualRefresh(cityName, country);
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering AI refresh:", error);
      res.status(500).json({ message: "Failed to trigger AI refresh", error: error.message });
    }
  });

  app.post("/api/travelpulse/ai/refresh-all", requireAdmin, checkAIRateLimit, async (req, res) => {
    try {
      const result = await travelPulseScheduler.triggerManualRefresh();
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering batch AI refresh:", error);
      res.status(500).json({ message: "Failed to trigger batch AI refresh", error: error.message });
    }
  });

  app.get("/api/travelpulse/media/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const { mediaAggregatorService } = await import("../services/media-aggregator.service");
      const media = await mediaAggregatorService.getMediaForCity(cityName, country);
      res.json(media);
    } catch (error: any) {
      console.error("Error getting city media:", error);
      res.status(500).json({ message: "Failed to get city media", error: error.message });
    }
  });

  app.post("/api/travelpulse/media/track-download", async (req, res) => {
    try {
      const { downloadLocationUrl } = req.body;
      
      if (!downloadLocationUrl || typeof downloadLocationUrl !== 'string') {
        return res.status(400).json({ message: "downloadLocationUrl is required" });
      }
      
      // Validate it's an Unsplash URL for security
      if (!downloadLocationUrl.includes('api.unsplash.com')) {
        return res.status(400).json({ message: "Invalid download location URL" });
      }
      
      const { unsplashService } = await import("../services/unsplash.service");
      await unsplashService.trackDownload(downloadLocationUrl);
      
      res.json({ success: true });
    } catch (error: any) {
      // Don't fail the request - tracking is best-effort
      console.error("Error tracking Unsplash download:", error);
      res.json({ success: false, error: error.message });
    }
  });

  app.get("/api/travelpulse/destination-calendar/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const calendarData = await travelPulseService.getFullCalendarData(cityName, country);
      
      res.json({
        city: cityName,
        country,
        ...calendarData
      });
    } catch (error: any) {
      console.error("Error getting destination calendar:", error);
      res.status(500).json({ message: "Failed to get destination calendar", error: error.message });
    }
  });

  app.get("/api/travelpulse/ai-recommendations/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const { month, budget, preferences, limit } = req.query;
      
      const { aiRecommendationEngineService } = await import("../services/ai-recommendation-engine.service");
      
      const recommendations = await aiRecommendationEngineService.getAIEnhancedRecommendations({
        cityName,
        country,
        travelMonth: month ? parseInt(month as string) : undefined,
        budget: budget as "budget" | "mid-range" | "luxury" | undefined,
        preferences: preferences ? (preferences as string).split(",") : undefined,
      }, limit ? parseInt(limit as string) : 20);
      
      res.json(recommendations);
    } catch (error: any) {
      console.error("Error getting AI recommendations:", error);
      res.status(500).json({ message: "Failed to get AI recommendations", error: error.message });
    }
  });

  app.get("/api/travelpulse/event-recommendations/:cityName/:country/:eventId", async (req, res) => {
    try {
      const { cityName, country, eventId } = req.params;
      
      const { aiRecommendationEngineService } = await import("../services/ai-recommendation-engine.service");
      
      const recommendations = await aiRecommendationEngineService.getEventAlignedRecommendations(
        cityName,
        country,
        eventId
      );
      
      if (!recommendations) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      res.json(recommendations);
    } catch (error: any) {
      console.error("Error getting event recommendations:", error);
      res.status(500).json({ message: "Failed to get event recommendations", error: error.message });
    }
  });

  app.get("/api/travelpulse/best-time/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      
      const { aiRecommendationEngineService } = await import("../services/ai-recommendation-engine.service");
      
      const analysis = await aiRecommendationEngineService.getBestTimeRecommendations(cityName, country);
      
      res.json({
        city: cityName,
        country,
        ...analysis
      });
    } catch (error: any) {
      console.error("Error getting best time analysis:", error);
      res.status(500).json({ message: "Failed to get best time analysis", error: error.message });
    }
  });

  app.get("/api/travelpulse/ai/city/:cityName", requireAdmin, async (req, res) => {
    try {
      const { cityName } = req.params;
      const city = await travelPulseService.getCityByName(cityName);
      
      if (!city) {
        return res.status(404).json({ message: "City not found" });
      }

      res.json({
        city,
        aiData: {
          generatedAt: city.aiGeneratedAt,
          sourceModel: city.aiSourceModel,
          bestTimeToVisit: city.aiBestTimeToVisit,
          seasonalHighlights: city.aiSeasonalHighlights,
          upcomingEvents: city.aiUpcomingEvents,
          travelTips: city.aiTravelTips,
          localInsights: city.aiLocalInsights,
          safetyNotes: city.aiSafetyNotes,
          optimalDuration: city.aiOptimalDuration,
          budgetEstimate: city.aiBudgetEstimate,
          mustSeeAttractions: city.aiMustSeeAttractions,
          avoidDates: city.aiAvoidDates,
        },
      });
    } catch (error: any) {
      console.error("Error getting city AI data:", error);
      res.status(500).json({ message: "Failed to get city AI data", error: error.message });
    }
  });

  app.get("/api/travelpulse/global-calendar", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const vibeFilter = req.query.vibe as string;
      const limit = parseInt(req.query.limit as string) || 20;
      
      // Get all cities with their seasonal data for the given month
      const cities = await travelPulseService.getAllCities();
      
      // Get seasonal data for all cities for this month
      const { destinationSeasons, destinationEvents } = await import("@shared/schema");
      const seasonsData = await db
        .select()
        .from(destinationSeasons)
        .where(eq(destinationSeasons.month, month));
      
      // Get upcoming events for this month
      const eventsData = await db
        .select()
        .from(destinationEvents)
        .where(
          and(
            eq(destinationEvents.startMonth, month),
            eq(destinationEvents.status, "approved")
          )
        );
      
      // Create a map of city+country to seasonal data
      const seasonMap = new Map<string, typeof seasonsData[0]>();
      for (const season of seasonsData) {
        const key = `${season.city || ""}-${season.country}`.toLowerCase();
        seasonMap.set(key, season);
      }
      
      // Create a map of city to events
      const eventMap = new Map<string, typeof eventsData>();
      for (const event of eventsData) {
        const key = `${event.city || ""}-${event.country}`.toLowerCase();
        if (!eventMap.has(key)) {
          eventMap.set(key, []);
        }
        eventMap.get(key)!.push(event);
      }
      
      // Combine cities with seasonal data - ONLY include cities that have seasonal data for this month
      const citiesWithSeasons = cities
        .map(city => {
          const key = `${city.cityName}-${city.country}`.toLowerCase();
          const season = seasonMap.get(key);
          const events = eventMap.get(key) || [];
          
          // Skip cities without seasonal data for this month
          if (!season) return null;
          
          return {
            id: city.id,
            cityName: city.cityName,
            country: city.country,
            countryCode: city.countryCode,
            heroImage: city.imageUrl,
            pulseScore: city.pulseScore,
            trendingScore: city.trendingScore,
            vibeTags: city.vibeTags as string[] || [],
            weatherScore: city.weatherScore,
            crowdLevel: city.crowdLevel,
            currentHighlight: city.currentHighlight,
            highlightEmoji: city.highlightEmoji,
            // Seasonal data for this month
            seasonalRating: season.rating,
            weatherDescription: season.weatherDescription,
            averageTemp: season.averageTemp,
            rainfall: season.rainfall,
            seasonCrowdLevel: season.crowdLevel,
            priceLevel: season.priceLevel,
            highlights: season.highlights || [],
            // Events this month
            events: events.map(e => ({
              id: e.id,
              title: e.title,
              eventType: e.eventType,
              description: e.description,
            })),
            // AI data
            aiBestTimeToVisit: city.aiBestTimeToVisit,
            aiBudgetEstimate: city.aiBudgetEstimate as any,
          };
        })
        .filter((city): city is NonNullable<typeof city> => city !== null);
      
      // Filter by vibe if specified (with null-safety)
      let filteredCities = citiesWithSeasons;
      if (vibeFilter && vibeFilter !== "all") {
        filteredCities = citiesWithSeasons.filter(city => {
          const tags = city.vibeTags || [];
          return tags.some((tag: string) => 
            tag && tag.toLowerCase().includes(vibeFilter.toLowerCase())
          );
        });
      }
      
      // Sort by rating priority: best > good > average > avoid
      const ratingOrder: Record<string, number> = {
        "best": 0,
        "excellent": 0,
        "good": 1,
        "average": 2,
        "avoid": 3,
        "poor": 3,
      };
      
      filteredCities.sort((a: typeof citiesWithSeasons[0], b: typeof citiesWithSeasons[0]) => {
        const aRating = ratingOrder[a.seasonalRating] ?? 2;
        const bRating = ratingOrder[b.seasonalRating] ?? 2;
        if (aRating !== bRating) return aRating - bRating;
        // Secondary sort by pulse score
        return (b.pulseScore || 0) - (a.pulseScore || 0);
      });
      
      // Group by rating for easier display
      type CityWithSeason = typeof citiesWithSeasons[0];
      const grouped = {
        best: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "best" || c.seasonalRating === "excellent"),
        good: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "good"),
        average: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "average" || !c.seasonalRating),
        avoid: filteredCities.filter((c: CityWithSeason) => c.seasonalRating === "avoid" || c.seasonalRating === "poor"),
      };
      
      res.json({
        month,
        monthName: new Date(2024, month - 1).toLocaleString("default", { month: "long" }),
        totalCities: filteredCities.length,
        vibeFilter: vibeFilter || null,
        cities: filteredCities.slice(0, limit),
        grouped,
        allEvents: eventsData.map(e => ({
          id: e.id,
          title: e.title,
          eventType: e.eventType,
          city: e.city,
          country: e.country,
          description: e.description,
          specificDate: e.specificDate,
          startMonth: e.startMonth,
          endMonth: e.endMonth,
        })),
      });
    } catch (error: any) {
      console.error("Error getting global calendar:", error);
      res.status(500).json({ message: "Failed to get global calendar", error: error.message });
    }
  });

  app.get("/api/travelpulse/global-events", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const eventType = req.query.eventType as string;
      
      const { destinationEvents } = await import("@shared/schema");
      const currentMonth = new Date().getMonth() + 1;
      
      // Get events from current month onwards
      let query = db.select().from(destinationEvents);
      
      const events = await query;
      
      // Filter to approved events starting from current month
      let filteredEvents = events.filter(e => 
        e.status === "approved" && 
        (e.startMonth ? e.startMonth >= currentMonth : true)
      );
      
      if (eventType && eventType !== "all") {
        filteredEvents = filteredEvents.filter(e => e.eventType === eventType);
      }
      
      // Sort by start month
      filteredEvents.sort((a, b) => (a.startMonth || 12) - (b.startMonth || 12));
      
      res.json({
        total: filteredEvents.length,
        events: filteredEvents.slice(0, limit).map(e => ({
          id: e.id,
          title: e.title,
          description: e.description,
          eventType: e.eventType,
          city: e.city,
          country: e.country,
          startMonth: e.startMonth,
          endMonth: e.endMonth,
          seasonRating: e.seasonRating,
          highlights: e.highlights,
          tips: e.tips,
        })),
      });
    } catch (error: any) {
      console.error("Error getting global events:", error);
      res.status(500).json({ message: "Failed to get global events", error: error.message });
    }
  });

  app.get("/api/travelpulse/enriched/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      if (!cityName) {
        return res.status(400).json({ message: "City name is required" });
      }

      const { contentEnrichmentService } = await import("../services/content-enrichment.service");
      const enrichedContent = await contentEnrichmentService.getEnrichedContentForCity(cityName);

      // Return 200 with empty arrays for consistent empty-state handling
      if (!enrichedContent) {
        return res.json({
          cityName,
          country: "",
          lastUpdated: new Date(),
          restaurants: [],
          attractions: [],
          nightlife: [],
          hiddenGems: [],
          trendingNow: [],
        });
      }

      res.json(enrichedContent);
    } catch (error: any) {
      console.error("Error getting enriched content:", error);
      res.status(500).json({ message: "Failed to get enriched content", error: error.message });
    }
  });

  app.get("/api/travelpulse/serp-search", async (req, res) => {
    try {
      const { query, city, country, type } = req.query;
      if (!city) {
        return res.status(400).json({ message: "City is required" });
      }

      const { serpService } = await import("../services/serp.service");
      let results;
      
      switch (type as string) {
        case "restaurant":
          results = await serpService.searchRestaurants(city as string, country as string || "", query as string);
          break;
        case "nightlife":
          results = await serpService.searchNightlife(city as string, country as string || "");
          break;
        default:
          results = await serpService.searchAttractions(city as string, country as string || "", query as string);
      }

      res.json({ results });
    } catch (error: any) {
      console.error("Error searching SERP:", error);
      res.status(500).json({ message: "Failed to search venues", error: error.message });
    }
  });

  app.get("/api/travelpulse/fever-events/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      const { year, month, limit } = req.query;

      // Find matching Fever city
      const feverCity = feverService.findCity(cityName);
      
      // Get Fever events for this city
      let feverEvents: any[] = [];
      if (feverCity) {
        const currentYear = year ? Number(year) : new Date().getFullYear();
        const currentMonth = month ? Number(month) : new Date().getMonth() + 1;
        
        // Calculate date range for the month (or year if no month specified)
        let startDate: string;
        let endDate: string;
        
        if (month) {
          startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
          const lastDay = new Date(currentYear, currentMonth, 0).getDate();
          endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${lastDay}`;
        } else {
          startDate = `${currentYear}-01-01`;
          endDate = `${currentYear}-12-31`;
        }

        const result = await feverService.searchEvents({
          city: feverCity.code,
          startDate,
          endDate,
          limit: limit ? Number(limit) : 50,
          sortBy: 'date',
        });

        if (result?.events) {
          feverEvents = result.events.map(event => ({
            id: `fever-${event.id}`,
            source: 'fever',
            title: event.title,
            description: event.shortDescription || event.description,
            city: event.city,
            country: event.country,
            eventType: mapFeverCategoryToEventType(event.category),
            specificDate: event.dates.startDate?.split('T')[0],
            startMonth: currentMonth,
            endMonth: currentMonth,
            crowdLevel: 'moderate',
            pricing: event.pricing,
            bookingUrl: event.affiliateUrl || event.bookingUrl,
            imageUrl: event.imageUrl,
            rating: event.rating,
            isFree: event.isFree,
            tags: event.tags,
          }));
        }
      }

      // Get existing TravelPulse destination events for this city
      const existingEvents = await db.select()
        .from(destinationEvents)
        .where(eq(destinationEvents.city, cityName));

      // Merge and deduplicate (prefer Fever events for matching titles)
      const mergedEvents = [...feverEvents];
      for (const event of existingEvents) {
        const isDuplicate = feverEvents.some(
          fe => fe.title.toLowerCase().includes(event.title.toLowerCase()) ||
                event.title.toLowerCase().includes(fe.title.toLowerCase())
        );
        if (!isDuplicate) {
          mergedEvents.push({
            ...event,
            source: 'travelpulse',
          });
        }
      }

      res.json({
        city: cityName,
        feverSupported: !!feverCity,
        feverCity: feverCity || null,
        events: mergedEvents,
        count: mergedEvents.length,
        feverCount: feverEvents.length,
        travelpulseCount: existingEvents.length,
      });
    } catch (error) {
      console.error("[TravelPulse] Fever events merge error:", error);
      res.status(500).json({ error: "Failed to get merged Fever events" });
    }
  });

  app.get("/api/spontaneous/opportunities", async (req, res) => {
    try {
      const schema = z.object({
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        city: z.string().optional(),
        radius: z.coerce.number().min(1).max(100).default(10),
        limit: z.coerce.number().min(1).max(50).default(20),
        types: z.string().optional(), // comma-separated types
        categories: z.string().optional(), // comma-separated categories
        maxPrice: z.coerce.number().optional(),
        timeWindow: z.enum(["tonight", "tomorrow", "weekend", "week", "surprise_me"]).optional(),
      });
      
      const params = schema.parse(req.query);
      const userId = (req.user as any)?.claims?.sub || null;
      
      const opportunities = await opportunityEngineService.getOpportunities(userId, {
        lat: params.lat,
        lng: params.lng,
        city: params.city,
        radius: params.radius,
        limit: params.limit,
        types: params.types?.split(","),
        categories: params.categories?.split(","),
        maxPrice: params.maxPrice,
        timeWindow: params.timeWindow,
      });
      
      res.json({
        opportunities,
        total: opportunities.length,
        refreshedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching spontaneous opportunities:", error);
      res.status(500).json({ message: "Failed to fetch opportunities" });
    }
  });

  app.get("/api/spontaneous/preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const preferences = await opportunityEngineService.getUserPreferences(userId);
      res.json(preferences || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.post("/api/spontaneous/preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const schema = z.object({
        spontaneityLevel: z.number().min(0).max(100).optional(),
        notificationRadius: z.number().min(1).max(100).optional(),
        preferredCities: z.array(z.string()).optional(),
        preferredCategories: z.array(z.string()).optional(),
        blacklistedTypes: z.array(z.string()).optional(),
        priceSensitivity: z.number().min(0).max(100).optional(),
        maxBudgetPerActivity: z.number().optional(),
        timeWindows: z.array(z.object({
          day: z.enum(["weekday", "weekend", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
          hours: z.array(z.string()),
        })).optional(),
        enableNotifications: z.boolean().optional(),
      });
      
      const preferences = schema.parse(req.body);
      const saved = await opportunityEngineService.saveUserPreferences(userId, {
        ...preferences,
        maxBudgetPerActivity: preferences.maxBudgetPerActivity?.toString(),
      });
      
      res.json(saved);
    } catch (error) {
      console.error("Error saving spontaneous preferences:", error);
      res.status(500).json({ message: "Failed to save preferences" });
    }
  });

  app.post("/api/spontaneous/:id/book", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const opportunityId = req.params.id;
      
      const result = await opportunityEngineService.bookOpportunity(userId, opportunityId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to process booking" });
    }
  });

  app.get("/api/spontaneous/quick-search/:window", async (req, res) => {
    try {
      const window = req.params.window as "tonight" | "tomorrow" | "weekend" | "surprise_me";
      const city = req.query.city as string | undefined;
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
      const categories = req.query.categories as string | undefined;
      const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
      
      const userId = (req.user as any)?.claims?.sub || null;
      
      const opportunities = await opportunityEngineService.getOpportunities(userId, {
        lat,
        lng,
        city,
        timeWindow: window,
        limit: 20,
        categories: categories ? categories.split(",") : undefined,
        minPrice,
      });
      
      res.json({
        opportunities,
        timeWindow: window,
        total: opportunities.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch opportunities" });
    }
  });

  app.post("/api/discovery/scan", isAuthenticated, async (req, res) => {
    try {
      const { destination, categories } = req.body;

      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "destination is required" });
      }

      const validCategories = categories?.filter((c: string) => 
        ["local_food_secrets", "hidden_viewpoints", "off_tourist_path", "seasonal_events", 
         "cultural_experiences", "secret_beaches", "street_art", "local_markets", 
         "sunset_spots", "historic_gems", "nature_escapes", "nightlife_secrets"].includes(c)
      );

      const result = await grokDiscoveryService.discoverGemsForDestination(
        destination,
        validCategories?.length > 0 ? validCategories : undefined
      );

      res.json({
        success: true,
        jobId: result.jobId,
        totalGems: result.totalGems,
        message: `Discovered ${result.totalGems} hidden gems in ${destination}`
      });
    } catch (error: any) {
      console.error("Discovery scan error:", error);
      res.status(500).json({ message: "Discovery failed", error: error.message });
    }
  });

  app.get("/api/discovery/categories", async (_req, res) => {
    try {
      const { grokDiscoveryService } = await import("../services/grok-discovery.service");
      const categories = await grokDiscoveryService.getAvailableCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  app.get("/api/discovery/gems", async (req, res) => {
    try {
      const { destination, category, limit, offset } = req.query;

      if (destination) {
        const result = await grokDiscoveryService.getGemsForDestination(
          destination as string,
          {
            category: category as any,
            limit: limit ? parseInt(limit as string) : undefined,
            offset: offset ? parseInt(offset as string) : undefined
          }
        );
        return res.json(result);
      }

      const result = await grokDiscoveryService.getAllGems({
        category: category as any,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });
      res.json(result);
    } catch (error: any) {
      console.error("Get gems error:", error);
      res.status(500).json({ message: "Failed to get gems", error: error.message });
    }
  });

  app.get("/api/discovery/gems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { aiDiscoveredGems } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [gem] = await db.select()
        .from(aiDiscoveredGems)
        .where(eq(aiDiscoveredGems.id, id))
        .limit(1);

      if (!gem) {
        return res.status(404).json({ message: "Gem not found" });
      }

      await grokDiscoveryService.incrementViewCount(id);

      res.json({ gem });
    } catch (error: any) {
      console.error("Get gem error:", error);
      res.status(500).json({ message: "Failed to get gem", error: error.message });
    }
  });

  app.get("/api/discovery/destinations", async (_req, res) => {
    try {
      const destinations = await grokDiscoveryService.getDestinationsWithGems();
      res.json({ destinations });
    } catch (error: any) {
      console.error("Get destinations error:", error);
      res.status(500).json({ message: "Failed to get destinations", error: error.message });
    }
  });

  app.get("/api/discovery/jobs", isAuthenticated, async (req, res) => {
    try {
      const { limit } = req.query;
      const jobs = await grokDiscoveryService.getDiscoveryJobs(
        limit ? parseInt(limit as string) : undefined
      );
      res.json({ jobs });
    } catch (error: any) {
      console.error("Get jobs error:", error);
      res.status(500).json({ message: "Failed to get jobs", error: error.message });
    }
  });

  app.get("/api/travelpulse/social-feed/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const cacheKey = city.toLowerCase().replace(/\s+/g, "-");
      const cached = _socialFeedCacheGlobal.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }

      const posts = await grokService.getSocialFeedForCity(city);
      // 30-min cache for real search data; fall back already handled in service
      _socialFeedCacheGlobal.set(cacheKey, { data: posts, expiresAt: Date.now() + 30 * 60 * 1000 });
      res.json(posts);
    } catch (error: any) {
      console.error("Social feed route error:", error);
      res.status(500).json({ message: "Failed to fetch social feed" });
    }
  });

  app.get("/api/travelpulse/instagram-feed/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const cacheKey = city.toLowerCase().replace(/\s+/g, "-");

      // Serve from DB-persisted 24h cache
      const cached = await storage.getInstagramCache(cacheKey);
      if (cached && cached.expiresAt > new Date()) {
        return res.json(cached.posts as SocialFeedPost[]);
      }

      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      const userId = process.env.INSTAGRAM_USER_ID;

      if (!accessToken || !userId) {
        // Cache empty result for 24h so we don't re-check env vars on every request
        await storage.setInstagramCache(cacheKey, [], 0, new Date(Date.now() + 24 * 60 * 60 * 1000));
        return res.json([]);
      }

      const citySlug = city.toLowerCase().replace(/\s+/g, "");
      // Query all 3 hashtags (Instagram allows up to 30/week — we use 3 per city)
      const hashtags = [citySlug, `${citySlug}travel`, `${citySlug}life`];

      interface InstagramHashtagSearchData { id: string }
      interface InstagramHashtagSearchResponse { data?: InstagramHashtagSearchData[] }
      interface InstagramMediaPost { id: string; caption?: string; like_count?: number; timestamp?: string; permalink?: string }
      interface InstagramMediaResponse { data?: InstagramMediaPost[] }

      const allPosts: SocialFeedPost[] = [];
      let totalHashtagVolume = 0;

      for (const tag of hashtags) {
        try {
          const hashtagRes = await fetch(
            `https://graph.facebook.com/v19.0/ig_hashtag_search?user_id=${userId}&q=${tag}&access_token=${accessToken}`
          );
          const hashtagData = await hashtagRes.json() as InstagramHashtagSearchResponse;
          if (!hashtagData.data?.[0]?.id) continue;

          const tagId = hashtagData.data[0].id;

          // Fetch recent media with post count for volume tracking
          const mediaRes = await fetch(
            `https://graph.facebook.com/v19.0/${tagId}/recent_media?user_id=${userId}&fields=id,caption,media_type,timestamp,permalink,like_count&limit=6&access_token=${accessToken}`
          );
          const mediaData = await mediaRes.json() as InstagramMediaResponse;
          if (mediaData.data) {
            totalHashtagVolume += mediaData.data.length;
            for (const post of mediaData.data) {
              allPosts.push({
                id: `ig_${post.id}`,
                source: "instagram",
                authorName: "Instagram",
                content: (post.caption || "").slice(0, 140),
                likesCount: post.like_count || 0,
                postedAt: post.timestamp || new Date().toISOString(),
                postUrl: post.permalink || `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
                sentiment: "positive",
              });
            }
          }
        } catch {
          continue;
        }
      }

      // Cap combined posts at 20
      const result = allPosts.slice(0, 20);

      // Persist to DB — 24h TTL to stay within Instagram's rate limits; volume stored for LiveScore nightly refresh
      await storage.setInstagramCache(cacheKey, result, totalHashtagVolume, new Date(Date.now() + 24 * 60 * 60 * 1000));
      res.json(result);
    } catch (error: any) {
      console.error("Instagram feed route error:", error);
      res.status(500).json({ message: "Failed to fetch Instagram feed" });
    }
  });

  // ─── Deals Feed ───────────────────────────────────────────────────────────
  // Unified deals from Fever events and Amadeus hotel offers
  const IATA_TO_CITY: Record<string, string> = {
    NYC: "New York",
    LON: "London",
    PAR: "Paris",
    LAX: "Los Angeles",
    BCN: "Barcelona",
    MAD: "Madrid",
    TYO: "Tokyo",
    SYD: "Sydney",
    DXB: "Dubai",
    SIN: "Singapore",
    AMS: "Amsterdam",
    ROM: "Rome",
    MIL: "Milan",
    BKK: "Bangkok",
    CDG: "Paris",
    LIS: "Lisbon",
    PRG: "Prague",
    VIE: "Vienna",
    CPT: "Cape Town",
  };

  app.get("/api/deals", async (req, res) => {
    try {
      const category = (req.query.category as string | undefined) || "all";
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 50);
      const now = new Date();
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const results: any[] = [];

      const wantEvents =
        category === "all" || category === "experiences" || category === "concerts" || category === "last-minute";
      const wantHotels = category === "all" || category === "hotels" || category === "last-minute";

      // ── Fever events ──────────────────────────────────────────────────────
      if (wantEvents) {
        const feverConditions: any[] = [gte(feverEventCache.expiresAt, now)];
        if (category === "experiences") {
          feverConditions.push(eq(feverEventCache.category, "experiences"));
        } else if (category === "concerts") {
          feverConditions.push(eq(feverEventCache.category, "concerts"));
        } else if (category === "last-minute") {
          feverConditions.push(
            and(
              isNotNull(feverEventCache.startDate),
              lte(feverEventCache.startDate, threeDaysFromNow)
            )!
          );
        }

        const eventLimit = wantHotels ? Math.ceil(limit * 0.65) : limit;
        const events = await db
          .select()
          .from(feverEventCache)
          .where(and(...feverConditions))
          .orderBy(asc(feverEventCache.minPrice))
          .limit(eventLimit);

        for (const event of events) {
          results.push({
            id: `fever-${event.eventId}`,
            type: "event",
            source: event.category === "concerts" ? "concerts" : "experiences",
            title: event.title,
            destination: `${event.city}, ${event.country}`,
            city: event.city,
            imageUrl: event.imageUrl || event.thumbnailUrl || null,
            price: event.minPrice ? parseFloat(event.minPrice) : 0,
            currency: event.currency || "USD",
            bookingUrl: event.affiliateUrl || event.bookingUrl,
            rating: event.rating ? parseFloat(event.rating as string) : null,
            isFree: event.isFree,
            startDate: event.startDate,
            endDate: event.endDate,
            category: event.category,
            tags: (event.tags as string[]) || [],
          });
        }
      }

      // ── Hotel offers (join hotel_offer_cache + hotel_cache) ───────────────
      if (wantHotels) {
        const hotelLimit = wantEvents ? Math.ceil(limit * 0.35) : limit;
        const hotelsWithOffers = await db
          .select({
            hotelId: hotelCache.hotelId,
            cityCode: hotelCache.cityCode,
            hotelName: hotelCache.name,
            starRating: hotelCache.starRating,
            rating: hotelCache.rating,
            price: hotelOfferCache.price,
            currency: hotelOfferCache.currency,
            checkIn: hotelOfferCache.checkInDate,
            checkOut: hotelOfferCache.checkOutDate,
            roomType: hotelOfferCache.roomType,
            offerId: hotelOfferCache.offerId,
          })
          .from(hotelOfferCache)
          .innerJoin(hotelCache, eq(hotelOfferCache.hotelCacheId, hotelCache.id))
          .where(gte(hotelOfferCache.expiresAt, now))
          .orderBy(asc(hotelOfferCache.price))
          .limit(hotelLimit);

        for (const hotel of hotelsWithOffers) {
          const city = IATA_TO_CITY[hotel.cityCode] || hotel.cityCode;
          results.push({
            id: `amadeus-${hotel.offerId}`,
            type: "hotel",
            source: "hotels",
            title: hotel.hotelName,
            destination: city,
            city,
            imageUrl: null,
            price: hotel.price ? parseFloat(hotel.price) : 0,
            currency: hotel.currency || "USD",
            bookingUrl: null,
            rating: hotel.rating ? parseFloat(hotel.rating as string) : null,
            starRating: hotel.starRating,
            checkIn: hotel.checkIn,
            checkOut: hotel.checkOut,
            category: "hotels",
            tags: [],
          });
        }
      }

      // Sort all results by price ascending
      results.sort((a, b) => a.price - b.price);
      const deals = results.slice(0, limit);
      res.json({ deals, total: deals.length });
    } catch (error: any) {
      console.error("Deals API error:", error);
      res.status(500).json({ message: "Failed to fetch deals" });
    }
  });

  // ── Admin: seed Amadeus activities into activity_cache ──────────────────────
  app.post("/api/admin/seed/amadeus-activities", requireAdmin, async (req, res) => {
    try {
      const cities = await db
        .select()
        .from(travelPulseCities)
        .where(and(isNotNull(travelPulseCities.latitude), isNotNull(travelPulseCities.longitude)));

      const results: { city: string; added: number; skipped: number; error?: string }[] = [];
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      for (const city of cities) {
        try {
          const lat = parseFloat(city.latitude as string);
          const lon = parseFloat(city.longitude as string);
          const activities = await amadeusService.searchActivities({ latitude: lat, longitude: lon, radius: 20 });

          let added = 0;
          let skipped = 0;
          for (const act of activities) {
            try {
              await db
                .insert(activityCache)
                .values({
                  productCode: `amadeus-${act.id}`,
                  destination: city.cityName,
                  city: city.cityName,
                  title: act.name,
                  description: act.description || act.shortDescription || null,
                  latitude: act.geoCode?.latitude?.toString() ?? null,
                  longitude: act.geoCode?.longitude?.toString() ?? null,
                  price: act.price?.amount ?? null,
                  currency: act.price?.currencyCode ?? "USD",
                  rating: act.rating?.toString() ?? null,
                  imageUrl: act.pictures?.[0] ?? null,
                  provider: "amadeus",
                  category: act.type || "EXPERIENCE",
                  rawData: act as unknown as Record<string, unknown>,
                  expiresAt,
                })
                .onConflictDoUpdate({
                  target: activityCache.productCode,
                  set: {
                    title: act.name,
                    description: act.description || act.shortDescription || null,
                    price: act.price?.amount ?? null,
                    rating: act.rating?.toString() ?? null,
                    imageUrl: act.pictures?.[0] ?? null,
                    rawData: act as unknown as Record<string, unknown>,
                    expiresAt,
                    lastUpdated: new Date(),
                  },
                });
              added++;
            } catch {
              skipped++;
            }
          }
          results.push({ city: city.cityName, added, skipped });
          // Small delay to avoid rate limits
          await new Promise(r => setTimeout(r, 300));
        } catch (err: any) {
          results.push({ city: city.cityName, added: 0, skipped: 0, error: err.message });
        }
      }

      const totalAdded = results.reduce((s, r) => s + r.added, 0);
      res.json({ success: true, totalAdded, results });
    } catch (error: any) {
      console.error("Amadeus activities seed error:", error);
      res.status(500).json({ message: "Failed to seed activities", error: error.message });
    }
  });

  // ── Admin: seed Amadeus safety ratings into safety_cache ────────────────────
  app.post("/api/admin/seed/amadeus-safety", requireAdmin, async (req, res) => {
    try {
      const cities = await db
        .select()
        .from(travelPulseCities)
        .where(and(isNotNull(travelPulseCities.latitude), isNotNull(travelPulseCities.longitude)));

      const results: { city: string; added: number; error?: string }[] = [];
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      for (const city of cities) {
        try {
          const lat = parseFloat(city.latitude as string);
          const lon = parseFloat(city.longitude as string);
          const ratings = await amadeusService.getSafetyRatings({ latitude: lat, longitude: lon, radius: 5 });

          let added = 0;
          for (const rating of ratings) {
            try {
              await db
                .insert(safetyCache)
                .values({
                  amadeusId: rating.id,
                  name: rating.name,
                  subType: rating.subType,
                  latitude: rating.geoCode.latitude.toString(),
                  longitude: rating.geoCode.longitude.toString(),
                  city: city.cityName,
                  country: city.country,
                  countryCode: city.countryCode,
                  overallScore: rating.safetyScores?.overall ?? null,
                  lgbtqScore: rating.safetyScores?.lgbtq ?? null,
                  medicalScore: rating.safetyScores?.medical ?? null,
                  physicalHarmScore: rating.safetyScores?.physicalHarm ?? null,
                  politicalFreedomScore: rating.safetyScores?.politicalFreedom ?? null,
                  theftScore: rating.safetyScores?.theft ?? null,
                  womenSafetyScore: rating.safetyScores?.women ?? null,
                  rawData: rating as unknown as Record<string, unknown>,
                  expiresAt,
                })
                .onConflictDoUpdate({
                  target: safetyCache.amadeusId,
                  set: {
                    overallScore: rating.safetyScores?.overall ?? null,
                    lgbtqScore: rating.safetyScores?.lgbtq ?? null,
                    medicalScore: rating.safetyScores?.medical ?? null,
                    physicalHarmScore: rating.safetyScores?.physicalHarm ?? null,
                    politicalFreedomScore: rating.safetyScores?.politicalFreedom ?? null,
                    theftScore: rating.safetyScores?.theft ?? null,
                    womenSafetyScore: rating.safetyScores?.women ?? null,
                    rawData: rating as unknown as Record<string, unknown>,
                    expiresAt,
                    lastUpdated: new Date(),
                  },
                });
              added++;
            } catch {}
          }
          results.push({ city: city.cityName, added });
          await new Promise(r => setTimeout(r, 300));
        } catch (err: any) {
          results.push({ city: city.cityName, added: 0, error: err.message });
        }
      }

      const totalAdded = results.reduce((s, r) => s + r.added, 0);
      res.json({ success: true, totalAdded, results });
    } catch (error: any) {
      console.error("Amadeus safety seed error:", error);
      res.status(500).json({ message: "Failed to seed safety ratings", error: error.message });
    }
  });

  // ── Bookable activities for For You tab ──────────────────────────────────────
  app.get("/api/travelpulse/activities/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 12, 30);
      const now = new Date();

      const rows = await db
        .select({
          id: activityCache.id,
          productCode: activityCache.productCode,
          title: activityCache.title,
          description: activityCache.description,
          price: activityCache.price,
          currency: activityCache.currency,
          rating: activityCache.rating,
          reviewCount: activityCache.reviewCount,
          imageUrl: activityCache.imageUrl,
          provider: activityCache.provider,
          category: activityCache.category,
          durationMinutes: activityCache.durationMinutes,
          rawData: activityCache.rawData,
        })
        .from(activityCache)
        .where(and(
          or(
            sql`lower(${activityCache.destination}) = lower(${cityName})`,
            sql`lower(${activityCache.city}) = lower(${cityName})`,
          ),
          gte(activityCache.expiresAt, now),
        ))
        .orderBy(
          sql`CASE WHEN ${activityCache.price} IS NULL OR ${activityCache.price} = 0 THEN 1 ELSE 0 END`,
          asc(activityCache.price),
        )
        .limit(limit);

      const activities = rows.map((row) => {
        const raw = row.rawData as Record<string, unknown> | null;
        const bookingUrl =
          (raw?.bookingLink as string | undefined) ??
          (raw?.productUrl as string | undefined) ??
          null;
        return {
          id: row.id,
          productCode: row.productCode,
          title: row.title,
          description: row.description,
          price: row.price ? parseFloat(row.price) : null,
          currency: row.currency ?? "USD",
          rating: row.rating ? parseFloat(row.rating) : null,
          reviewCount: row.reviewCount ?? 0,
          imageUrl: row.imageUrl,
          provider: row.provider ?? "viator",
          category: row.category,
          durationMinutes: row.durationMinutes,
          bookingUrl,
        };
      });

      res.json({ activities, total: activities.length, city: cityName });
    } catch (error: any) {
      console.error("Bookable activities API error:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // ── Safety scores API ────────────────────────────────────────────────────────
  app.get("/api/travelpulse/safety/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const now = new Date();
      const rows = await db
        .select()
        .from(safetyCache)
        .where(and(
          sql`lower(${safetyCache.city}) = lower(${city})`,
          gte(safetyCache.expiresAt, now),
        ));

      if (rows.length === 0) {
        return res.json(null);
      }

      const avg = (col: (typeof rows[0][keyof typeof rows[0]])[]) => {
        const valid = col.filter((v) => v != null) as number[];
        return valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null;
      };

      const aggregated = {
        city,
        neighborhoodCount: rows.length,
        overall: avg(rows.map(r => r.overallScore)),
        lgbtq: avg(rows.map(r => r.lgbtqScore)),
        medical: avg(rows.map(r => r.medicalScore)),
        physicalHarm: avg(rows.map(r => r.physicalHarmScore)),
        politicalFreedom: avg(rows.map(r => r.politicalFreedomScore)),
        theft: avg(rows.map(r => r.theftScore)),
        women: avg(rows.map(r => r.womenSafetyScore)),
      };

      res.json(aggregated);
    } catch (error: any) {
      console.error("Safety ratings API error:", error);
      res.status(500).json({ message: "Failed to fetch safety ratings" });
    }
  });
}
