import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, setupFacebookAuth, setupEmailAuth } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
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
  expertPayouts, providerPayouts,
  platformSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, like, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "./itinerary-optimizer";
import messagesRouter from "./routes/messages";
import { amadeusService } from "./services/amadeus.service";
import { viatorService } from "./services/viator.service";
import { cacheService } from "./services/cache.service";
import { cacheSchedulerService } from "./services/cache-scheduler.service";
import { claudeService } from "./services/claude.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "./services/routes.service";
import { aiOrchestrator } from "./services/ai-orchestrator";
import { grokService } from "./services/grok.service";
import { feverService } from "./services/fever.service";
import { feverCacheService } from "./services/fever-cache.service";
import { expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow } from "@shared/schema";
import { coordinationService } from "./services/coordination.service";
import { vendorManagementService } from "./services/vendor-management.service";
import { budgetService } from "./services/budget.service";
import { itineraryIntelligenceService } from "./services/itinerary-intelligence.service";
import { emergencyService } from "./services/emergency.service";
import { experienceCatalogService } from "./services/experience-catalog.service";
import { opportunityEngineService } from "./services/opportunity-engine.service";
import { aiUsageService } from "./services/ai-usage.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "./utils/data-sanitizer";
import { transportLegs, sharedItineraries, mapsExportCache, expertUpdatedItineraries } from "@shared/schema";
import { accessAuditLogs, contentRegistry } from "@shared/schema";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "./services/transport-leg-calculator";
import { buildGoogleNavUrl, buildAppleNavUrl } from "./services/maps-url-builder";
import { generateKml } from "./services/kml-generator";
import { generateGpx } from "./services/gpx-generator";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "./infrastructure";
import instagramRoutes from "./routes/instagram";
import bookingsRoutes from "./routes/bookings";
import bookingActionsRoutes from "./routes/booking-actions";
import myItineraryRoutes from "./routes/my-itinerary.routes";
import transportHubRoutes from "./routes/transport-hub.routes";
import plancardRoutes from "./routes/plancard.routes";
import itineraryComparisonRoutes from "./routes/itinerary-comparisons";
import { registerAdminRoutes } from "./routes/admin";
import { registerProviderRoutes } from "./routes/provider";
import { registerExpertRoutes } from "./routes/expert";
import { registerCartRoutes } from "./routes/cart";
import { registerItineraryShareRoutes } from "./routes/itinerary";
import { registerMiscRoutes } from "./routes/misc";
import { sanitizeObject } from "./routes/route-utils";
import { 
  insertTripParticipantSchema, 
  insertVendorContractSchema, 
  insertTripTransactionSchema,
  insertItineraryItemSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema
} from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Auth setup
  try {
    await setupAuth(app);
    registerAuthRoutes(app);
    setupFacebookAuth(app);
    setupEmailAuth(app);
  } catch (error) {
    console.warn("Auth setup failed (OK for development):", (error as Error).message);
    // Continue without auth - public routes will still work
  }

  // Chat routes for AI Assistant conversations
  registerChatRoutes(app);
  app.use("/api/instagram", instagramRoutes);

  // Bookings API routes - Stripe payments, availability, pricing
  app.use("/api/bookings", bookingsRoutes);

  // Booking Actions API routes - Expert Review, Save, Share
  app.use("/api", bookingActionsRoutes);
  app.use("/api/messages", messagesRouter);

  // My Itinerary routes - final itinerary view with smart sequencing
  app.use(myItineraryRoutes);

  // Transport Hub routes - booking interface for transport legs
  app.use(transportHubRoutes);

  // PlanCard routes - change tracking, comments, structured day data
  app.use(plancardRoutes);

  // Itinerary comparison & optimization routes
  app.use(itineraryComparisonRoutes);

  // Trips Routes
  app.get(api.trips.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const trips = await storage.getTrips(userId, status);
    res.json(trips);
  });

  app.get(api.trips.get.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }
    // Check ownership
    const userId = (req.user as any).claims.sub;
    if (trip.userId !== userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(trip);
  });

  app.post(api.trips.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.trips.create.input.parse(req.body);
      // Sanitize string inputs to prevent XSS
      const sanitizedInput = sanitizeObject(input);
      
      // Additional validations
      if (sanitizedInput.startDate && sanitizedInput.endDate) {
        if (new Date(sanitizedInput.endDate) < new Date(sanitizedInput.startDate)) {
          return res.status(400).json({ message: "End date must be on or after start date" });
        }
      }
      if (sanitizedInput.budget && parseFloat(sanitizedInput.budget) < 0) {
        return res.status(400).json({ message: "Budget must be a positive number" });
      }
      
      const userId = (req.user as any).claims.sub;
      const trip = await storage.createTrip({ ...sanitizedInput, userId });
      res.status(201).json(trip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch(api.trips.update.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.trips.update.input.parse(req.body);
      // Sanitize string inputs to prevent XSS
      const sanitizedInput = sanitizeObject(input);
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      
      const userId = (req.user as any).claims.sub;
      if (trip.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

      const updatedTrip = await storage.updateTrip(req.params.id, sanitizedInput);
      res.json(updatedTrip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.trips.delete.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    
    const userId = (req.user as any).claims.sub;
    if (trip.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

    await storage.deleteTrip(req.params.id);
    res.status(204).send();
  });

  app.post(api.trips.generateItinerary.path, isAuthenticated, async (req, res) => {
    try {
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const destination = trip.destination || "the destination";
      const travelers = trip.numberOfTravelers || 1;
      const preferences = trip.preferences || "";

      let itineraryData: any;

      try {
        const prompt = `Create a detailed ${duration}-day travel itinerary for ${destination} for ${travelers} traveler(s).${preferences ? ` Preferences: ${preferences}.` : ""}

Return ONLY valid JSON in this exact structure:
{
  "days": [
    {
      "day": 1,
      "title": "Day theme title",
      "activities": [
        {
          "time": "09:00 AM",
          "title": "Activity name",
          "description": "2-3 sentence description",
          "type": "sightseeing|food|travel|rest|adventure|shopping|culture",
          "locationName": "Specific place name",
          "durationMinutes": 90,
          "estimatedCost": 20
        }
      ]
    }
  ]
}

Include 4-6 activities per day. Make it realistic, specific to ${destination}, and culturally accurate.`;

        const completion = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        });

        const text = (completion.content[0] as any).text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        itineraryData = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      } catch (aiErr) {
        console.error("AI generation failed, using contextual fallback:", aiErr);
        itineraryData = {
          days: Array.from({ length: duration }, (_, i) => ({
            day: i + 1,
            title: i === 0 ? "Arrival & Orientation" : i === duration - 1 ? "Departure Day" : `Exploration Day ${i + 1}`,
            activities: [
              { time: "09:00 AM", title: `Morning in ${destination}`, description: `Start your day exploring the highlights of ${destination}.`, type: "sightseeing", locationName: destination, durationMinutes: 120, estimatedCost: 0 },
              { time: "12:00 PM", title: "Local Lunch", description: `Try authentic local cuisine in ${destination}.`, type: "food", locationName: "Local Restaurant", durationMinutes: 60, estimatedCost: 20 },
              { time: "2:00 PM", title: "Cultural Experience", description: `Immerse yourself in the culture and history of ${destination}.`, type: "culture", locationName: destination, durationMinutes: 150, estimatedCost: 15 },
              { time: "7:00 PM", title: "Dinner", description: "Enjoy a relaxing dinner after a full day.", type: "food", locationName: "Local Restaurant", durationMinutes: 90, estimatedCost: 30 },
            ],
          })),
        };
      }

      // Upsert: update if exists, create if not
      const existing = await storage.getGeneratedItineraryByTripId(trip.id);
      let itinerary;
      if (existing) {
        [itinerary] = await db
          .update(generatedItineraries)
          .set({ itineraryData, status: "generated" })
          .where(eq(generatedItineraries.id, existing.id))
          .returning();
      } else {
        itinerary = await storage.createGeneratedItinerary({ tripId: trip.id, itineraryData, status: "generated" });
      }

      // Rebuild itinerary_items — delete old, insert new
      await db.delete(itineraryItems).where(eq(itineraryItems.tripId, trip.id));

      for (const day of itineraryData.days || []) {
        for (const activity of day.activities || []) {
          await db.insert(itineraryItems).values({
            tripId: trip.id,
            title: activity.title || "Activity",
            description: activity.description || "",
            itemType: activity.type || "activity",
            status: "planned",
            dayNumber: day.day,
            startTime: activity.time || "",
            durationMinutes: activity.durationMinutes || 60,
            locationName: activity.locationName || destination,
            estimatedCost: activity.estimatedCost != null ? String(activity.estimatedCost) : null,
            currency: "USD",
          });
        }
      }

      res.status(201).json(itinerary);
    } catch (err) {
      console.error("Error generating itinerary:", err);
      res.status(500).json({ message: "Failed to generate itinerary" });
    }
  });
  const expertBookingRequestSchema = z.object({
    tripId: z.string().min(1, "tripId is required"),
    notes: z.string().optional().default("")
  });
  app.get(api.touristPlaces.search.path, async (req, res) => {
    const query = req.query.query as string;
    if (!query) return res.json([]);
    const results = await storage.searchTouristPlaces(query);
    res.json(results);
  });

  // Chats Routes
  // SECURITY: User data is sanitized and contact info in messages is redacted
  app.get(api.chats.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userRole = (req.user as any).claims.role || 'user';
    const chats = await storage.getChats(userId);
    
    // Log access for audit trail
    storage.logAccess({
      actorId: userId,
      actorRole: userRole,
      action: 'view_chats',
      resourceType: 'chat',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    // Enrich chats with sanitized participant info and redacted messages
    const enrichedChats = await Promise.all(chats.map(async (chat) => {
      // Get the other participant's info (sanitized)
      const otherUserId = chat.senderId === userId ? chat.receiverId : chat.senderId;
      
      // Redact any contact info from message content
      const redactedMessage = redactContactInfo(chat.message);
      
      let participant = null;
      if (otherUserId) {
        const otherUser = await storage.getUser(otherUserId);
        if (otherUser) {
          const sanitizedUser = sanitizeUserForRole(otherUser, userRole, false);
          participant = {
            ...sanitizedUser,
            displayName: getDisplayName(otherUser.firstName, otherUser.lastName)
          };
        }
      }
      
      return {
        ...chat,
        message: redactedMessage, // Contact info redacted
        participant
      };
    }));
    
    res.json(enrichedChats);
  });

  app.post(api.chats.create.path, isAuthenticated, async (req, res) => {
     try {
      const input = api.chats.create.input.parse(req.body);
      // For MVP, just create it directly
      const chat = await storage.createChat(input);
      res.status(201).json(chat);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Help Guide Trips Routes
  app.get(api.helpGuideTrips.list.path, async (req, res) => {
    const trips = await storage.getHelpGuideTrips();
    res.json(trips);
  });

  app.get(api.helpGuideTrips.get.path, async (req, res) => {
    const trip = await storage.getHelpGuideTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  });
  const slugAliases: Record<string, string> = {
    "romance": "date-night",
    "corporate": "corporate-events",
  };
  
  function resolveSlug(slug: string): string {
    return slugAliases[slug] || slug;
  }
  const searchEventSchema = z.object({
    destination: z.string(),
    origin: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    travelers: z.number().optional(),
    experienceType: z.string().optional(),
    searchContext: z.string().optional(), // "discover" | "experience-template" | "quick-start"
  });

  // Track itinerary generation events
  const itineraryGeneratedSchema = z.object({
    tripId: z.string().optional(),
    destination: z.string(),
    activities: z.array(z.string()).optional(),
    duration: z.number().optional(), // days
    travelers: z.number().optional(),
    budget: z.number().optional(),
    variationType: z.string().optional(), // "user_plan" | "weather_optimized" | "best_value"
    experienceType: z.string().optional(),
  });

  // Track booking events
  const bookingEventSchema = z.object({
    type: z.string(), // "hotel" | "activity" | "flight" | "service" | "transport"
    destination: z.string().optional(),
    price: z.number().optional(),
    travelers: z.number().optional(),
    tripId: z.string().optional(),
    itemId: z.string().optional(),
    provider: z.string().optional(), // "amadeus" | "viator" | "platform" | "external"
    bookingStatus: z.string().optional(), // "initiated" | "confirmed" | "pending"
  });
  seedDatabase().catch(err => console.error("Error seeding database:", err));
  const transferSearchSchema = z.object({
    startLocationCode: z.string().min(3).max(4),
    endAddressLine: z.string().optional(),
    endCityName: z.string().optional(),
    endGeoCode: z.object({
      latitude: z.number(),
      longitude: z.number()
    }).optional(),
    transferType: z.string(),
    startDateTime: z.string(),
    passengers: z.union([z.string(), z.number()]).transform((val) => 
      typeof val === 'string' ? parseInt(val, 10) : val
    ),
  });
  const verifyItemSchema = z.object({
    type: z.enum(['hotel', 'activity', 'flight']),
    id: z.string(),
    checkInDate: z.string().optional(),
    checkOutDate: z.string().optional(),
    travelDate: z.string().optional(),
    adults: z.number().optional(),
    rooms: z.number().optional(),
    currency: z.string().optional(),
  });

  const verifyAvailabilitySchema = z.object({
    items: z.array(verifyItemSchema).min(1).max(50),
  });
  const hotelFilterSchema = z.object({
    cityCode: z.string().max(10).optional(),
    searchQuery: z.string().max(200).optional(),
    priceMin: z.coerce.number().min(0).max(100000).optional(),
    priceMax: z.coerce.number().min(0).max(100000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    preferenceTags: z.string().max(500).optional(),
    county: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    countryCode: z.string().max(5).optional(),
    sortBy: z.enum(['price_low', 'price_high', 'rating', 'popularity', 'newest']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  });

  const activityFilterSchema = z.object({
    destination: z.string().max(200).optional(),
    searchQuery: z.string().max(200).optional(),
    priceMin: z.coerce.number().min(0).max(100000).optional(),
    priceMax: z.coerce.number().min(0).max(100000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    preferenceTags: z.string().max(500).optional(),
    category: z.string().max(100).optional(),
    county: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    countryCode: z.string().max(5).optional(),
    sortBy: z.enum(['price_low', 'price_high', 'rating', 'popularity', 'newest']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  });
  const checkoutVerifySchema = z.object({
    items: z.array(z.object({
      type: z.enum(['hotel', 'activity', 'flight']),
      id: z.string().max(100),
      params: z.object({
        checkInDate: z.string().optional(),
        checkOutDate: z.string().optional(),
        travelDate: z.string().optional(),
        adults: z.number().optional(),
        rooms: z.number().optional(),
        currency: z.string().optional(),
      }).optional(),
    })).max(20),
  });
  const claudeCartItemSchema = z.object({
    id: z.string().max(100),
    type: z.string().max(50),
    name: z.string().max(500),
    price: z.number().min(0).max(1000000),
    details: z.string().max(1000).optional(),
    metadata: z.object({
      cabin: z.string().max(50).optional(),
      baggage: z.string().max(100).optional(),
      stops: z.number().min(0).max(10).optional(),
      duration: z.string().max(50).optional(),
      airline: z.string().max(100).optional(),
      departureTime: z.string().max(50).optional(),
      arrivalTime: z.string().max(50).optional(),
      refundable: z.boolean().optional(),
      cancellationDeadline: z.string().max(100).optional(),
      boardType: z.string().max(50).optional(),
      nights: z.number().min(0).max(365).optional(),
      checkInDate: z.string().max(20).optional(),
      checkOutDate: z.string().max(20).optional(),
      meetingPoint: z.string().max(500).optional(),
      meetingPointCoordinates: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }).optional(),
      travelers: z.number().min(1).max(100).optional(),
    }).passthrough().optional(),
  });

  const claudeOptimizeSchema = z.object({
    destination: z.string().min(1).max(200),
    startDate: z.string().max(20),
    endDate: z.string().max(20),
    travelers: z.number().min(1).max(100).optional(),
    budget: z.number().min(0).max(10000000).optional(),
    cartItems: z.array(claudeCartItemSchema).max(50),
    preferences: z.object({
      pacePreference: z.enum(['relaxed', 'moderate', 'packed']).optional(),
      prioritizeProximity: z.boolean().optional(),
      prioritizeBudget: z.boolean().optional(),
      prioritizeRatings: z.boolean().optional(),
    }).optional(),
  });

  const claudeTransportSchema = z.object({
    hotelLocation: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().max(500),
    }),
    activityLocations: z.array(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().max(500),
      name: z.string().max(300),
    })).max(20),
  });

  const claudeRecommendationsSchema = z.object({
    destination: z.string().min(1).max(200),
    dates: z.object({
      start: z.string().max(20),
      end: z.string().max(20),
    }),
    interests: z.array(z.string().max(50)).max(20),
  });
  const transportPackageSegmentSchema = z.object({
    id: z.string(),
    type: z.string(),
    from: z.object({ name: z.string(), type: z.string() }),
    to: z.object({ name: z.string(), type: z.string() }),
    date: z.string().optional(),
  });

  const transportPackageRequestSchema = z.object({
    segments: z.array(transportPackageSegmentSchema).min(1),
    destination: z.string().min(1),
    travelers: z.number().int().min(1).default(1),
    tripDays: z.number().int().min(1).default(1),
  });
  const multiTransitSchema = z.object({
    origin: z.object({
      lat: z.number(),
      lng: z.number(),
      name: z.string().optional(),
    }),
    destinations: z.array(z.object({
      id: z.string(),
      lat: z.number(),
      lng: z.number(),
      name: z.string(),
    })),
  });

  // Google Maps Geocoding API - Convert place name to coordinates
  const geocodeSchema = z.object({
    address: z.string().min(1),
  });

  const FALLBACK_COORDINATES: Record<string, { lat: number; lng: number; formattedAddress: string }> = {
    // Cities
    "rome": { lat: 41.9028, lng: 12.4964, formattedAddress: "Rome, Italy" },
    "paris": { lat: 48.8566, lng: 2.3522, formattedAddress: "Paris, France" },
    "london": { lat: 51.5074, lng: -0.1278, formattedAddress: "London, United Kingdom" },
    "tokyo": { lat: 35.6762, lng: 139.6503, formattedAddress: "Tokyo, Japan" },
    "new york": { lat: 40.7128, lng: -74.0060, formattedAddress: "New York, NY, USA" },
    "nyc": { lat: 40.7128, lng: -74.0060, formattedAddress: "New York, NY, USA" },
    "barcelona": { lat: 41.3874, lng: 2.1686, formattedAddress: "Barcelona, Spain" },
    "madrid": { lat: 40.4168, lng: -3.7038, formattedAddress: "Madrid, Spain" },
    "bangkok": { lat: 13.7563, lng: 100.5018, formattedAddress: "Bangkok, Thailand" },
    "sydney": { lat: -33.8688, lng: 151.2093, formattedAddress: "Sydney, Australia" },
    "dubai": { lat: 25.2048, lng: 55.2708, formattedAddress: "Dubai, UAE" },
    "marrakech": { lat: 31.6295, lng: -7.9811, formattedAddress: "Marrakech, Morocco" },
    "bali": { lat: -8.3405, lng: 115.0920, formattedAddress: "Bali, Indonesia" },
    "jakarta": { lat: -6.2088, lng: 106.8456, formattedAddress: "Jakarta, Indonesia" },
    "istanbul": { lat: 41.0082, lng: 28.9784, formattedAddress: "Istanbul, Turkey" },
    "lisbon": { lat: 38.7223, lng: -9.1393, formattedAddress: "Lisbon, Portugal" },
    "los angeles": { lat: 34.0522, lng: -118.2437, formattedAddress: "Los Angeles, CA, USA" },
    "miami": { lat: 25.7617, lng: -80.1918, formattedAddress: "Miami, FL, USA" },
    "amsterdam": { lat: 52.3676, lng: 4.9041, formattedAddress: "Amsterdam, Netherlands" },
    "berlin": { lat: 52.5200, lng: 13.4050, formattedAddress: "Berlin, Germany" },
    "hong kong": { lat: 22.3193, lng: 114.1694, formattedAddress: "Hong Kong" },
    "goa": { lat: 15.2993, lng: 74.1240, formattedAddress: "Goa, India" },
    "mumbai": { lat: 19.0760, lng: 72.8777, formattedAddress: "Mumbai, India" },
    "delhi": { lat: 28.6139, lng: 77.2090, formattedAddress: "New Delhi, India" },
    "athens": { lat: 37.9838, lng: 23.7275, formattedAddress: "Athens, Greece" },
    "cairo": { lat: 30.0444, lng: 31.2357, formattedAddress: "Cairo, Egypt" },
    "cape town": { lat: -33.9249, lng: 18.4241, formattedAddress: "Cape Town, South Africa" },
    "rio de janeiro": { lat: -22.9068, lng: -43.1729, formattedAddress: "Rio de Janeiro, Brazil" },
    "mexico city": { lat: 19.4326, lng: -99.1332, formattedAddress: "Mexico City, Mexico" },
    "beijing": { lat: 39.9042, lng: 116.4074, formattedAddress: "Beijing, China" },
    "shanghai": { lat: 31.2304, lng: 121.4737, formattedAddress: "Shanghai, China" },
    "seoul": { lat: 37.5665, lng: 126.9780, formattedAddress: "Seoul, South Korea" },
    "prague": { lat: 50.0755, lng: 14.4378, formattedAddress: "Prague, Czech Republic" },
    "vienna": { lat: 48.2082, lng: 16.3738, formattedAddress: "Vienna, Austria" },
    "zurich": { lat: 47.3769, lng: 8.5417, formattedAddress: "Zurich, Switzerland" },
    "toronto": { lat: 43.6532, lng: -79.3832, formattedAddress: "Toronto, Canada" },
    "vancouver": { lat: 49.2827, lng: -123.1207, formattedAddress: "Vancouver, Canada" },
    "san francisco": { lat: 37.7749, lng: -122.4194, formattedAddress: "San Francisco, CA, USA" },
    "chicago": { lat: 41.8781, lng: -87.6298, formattedAddress: "Chicago, IL, USA" },
    "cancun": { lat: 21.1619, lng: -86.8515, formattedAddress: "Cancun, Mexico" },
    "phuket": { lat: 7.8804, lng: 98.3923, formattedAddress: "Phuket, Thailand" },
    "chiang mai": { lat: 18.7883, lng: 98.9853, formattedAddress: "Chiang Mai, Thailand" },
    // Countries — resolve to capital or major tourism hub
    "thailand": { lat: 13.7563, lng: 100.5018, formattedAddress: "Bangkok, Thailand" },
    "japan": { lat: 35.6762, lng: 139.6503, formattedAddress: "Tokyo, Japan" },
    "france": { lat: 48.8566, lng: 2.3522, formattedAddress: "Paris, France" },
    "italy": { lat: 41.9028, lng: 12.4964, formattedAddress: "Rome, Italy" },
    "spain": { lat: 40.4168, lng: -3.7038, formattedAddress: "Madrid, Spain" },
    "uk": { lat: 51.5074, lng: -0.1278, formattedAddress: "London, United Kingdom" },
    "united kingdom": { lat: 51.5074, lng: -0.1278, formattedAddress: "London, United Kingdom" },
    "england": { lat: 51.5074, lng: -0.1278, formattedAddress: "London, United Kingdom" },
    "australia": { lat: -33.8688, lng: 151.2093, formattedAddress: "Sydney, Australia" },
    "germany": { lat: 52.5200, lng: 13.4050, formattedAddress: "Berlin, Germany" },
    "portugal": { lat: 38.7223, lng: -9.1393, formattedAddress: "Lisbon, Portugal" },
    "turkey": { lat: 41.0082, lng: 28.9784, formattedAddress: "Istanbul, Turkey" },
    "india": { lat: 19.0760, lng: 72.8777, formattedAddress: "Mumbai, India" },
    "greece": { lat: 37.9838, lng: 23.7275, formattedAddress: "Athens, Greece" },
    "morocco": { lat: 31.6295, lng: -7.9811, formattedAddress: "Marrakech, Morocco" },
    "uae": { lat: 25.2048, lng: 55.2708, formattedAddress: "Dubai, UAE" },
    "united arab emirates": { lat: 25.2048, lng: 55.2708, formattedAddress: "Dubai, UAE" },
    "china": { lat: 39.9042, lng: 116.4074, formattedAddress: "Beijing, China" },
    "mexico": { lat: 19.4326, lng: -99.1332, formattedAddress: "Mexico City, Mexico" },
    "brazil": { lat: -22.9068, lng: -43.1729, formattedAddress: "Rio de Janeiro, Brazil" },
    "south africa": { lat: -33.9249, lng: 18.4241, formattedAddress: "Cape Town, South Africa" },
    "egypt": { lat: 30.0444, lng: 31.2357, formattedAddress: "Cairo, Egypt" },
    "indonesia": { lat: -8.3405, lng: 115.0920, formattedAddress: "Bali, Indonesia" },
    "netherlands": { lat: 52.3676, lng: 4.9041, formattedAddress: "Amsterdam, Netherlands" },
    "singapore": { lat: 1.3521, lng: 103.8198, formattedAddress: "Singapore" },
    "south korea": { lat: 37.5665, lng: 126.9780, formattedAddress: "Seoul, South Korea" },
    "korea": { lat: 37.5665, lng: 126.9780, formattedAddress: "Seoul, South Korea" },
    "switzerland": { lat: 47.3769, lng: 8.5417, formattedAddress: "Zurich, Switzerland" },
    "austria": { lat: 48.2082, lng: 16.3738, formattedAddress: "Vienna, Austria" },
    "czech republic": { lat: 50.0755, lng: 14.4378, formattedAddress: "Prague, Czech Republic" },
    "canada": { lat: 43.6532, lng: -79.3832, formattedAddress: "Toronto, Canada" },
    "vietnam": { lat: 21.0285, lng: 105.8542, formattedAddress: "Hanoi, Vietnam" },
    "cambodia": { lat: 11.5564, lng: 104.9282, formattedAddress: "Phnom Penh, Cambodia" },
    "malaysia": { lat: 3.1390, lng: 101.6869, formattedAddress: "Kuala Lumpur, Malaysia" },
    "philippines": { lat: 14.5995, lng: 120.9842, formattedAddress: "Manila, Philippines" },
    "sri lanka": { lat: 6.9271, lng: 79.8612, formattedAddress: "Colombo, Sri Lanka" },
    "nepal": { lat: 27.7172, lng: 85.3240, formattedAddress: "Kathmandu, Nepal" },
    "maldives": { lat: 3.2028, lng: 73.2207, formattedAddress: "Maldives" },
    "peru": { lat: -12.0464, lng: -77.0428, formattedAddress: "Lima, Peru" },
    "argentina": { lat: -34.6037, lng: -58.3816, formattedAddress: "Buenos Aires, Argentina" },
    "colombia": { lat: 4.7110, lng: -74.0721, formattedAddress: "Bogotá, Colombia" },
    "kenya": { lat: -1.2921, lng: 36.8219, formattedAddress: "Nairobi, Kenya" },
    "tanzania": { lat: -6.7924, lng: 39.2083, formattedAddress: "Dar es Salaam, Tanzania" },
    "new zealand": { lat: -36.8485, lng: 174.7633, formattedAddress: "Auckland, New Zealand" },
    "iceland": { lat: 64.1265, lng: -21.8174, formattedAddress: "Reykjavik, Iceland" },
    "sweden": { lat: 59.3293, lng: 18.0686, formattedAddress: "Stockholm, Sweden" },
    "norway": { lat: 59.9139, lng: 10.7522, formattedAddress: "Oslo, Norway" },
    "denmark": { lat: 55.6761, lng: 12.5683, formattedAddress: "Copenhagen, Denmark" },
    "finland": { lat: 60.1699, lng: 24.9384, formattedAddress: "Helsinki, Finland" },
    "poland": { lat: 52.2297, lng: 21.0122, formattedAddress: "Warsaw, Poland" },
    "hungary": { lat: 47.4979, lng: 19.0402, formattedAddress: "Budapest, Hungary" },
    "croatia": { lat: 45.8150, lng: 15.9819, formattedAddress: "Zagreb, Croatia" },
  };
  const expertMatchSchema = z.object({
    travelerProfile: z.object({
      destination: z.string(),
      tripDates: z.object({
        start: z.string(),
        end: z.string(),
      }),
      eventType: z.string().optional(),
      budget: z.number().optional(),
      travelers: z.number(),
      interests: z.array(z.string()).optional(),
      preferences: z.record(z.any()).optional(),
    }),
    expertIds: z.array(z.string()).optional(),
    limit: z.number().optional().default(5),
  });

  // Content Generation - Generate bio, descriptions, responses
  const contentGenerationSchema = z.object({
    type: z.enum(["bio", "service_description", "inquiry_response", "welcome_message"]),
    context: z.record(z.any()),
    tone: z.enum(["professional", "friendly", "casual"]).optional(),
    length: z.enum(["short", "medium", "long"]).optional(),
  });

  // Real-Time Intelligence - Get current events, weather, trends for destination
  const intelligenceSchema = z.object({
    destination: z.string(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
    topics: z.array(z.enum(["events", "weather", "safety", "trending", "deals"])).optional(),
  });

  // Autonomous Itinerary Generation - Full AI trip planning
  const autonomousItinerarySchema = z.object({
    destination: z.string(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }),
    travelers: z.number(),
    budget: z.number().optional(),
    eventType: z.string().optional(),
    interests: z.array(z.string()),
    pacePreference: z.enum(["relaxed", "moderate", "packed"]).optional(),
    mustSeeAttractions: z.array(z.string()).optional(),
    dietaryRestrictions: z.array(z.string()).optional(),
    mobilityConsiderations: z.array(z.string()).optional(),
    tripId: z.string().optional(),
  });

  // AI Quick Start Itinerary - Fetches city intelligence and generates itinerary
  const quickStartItinerarySchema = z.object({
    destination: z.string().min(1),
    country: z.string().optional(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
    travelers: z.number().min(1).default(2),
    interests: z.array(z.string()).default([]),
    pacePreference: z.enum(["relaxed", "moderate", "packed"]).default("moderate"),
  });

  // AI Chat endpoint - General purpose chat
  const chatSchema = z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    systemContext: z.string().optional(),
    preferProvider: z.enum(["grok", "claude", "auto"]).optional(),
  });
  const delegateTaskSchema = z.object({
    taskType: z.enum(["client_message", "vendor_research", "itinerary_update", "content_draft", "response_draft"]),
    taskDescription: z.string().min(10, "Task description must be at least 10 characters"),
    clientName: z.string().optional(),
    context: z.record(z.any()).optional(),
  });
  const { travelPulseService } = await import("./services/travelpulse.service");
  const { travelPulseScheduler } = await import("./services/travelpulse-scheduler.service");

  // Middleware to check admin role for AI endpoints
  const requireAdmin = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const user = await db.select().from(users).where(eq(users.id, req.user?.claims?.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Global rate limiter for AI endpoints (max 10 refreshes per hour)
  let aiRefreshCount = 0;
  let aiRefreshResetTime = Date.now() + 60 * 60 * 1000;
  
  const checkAIRateLimit = (req: any, res: any, next: any) => {
    if (Date.now() > aiRefreshResetTime) {
      aiRefreshCount = 0;
      aiRefreshResetTime = Date.now() + 60 * 60 * 1000;
    }
    if (aiRefreshCount >= 10) {
      return res.status(429).json({ 
        message: "AI refresh rate limit exceeded. Maximum 10 manual refreshes per hour.",
        resetAt: new Date(aiRefreshResetTime),
      });
    }
    aiRefreshCount++;
    next();
  };
  travelPulseScheduler.start();
  await registerDiscoveryRoutes(app);

  // === Domain route registration ===
  registerAdminRoutes(app, resolveSlug);
  registerProviderRoutes(app, resolveSlug);
  registerExpertRoutes(app, resolveSlug);
  registerCartRoutes(app, resolveSlug);
  registerItineraryShareRoutes(app, resolveSlug);
  registerMiscRoutes(app, resolveSlug);

  return httpServer;
}

// Seed Database Function
async function hashPassword(password: string): Promise<string> {
  const crypto = await import("crypto");
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err: Error | null, derivedKey: Buffer) => {
      if (err) reject(err);
      resolve(salt + ":" + derivedKey.toString("hex"));
    });
  });
}

export async function seedDatabase() {
  // Always ensure the platform admin account exists
  const adminCheck = await db.select().from(users).where(eq(users.email, "admin@traveloure.test")).limit(1);
  if (adminCheck.length === 0) {
    const hashedPassword = await hashPassword("AdminPass123!");
    await db.insert(users).values({
      email: "admin@traveloure.test",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "Traveloure",
      role: "admin",
      emailVerified: new Date(),
      authProvider: "email",
    });
    console.log("Admin account created: admin@traveloure.test");
  }

  const existingTrips = await storage.getHelpGuideTrips();
  if (existingTrips.length === 0) {
    // Check if any user exists
    const usersList = await db.select().from(users).limit(1);
    let userId = usersList[0]?.id;

    if (!userId) {
       // Create a dummy user
       const [newUser] = await db.insert(users).values({
         email: "admin@traveloure.com",
         firstName: "Admin",
         lastName: "User"
       }).returning();
       userId = newUser.id;
    }

    await db.insert(helpGuideTrips).values([
      {
        userId: userId,
        country: "Japan",
        state: "Tokyo",
        city: "Tokyo",
        title: "Tokyo Adventure 5 Days",
        description: "Experience the vibrant culture of Tokyo.",
        highlights: "Shibuya Crossing, Senso-ji Temple, Meiji Shrine",
        days: 5,
        nights: 4,
        price: "1500.00",
        startDate: "2024-04-01",
        endDate: "2024-04-05",
        inclusive: "Hotel, Breakfast",
        exclusive: "Flights, Dinner"
      },
      {
         userId: userId,
         country: "France",
         state: "Île-de-France",
         city: "Paris",
         title: "Romantic Paris Getaway",
         description: "Enjoy 3 days in the city of love.",
         highlights: "Eiffel Tower, Louvre Museum, Seine Cruise",
         days: 3,
         nights: 2,
         price: "1200.00",
         startDate: "2024-05-10",
         endDate: "2024-05-13",
         inclusive: "Hotel, Breakfast, Cruise ticket",
         exclusive: "Flights, Lunch, Dinner"
      }
    ]);

    // Create a search record first to satisfy foreign key
    const [search] = await db.insert(touristPlacesSearches).values({
      search: "Tokyo"
    }).returning();
  }
}

// ============================================
// AI DISCOVERY (HIDDEN GEMS) ROUTES
// Grok-powered discovery of local secrets
// ============================================

export async function registerDiscoveryRoutes(app: Express) {
  const { grokDiscoveryService } = await import("./services/grok-discovery.service");

  // Trigger discovery for a destination

  // Get available categories

  // Get gems for a destination

  // Get a specific gem and increment view

  // Get destinations with gems

  // Get discovery job history

  // ==================== AFFILIATE PARTNER MANAGEMENT ====================
  
  const { affiliateScraperService } = await import("./services/affiliate-scraper.service");

  // Get partner categories

  // Create affiliate partner

  // Get all affiliate partners

  // Get single affiliate partner

  // Update affiliate partner

  // Delete affiliate partner

  // Trigger partner website scrape

  // Get scrape jobs for a partner

  // Get all affiliate products

  // Get single product

  // Track affiliate click

  // Get products for a specific location (for itinerary integration)

  // === Content Tracking System API ===

  // Get content tracking summary (admin only)

  // Get all content registry entries (admin only)

  // Get content by tracking number

  // Register new content (manual registration via API)

  // Get moderation queue (flagged content)

  // Moderate content

  // Flag content

  // Get pending flags (admin only)

  // Resolve flag (admin only)

  // === Content Invoices API ===

  // Create invoice for content

  // Get invoice by number

  // Update invoice status

  // Get invoices by customer

  // =============================================
  // AI Usage & Cost Tracking Endpoints (Admin)
  // =============================================

  // Get AI usage summary with cost breakdown

  // Get daily AI usage for charts

  // Get recent AI usage logs

  // Get AI pricing info

  // External API Usage Tracking (Amadeus, etc.)

  // === Revenue Tracking Endpoints ===

  // Admin unified revenue dashboard

  // Platform revenue summary with filters

  // Platform revenue transactions list

  // Revenue report by content tracking number

  // Provider earnings endpoints
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings

  // Provider payout requests

  // Expert earnings details endpoint
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings

  // === Stripe Connect Onboarding ===

  // === Admin Payouts Management ===

  // === Logistics: Temporal Anchors ===

  // === Logistics: Day Boundaries ===

  // === Logistics: Schedule Validation ===

  // === Logistics: Energy Calculation ===

  // === Logistics: Template Presets ===

  // === Logistics: AI Anchor Suggestions ===

  // ==========================================
  // Expert/Provider Logistics Integration
  // ==========================================

  // === Expert: Client Constraint Visibility ===

  // === Expert: Vendor Coordination ===

  // === Provider: Booking Requests ===

  // ==========================================
  // Constraint Propagation & Workflow Services
  // ==========================================

  // === Wedding Coordination ===

  // === Corporate Coordination ===

  // === Admin Users Management ===

  // Suspend/Unsuspend user

  // Change user role

  // === Admin Trips/Plans Management ===

  // === Admin Analytics Overview ===

  // Country/Region Analytics

  // Expert Analytics - detailed breakdown

  // Provider Analytics - detailed breakdown

  // === Tourism Analytics Dashboard ===

  // === Admin System Health ===

  // === Admin Global Search ===

  // === Platform Stats (Public) ===

  // === Admin Notifications (admin-specific) ===

  function getRelativeTime(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // ============================================================
  // SHAREABLE ITINERARY CARD SYSTEM
  // ============================================================

  // POST /api/itinerary-variants/:variantId/share

  // GET /api/trips/:id/share-info — Returns share token + expert review status for a trip (owner only)

  // GET /api/trips/:id/itinerary-token — Get or create a self-share token for the owner to view their itinerary

  // GET /api/itinerary-share/:token — PUBLIC

  // GET /api/trips/:tripId/transport-legs
  // Returns transport legs for the most recent selected variant associated with a trip

  // PATCH /api/trips/:tripId/transport-mode
  // Bulk-update transport mode (and optional bookingTiming/providerSource) for ALL legs in a trip

  // PATCH /api/transport-legs/:legId/mode
  // Accepts either authenticated session (owner) or a suggest-permissions shareToken (expert without login)

  // PATCH /api/itinerary-share/:token/transport-mode/bulk
  // Apply a transport mode (and optional bookingTiming/providerSource) to ALL legs in the itinerary

  // GET /api/itinerary-share/:token/export/kml

  // GET /api/itinerary-share/:token/export/gpx

  // GET /api/itinerary-share/:token/navigate/:dayNumber/:legOrder

  // GET /api/transport-legs/user — returns all transport legs for the current user across all shared itineraries

  // GET /api/itinerary-variants/:variantId/transport-legs

  // POST /api/itinerary-variants/:variantId/calculate-transport

  // POST /api/itinerary-share/:token/suggest — DEPRECATED: Expert suggests modifications (legacy)
  // Use POST /api/expert-review/:shareToken/submit instead (stores full snapshot)

  // PATCH /api/itinerary-share/:token/acknowledge — Owner accepts or rejects expert edits

  // POST /api/expert-review/:shareToken/submit — Expert submits diff + notes to expert_updated_itineraries

  // PATCH /api/expert-review/:shareToken/acknowledge — Owner acknowledges expert edits

  // Social sharing meta-tag injection for /itinerary-view/:token
  // This route intercepts the SPA route and injects Open Graph tags into the HTML
  // so social crawlers (Twitter, Facebook, Slack, etc.) see them in <head>.

  // ============================================
  // DATA TRACKING & MONETIZATION APIs
  // ============================================

  // Track search events (called from frontend)

  // Track page views

  // Track booking funnel events

  // === DATA REPORTS FOR MONETIZATION ===

  // Destination Demand Report (sell to tourism boards)

  // Service Provider Market Report

  // Geographic Insights Report (sell to countries/tourism boards)

  // Conversion Funnel Report

  // Track activity/service interactions

  // Activity Demand Report - What activities are trending

  // Activity trends by category (for selling to specific industries)

  // Track enhanced trip analytics

  // Destination Benchmark Report (premium product for tourism boards)

  // === AUTO-INFER ANALYTICS FROM USER BEHAVIOR ===
  
  // Middleware/helper to infer trip analytics from itinerary data
  async function inferTripAnalytics(tripId: string, userId: string) {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      
      // Get trip data
      const trip = await storage.getTrip(tripId);
      if (!trip) return;

      // Get itinerary items for this trip
      const itineraryData = await db.select().from(generatedItineraries).where(eq(generatedItineraries.tripId, tripId)).then(r => r[0]);
      const items = itineraryData?.itineraryData as any;

      // Infer party composition from travelers + event type
      let partyComposition = "group";
      const travelers = trip.numberOfTravelers || 1;
      const eventType = trip.eventType || "vacation";
      
      if (travelers === 1) partyComposition = "solo";
      else if (travelers === 2 && ["honeymoon", "anniversary", "proposal", "romantic"].includes(eventType)) partyComposition = "couple";
      else if (travelers <= 4 && eventType === "vacation") partyComposition = "family";
      else partyComposition = "group";

      // Infer if has children from activities (look for kid-friendly keywords)
      let hasChildren = false;
      if (items?.dailyItinerary) {
        const allActivities = JSON.stringify(items.dailyItinerary).toLowerCase();
        hasChildren = allActivities.includes("kid") || allActivities.includes("child") || 
                     allActivities.includes("family") || allActivities.includes("playground") ||
                     allActivities.includes("zoo") || allActivities.includes("aquarium");
      }

      // Calculate length of stay
      const startDate = trip.startDate ? new Date(trip.startDate) : null;
      const endDate = trip.endDate ? new Date(trip.endDate) : null;
      const lengthOfStay = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

      // Determine season
      let season = null;
      if (startDate) {
        const month = startDate.getMonth();
        if (month >= 2 && month <= 4) season = "spring";
        else if (month >= 5 && month <= 7) season = "summer";
        else if (month >= 8 && month <= 10) season = "fall";
        else season = "winter";
      }

      // Infer destination details
      const destination = trip.destination || "";
      // Try to extract country from destination string
      const destinationParts = destination.split(",").map(s => s.trim());
      const destinationCity = destinationParts[0] || destination;
      const destinationCountry = destinationParts.length > 1 ? destinationParts[destinationParts.length - 1] : null;

      // Infer price segment from budget
      let priceSegment = "mid-range";
      const budget = parseFloat(trip.budget || "0");
      const dailyBudget = lengthOfStay && lengthOfStay > 0 ? budget / lengthOfStay : budget;
      if (dailyBudget < 100) priceSegment = "budget";
      else if (dailyBudget < 300) priceSegment = "mid-range";
      else if (dailyBudget < 500) priceSegment = "luxury";
      else priceSegment = "ultra-luxury";

      // Infer primary activity from itinerary
      let primaryActivity = null;
      if (items?.dailyItinerary) {
        const activityCounts: Record<string, number> = {};
        for (const day of items.dailyItinerary) {
          for (const activity of day.activities || []) {
            const type = activity.type || activity.category || "sightseeing";
            activityCounts[type] = (activityCounts[type] || 0) + 1;
          }
        }
        primaryActivity = Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      }

      // Upsert analytics record
      await db.insert(tripAnalyticsEnhanced).values({
        tripId,
        userId,
        destinationCity,
        destinationCountry,
        tripStartDate: startDate,
        tripEndDate: endDate,
        lengthOfStay,
        season,
        partySize: travelers,
        partyComposition,
        hasChildren,
        tripPurpose: eventType,
        totalBudget: trip.budget,
        priceSegment,
        primaryActivity,
      }).onConflictDoUpdate({
        target: [tripAnalyticsEnhanced.tripId],
        set: {
          partyComposition,
          hasChildren,
          lengthOfStay,
          season,
          priceSegment,
          primaryActivity,
        }
      });

      return true;
    } catch (err) {
      console.error("Error inferring trip analytics:", err);
      return false;
    }
  }

  // Hook into itinerary generation to auto-capture analytics

  // Track searches automatically (what destinations were considered)

  // Auto-capture accommodation preference from hotel searches/bookings

  // === Admin Activity Feed ===

  // === Admin Flagged Content Queue ===

  // === Admin Platform Settings ===

  const DEFAULT_SETTINGS: Record<string, string> = {
    platform_name: "Traveloure",
    default_currency: "USD",
    timezone: "UTC",
    support_email: "support@traveloure.com",
    expert_commission_min: "75",
    expert_commission_max: "85",
    provider_commission_min: "4",
    provider_commission_max: "12",
    ai_recommendations_enabled: "true",
    new_registrations_enabled: "true",
    travelpulse_enabled: "true",
    credit_system_enabled: "true",
    affiliate_bookings_enabled: "true",
  };

  async function seedDefaultSettings() {
    try {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await db.insert(platformSettings)
          .values({ key, value })
          .onConflictDoNothing();
      }
    } catch (err) {
      console.error("Failed to seed platform settings:", err);
    }
  }
  // Seed on startup (non-blocking)
  seedDefaultSettings();

}
