import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { eq, and, or, like, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { amadeusService } from "../services/amadeus.service";
import { viatorService } from "../services/viator.service";
import { cacheService } from "../services/cache.service";
import { claudeService } from "../services/claude.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService } from "../services/grok.service";
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
  accessAuditLogs, contentRegistry
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

const searchEventSchema = z.object({
  destination: z.string(),
  origin: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  travelers: z.number().optional(),
  experienceType: z.string().optional(),
  searchContext: z.string().optional(),
});

const itineraryGeneratedSchema = z.object({
  tripId: z.string().optional(),
  destination: z.string(),
  activities: z.array(z.string()).optional(),
  duration: z.number().optional(),
  travelers: z.number().optional(),
  budget: z.number().optional(),
  variationType: z.string().optional(),
  experienceType: z.string().optional(),
});

const bookingEventSchema = z.object({
  type: z.string(),
  destination: z.string().optional(),
  price: z.number().optional(),
  travelers: z.number().optional(),
  tripId: z.string().optional(),
  itemId: z.string().optional(),
  provider: z.string().optional(),
  bookingStatus: z.string().optional(),
});

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(2000),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
});


export function registerAffiliateRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/analytics/search-trends", isAuthenticated, async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const trends = await storage.getDestinationSearchTrends(days);
      res.json(trends);
    } catch (err) {
      console.error("Error fetching search trends:", err);
      res.status(500).json({ message: "Failed to fetch search trends" });
    }
  });

  app.get("/api/analytics/expert-match-trends/:expertId", isAuthenticated, async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const trends = await storage.getExpertMatchTrends(req.params.expertId, days);
      res.json(trends);
    } catch (err) {
      console.error("Error fetching expert match trends:", err);
      res.status(500).json({ message: "Failed to fetch expert match trends" });
    }
  });

  app.get("/api/analytics/destination-metrics/:destination", isAuthenticated, async (req, res) => {
    try {
      const metricType = (req.query.metricType as string) || "trend_score";
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const history = await storage.getDestinationMetricsHistory(
        decodeURIComponent(req.params.destination),
        metricType,
        days
      );
      res.json(history);
    } catch (err) {
      console.error("Error fetching destination metrics:", err);
      res.status(500).json({ message: "Failed to fetch destination metrics" });
    }
  });

  app.post("/api/analytics/search-event", async (req, res) => {
    // Fire-and-forget - respond immediately, process async
    res.status(202).json({ received: true });
    
    try {
      const validation = searchEventSchema.safeParse(req.body);
      if (!validation.success) {
        console.warn("[Analytics] Invalid search-event payload:", validation.error.flatten());
        return;
      }
      
      const data = validation.data;
      const userId = (req.user as any)?.claims?.sub;
      
      // Log to destination search patterns for trend analysis
      await storage.createDestinationSearchPattern({
        destination: data.destination,
        city: data.destination.split(",")[0]?.trim(),
        searchQuery: data.destination,
        searchType: data.searchContext || "search",
        userId: userId || undefined,
        resultsViewed: 0,
        date: new Date().toISOString().split("T")[0],
        hour: new Date().getHours(),
      }).catch(err => console.error("[Analytics] Failed to track search event:", err));
      
      console.log("[Analytics] Search event tracked:", {
        destination: data.destination,
        context: data.searchContext,
        userId: userId?.substring(0, 8),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[Analytics] Error processing search event:", err);
    }
  });

  app.post("/api/analytics/itinerary-generated", async (req, res) => {
    // Fire-and-forget - respond immediately
    res.status(202).json({ received: true });
    
    try {
      const validation = itineraryGeneratedSchema.safeParse(req.body);
      if (!validation.success) {
        console.warn("[Analytics] Invalid itinerary-generated payload:", validation.error.flatten());
        return;
      }
      
      const data = validation.data;
      const userId = (req.user as any)?.claims?.sub;
      
      // Track as AI interaction for analytics
      await db.insert(aiInteractions).values({
        userId: userId || null,
        interactionType: "itinerary_generation",
        model: "claude-sonnet",
        inputTokens: 0,
        outputTokens: 0,
        responseTimeMs: 0,
        success: true,
        metadata: {
          destination: data.destination,
          tripId: data.tripId,
          duration: data.duration,
          travelers: data.travelers,
          budget: data.budget,
          variationType: data.variationType,
          experienceType: data.experienceType,
          activitiesCount: data.activities?.length || 0,
        },
      }).catch(err => console.error("[Analytics] Failed to track itinerary generation:", err));
      
      console.log("[Analytics] Itinerary generated event tracked:", {
        destination: data.destination,
        duration: data.duration,
        variationType: data.variationType,
        userId: userId?.substring(0, 8),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[Analytics] Error processing itinerary-generated event:", err);
    }
  });

  app.post("/api/analytics/booking", async (req, res) => {
    // Fire-and-forget - respond immediately
    res.status(202).json({ received: true });
    
    try {
      const validation = bookingEventSchema.safeParse(req.body);
      if (!validation.success) {
        console.warn("[Analytics] Invalid booking payload:", validation.error.flatten());
        return;
      }
      
      const data = validation.data;
      const userId = (req.user as any)?.claims?.sub;
      
      // Track booking event
      console.log("[Analytics] Booking event tracked:", {
        type: data.type,
        destination: data.destination,
        price: data.price,
        provider: data.provider,
        status: data.bookingStatus,
        userId: userId?.substring(0, 8),
        timestamp: new Date().toISOString(),
      });
      
      // Also log to destination search patterns if destination provided (to track conversion)
      if (data.destination) {
        await storage.createDestinationSearchPattern({
          destination: data.destination,
          city: data.destination.split(",")[0]?.trim(),
          searchQuery: `booking:${data.type}`,
          searchType: "booking",
          userId: userId || undefined,
          resultsViewed: 1,
          date: new Date().toISOString().split("T")[0],
          hour: new Date().getHours(),
        }).catch(err => console.error("[Analytics] Failed to track booking destination:", err));
      }
    } catch (err) {
      console.error("[Analytics] Error processing booking event:", err);
    }
  });

  app.get("/api/affiliate/categories", async (_req, res) => {
    try {
      const categories = await affiliateScraperService.getPartnerCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  app.post("/api/affiliate/partners", isAuthenticated, async (req, res) => {
    try {
      const { name, websiteUrl, category, affiliateTrackingId, affiliateLinkTemplate, description, logoUrl, commissionRate, scrapeConfig } = req.body;

      if (!name || !websiteUrl || !category) {
        return res.status(400).json({ message: "name, websiteUrl, and category are required" });
      }

      const partner = await affiliateScraperService.createPartner({
        name,
        websiteUrl,
        category,
        affiliateTrackingId,
        affiliateLinkTemplate,
        description,
        logoUrl,
        commissionRate,
        scrapeConfig,
      });

      res.status(201).json({ partner, message: "Partner created successfully" });
    } catch (error: any) {
      console.error("Create partner error:", error);
      res.status(500).json({ message: "Failed to create partner", error: error.message });
    }
  });

  app.get("/api/affiliate/partners", async (req, res) => {
    try {
      const { category, isActive, limit, offset } = req.query;
      const result = await affiliateScraperService.getPartners({
        category: category as string,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get partners", error: error.message });
    }
  });

  app.get("/api/affiliate/partners/:id", async (req, res) => {
    try {
      const partner = await affiliateScraperService.getPartnerById(req.params.id);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }
      res.json({ partner });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get partner", error: error.message });
    }
  });

  app.patch("/api/affiliate/partners/:id", isAuthenticated, async (req, res) => {
    try {
      const partner = await affiliateScraperService.updatePartner(req.params.id, req.body);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }
      res.json({ partner, message: "Partner updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update partner", error: error.message });
    }
  });

  app.delete("/api/affiliate/partners/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await affiliateScraperService.deletePartner(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Partner not found" });
      }
      res.json({ message: "Partner deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete partner", error: error.message });
    }
  });

  app.post("/api/affiliate/partners/:id/scrape", isAuthenticated, async (req, res) => {
    try {
      const result = await affiliateScraperService.scrapePartnerWebsite(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error("Scrape error:", error);
      res.status(500).json({ message: "Failed to scrape partner website", error: error.message });
    }
  });

  app.get("/api/affiliate/partners/:id/jobs", isAuthenticated, async (req, res) => {
    try {
      const { limit } = req.query;
      const jobs = await affiliateScraperService.getScrapeJobs({
        partnerId: req.params.id,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json({ jobs });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get scrape jobs", error: error.message });
    }
  });

  app.get("/api/affiliate/products", async (req, res) => {
    try {
      const { partnerId, category, city, country, search, minPrice, maxPrice, minRating, limit, offset } = req.query;
      const result = await affiliateScraperService.getProducts({
        partnerId: partnerId as string,
        category: category as string,
        city: city as string,
        country: country as string,
        search: search as string,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        minRating: minRating ? parseFloat(minRating as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get products", error: error.message });
    }
  });

  app.get("/api/affiliate/products/:id", async (req, res) => {
    try {
      const product = await affiliateScraperService.getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ product });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get product", error: error.message });
    }
  });

  app.post("/api/affiliate/track-click", async (req, res) => {
    try {
      const { productId, partnerId, userId, tripId, itineraryItemId } = req.body;
      
      if (!productId && !partnerId) {
        return res.status(400).json({ message: "productId or partnerId is required" });
      }

      const result = await affiliateScraperService.trackClick({
        productId,
        partnerId,
        userId,
        tripId,
        itineraryItemId,
        referrer: req.headers.referer,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to track click", error: error.message });
    }
  });

  app.get("/api/affiliate/products/by-location", async (req, res) => {
    try {
      const { city, country, category, limit } = req.query;
      
      if (!city && !country) {
        return res.status(400).json({ message: "city or country is required" });
      }

      const result = await affiliateScraperService.getProducts({
        city: city as string,
        country: country as string,
        category: category as string,
        limit: limit ? parseInt(limit as string) : 10,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get products by location", error: error.message });
    }
  });

  app.post("/api/track/search", async (req, res) => {
    try {
      const { searchAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(searchAnalytics).values({
        sessionId: req.body.sessionId || req.headers["x-session-id"] as string,
        userId,
        searchType: req.body.searchType,
        query: req.body.query,
        destination: req.body.destination,
        originCountry: req.body.originCountry,
        travelDates: req.body.travelDates,
        travelers: req.body.travelers,
        budget: req.body.budget,
        filters: req.body.filters,
        resultsCount: req.body.resultsCount,
        deviceType: req.body.deviceType,
        ipCountry: req.headers["cf-ipcountry"] as string,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Track search error:", err);
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/track/pageview", async (req, res) => {
    try {
      const { pageViewAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(pageViewAnalytics).values({
        sessionId: req.body.sessionId,
        userId,
        pagePath: req.body.pagePath,
        pageType: req.body.pageType,
        referrer: req.body.referrer,
        utmSource: req.body.utmSource,
        utmMedium: req.body.utmMedium,
        utmCampaign: req.body.utmCampaign,
        deviceType: req.body.deviceType,
        ipCountry: req.headers["cf-ipcountry"] as string,
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/track/funnel", async (req, res) => {
    try {
      const { bookingFunnelAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(bookingFunnelAnalytics).values({
        sessionId: req.body.sessionId,
        userId,
        funnelStage: req.body.stage,
        serviceType: req.body.serviceType,
        serviceId: req.body.serviceId,
        providerId: req.body.providerId,
        destination: req.body.destination,
        price: req.body.price,
        abandonReason: req.body.abandonReason,
        ipCountry: req.headers["cf-ipcountry"] as string,
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/track/activity", async (req, res) => {
    try {
      const { activityBookingAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(activityBookingAnalytics).values({
        sessionId: req.body.sessionId,
        userId,
        activityType: req.body.activityType,
        activityCategory: req.body.activityCategory,
        serviceName: req.body.serviceName,
        providerId: req.body.providerId,
        providerType: req.body.providerType,
        destination: req.body.destination,
        country: req.body.country,
        city: req.body.city,
        bookingStatus: req.body.status, // viewed, inquired, booked
        price: req.body.price,
        groupSize: req.body.groupSize,
        tripType: req.body.tripType,
        travelerOriginCountry: req.headers["cf-ipcountry"] as string || req.body.originCountry,
        bookingLeadDays: req.body.leadDays,
        deviceType: req.body.deviceType,
        referralSource: req.body.referralSource,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Track activity error:", err);
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/track/trip-enhanced", async (req, res) => {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      await db.insert(tripAnalyticsEnhanced).values({
        tripId: req.body.tripId,
        userId,
        destinationCountry: req.body.destinationCountry,
        destinationRegion: req.body.destinationRegion,
        destinationCity: req.body.destinationCity,
        destinationType: req.body.destinationType,
        originCountry: req.headers["cf-ipcountry"] as string || req.body.originCountry,
        originCity: req.body.originCity,
        bookingDate: new Date(),
        tripStartDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        tripEndDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        leadTimeDays: req.body.leadTimeDays,
        lengthOfStay: req.body.lengthOfStay,
        season: req.body.season,
        partySize: req.body.partySize,
        partyComposition: req.body.partyComposition,
        hasChildren: req.body.hasChildren,
        tripPurpose: req.body.tripPurpose,
        totalBudget: req.body.totalBudget,
        spendPerDay: req.body.spendPerDay,
        priceSegment: req.body.priceSegment,
        activitiesBooked: req.body.activitiesBooked,
        primaryActivity: req.body.primaryActivity,
        accommodationType: req.body.accommodationType,
        starRating: req.body.starRating,
        otherDestinationsConsidered: req.body.otherDestinationsConsidered,
        deviceUsed: req.body.deviceType,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Track trip enhanced error:", err);
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/track/destination-search", async (req, res) => {
    try {
      const { searchAnalytics } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      const sessionId = req.body.sessionId || req.headers["x-session-id"] as string;
      
      // Track this search
      await db.insert(searchAnalytics).values({
        sessionId,
        userId,
        searchType: "destination",
        destination: req.body.destination,
        query: req.body.query,
        ipCountry: req.headers["cf-ipcountry"] as string,
        deviceType: req.body.deviceType,
      });

      // If user has a draft trip, track this as a "considered" destination
      if (userId && req.body.tripId) {
        const { tripAnalyticsEnhanced } = await import("@shared/schema");
        const existing = await db.select().from(tripAnalyticsEnhanced).where(eq(tripAnalyticsEnhanced.tripId, req.body.tripId)).then(r => r[0]);
        
        if (existing) {
          const considered = (existing.otherDestinationsConsidered as string[] || []);
          if (!considered.includes(req.body.destination) && req.body.destination !== existing.destinationCity) {
            considered.push(req.body.destination);
            await db.update(tripAnalyticsEnhanced)
              .set({ otherDestinationsConsidered: considered.slice(-10) }) // Keep last 10
              .where(eq(tripAnalyticsEnhanced.tripId, req.body.tripId));
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/track/accommodation-preference", async (req, res) => {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      const userId = (req.user as any)?.claims?.sub;
      
      if (userId && req.body.tripId) {
        await db.update(tripAnalyticsEnhanced)
          .set({ 
            accommodationType: req.body.accommodationType,
            starRating: req.body.starRating,
          })
          .where(eq(tripAnalyticsEnhanced.tripId, req.body.tripId));
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });
}
