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
import { registerContentTypeRoutes } from "./content-types";
import { registerServiceBookingRoutes } from "./service-bookings";
import { registerTripRoutes } from "./trips";
import { registerIntelligenceRoutes } from "./intelligence";
import { registerAiRoutes } from "./ai";
import { registerIntegrationRoutes } from "./integrations";
import { registerCoordinationRoutes } from "./coordination";
import { registerUserFeatureRoutes } from "./user-features";
import { registerAffiliateRoutes } from "./affiliates";
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

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(2000),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
});

export function registerMiscRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/health", (_req, res) => {
  registerTripRoutes(app, resolveSlug);
  registerIntelligenceRoutes(app, resolveSlug);
  registerAiRoutes(app, resolveSlug);
  registerIntegrationRoutes(app, resolveSlug);
  registerCoordinationRoutes(app, resolveSlug);
  registerUserFeatureRoutes(app, resolveSlug);
  registerAffiliateRoutes(app, resolveSlug);
  registerContentTypeRoutes(app, resolveSlug);
  registerServiceBookingRoutes(app, resolveSlug);
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/status", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const input = contactSchema.parse(req.body);
      
      // Log contact form submission (in production, send email or save to DB)
      console.log("Contact form submission:", {
        name: input.name,
        email: input.email,
        subject: input.subject,
        timestamp: new Date().toISOString(),
      });

      // TODO: Implement email sending (e.g., SendGrid, Resend, etc.)
      // For now, just acknowledge receipt
      
      res.status(200).json({ 
        success: true, 
        message: "Thank you for your message. We'll get back to you soon!" 
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: err.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
      }
      console.error("Contact form error:", err);
      res.status(500).json({ message: "Failed to submit contact form" });
    }
  });

  app.post("/api/chat/start", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { expertId, message, tripId } = req.body;

      if (!expertId) {
        return res.status(400).json({ message: "Expert ID is required" });
      }

      // Verify expert exists
      const expert = await db.select().from(users).where(eq(users.id, expertId)).then(r => r[0]);
      if (!expert) {
        return res.status(404).json({ message: "Expert not found" });
      }

      // Create initial chat message
      const [chat] = await db.insert(userAndExpertChats).values({
        senderId: userId,
        receiverId: expertId,
        message: message || "Hello, I would like to connect with you.",
      }).returning();

      // Create notification for expert
      await db.insert(notifications).values({
        userId: expertId,
        type: "new_chat",
        title: "New message",
        message: `You have a new message from a traveler`,
        data: { chatId: chat.id, senderId: userId, tripId },
      });

      res.status(201).json({
        message: "Chat started successfully",
        chatId: chat.id,
        chat,
      });
    } catch (error) {
      console.error("Error starting chat:", error);
      res.status(500).json({ message: "Failed to start chat" });
    }
  });

  app.post("/api/transport-packages/generate", isAuthenticated, async (req, res) => {
    try {
      const parsed = transportPackageRequestSchema.parse(req.body);
      const { segments, destination, travelers, tripDays } = parsed;

      const segmentsDescription = segments.map(s =>
        `- Segment "${s.id}" (${s.type}): from ${s.from.name} (${s.from.type}) to ${s.to.name} (${s.to.type})${s.date ? ` on ${s.date}` : ''}`
      ).join('\n');

      const systemPrompt = `You are a transportation planning expert. Generate exactly 3 transport packages for a trip. Always respond with valid JSON only, no markdown or explanation outside the JSON.`;

      const userPrompt = `Generate 3 transport packages for a ${tripDays}-day trip to ${destination} with ${travelers} traveler(s).

TRANSPORT SEGMENTS NEEDED:
${segmentsDescription}

Generate exactly 3 packages:
1. "Private Car Service" (id: "private") - Private car/taxi for all legs. Icon: "car". High convenience, low eco score.
2. "Public Transit" (id: "public") - Buses, metro, trains for all legs. Icon: "train". Low cost, high eco score.
3. "Smart Hybrid" (id: "hybrid") - AI picks the best mode per leg balancing cost, time, and convenience. Icon: "sparkles". Best overall value.

For each package, provide:
- Realistic cost estimates (min/max in USD) based on ${destination} local transport prices
- Total estimated travel time across all legs
- Convenience score (0-100)
- Eco score (0-100)
- Best for description
- Per-leg details with mode, provider name, estimated cost range, estimated duration, and notes

Respond with this exact JSON structure:
{
  "packages": [
    {
      "id": "private",
      "name": "Private Car Service",
      "icon": "car",
      "description": "Door-to-door private car for all legs",
      "totalCost": { "min": <number>, "max": <number> },
      "totalTime": "<e.g. 2h 30m>",
      "convenience": <0-100>,
      "ecoScore": <0-100>,
      "bestFor": "<short description>",
      "legs": [
        {
          "segmentId": "<matching segment id>",
          "mode": "<private_car|taxi|uber|metro|bus|train|shuttle|rideshare|walk|ferry>",
          "provider": "<provider name>",
          "estimatedCost": { "min": <number>, "max": <number> },
          "estimatedDuration": "<e.g. 35 min>",
          "notes": "<helpful note about this leg>"
        }
      ]
    }
  ]
}`;

      const aiResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const responseText = aiResponse.content[0]?.type === "text" ? aiResponse.content[0].text : "";

      let jsonText = responseText;
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      } else {
        const jsonObjMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          jsonText = jsonObjMatch[0];
        }
      }

      const result = JSON.parse(jsonText);

      const packageResponseSchema = z.object({
        packages: z.array(z.object({
          id: z.string(),
          name: z.string(),
          icon: z.string(),
          description: z.string(),
          totalCost: z.object({ min: z.number(), max: z.number() }),
          totalTime: z.string(),
          convenience: z.number().min(0).max(100),
          ecoScore: z.number().min(0).max(100),
          bestFor: z.string(),
          legs: z.array(z.object({
            segmentId: z.string(),
            mode: z.string(),
            provider: z.string(),
            estimatedCost: z.object({ min: z.number(), max: z.number() }),
            estimatedDuration: z.string(),
            notes: z.string(),
          })),
        })).min(1),
      });

      const validated = packageResponseSchema.safeParse(result);
      if (!validated.success) {
        console.error("AI response validation failed:", validated.error.flatten());
        return res.status(500).json({ message: "AI generated an invalid response format. Please try again." });
      }

      res.json(validated.data);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.flatten() });
      }
      console.error("Transport package generation error:", error);
      res.status(500).json({ message: error.message || "Failed to generate transport packages" });
    }
  });

  app.post("/api/routes/transit", isAuthenticated, async (req, res) => {
    try {
      const parsed = TransitRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const route = await getTransitRoute(parsed.data);
      
      if (!route) {
        return res.status(404).json({ message: "No transit route found" });
      }
      
      res.json(route);
    } catch (error: any) {
      console.error('Routes API error:', error);
      res.status(500).json({ message: error.message || "Transit route lookup failed" });
    }
  });

  app.post("/api/routes/transit-multi", isAuthenticated, async (req, res) => {
    try {
      const parsed = multiTransitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { origin, destinations } = parsed.data;
      const routesMap = await getMultipleTransitRoutes(origin, destinations);
      
      const routes: Record<string, any> = {};
      routesMap.forEach((route, id) => {
        routes[id] = route;
      });
      
      res.json({ routes });
    } catch (error: any) {
      console.error('Routes API multi error:', error);
      res.status(500).json({ message: error.message || "Transit routes lookup failed" });
    }
  });

  app.post("/api/geocode", async (req, res) => {
    try {
      const parsed = geocodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { address } = parsed.data;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      
      if (apiKey) {
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
          );
          const data = await response.json();
          
          if (data.status === "OK" && data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            const formattedAddress = data.results[0].formatted_address;
            return res.json({ lat: location.lat, lng: location.lng, formattedAddress });
          }
        } catch (geoErr) {
          console.warn("Google geocoding failed, trying fallback:", geoErr);
        }
      }
      
      const normalizedAddress = address.toLowerCase().trim();
      // Prefer exact key match first to avoid substring collisions (e.g. "uk" inside "phuket")
      const fallback = Object.entries(FALLBACK_COORDINATES).find(([key]) => key === normalizedAddress)
        ?? Object.entries(FALLBACK_COORDINATES).find(([key]) =>
          normalizedAddress.includes(key) || key.includes(normalizedAddress)
        );
      
      if (fallback) {
        return res.json(fallback[1]);
      }
      
      res.status(404).json({ message: "Location not found" });
    } catch (error: any) {
      console.error('Geocoding API error:', error);
      res.status(500).json({ message: error.message || "Geocoding failed" });
    }
  });

  app.post("/api/quick-start-itinerary", isAuthenticated, async (req, res) => {
    try {
      const parsed = quickStartItinerarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { destination, country, dates, travelers, interests, pacePreference } = parsed.data;

      // Fetch city intelligence from TravelPulse
      const cityIntelligence = await travelPulseService.getCityIntelligence(destination);
      
      // Build TravelPulse context for the AI
      let travelPulseContext: any = undefined;
      
      if (cityIntelligence) {
        const city = cityIntelligence.city;
        travelPulseContext = {
          pulseScore: city.pulseScore,
          trendingScore: city.trendingScore,
          crowdLevel: city.crowdLevel,
          aiBudgetEstimate: city.aiBudgetEstimate,
          aiTravelTips: city.aiTravelTips,
          aiLocalInsights: city.aiLocalInsights,
          aiMustSeeAttractions: city.aiMustSeeAttractions,
          aiSeasonalHighlights: city.aiSeasonalHighlights,
          aiUpcomingEvents: city.aiUpcomingEvents,
          hiddenGems: cityIntelligence.hiddenGems?.slice(0, 5).map((g: any) => ({
            name: g.name,
            description: g.description,
            gemScore: g.gemScore,
          })),
          happeningNow: cityIntelligence.happeningNow?.slice(0, 5).map((h: any) => ({
            name: h.name,
            type: h.type,
          })),
        };
      }

      // Generate default dates if not provided (3-day trip starting tomorrow)
      const startDate = dates?.start || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = dates?.end || new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Generate itinerary with city intelligence context
      const itineraryRequest = {
        destination: country ? `${destination}, ${country}` : destination,
        dates: { start: startDate, end: endDate },
        travelers,
        interests: interests.length > 0 ? interests : ["culture", "food", "nature"],
        pacePreference,
        travelPulseContext,
      };

      const result = await aiOrchestrator.generateAutonomousItinerary(itineraryRequest, {
        userId,
      });

      // Store generated itinerary
      const [saved] = await db.insert(aiGeneratedItineraries).values({
        userId,
        destination: itineraryRequest.destination,
        startDate: itineraryRequest.dates.start,
        endDate: itineraryRequest.dates.end,
        title: result.title,
        summary: result.summary,
        totalEstimatedCost: result.totalEstimatedCost?.toString(),
        itineraryData: result.dailyItinerary,
        accommodationSuggestions: result.accommodationSuggestions || [],
        packingList: result.packingList || [],
        travelTips: result.travelTips || [],
        provider: "grok",
        status: "generated",
      }).returning();

      res.json({
        ...result,
        id: saved.id,
        cityIntelligence: cityIntelligence ? {
          pulseScore: cityIntelligence.city?.pulseScore,
          trendingScore: cityIntelligence.city?.trendingScore,
          hiddenGemsCount: cityIntelligence.hiddenGems?.length || 0,
          happeningNowCount: cityIntelligence.happeningNow?.length || 0,
          alertsCount: cityIntelligence.alerts?.length || 0,
        } : null,
      });
    } catch (error: any) {
      console.error("Quick start itinerary error:", error);
      res.status(500).json({ message: error.message || "Itinerary generation failed" });
    }
  });

  app.get("/api/destination-intelligence", isAuthenticated, async (req, res) => {
    try {
      const { destination, startDate, endDate } = req.query;
      const userId = (req.user as any).claims.sub;
      
      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "Destination is required" });
      }

      const dates = startDate && endDate ? {
        start: startDate as string,
        end: endDate as string
      } : undefined;

      // Check for cached intelligence (not expired)
      const now = new Date();
      
      // Build cache query conditions
      const cacheConditions = dates
        ? and(
            eq(destinationIntelligence.destination, destination),
            eq(destinationIntelligence.startDate, dates.start),
            eq(destinationIntelligence.endDate, dates.end),
            sql`${destinationIntelligence.expiresAt} > ${now.toISOString()}`
          )
        : and(
            eq(destinationIntelligence.destination, destination),
            sql`${destinationIntelligence.startDate} IS NULL`,
            sql`${destinationIntelligence.expiresAt} > ${now.toISOString()}`
          );
      
      const cached = await db.select()
        .from(destinationIntelligence)
        .where(cacheConditions)
        .orderBy(sql`${destinationIntelligence.lastUpdated} DESC`)
        .limit(1);

      if (cached.length > 0 && cached[0].intelligenceData) {
        return res.json(cached[0].intelligenceData);
      }

      // Fetch fresh intelligence using Grok
      const { grokService: grokSvc } = await import("../services/grok.service");
      const { result, usage } = await grokSvc.getRealTimeIntelligence({
        destination,
        dates,
        topics: ["events", "weather", "safety", "trending", "deals"]
      });

      // Cache the result with proper destination and date fields
      await db.insert(destinationIntelligence).values({
        destination,
        startDate: dates?.start || null,
        endDate: dates?.end || null,
        intelligenceData: result as any,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      // Log AI interaction for usage tracking
      await db.insert(aiInteractions).values({
        taskType: "real_time_intelligence",
        provider: "grok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
        estimatedCost: usage.estimatedCost.toFixed(6),
        durationMs: 0,
        success: true,
        userId,
        metadata: { destination, dates },
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error fetching destination intelligence:", error);
      res.status(500).json({ 
        message: error.message || "Failed to fetch destination intelligence",
        destination: req.query.destination,
        timestamp: new Date().toISOString(),
        events: [],
        safetyAlerts: [],
        trendingExperiences: [],
        deals: []
      });
    }
  });

  app.get("/api/venues/search", async (req, res) => {
    try {
      const { location, type = 'venue', radius, minRating, priceLevel, keyword } = req.query;

      if (!location) {
        return res.status(400).json({ message: "Location parameter is required" });
      }

      const { venueSearchService } = await import("../services/venue-search.service");
      
      const results = await venueSearchService.searchVenues({
        location: location as string,
        type: type as any,
        radius: radius ? parseInt(radius as string) : undefined,
        minRating: minRating ? parseFloat(minRating as string) : undefined,
        priceLevel: priceLevel as string,
        keyword: keyword as string
      });

      res.json({ 
        results,
        count: results.length,
        source: "serpapi"
      });
    } catch (error: any) {
      console.error("Error searching venues:", error);
      res.status(500).json({ message: "Failed to search venues", error: error.message });
    }
  });

  app.get("/api/venues/wedding-vendors", async (req, res) => {
    try {
      const { location, vendorType } = req.query;

      if (!location || !vendorType) {
        return res.status(400).json({ message: "Location and vendorType parameters are required" });
      }

      const { venueSearchService } = await import("../services/venue-search.service");
      
      const results = await venueSearchService.searchWeddingVendors(
        location as string,
        vendorType as string
      );

      res.json({ 
        results,
        count: results.length,
        vendorType,
        location
      });
    } catch (error: any) {
      console.error("Error searching wedding vendors:", error);
      res.status(500).json({ message: "Failed to search wedding vendors", error: error.message });
    }
  });

  app.get("/api/venues/:placeId", async (req, res) => {
    try {
      const { placeId } = req.params;

      const { venueSearchService } = await import("../services/venue-search.service");
      
      const venue = await venueSearchService.getVenueDetails(placeId);

      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      res.json(venue);
    } catch (error: any) {
      console.error("Error fetching venue details:", error);
      res.status(500).json({ message: "Failed to fetch venue details", error: error.message });
    }
  });

  app.patch("/api/participants/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await coordinationService.getParticipant(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Participant not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const participant = await coordinationService.updateParticipant(req.params.id, req.body);
      res.json(participant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update participant" });
    }
  });

  app.patch("/api/participants/:id/rsvp", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await coordinationService.getParticipant(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Participant not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { status, notes } = req.body;
      const participant = await coordinationService.updateRSVP(req.params.id, status, notes);
      res.json(participant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update RSVP" });
    }
  });

  app.post("/api/participants/:id/payment", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await coordinationService.getParticipant(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Participant not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { amount, method, notes } = req.body;
      const participant = await coordinationService.updatePayment(req.params.id, amount, method, notes);
      res.json(participant);
    } catch (error) {
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  app.delete("/api/participants/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await coordinationService.getParticipant(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Participant not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await coordinationService.deleteParticipant(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete participant" });
    }
  });

  app.post("/api/budget/convert-currency", isAuthenticated, async (req, res) => {
    try {
      const { amount, fromCurrency, toCurrency } = req.body;
      const conversion = await budgetService.convertCurrency(amount, fromCurrency, toCurrency);
      res.json(conversion);
    } catch (error) {
      res.status(500).json({ message: "Failed to convert currency" });
    }
  });

  app.post("/api/budget/calculate-tip", isAuthenticated, async (req, res) => {
    try {
      const { amount, countryCode, serviceType } = req.body;
      const tip = budgetService.calculateTip(amount, countryCode, serviceType);
      res.json(tip);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate tip" });
    }
  });

  app.patch("/api/transactions/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await budgetService.getTransaction(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const transaction = await budgetService.updateTransaction(req.params.id, req.body);
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ message: "Failed to update transaction" });
    }
  });

  app.delete("/api/transactions/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await budgetService.getTransaction(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await budgetService.deleteTransaction(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete transaction" });
    }
  });

  app.patch("/api/itinerary-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const userName = (req.user as any).claims.name || "User";
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const item = await itineraryIntelligenceService.updateItem(req.params.id, req.body);
      const changedFields = Object.keys(req.body).filter(k => k !== 'id').join(', ');
      logItineraryChange(existing.tripId, userName, `Updated "${existing.title}" (${changedFields})`, "edit", "owner", req.params.id);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to update itinerary item" });
    }
  });

  app.post("/api/itinerary-items/:id/backup", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { backupItemId } = req.body;
      const item = await itineraryIntelligenceService.setBackupPlan(req.params.id, backupItemId);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to set backup plan" });
    }
  });

  app.post("/api/itinerary/estimate-travel", isAuthenticated, async (req, res) => {
    try {
      const { fromLat, fromLng, toLat, toLng, mode } = req.body;
      const estimate = itineraryIntelligenceService.estimateTravelTime(fromLat, fromLng, toLat, toLng, mode);
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to estimate travel time" });
    }
  });

  app.delete("/api/itinerary-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const userName = (req.user as any).claims.name || "User";
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await itineraryIntelligenceService.deleteItem(req.params.id);
      logItineraryChange(existing.tripId, userName, `Removed "${existing.title}"`, "remove", "owner", req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete itinerary item" });
    }
  });

  app.post("/api/alerts/:id/acknowledge", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await emergencyService.getAlert(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Alert not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const alert = await emergencyService.acknowledgeAlert(req.params.id, userId);
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  app.post("/api/alerts/:id/dismiss", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await emergencyService.getAlert(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Alert not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const alert = await emergencyService.dismissAlert(req.params.id);
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to dismiss alert" });
    }
  });

  app.post("/api/content/:trackingNumber/flag", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { trackingNumber } = req.params;
      const { flagType, severity, description, evidence } = req.body;

      if (!flagType) {
        return res.status(400).json({ message: "flagType is required" });
      }

      const flag = await storage.createContentFlag({
        trackingNumber,
        reporterId: user?.claims?.sub,
        flagType,
        severity: severity || 'medium',
        description,
        evidence: evidence || [],
      });

      res.json(flag);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to flag content", error: error.message });
    }
  });

  app.get("/api/invoices/my", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const invoices = await storage.getInvoicesByCustomer(user.claims.sub);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoices", error: error.message });
    }
  });

  app.post("/api/stripe/connect/onboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!['expert', 'local_expert', 'service_provider'].includes(user.role || '')) {
        return res.status(403).json({ error: "Only experts and providers can onboard for payouts" });
      }

      const existing = await storage.getUserStripeAccount(userId);
      if (existing.stripeAccountId && existing.stripeAccountStatus === 'active') {
        return res.status(400).json({ error: "Stripe account already active" });
      }

      const { stripeConnectService } = await import('../services/stripe-connect.service');
      let accountId = existing.stripeAccountId;
      if (!accountId) {
        const result = await stripeConnectService.createConnectedAccount(
          userId, user.email, ['expert', 'local_expert'].includes(user.role) ? 'expert' : 'provider', user.name || undefined
        );
        accountId = result.accountId;
        await storage.updateUserStripeAccount(userId, accountId, 'onboarding_incomplete');
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const link = await stripeConnectService.createOnboardingLink(
        accountId,
        `${baseUrl}/stripe/connect/return`,
        `${baseUrl}/stripe/connect/refresh`
      );
      res.json({ url: link.url, accountId });
    } catch (error: any) {
      console.error('Stripe Connect onboard error:', error);
      res.status(500).json({ message: "Failed to start Stripe onboarding", error: error.message });
    }
  });

  app.get("/api/stripe/connect/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const account = await storage.getUserStripeAccount(userId);
      if (!account.stripeAccountId) {
        return res.json({ connected: false, status: 'not_connected' });
      }

      const { stripeConnectService } = await import('../services/stripe-connect.service');
      const status = await stripeConnectService.getAccountStatus(account.stripeAccountId);

      if (status.status !== account.stripeAccountStatus) {
        await storage.updateUserStripeAccount(userId, account.stripeAccountId, status.status);
      }

      res.json({
        connected: true,
        accountId: account.stripeAccountId,
        ...status,
      });
    } catch (error: any) {
      console.error('Stripe Connect status error:', error);
      res.status(500).json({ message: "Failed to check Stripe status", error: error.message });
    }
  });

  app.get("/api/stripe/connect/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const account = await storage.getUserStripeAccount(userId);
      if (!account.stripeAccountId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }

      const { stripeConnectService } = await import('../services/stripe-connect.service');
      const link = await stripeConnectService.createLoginLink(account.stripeAccountId);
      res.json({ url: link.url });
    } catch (error: any) {
      console.error('Stripe dashboard link error:', error);
      res.status(500).json({ message: "Failed to create dashboard link", error: error.message });
    }
  });

  app.get("/stripe/connect/return", (_req, res) => {
    res.redirect("/dashboard?stripe=connected");
  });

  app.get("/stripe/connect/refresh", (_req, res) => {
    res.redirect("/dashboard?stripe=refresh");
  });

  app.put("/api/anchors/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const updated = await storage.updateTemporalAnchor(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Anchor not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update anchor", error: error.message });
    }
  });

  app.delete("/api/anchors/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      await storage.deleteTemporalAnchor(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete anchor", error: error.message });
    }
  });

  app.get("/api/platform/stats", async (_req, res) => {
    try {
      const [userCount] = await db.select({ count: count() }).from(users);
      const [tripCount] = await db.select({ count: count() }).from(trips);
      const [expertCount] = await db.select({ count: count() }).from(localExpertForms).where(eq(localExpertForms.status, "approved"));
      const [reviewCount] = await db.select({ count: count() }).from(serviceReviews);
      const [bookingCount] = await db.select({ count: count() }).from(serviceBookings);
      const allReviews = await db.select({ rating: serviceReviews.rating }).from(serviceReviews);
      const avgRating = allReviews.length > 0
        ? (allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length).toFixed(1)
        : "4.9";

      const allTrips = await db.select({ destination: trips.destination }).from(trips);
      const uniqueCountries = new Set(
        allTrips.map(t => t.destination?.split(",").pop()?.trim()).filter(Boolean)
      );

      res.json({
        totalTrips: tripCount?.count || 0,
        totalUsers: userCount?.count || 0,
        totalExperts: expertCount?.count || 0,
        totalReviews: reviewCount?.count || 0,
        totalBookings: bookingCount?.count || 0,
        totalCountries: uniqueCountries.size || 0,
        avgRating,
      });
    } catch (err) {
      console.error("Platform stats error:", err);
      res.status(500).json({ message: "Failed to fetch platform stats" });
    }
  });

  app.post("/api/itinerary-variants/:variantId/share", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = (req as any).user?.id;
      const { sharedWithUserId, permissions = "view", transportPreferences } = req.body;

      const [variant] = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const shareToken = crypto.randomUUID();
      const replitDomains = process.env.REPLIT_DOMAINS;
      const baseUrl = replitDomains
        ? `https://${replitDomains.split(",")[0].trim()}`
        : (process.env.REPL_SLUG
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : `https://traveloure.com`);

      await db.insert(sharedItineraries).values({
        shareToken,
        variantId,
        sharedByUserId: userId,
        sharedWithUserId: sharedWithUserId || null,
        permissions,
        transportPreferences: transportPreferences || null,
      });

      if (sharedWithUserId) {
        await db.insert(notifications).values({
          userId: sharedWithUserId,
          type: "itinerary_shared",
          title: "Itinerary shared with you",
          message: `A traveler has shared their itinerary to ${comparison.destination} with you for review.`,
          data: { shareToken, variantId, destination: comparison.destination },
        } as any);
      }

      res.json({
        shareToken,
        shareUrl: `${baseUrl}/itinerary-view/${shareToken}`,
        expiresAt: null,
      });
    } catch (err: any) {
      console.error("Share itinerary error:", err);
      res.status(500).json({ error: "Failed to share itinerary" });
    }
  });

  app.patch("/api/transport-legs/:legId/mode", async (req, res) => {
    const VALID_TIMING = ["in_advance", "real_time"];
    const VALID_SOURCE = ["traveloure", "external"];
    try {
      const { legId } = req.params;
      const { selectedMode, shareToken, bookingTiming, providerSource } = req.body;
      const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;

      if (!selectedMode) return res.status(400).json({ error: "selectedMode is required" });
      if (bookingTiming !== undefined && bookingTiming !== null && !VALID_TIMING.includes(bookingTiming)) {
        return res.status(400).json({ error: `bookingTiming must be one of: ${VALID_TIMING.join(", ")}` });
      }
      if (providerSource !== undefined && providerSource !== null && !VALID_SOURCE.includes(providerSource)) {
        return res.status(400).json({ error: `providerSource must be one of: ${VALID_SOURCE.join(", ")}` });
      }
      if (!userId && !shareToken) return res.status(401).json({ error: "Authentication or share token required" });

      const [leg] = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.id, legId));

      if (!leg) return res.status(404).json({ error: "Transport leg not found" });

      // Ownership check: verify via the variant's comparison owner OR valid suggest share token
      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, leg.variantId));

      if (variant) {
        const [comparison] = await db
          .select({ userId: itineraryComparisons.userId })
          .from(itineraryComparisons)
          .where(eq(itineraryComparisons.id, variant.comparisonId));

        const isOwner = userId && comparison?.userId === userId;

        if (!isOwner) {
          if (shareToken) {
            const [shared] = await db
              .select({ permissions: sharedItineraries.permissions, variantId: sharedItineraries.variantId, expiresAt: sharedItineraries.expiresAt })
              .from(sharedItineraries)
              .where(and(eq(sharedItineraries.shareToken, shareToken), eq(sharedItineraries.variantId, leg.variantId)));

            if (!shared) return res.status(403).json({ error: "Not authorized to update this transport leg" });
            if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
              return res.status(410).json({ error: "Share link has expired" });
            }
            if (shared.permissions !== "suggest") {
              return res.status(403).json({ error: "This share link does not allow modifications" });
            }
          } else {
            return res.status(403).json({ error: "Not authorized to update this transport leg" });
          }
        }
      }

      const alternatives = (leg.alternativeModes as any[]) || [];
      const selected = alternatives.find((a: any) => a.mode === selectedMode);

      let newDuration = leg.estimatedDurationMinutes;
      let newCost = leg.estimatedCostUsd;
      let newEnergy = leg.energyCost;

      if (selected) {
        newDuration = selected.durationMinutes;
        newCost = selected.costUsd;
        newEnergy = selected.energyCost;
      }

      const prevDuration = leg.estimatedDurationMinutes;
      const timeDiff = newDuration - prevDuration;

      const updatePayload: Record<string, any> = {
        userSelectedMode: selectedMode,
        estimatedDurationMinutes: newDuration,
        estimatedCostUsd: newCost ?? null,
        energyCost: newEnergy ?? 0,
        updatedAt: new Date(),
      };
      if (bookingTiming !== undefined) updatePayload.bookingTiming = bookingTiming;
      if (providerSource !== undefined) updatePayload.providerSource = providerSource;

      await db
        .update(transportLegs)
        .set(updatePayload)
        .where(eq(transportLegs.id, legId));

      // Re-fetch actual stored values so response reflects DB truth
      const [storedLeg] = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.id, legId));

      // Regenerate maps URLs for all days (reflects new mode selection, replaces stale KML/GPX cache)
      let updatedMapsUrls: { googleMapsUrls: Record<number, string>; appleMapsUrls: Record<number, string>; appleMapsWebUrls: Record<number, string> } | null = null;
      try {
        updatedMapsUrls = await regenerateMapsUrlsFromLegs(leg.variantId, leg.dayNumber);
      } catch (mapsErr) {
        console.error("Maps URL regeneration error (non-critical):", mapsErr);
      }

      let downstreamMessage = "";
      if (timeDiff < 0) {
        downstreamMessage = `Switching to ${selectedMode} saves ${Math.abs(timeDiff)} minutes.`;
      } else if (timeDiff > 0) {
        downstreamMessage = `Switching to ${selectedMode} adds ${timeDiff} minutes.`;
      } else {
        downstreamMessage = `Transport mode updated to ${selectedMode}.`;
      }

      if (variant) {
        const [comp] = await db.select({ tripId: itineraryComparisons.tripId }).from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
        if (comp?.tripId) {
          const who = userId ? ((req.user as any)?.claims?.name || "User") : "Guest";
          logItineraryChange(comp.tripId, who, `Changed transport mode to ${selectedMode} (${leg.fromName} → ${leg.toName})`, "transport", shareToken ? "friend" : "owner", undefined, { legId, selectedMode, previousMode: leg.userSelectedMode || leg.recommendedMode });
        }
      }

      res.json({
        updatedLeg: {
          id: storedLeg?.id ?? legId,
          userSelectedMode: storedLeg?.userSelectedMode,
          estimatedDurationMinutes: storedLeg?.estimatedDurationMinutes,
          estimatedCostUsd: storedLeg?.estimatedCostUsd,
          energyCost: storedLeg?.energyCost,
          bookingTiming: storedLeg?.bookingTiming ?? null,
          providerSource: storedLeg?.providerSource ?? null,
        },
        downstreamImpact: {
          nextActivityStartTimeShift: -timeDiff,
          message: downstreamMessage,
        },
        updatedMapsUrls,
      });
    } catch (err: any) {
      console.error("Update transport mode error:", err);
      res.status(500).json({ error: "Failed to update transport mode" });
    }
  });

  app.get("/api/transport-legs/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const userLegs = await db
        .select({
          id: transportLegs.id,
          variantId: transportLegs.variantId,
          legOrder: transportLegs.legOrder,
          fromName: transportLegs.fromName,
          toName: transportLegs.toName,
          userSelectedMode: transportLegs.userSelectedMode,
          recommendedMode: transportLegs.recommendedMode,
        })
        .from(transportLegs)
        .innerJoin(itineraryVariants, eq(itineraryVariants.id, transportLegs.variantId))
        .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
        .where(eq(itineraryComparisons.userId, userId));

      res.json(userLegs);
    } catch (err: any) {
      console.error("Get user transport legs error:", err);
      res.status(500).json({ error: "Failed to get transport legs" });
    }
  });

  app.get("/api/itinerary-variants/:variantId/transport-legs", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = (req as any).user?.id;

      // Verify ownership: the variant must belong to a comparison owned by the requesting user
      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, variantId));
      res.json(legs);
    } catch (err: any) {
      console.error("Get transport legs error:", err);
      res.status(500).json({ error: "Failed to get transport legs" });
    }
  });

  app.post("/api/itinerary-variants/:variantId/calculate-transport", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = (req as any).user?.id;
      const { userPrefs } = req.body;

      const [variant] = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, variantId));

      const activities = items
        .filter(item => item.latitude && item.longitude)
        .map((item, idx) => ({
          id: item.id,
          name: item.name,
          lat: parseFloat(item.latitude as any),
          lng: parseFloat(item.longitude as any),
          scheduledTime: item.startTime || `09:${String(idx * 30 % 60).padStart(2, "0")}`,
          dayNumber: item.dayNumber,
          order: item.sortOrder || idx,
        }));

      const legs = await calculateTransportLegs(
        variantId,
        activities,
        comparison.destination || "",
        userPrefs || {}
      );

      res.json({ legs, count: legs.length });
    } catch (err: any) {
      console.error("Calculate transport error:", err);
      res.status(500).json({ error: "Failed to calculate transport legs" });
    }
  });

  app.get("/itinerary-view/:token", async (req, res, next) => {
    try {
      const { token } = req.params;

      // Fetch share metadata from DB
      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return next(); // Let SPA handle 404

      const [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      const [comparison] = variant
        ? await db
            .select()
            .from(itineraryComparisons)
            .where(eq(itineraryComparisons.id, variant.comparisonId))
        : [null];

      const destination = comparison?.destination || "an amazing destination";
      const variantName = variant?.name || "Travel Itinerary";
      const title = `${variantName} – ${destination} | Traveloure`;
      const description = `Explore this AI-powered itinerary for ${destination}. View day-by-day activities, transport options, and more — shared via Traveloure.`;
      const shareUrl = `${req.protocol}://${req.get("host")}/itinerary-view/${token}`;

      // Use a destination-based image for og:image (Unsplash source for travel images)
      const encodedDest = encodeURIComponent(destination);
      const ogImage = `https://source.unsplash.com/1200x630/?travel,${encodedDest}`;

      const ogTags = [
        `<title>${title}</title>`,
        `<meta name="description" content="${description}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:url" content="${shareUrl}" />`,
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="${description}" />`,
        `<meta property="og:image" content="${ogImage}" />`,
        `<meta property="og:site_name" content="Traveloure" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${title}" />`,
        `<meta name="twitter:description" content="${description}" />`,
        `<meta name="twitter:image" content="${ogImage}" />`,
      ].join("\n    ");

      // Read index.html and inject tags into <head>
      let template: string;
      const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
      const clientTemplateProd = path.resolve(__dirname, "public", "index.html");
      const templatePath = fs.existsSync(clientTemplateDev) ? clientTemplateDev : clientTemplateProd;

      if (!fs.existsSync(templatePath)) return next();

      template = fs.readFileSync(templatePath, "utf-8");
      template = template.replace("<head>", `<head>\n    ${ogTags}`);

      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (err) {
      console.error("OG meta injection error:", err);
      next(); // Fall through to SPA on error
    }
  });

}
