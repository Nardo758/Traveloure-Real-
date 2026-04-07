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
import { 
  insertTripParticipantSchema, 
  insertVendorContractSchema, 
  insertTripTransactionSchema,
  insertItineraryItemSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema
} from "@shared/schema";

// Helper function to verify trip ownership
async function verifyTripOwnership(tripId: string, userId: string): Promise<boolean> {
  const trip = await storage.getTrip(tripId);
  return trip?.userId === userId;
}

function logItineraryChange(tripId: string, who: string, action: string, changeType: string, role: string, activityId?: string, metadata?: any) {
  return storage.createItineraryChange({
    tripId,
    activityId: activityId || null,
    who,
    action,
    changeType,
    role,
    metadata: metadata || {},
  }).catch(err => console.error("Failed to log itinerary change:", err));
}

// Helper function to map Fever categories to TravelPulse event types
function mapFeverCategoryToEventType(category: string): string {
  const categoryMap: Record<string, string> = {
    'experiences': 'cultural',
    'concerts': 'cultural',
    'theater': 'cultural',
    'exhibitions': 'cultural',
    'festivals': 'cultural',
    'nightlife': 'nightlife',
    'food-drink': 'culinary',
    'sports': 'sports',
    'wellness': 'wellness',
    'tours': 'cultural',
    'classes': 'cultural',
    'family': 'family',
  };
  return categoryMap[category] || 'other';
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Simple XSS sanitization - strips HTML tags and dangerous characters
function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    })
    .trim();
}

// Sanitize object string fields recursively
function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      result[key] = sanitizeInput(result[key]);
    }
  }
  return result;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  // Health check aliases (main health is at /health via health router)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  app.get("/api/status", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Contact form endpoint
  const contactSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    email: z.string().email("Invalid email"),
    phone: z.string().optional(),
    subject: z.string().min(1, "Subject is required").max(200),
    message: z.string().min(10, "Message must be at least 10 characters").max(2000),
    preferredContactMethod: z.enum(["email", "phone"]).optional(),
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
  
  // Chat routes for AI Assistant conversations
  registerChatRoutes(app);

  // Start a chat with an expert
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

  // Instagram API routes
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

  app.post("/api/trips/generate-itinerary", isAuthenticated, async (req, res) => {
    const { tripId } = req.body;
    if (!tripId) {
      return res.status(400).json({ message: "tripId is required in the request body" });
    }
    const trip = await storage.getTrip(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    const itinerary = await storage.createGeneratedItinerary({
      tripId: trip.id,
      itineraryData: {
        days: [
          { day: 1, activities: [
            { time: "10:00 AM", title: "Visit City Center", description: "Explore the main square." },
            { time: "2:00 PM", title: "Lunch at Local Cafe", description: "Try the famous pastry." }
          ]},
          { day: 2, activities: [
            { time: "09:00 AM", title: "Museum Tour", description: "Learn about local history." },
            { time: "4:00 PM", title: "Sunset View", description: "Best view in the city." }
          ]}
        ]
      },
      status: "generated"
    });
    res.status(201).json(itinerary);
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

  // Create generated itinerary (save AI-generated itinerary)
  app.post("/api/generated-itineraries", isAuthenticated, async (req, res) => {
    try {
      const parseResult = insertGeneratedItinerarySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid itinerary data", 
          errors: parseResult.error.errors 
        });
      }
      
      const { tripId, itineraryData, status } = parseResult.data;
      
      const trip = await storage.getTrip(tripId);
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      
      const userId = (req.user as any).claims.sub;
      if (trip.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const itinerary = await storage.createGeneratedItinerary({
        tripId,
        itineraryData: itineraryData || {},
        status: status || "generated",
      });
      
      res.status(201).json(itinerary);
    } catch (err) {
      console.error("Error saving generated itinerary:", err);
      res.status(500).json({ message: "Failed to save itinerary" });
    }
  });

  // Request expert booking assistance
  const expertBookingRequestSchema = z.object({
    tripId: z.string().min(1, "tripId is required"),
    notes: z.string().optional().default("")
  });

  app.post("/api/expert-booking-requests", isAuthenticated, async (req, res) => {
    try {
      const validation = expertBookingRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Invalid request body" 
        });
      }
      
      const { tripId, notes } = validation.data;
      const userId = (req.user as any).claims.sub;
      
      // Check if this is a real trip vs demo/mock trip
      const trip = await storage.getTrip(tripId);
      if (trip && trip.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // TODO: In production, this would create a record in expertBookingRequests table
      // and notify experts. For now, we just acknowledge the request.
      console.log(`[Expert Booking] Request received for trip ${tripId} from user ${userId}`, { notes, isDemo: !trip });
      
      res.status(201).json({ 
        success: true, 
        message: "Expert booking request submitted successfully",
        tripId,
        requestedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error creating expert booking request:", err);
      res.status(500).json({ message: "Failed to submit expert booking request" });
    }
  });

  // Get generated itinerary for a trip
  app.get("/api/generated-itineraries/:tripId", isAuthenticated, async (req, res) => {
    try {
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      
      const userId = (req.user as any).claims.sub;
      if (trip.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const itinerary = await storage.getGeneratedItineraryByTripId(req.params.tripId);
      if (!itinerary) {
        return res.status(404).json({ message: "Itinerary not found" });
      }
      res.json(itinerary);
    } catch (err) {
      console.error("Error fetching generated itinerary:", err);
      res.status(500).json({ message: "Failed to fetch itinerary" });
    }
  });

  // Tourist Places Routes
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

  // AI Blueprint Generation API
  app.post("/api/ai/generate-blueprint", isAuthenticated, async (req, res) => {
    try {
      const { eventType, destination, travelers, startDate, endDate, budget, preferences } = req.body;
      const userId = (req.user as any).claims.sub;

      const prompt = `You are an expert travel planner. Create a detailed trip blueprint for the following:
      
Event Type: ${eventType || 'vacation'}
Destination: ${destination || 'To be determined'}
Number of Travelers: ${travelers || 2}
Dates: ${startDate || 'flexible'} to ${endDate || 'flexible'}
Budget: ${budget || 'moderate'}
Special Preferences: ${JSON.stringify(preferences || {})}

Please provide a comprehensive travel blueprint in JSON format with this structure:
{
  "title": "Trip title",
  "overview": "Brief trip overview",
  "estimatedBudget": { "min": number, "max": number, "currency": "USD" },
  "recommendedDuration": { "days": number, "nights": number },
  "highlights": ["highlight1", "highlight2", ...],
  "itinerary": [
    {
      "day": 1,
      "title": "Day title",
      "description": "Day overview",
      "activities": [
        { "time": "9:00 AM", "title": "Activity", "description": "Description", "estimatedCost": 50 }
      ],
      "meals": { "breakfast": "suggestion", "lunch": "suggestion", "dinner": "suggestion" },
      "accommodation": "Hotel recommendation"
    }
  ],
  "packingList": ["item1", "item2"],
  "travelTips": ["tip1", "tip2"],
  "recommendedVendors": [
    { "type": "hotel", "name": "Hotel Name", "reason": "Why recommended" }
  ]
}`;

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: "You are a professional travel planning assistant. Always respond with valid JSON.",
        messages: [
          { role: "user", content: prompt }
        ],
      });

      const blueprintContent = completion.content[0]?.type === "text" ? completion.content[0].text : null;
      const blueprintData = blueprintContent ? JSON.parse(blueprintContent) : {};

      const [blueprint] = await db.insert(aiBlueprints).values({
        userId,
        eventType: eventType || 'vacation',
        destination,
        blueprintData,
        status: 'generated',
      }).returning();

      res.status(201).json(blueprint);
    } catch (error) {
      console.error("Error generating blueprint:", error);
      res.status(500).json({ message: "Failed to generate blueprint" });
    }
  });

  // AI Chat Endpoint for Trip Planning
  app.post("/api/ai/chat", isAuthenticated, async (req, res) => {
    try {
      const { messages, tripContext } = req.body;

      const systemPrompt = `You are an expert travel advisor assistant for Traveloure. 
You help users plan trips, answer questions about destinations, provide recommendations for hotels, restaurants, activities, and help with wedding/honeymoon/special event planning.
${tripContext ? `Current trip context: ${JSON.stringify(tripContext)}` : ''}
Be friendly, helpful, and provide specific actionable advice. If recommending specific places, provide names and brief descriptions.`;

      // Transform messages to ensure proper Anthropic format with alternation
      const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const m of messages || []) {
        const role = m.role as "user" | "assistant";
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        const lastRole = anthropicMessages.length > 0 ? anthropicMessages[anthropicMessages.length - 1].role : null;
        if (lastRole === role) {
          anthropicMessages[anthropicMessages.length - 1].content += "\n" + content;
        } else {
          anthropicMessages.push({ role, content });
        }
      }
      
      // Ensure first message is from user
      if (anthropicMessages.length === 0 || anthropicMessages[0].role !== "user") {
        anthropicMessages.unshift({ role: "user", content: "Hello, I need help with travel planning." });
      }

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: anthropicMessages,
      });

      const response = completion.content[0]?.type === "text" ? completion.content[0].text : "I'm sorry, I couldn't process your request.";
      res.json({ response });
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ message: "Failed to process chat request" });
    }
  });

  // Experience AI Optimization endpoint
  app.post("/api/ai/optimize-experience", isAuthenticated, async (req, res) => {
    try {
      const { experienceType, destination, date, selectedServices, preferences } = req.body;
      
      const servicesContext = selectedServices?.map((s: any) => ({
        name: s.name,
        provider: s.provider,
        price: s.price,
        category: s.category
      })) || [];

      const systemPrompt = `You are an expert experience planning optimizer for Traveloure. 
Analyze the user's selected services and provide optimization recommendations.
Experience Type: ${experienceType}
Destination: ${destination || "Not specified"}
Date: ${date || "Flexible"}
Selected Services: ${JSON.stringify(servicesContext)}
Preferences: ${JSON.stringify(preferences || {})}

Provide a comprehensive optimization analysis in JSON format with this structure:
{
  "overallScore": number between 0-100,
  "summary": "Brief summary of the analysis",
  "recommendations": [
    { 
      "type": "timing" | "cost" | "quality" | "logistics" | "alternative",
      "title": "Recommendation title",
      "description": "Detailed recommendation",
      "impact": "high" | "medium" | "low",
      "potentialSavings": number or null
    }
  ],
  "optimizedSchedule": [
    {
      "time": "HH:MM AM/PM",
      "activity": "Activity name",
      "location": "Location",
      "notes": "Any special notes"
    }
  ],
  "estimatedTotal": {
    "original": number,
    "optimized": number,
    "savings": number
  },
  "warnings": ["Any concerns or warnings about the plan"]
}`;

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          { role: "user", content: `Please analyze and optimize my ${experienceType} experience plan.` }
        ],
      });

      const responseText = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
      const optimization = JSON.parse(responseText);
      
      res.json(optimization);
    } catch (error) {
      console.error("Error in experience optimization:", error);
      res.status(500).json({ 
        message: "Failed to optimize experience",
        overallScore: 0,
        summary: "Unable to process optimization request",
        recommendations: [],
        optimizedSchedule: [],
        estimatedTotal: { original: 0, optimized: 0, savings: 0 },
        warnings: ["Optimization service temporarily unavailable"]
      });
    }
  });

  // Vendors Routes
  app.get("/api/vendors", async (req, res) => {
    const { category, city } = req.query;
    const vendorList = await storage.getVendors(
      category as string | undefined, 
      city as string | undefined
    );
    res.json(vendorList);
  });

  app.post("/api/vendors", isAuthenticated, async (req, res) => {
    try {
      const input = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor(input);
      res.status(201).json(vendor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating vendor:", err);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  // === Expert Application Routes ===
  
  // Get current user's expert application
  app.get("/api/expert-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const form = await storage.getLocalExpertForm(userId);
    res.json(form || null);
  });

  // Submit expert application
  app.post("/api/expert-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const existing = await storage.getLocalExpertForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }

      const input = insertLocalExpertFormSchema.parse(req.body);
      const form = await storage.createLocalExpertForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating expert application:", err);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Alias: /api/expert-forms -> /api/expert-application (for API compatibility)
  app.post("/api/expert-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await storage.getLocalExpertForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }
      const input = insertLocalExpertFormSchema.parse(req.body);
      const form = await storage.createLocalExpertForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Admin: Get platform stats
  app.get("/api/admin/stats", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Get counts from database
      const allUsers = await db.select().from(users);
      const allBookings = await storage.getServiceBookings({});
      const pendingExperts = await storage.getLocalExpertForms("pending");
      const pendingProviders = await storage.getServiceProviderForms("pending");
      
      const totalUsers = allUsers.length;
      const totalBookings = allBookings.length;
      
      // Calculate revenue from completed bookings
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // This month's revenue
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const monthlyRevenue = completedBookings
        .filter(b => {
          const date = b.createdAt ? new Date(b.createdAt) : null;
          return date && date.getMonth() === thisMonth && date.getFullYear() === thisYear;
        })
        .reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // New users today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newUsersToday = allUsers.filter(u => {
        const created = u.createdAt ? new Date(u.createdAt) : null;
        return created && created >= today;
      }).length;
      
      res.json({
        totalUsers,
        totalBookings,
        totalRevenue,
        monthlyRevenue,
        newUsersToday,
        pendingExpertApplications: pendingExperts.length,
        pendingProviderApplications: pendingProviders.length,
      });
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/bookings", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const status = req.query.status as string | undefined;
      const allBookings = await storage.getServiceBookings(status ? { status } : {});
      const enrichedBookings = await Promise.all(allBookings.map(async (booking) => {
        const traveler = await storage.getUser(booking.travelerId);
        const provider = await storage.getUser(booking.providerId);
        const service = await storage.getProviderServiceById(booking.serviceId);
        return {
          ...booking,
          traveler: traveler ? { id: traveler.id, firstName: traveler.firstName, lastName: traveler.lastName, email: traveler.email } : null,
          provider: provider ? { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, email: provider.email } : null,
          service: service ? { id: service.id, serviceName: service.serviceName } : null,
        };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("Admin bookings error:", err);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.get("/api/admin/revenue", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const allBookings = await storage.getServiceBookings({});
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      const totalGross = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
      res.json({
        totalRevenue,
        totalGross,
        totalBookings: allBookings.length,
        completedBookings: completedBookings.length,
      });
    } catch (err) {
      console.error("Admin revenue error:", err);
      res.status(500).json({ message: "Failed to fetch revenue" });
    }
  });

  // Admin: Get all expert applications
  app.get("/api/admin/expert-applications", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getLocalExpertForms(status);
    res.json(forms);
  });

  // Admin: Update expert application status
  app.patch("/api/admin/expert-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const updated = await storage.updateLocalExpertFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // If approved, update user role based on expert type
    if (status === "approved") {
      // Use the expertType from the form, default to "expert" for backwards compatibility
      const role = (updated as any).expertType || "expert";
      await db.update(users).set({ role }).where(eq(users.id, updated.userId));
    }
    
    res.json(updated);
  });

  // === Provider Application Routes ===
  
  // Get current user's provider application
  app.get("/api/provider-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const form = await storage.getServiceProviderForm(userId);
    res.json(form || null);
  });

  // Submit provider application
  app.post("/api/provider-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const existing = await storage.getServiceProviderForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }

      const input = insertServiceProviderFormSchema.parse(req.body);
      const form = await storage.createServiceProviderForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating provider application:", err);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Alias: /api/provider-forms -> /api/provider-application (for API compatibility)
  app.post("/api/provider-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await storage.getServiceProviderForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }
      const input = insertServiceProviderFormSchema.parse(req.body);
      const form = await storage.createServiceProviderForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Admin: Get all provider applications
  app.get("/api/admin/provider-applications", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getServiceProviderForms(status);
    res.json(forms);
  });

  // Admin: Update provider application status
  app.patch("/api/admin/provider-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const updated = await storage.updateServiceProviderFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // If approved, update user role to service_provider
    if (status === "approved") {
      await db.update(users).set({ role: "service_provider" }).where(eq(users.id, updated.userId));
    }
    
    res.json(updated);
  });

  // === Provider Services Routes ===
  
  // Get all active provider services (public - for experience browsing)
  app.get("/api/provider-services", async (req, res) => {
    const services = await storage.getAllProviderServices();
    res.json(services);
  });
  
  // Get provider's services
  app.get("/api/provider/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getProviderServices(userId);
    res.json(services);
  });

  // Create a new service
  app.post("/api/provider/services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = insertProviderServiceSchema.parse(req.body);
      const service = await storage.createProviderService({ ...input, userId });
      res.status(201).json(service);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating provider service:", err);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  // Update a service
  app.patch("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const services = await storage.getProviderServices(userId);
      const ownedService = services.find(s => s.id === req.params.id);
      if (!ownedService) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const input = insertProviderServiceSchema.partial().parse(req.body);
      // Remove userId from input to prevent ownership transfer
      const { userId: _, ...safeInput } = input as any;
      const updated = await storage.updateProviderService(req.params.id, safeInput);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  // Delete a service
  app.delete("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getProviderServices(userId);
    const ownedService = services.find(s => s.id === req.params.id);
    if (!ownedService) {
      return res.status(404).json({ message: "Service not found or not owned by you" });
    }
    await storage.deleteProviderService(req.params.id);
    res.status(204).send();
  });

  // === Service Categories Routes ===
  
  // Get all categories
  app.get("/api/service-categories", async (req, res) => {
    const categories = await storage.getServiceCategories();
    res.json(categories);
  });

  app.get("/api/service-categories/provider-counts", async (_req, res) => {
    try {
      const counts = await db
        .select({
          categoryId: serviceProviderForms.categoryId,
          count: sql<number>`count(*)::int`,
        })
        .from(serviceProviderForms)
        .where(isNotNull(serviceProviderForms.categoryId))
        .groupBy(serviceProviderForms.categoryId);
      const map: Record<string, number> = {};
      counts.forEach(c => { if (c.categoryId) map[c.categoryId] = c.count; });
      res.json(map);
    } catch (error: any) {
      console.error("Failed to fetch provider counts:", error?.message || error);
      res.status(500).json({});
    }
  });

  // Create category (admin)
  app.post("/api/service-categories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.parse(req.body);
      const category = await storage.createServiceCategory(input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Get subcategories for a category
  app.get("/api/service-categories/:categoryId/subcategories", async (req, res) => {
    const subcategories = await storage.getServiceSubcategories(req.params.categoryId);
    res.json(subcategories);
  });

  // Create subcategory (admin)
  app.post("/api/service-subcategories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceSubcategorySchema.parse(req.body);
      const subcategory = await storage.createServiceSubcategory(input);
      res.status(201).json(subcategory);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create subcategory" });
    }
  });

  // === Custom Venues Routes ===
  
  // Get custom venues (with optional filters)
  app.get("/api/custom-venues", async (req, res) => {
    const { userId, tripId, experienceType } = req.query;
    const venues = await storage.getCustomVenues(
      userId as string | undefined,
      tripId as string | undefined,
      experienceType as string | undefined
    );
    res.json(venues);
  });

  // Get single custom venue
  app.get("/api/custom-venues/:id", async (req, res) => {
    const venue = await storage.getCustomVenue(req.params.id);
    if (!venue) {
      return res.status(404).json({ message: "Custom venue not found" });
    }
    res.json(venue);
  });

  // Create custom venue
  app.post("/api/custom-venues", isAuthenticated, async (req, res) => {
    try {
      const input = insertCustomVenueSchema.parse(req.body);
      const venue = await storage.createCustomVenue(input);
      res.status(201).json(venue);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating custom venue:", err);
      res.status(500).json({ message: "Failed to create custom venue" });
    }
  });

  // Update custom venue
  app.patch("/api/custom-venues/:id", isAuthenticated, async (req, res) => {
    try {
      const input = insertCustomVenueSchema.partial().parse(req.body);
      const updated = await storage.updateCustomVenue(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Custom venue not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update custom venue" });
    }
  });

  // Delete custom venue
  app.delete("/api/custom-venues/:id", isAuthenticated, async (req, res) => {
    await storage.deleteCustomVenue(req.params.id);
    res.status(204).send();
  });

  // === Experience Types Routes ===
  
  // Slug aliasing for backward compatibility
  const slugAliases: Record<string, string> = {
    "romance": "date-night",
    "corporate": "corporate-events",
  };
  
  function resolveSlug(slug: string): string {
    return slugAliases[slug] || slug;
  }
  
  // Get all experience types (filter out legacy slugs for frontend)
  app.get("/api/experience-types", async (req, res) => {
    const types = await storage.getExperienceTypes();
    // Filter out legacy slugs that have been aliased
    const legacySlugs = Object.keys(slugAliases);
    const filteredTypes = types.filter(t => !legacySlugs.includes(t.slug));
    res.json(filteredTypes);
  });

  // Get experience type by slug (with alias resolution)
  app.get("/api/experience-types/:slug", async (req, res) => {
    const resolvedSlug = resolveSlug(req.params.slug);
    const type = await storage.getExperienceTypeBySlug(resolvedSlug);
    if (!type) {
      return res.status(404).json({ message: "Experience type not found" });
    }
    res.json(type);
  });

  // Get template steps for an experience type
  app.get("/api/experience-types/:id/steps", async (req, res) => {
    const steps = await storage.getExperienceTemplateSteps(req.params.id);
    res.json(steps);
  });

  // Get template tabs with filters for an experience type
  app.get("/api/experience-types/:id/tabs", async (req, res) => {
    try {
      const tabs = await storage.getExperienceTemplateTabs(req.params.id);
      res.json(tabs);
    } catch (error) {
      console.error("Error fetching template tabs:", error);
      res.status(500).json({ message: "Failed to fetch template tabs" });
    }
  });

  // Get universal filters for an experience type
  app.get("/api/experience-types/:id/universal-filters", async (req, res) => {
    try {
      const filters = await storage.getExperienceUniversalFilters(req.params.id);
      res.json(filters);
    } catch (error) {
      console.error("Error fetching universal filters:", error);
      res.status(500).json({ message: "Failed to fetch universal filters" });
    }
  });

  // === Experience Catalog API ===

  // Search unified experience catalog across all providers
  app.get("/api/catalog/search", async (req, res) => {
    try {
      const { 
        destination, 
        query, 
        priceMin, 
        priceMax, 
        rating, 
        sortBy, 
        limit, 
        offset,
        providers,
        experienceTypeSlug,
        tabSlug
      } = req.query;

      const result = await experienceCatalogService.searchCatalog({
        destination: destination as string | undefined,
        query: query as string | undefined,
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
        rating: rating ? parseFloat(rating as string) : undefined,
        sortBy: sortBy as "popular" | "price_low" | "price_high" | "rating" | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        providers: providers ? (providers as string).split(",") : undefined,
        experienceTypeSlug: experienceTypeSlug as string | undefined,
        tabSlug: tabSlug as string | undefined,
      });

      res.json(result);
    } catch (error) {
      console.error("Catalog search error:", error);
      res.status(500).json({ message: "Failed to search catalog" });
    }
  });

  // Hybrid catalog search with SERP fallback
  app.get("/api/catalog/search-hybrid", async (req, res) => {
    try {
      const { hybridCatalogSearchQuerySchema } = await import("@shared/schema");
      const parseResult = hybridCatalogSearchQuerySchema.safeParse(req.query);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const result = await experienceCatalogService.searchWithSerpFallback(parseResult.data);

      res.json(result);
    } catch (error) {
      console.error("Hybrid catalog search error:", error);
      res.status(500).json({ message: "Failed to search catalog" });
    }
  });

  // Get experience type with all tabs and filters
  app.get("/api/catalog/templates/:slug", async (req, res) => {
    try {
      const result = await experienceCatalogService.getExperienceTypeWithTabs(req.params.slug);
      if (!result.experienceType) {
        return res.status(404).json({ message: "Experience type not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  // Get single catalog item by ID and type
  app.get("/api/catalog/items/:type/:id", async (req, res) => {
    try {
      const item = await experienceCatalogService.getCatalogItem(req.params.id, req.params.type);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching catalog item:", error);
      res.status(500).json({ message: "Failed to fetch catalog item" });
    }
  });

  // Get available destinations from all providers
  app.get("/api/catalog/destinations", async (req, res) => {
    try {
      const destinations = await experienceCatalogService.getDestinations();
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching destinations:", error);
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  // Alias: /api/destinations -> /api/catalog/destinations
  app.get("/api/destinations", async (req, res) => {
    try {
      const destinations = await experienceCatalogService.getDestinations();
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching destinations:", error);
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  // === User Experiences Routes ===

  // Get user's experiences
  app.get("/api/user-experiences", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experiences = await storage.getUserExperiences(userId);
    res.json(experiences);
  });

  // Get single experience with items
  app.get("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const items = await storage.getUserExperienceItems(req.params.id);
    res.json({ ...experience, items });
  });

  // Create new experience
  app.post("/api/user-experiences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const experience = await storage.createUserExperience({ ...req.body, userId });
      res.status(201).json(experience);
    } catch (err) {
      res.status(500).json({ message: "Failed to create experience" });
    }
  });

  // Update experience
  app.patch("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const updated = await storage.updateUserExperience(req.params.id, req.body);
    res.json(updated);
  });

  // Delete experience
  app.delete("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    await storage.deleteUserExperience(req.params.id);
    res.status(204).send();
  });

  // Add item to experience
  app.post("/api/user-experiences/:id/items", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const item = await storage.addUserExperienceItem({ ...req.body, userExperienceId: req.params.id });
    res.status(201).json(item);
  });

  // Update experience item
  app.patch("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    const updated = await storage.updateUserExperienceItem(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json(updated);
  });

  // Remove experience item
  app.delete("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    await storage.removeUserExperienceItem(req.params.id);
    res.status(204).send();
  });

  // === FAQ Routes ===
  
  // Get all FAQs
  app.get("/api/faqs", async (req, res) => {
    const category = req.query.category as string | undefined;
    const faqsList = await storage.getFAQs(category);
    res.json(faqsList);
  });

  // Create FAQ (admin)
  app.post("/api/faqs", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertFaqSchema.parse(req.body);
      const faq = await storage.createFAQ(input);
      res.status(201).json(faq);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  // Update FAQ (admin)
  app.patch("/api/faqs/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertFaqSchema.partial().parse(req.body);
      const updated = await storage.updateFAQ(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "FAQ not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update FAQ" });
    }
  });

  // Delete FAQ (admin)
  app.delete("/api/faqs/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteFAQ(req.params.id);
    res.status(204).send();
  });

  // === Wallet & Credits Routes ===
  
  // Get current user's wallet
  app.get("/api/wallet", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getOrCreateWallet(userId);
    res.json(wallet);
  });

  // Get wallet transactions
  app.get("/api/wallet/transactions", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getWallet(userId);
    if (!wallet) {
      return res.json([]);
    }
    const transactions = await storage.getCreditTransactions(wallet.id);
    res.json(transactions);
  });

  // Add credits (admin only - for production, integrate with payment provider)
  app.post("/api/wallet/add-credits", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId, amount, description } = req.body;
      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid userId or amount" });
      }
      const transaction = await storage.addCredits(userId, amount, description || "Credit purchase");
      res.status(201).json(transaction);
    } catch (err) {
      console.error("Error adding credits:", err);
      res.status(500).json({ message: "Failed to add credits" });
    }
  });

  // Purchase credits via Stripe Checkout
  const CREDIT_PACKAGES = [
    { id: 1, credits: 50, price: 49 },
    { id: 2, credits: 100, price: 89 },
    { id: 3, credits: 250, price: 199 },
    { id: 4, credits: 500, price: 349 },
  ];

  app.post("/api/credits/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { packageId } = req.body;

      const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
      if (!pkg) {
        return res.status(400).json({ message: "Invalid package" });
      }

      const { credits, price } = pkg;

      const userRecord = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      const userEmail = userRecord?.email || undefined;

      const { getBaseUrl } = await import("./services/stripe.service");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });

      const baseUrl = getBaseUrl();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${credits} Credits`,
                description: `Traveloure credit package - ${credits} credits`,
              },
              unit_amount: Math.round(price * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'credit_purchase',
          userId,
          credits: credits.toString(),
          packageId: packageId?.toString() || '',
        },
        success_url: `${baseUrl}/credits-billing?purchase=success&credits=${credits}`,
        cancel_url: `${baseUrl}/credits-billing?purchase=cancelled`,
      });

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (err: any) {
      console.error("Credit purchase error:", err);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // === Service Templates Routes (Admin manages, Experts browse) ===
  
  // Get all active service templates
  app.get("/api/service-templates", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const templates = await storage.getServiceTemplates(categoryId);
    res.json(templates);
  });

  // Get single template
  app.get("/api/service-templates/:id", async (req, res) => {
    const template = await storage.getServiceTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  });

  // Create template (admin only)
  app.post("/api/admin/service-templates", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceTemplateSchema.parse(req.body);
      const template = await storage.createServiceTemplate(input);
      res.status(201).json(template);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Update template (admin only)
  app.patch("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateServiceTemplate(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Delete template (admin only - soft delete)
  app.delete("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceTemplate(req.params.id);
    res.status(204).send();
  });

  // === Admin Service Category Management ===

  // Get all categories with subcategories
  app.get("/api/admin/categories", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const type = req.query.type as string | undefined;
    const categories = await storage.getServiceCategories(type);
    const subcategories = await storage.getAllServiceSubcategories();
    
    // Attach subcategories to each category
    const categoriesWithSubs = categories.map(cat => ({
      ...cat,
      subcategories: subcategories.filter(sub => sub.categoryId === cat.id)
    }));
    res.json(categoriesWithSubs);
  });

  // Get single category
  app.get("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const category = await storage.getServiceCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    const subcategories = await storage.getServiceSubcategories(req.params.id);
    res.json({ ...category, subcategories });
  });

  // Create category (admin only)
  app.post("/api/admin/categories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.parse(req.body);
      const category = await storage.createServiceCategory(input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Update category (admin only)
  app.patch("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.partial().parse(req.body);
      const updated = await storage.updateServiceCategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  // Delete category (admin only)
  app.delete("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceCategory(req.params.id);
    res.status(204).send();
  });

  // Create subcategory (admin only)
  app.post("/api/admin/categories/:categoryId/subcategories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const category = await storage.getServiceCategoryById(req.params.categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      const input = insertServiceSubcategorySchema.parse({ ...req.body, categoryId: req.params.categoryId });
      const subcategory = await storage.createServiceSubcategory(input);
      res.status(201).json(subcategory);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create subcategory" });
    }
  });

  // Update subcategory (admin only)
  app.patch("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceSubcategorySchema.partial().parse(req.body);
      const updated = await storage.updateServiceSubcategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Subcategory not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update subcategory" });
    }
  });

  // Delete subcategory (admin only)
  app.delete("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceSubcategory(req.params.id);
    res.status(204).send();
  });

  // Seed 15 core categories (admin only - run once)
  app.post("/api/admin/seed-categories", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const coreCategories = [
      { name: "Photography & Videography", slug: "photography-videography", description: "Portrait, event, engagement, family, architectural photography and travel videos, drone footage", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["portfolio", "insurance"], priceRange: { min: 150, max: 1000 }, sortOrder: 1 },
      { name: "Transportation & Logistics", slug: "transportation-logistics", description: "Private drivers, airport transfers, day trips, specialty transport", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance", "vehicle_registration"], priceRange: { min: 50, max: 800 }, sortOrder: 2 },
      { name: "Food & Culinary", slug: "food-culinary", description: "Private chefs, cooking lessons, meal prep, sommelier services, food tours", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["culinary_credentials", "food_handler_license"], priceRange: { min: 100, max: 600 }, sortOrder: 3 },
      { name: "Childcare & Family", slug: "childcare-family", description: "Babysitters, nannies, kids activity coordinators, family assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "cpr_certification", "references"], priceRange: { min: 20, max: 150 }, sortOrder: 4 },
      { name: "Tours & Experiences", slug: "tours-experiences", description: "Tour guides, walking tours, museum tours, adventure guides, cultural experiences", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["tour_guide_license", "insurance"], priceRange: { min: 100, max: 500 }, sortOrder: 5 },
      { name: "Personal Assistance", slug: "personal-assistance", description: "Travel companions, personal concierge, executive assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "references", "first_aid"], priceRange: { min: 100, max: 300 }, sortOrder: 6 },
      { name: "TaskRabbit Services", slug: "taskrabbit-services", description: "Handyman, delivery, cleaning, property management", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 30, max: 200 }, sortOrder: 7 },
      { name: "Health & Wellness", slug: "health-wellness", description: "Fitness instructors, massage therapists, yoga teachers, wellness coaches", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["certification", "insurance"], priceRange: { min: 50, max: 200 }, sortOrder: 8 },
      { name: "Beauty & Styling", slug: "beauty-styling", description: "Hair stylists, makeup artists, personal stylists", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 75, max: 300 }, sortOrder: 9 },
      { name: "Pets & Animals", slug: "pets-animals", description: "Pet sitters, dog walkers, animal experience guides", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["references"], priceRange: { min: 25, max: 100 }, sortOrder: 10 },
      { name: "Events & Celebrations", slug: "events-celebrations", description: "Event coordinators, florists, bakers, party planners", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 1500 }, sortOrder: 11 },
      { name: "Technology & Connectivity", slug: "technology-connectivity", description: "Tech support, social media management, photography editing", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 50, max: 150 }, sortOrder: 12 },
      { name: "Language & Translation", slug: "language-translation", description: "Translators, interpreters, language tutors", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["certification", "references"], priceRange: { min: 50, max: 200 }, sortOrder: 13 },
      { name: "Specialty Services", slug: "specialty-services", description: "Wedding coordinators, relocation specialists, legal/visa assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 200, max: 2000 }, sortOrder: 14 },
      { name: "Custom / Other", slug: "custom-other", description: "Custom service requests, user-suggested categories", categoryType: "service_provider", verificationRequired: true, requiredDocuments: [], priceRange: { min: 0, max: 0 }, sortOrder: 15 },
    ];
    
    const created = [];
    for (const cat of coreCategories) {
      try {
        const existing = await storage.getServiceCategoryBySlug(cat.slug);
        if (!existing) {
          const newCat = await storage.createServiceCategory(cat as any);
          created.push(newCat);
        }
      } catch (err) {
        console.error(`Failed to create category ${cat.name}:`, err);
      }
    }
    
    res.json({ message: `Created ${created.length} categories`, categories: created });
  });

  // === Enhanced Expert Services Routes ===

  // Get all expert service categories with offerings (public)
  app.get("/api/expert-service-categories", async (_req, res) => {
    const categories = await storage.getExpertServiceCategories();
    const categoriesWithOfferings = await Promise.all(categories.map(async (cat) => {
      const offerings = await storage.getExpertServiceOfferings(cat.id);
      return { ...cat, offerings };
    }));
    res.json(categoriesWithOfferings);
  });

  // Get expert service offerings for a specific category
  app.get("/api/expert-service-categories/:categoryId/offerings", async (req, res) => {
    const offerings = await storage.getExpertServiceOfferings(req.params.categoryId);
    res.json(offerings);
  });

  // Get all experts with their full profiles (public)
  app.get("/api/experts", async (req, res) => {
    const experienceTypeId = req.query.experienceTypeId as string | undefined;
    const location = req.query.location as string | undefined;
    const experienceType = req.query.experienceType as string | undefined;
    const experts = await storage.getExpertsWithProfiles(experienceTypeId);

    let filtered = experts;

    // Filter by location (match against expert form destinations, city, or country)
    if (location) {
      const loc = location.toLowerCase();
      filtered = filtered.filter((expert: any) => {
        const form = expert.expertForm;
        if (!form) return false;
        const destinations = (form.destinations || []).map((d: string) => d.toLowerCase());
        const city = (form.city || "").toLowerCase();
        const country = (form.country || "").toLowerCase();
        return destinations.some((d: string) => d.includes(loc) || loc.includes(d)) ||
          city.includes(loc) || loc.includes(city) ||
          country.includes(loc) || loc.includes(country);
      });
    }

    // Filter by experience type name (not ID)
    if (experienceType) {
      const et = experienceType.toLowerCase();
      filtered = filtered.filter((expert: any) =>
        expert.experienceTypes?.some((t: any) =>
          t.experienceType?.name?.toLowerCase().includes(et) ||
          t.experienceType?.slug?.toLowerCase().includes(et)
        )
      );
    }

    res.json(filtered);
  });

  // Get a single expert with profile by ID (public)
  app.get("/api/experts/:id", async (req, res) => {
    const experts = await storage.getExpertsWithProfiles();
    const expert = experts.find(e => e.id === req.params.id);
    if (!expert) {
      return res.status(404).json({ message: "Expert not found" });
    }
    res.json(expert);
  });

  // Get services offered by a specific expert (public)
  app.get("/api/experts/:id/services", async (req, res) => {
    try {
      const expertId = req.params.id;
      const services = await storage.getExpertSelectedServices(expertId);
      res.json(services);
    } catch (err) {
      console.error("Error fetching expert services:", err);
      res.json([]);
    }
  });

  // Get reviews for a specific expert (public)
  app.get("/api/experts/:id/reviews", async (req, res) => {
    try {
      const expertId = req.params.id;
      // For now, return empty array - can be implemented with actual review system
      // TODO: Implement storage.getExpertReviews(expertId)
      res.json([]);
    } catch (err) {
      console.error("Error fetching expert reviews:", err);
      res.json([]);
    }
  });

  // Get current expert's selected services (authenticated)
  app.get("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getExpertSelectedServices(userId);
    res.json(services);
  });

  // Add service offering to expert's profile (authenticated)
  app.post("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { serviceOfferingId, customPrice } = req.body;
    const service = await storage.addExpertSelectedService(userId, serviceOfferingId, customPrice);
    res.json(service);
  });

  // Remove service offering from expert's profile (authenticated)
  app.delete("/api/expert/selected-services/:serviceOfferingId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.removeExpertSelectedService(userId, req.params.serviceOfferingId);
    res.json({ success: true });
  });

  // Get current expert's specializations (authenticated)
  app.get("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const specializations = await storage.getExpertSpecializations(userId);
    res.json(specializations);
  });

  // Add specialization to expert's profile (authenticated)
  app.post("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { specialization } = req.body;
    const spec = await storage.addExpertSpecialization(userId, specialization);
    res.json(spec);
  });

  // Remove specialization from expert's profile (authenticated)
  app.delete("/api/expert/specializations/:specialization", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.removeExpertSpecialization(userId, req.params.specialization);
    res.json({ success: true });
  });

  // === Expert Custom Services (User-submitted offerings) ===
  
  // Get current expert's custom services (authenticated)
  app.get("/api/expert/custom-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getExpertCustomServices(userId);
    res.json(services);
  });

  // Get single custom service by ID (authenticated - owner only)
  app.get("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const service = await storage.getExpertCustomServiceById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Custom service not found" });
    }
    if (service.expertId !== userId) {
      return res.status(403).json({ message: "Not authorized to view this service" });
    }
    res.json(service);
  });

  // Create new custom service (authenticated - experts only)
  app.post("/api/expert/custom-services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      
      if (!user || (!["expert", "local_expert"].includes(user.role) && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }

      const { title, description, categoryName, existingCategoryId, price, duration, deliverables, cancellationPolicy, leadTime, imageUrl, galleryImages, experienceTypes, isActive } = req.body;
      
      if (!title || !price) {
        return res.status(400).json({ message: "Title and price are required" });
      }

      const service = await storage.createExpertCustomService(userId, {
        title,
        description,
        categoryName,
        existingCategoryId,
        price: price.toString(),
        duration,
        deliverables,
        cancellationPolicy,
        leadTime,
        imageUrl,
        galleryImages,
        experienceTypes,
        isActive: isActive !== false,
      });
      res.status(201).json(service);
    } catch (err) {
      console.error("Error creating custom service:", err);
      res.status(500).json({ message: "Failed to create custom service" });
    }
  });

  // Update custom service (authenticated - owner only, draft status only)
  app.patch("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getExpertCustomServiceById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this service" });
      }
      if (service.status !== "draft" && service.status !== "rejected") {
        return res.status(400).json({ message: "Can only update draft or rejected services" });
      }

      const updated = await storage.updateExpertCustomService(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating custom service:", err);
      res.status(500).json({ message: "Failed to update custom service" });
    }
  });

  // Submit custom service for approval (authenticated - owner only)
  app.post("/api/expert/custom-services/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getExpertCustomServiceById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to submit this service" });
      }
      if (service.status !== "draft" && service.status !== "rejected") {
        return res.status(400).json({ message: "Can only submit draft or rejected services" });
      }

      const submitted = await storage.submitExpertCustomService(req.params.id);
      res.json(submitted);
    } catch (err) {
      console.error("Error submitting custom service:", err);
      res.status(500).json({ message: "Failed to submit custom service" });
    }
  });

  // Delete custom service (authenticated - owner only, draft/rejected status only)
  app.delete("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getExpertCustomServiceById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this service" });
      }
      if (service.status === "approved") {
        return res.status(400).json({ message: "Cannot delete approved services. Deactivate instead." });
      }

      await storage.deleteExpertCustomService(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting custom service:", err);
      res.status(500).json({ message: "Failed to delete custom service" });
    }
  });

  // Admin: Get all custom services pending approval
  app.get("/api/admin/custom-services/pending", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const services = await storage.getExpertCustomServicesByStatus("submitted");
    res.json(services);
  });

  // Admin: Approve custom service
  app.post("/api/admin/custom-services/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const service = await storage.getExpertCustomServiceById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only approve submitted services" });
      }

      const approved = await storage.approveExpertCustomService(req.params.id, adminId);
      res.json(approved);
    } catch (err) {
      console.error("Error approving custom service:", err);
      res.status(500).json({ message: "Failed to approve custom service" });
    }
  });

  // Admin: Reject custom service
  app.post("/api/admin/custom-services/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const service = await storage.getExpertCustomServiceById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only reject submitted services" });
      }

      const rejected = await storage.rejectExpertCustomService(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting custom service:", err);
      res.status(500).json({ message: "Failed to reject custom service" });
    }
  });

  // === Expert Templates (Income Streams) ===
  
  // Get all published templates (public)
  app.get("/api/expert-templates", async (req, res) => {
    try {
      const { category, destination, expertId } = req.query;
      const templates = await storage.getExpertTemplates({
        isPublished: true,
        category: category as string | undefined,
        destination: destination as string | undefined,
        expertId: expertId as string | undefined,
      });
      res.json(templates);
    } catch (err) {
      console.error("Error fetching templates:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Get single template (public - also tracks views)
  app.get("/api/expert-templates/:id", async (req, res) => {
    try {
      const template = await storage.getExpertTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      // Increment view count
      await storage.incrementTemplateView(req.params.id);
      res.json(template);
    } catch (err) {
      console.error("Error fetching template:", err);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  // Get expert's own templates (authenticated)
  app.get("/api/expert/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const templates = await storage.getExpertTemplates({ expertId: userId });
      res.json(templates);
    } catch (err) {
      console.error("Error fetching expert templates:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Create new template (authenticated)
  app.post("/api/expert/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const template = await storage.createExpertTemplate({
        ...req.body,
        expertId: userId,
      });
      res.json(template);
    } catch (err) {
      console.error("Error creating template:", err);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Update template (authenticated - owner only)
  app.patch("/api/expert/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const template = await storage.getExpertTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this template" });
      }

      const updated = await storage.updateExpertTemplate(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating template:", err);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Delete template (authenticated - owner only)
  app.delete("/api/expert/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const template = await storage.getExpertTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this template" });
      }

      await storage.deleteExpertTemplate(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting template:", err);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Purchase template (authenticated)
  app.post("/api/expert-templates/:id/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const template = await storage.getExpertTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (!template.isPublished) {
        return res.status(400).json({ message: "Template is not available for purchase" });
      }
      if (template.expertId === userId) {
        return res.status(400).json({ message: "You cannot purchase your own template" });
      }

      // Check if already purchased
      const alreadyPurchased = await storage.hasUserPurchasedTemplate(userId, req.params.id);
      if (alreadyPurchased) {
        return res.status(400).json({ message: "You have already purchased this template" });
      }

      // Calculate fees (platform takes 20%)
      const price = parseFloat(template.price as string);
      const platformFee = price * 0.20;
      const expertEarnings = price - platformFee;

      // Create purchase record
      const purchase = await storage.createTemplatePurchase({
        templateId: req.params.id,
        buyerId: userId,
        expertId: template.expertId,
        price: template.price,
        currency: template.currency || 'USD',
        platformFee: platformFee.toFixed(2),
        expertEarnings: expertEarnings.toFixed(2),
        status: 'completed',
      });

      // Record expert earning
      await storage.createExpertEarning({
        expertId: template.expertId,
        type: 'template_sale',
        amount: expertEarnings.toFixed(2),
        currency: template.currency || 'USD',
        referenceId: purchase.id,
        referenceType: 'template_purchase',
        description: `Sale of template: ${template.title}`,
        status: 'available',
        availableAt: new Date(),
      });

      res.json({ purchase, template });
    } catch (err) {
      console.error("Error purchasing template:", err);
      res.status(500).json({ message: "Failed to purchase template" });
    }
  });

  // Get user's purchased templates
  app.get("/api/my-purchased-templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const purchases = await storage.getTemplatePurchases({ buyerId: userId });
      
      // Get full template data for each purchase
      const templatesWithPurchases = await Promise.all(
        purchases.map(async (purchase) => {
          const template = await storage.getExpertTemplate(purchase.templateId);
          return { ...purchase, template };
        })
      );
      
      res.json(templatesWithPurchases);
    } catch (err) {
      console.error("Error fetching purchased templates:", err);
      res.status(500).json({ message: "Failed to fetch purchased templates" });
    }
  });

  // Get template reviews
  app.get("/api/expert-templates/:id/reviews", async (req, res) => {
    try {
      const reviews = await storage.getTemplateReviews(req.params.id);
      res.json(reviews);
    } catch (err) {
      console.error("Error fetching reviews:", err);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Create template review (authenticated - must have purchased)
  app.post("/api/expert-templates/:id/reviews", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Get user's purchase of this template
      const purchases = await storage.getTemplatePurchases({ buyerId: userId });
      const purchase = purchases.find(p => p.templateId === req.params.id);
      
      if (!purchase) {
        return res.status(403).json({ message: "You must purchase this template before reviewing" });
      }

      const review = await storage.createTemplateReview({
        templateId: req.params.id,
        purchaseId: purchase.id,
        reviewerId: userId,
        rating: req.body.rating,
        review: req.body.review,
      });

      res.json(review);
    } catch (err) {
      console.error("Error creating review:", err);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // Get expert earnings (authenticated)
  app.get("/api/expert/earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const earnings = await storage.getExpertEarnings(userId);
      const summary = await storage.getExpertEarningsSummary(userId);
      res.json({ earnings, summary });
    } catch (err) {
      console.error("Error fetching earnings:", err);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // Get expert template sales (authenticated)
  app.get("/api/expert/template-sales", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const sales = await storage.getTemplatePurchases({ expertId: userId });
      
      // Get template details for each sale
      const salesWithTemplates = await Promise.all(
        sales.map(async (sale) => {
          const template = await storage.getExpertTemplate(sale.templateId);
          return { ...sale, template };
        })
      );
      
      res.json(salesWithTemplates);
    } catch (err) {
      console.error("Error fetching sales:", err);
      res.status(500).json({ message: "Failed to fetch sales" });
    }
  });

  // === Income Streams & Revenue Splits ===
  
  // Get revenue splits configuration
  app.get("/api/revenue-splits", async (req, res) => {
    try {
      const splits = await storage.getRevenueSplits();
      res.json(splits);
    } catch (err) {
      console.error("Error fetching revenue splits:", err);
      res.status(500).json({ message: "Failed to fetch revenue splits" });
    }
  });

  // Expert Tips - Create a tip for an expert
  app.post("/api/expert/:expertId/tip", isAuthenticated, async (req, res) => {
    try {
      const travelerId = (req.user as any).claims.sub;
      const { expertId } = req.params;
      
      // Validate request body
      const tipSchema = z.object({
        amount: z.number().positive("Amount must be positive"),
        message: z.string().max(500).optional(),
        bookingId: z.string().optional(),
        isAnonymous: z.boolean().optional().default(false),
      });

      const parsed = tipSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid tip data", errors: parsed.error.errors });
      }

      const { amount, message, bookingId, isAnonymous } = parsed.data;

      // Note: createExpertTip in storage applies revenue split and creates expert earnings ledger entry
      const tip = await storage.createExpertTip({
        expertId,
        travelerId,
        amount: String(amount),
        message,
        bookingId,
        isAnonymous,
      });

      res.json(tip);
    } catch (err) {
      console.error("Error creating tip:", err);
      res.status(500).json({ message: "Failed to create tip" });
    }
  });

  // Get tips received by expert
  app.get("/api/expert/tips", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const result = await storage.getTipsForExpert(userId);
      res.json(result);
    } catch (err) {
      console.error("Error fetching tips:", err);
      res.status(500).json({ message: "Failed to fetch tips" });
    }
  });

  // Expert Referrals - Get referral code and stats
  app.get("/api/expert/referrals", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const referrals = await storage.getExpertReferrals(userId);
      
      // Get the expert's referral code from their profile
      const expertProfile = await storage.getLocalExpertForm(userId);
      const referralCode = expertProfile?.referralCode || `REF-${userId.substring(0, 8).toUpperCase()}`;
      
      const stats = {
        totalReferrals: referrals.length,
        pendingReferrals: referrals.filter(r => r.status === 'pending').length,
        qualifiedReferrals: referrals.filter(r => r.status === 'qualified' || r.status === 'paid').length,
        totalEarned: referrals.filter(r => r.status === 'paid').reduce((sum, r) => sum + parseFloat(r.bonusAmount || '0'), 0),
      };

      res.json({ referralCode, referrals, stats });
    } catch (err) {
      console.error("Error fetching referrals:", err);
      res.status(500).json({ message: "Failed to fetch referrals" });
    }
  });

  // Affiliate earnings for expert
  app.get("/api/expert/affiliate-earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const earnings = await storage.getAffiliateEarnings(userId);
      const summary = await storage.getAffiliateEarningsSummary(userId);
      res.json({ earnings, summary });
    } catch (err) {
      console.error("Error fetching affiliate earnings:", err);
      res.status(500).json({ message: "Failed to fetch affiliate earnings" });
    }
  });

  // Comprehensive Revenue Optimization endpoint
  app.get("/api/expert/revenue-optimization", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Get all earnings data
      const [
        earningsData,
        templateSales,
        templates,
        tips,
        affiliateEarnings,
        referrals,
        services,
        bookings,
        revenueSplits
      ] = await Promise.all([
        storage.getExpertEarningsSummary(userId),
        storage.getTemplatePurchases({ expertId: userId }),
        storage.getExpertTemplates({ expertId: userId }),
        storage.getTipsForExpert(userId),
        storage.getAffiliateEarningsSummary(userId),
        storage.getExpertReferrals(userId),
        storage.getProviderServices(userId),
        storage.getServiceBookings(userId),
        storage.getRevenueSplits()
      ]);

      // Get revenue split configurations
      const affiliateSplit = revenueSplits.find((s) => s.type === 'affiliate_commission');
      const tipSplit = revenueSplits.find((s) => s.type === 'tip');
      const serviceSplit = revenueSplits.find((s) => s.type === 'service_booking');
      const templateSplit = revenueSplits.find((s) => s.type === 'template_sale');

      // Calculate expert's share percentages
      const serviceExpertPct = parseFloat(serviceSplit?.expertPercentage || '85') / 100;
      const templateExpertPct = parseFloat(templateSplit?.expertPercentage || '80') / 100;
      
      // Calculate real earnings breakdown - using expert's share after platform fees
      const publishedTemplates = templates.filter((t) => t.isPublished);
      const templateGrossRevenue = templateSales.reduce((sum: number, s) => sum + parseFloat(s.price || '0'), 0);
      const templateExpertRevenue = templateSales.reduce((sum: number, s) => sum + parseFloat(s.expertEarnings || '0'), 0);
      
      // Calculate service booking revenue - apply expert's share
      const completedBookings = bookings.filter((b: any) => b.status === 'completed');
      const serviceGrossRevenue = completedBookings.reduce((sum: number, b: any) => sum + parseFloat(b.amount || '0'), 0);
      const serviceExpertRevenue = serviceGrossRevenue * serviceExpertPct; // Expert's share after platform fee

      // Calculate income streams with real data - using expert's share
      const incomeStreams = {
        serviceBookings: {
          name: "Service Bookings",
          description: "Direct consulting, planning, and concierge services",
          revenue: serviceExpertRevenue, // Expert's share after platform fee
          grossRevenue: serviceGrossRevenue,
          bookings: completedBookings.length,
          split: {
            expert: parseFloat(serviceSplit?.expertPercentage || '85'),
            platform: parseFloat(serviceSplit?.platformPercentage || '15'),
            provider: 0
          },
          status: services.length > 0 ? "active" : "setup"
        },
        templateSales: {
          name: "Itinerary Templates",
          description: "Pre-built itineraries sold on the marketplace",
          revenue: templateExpertRevenue, // Expert's share after platform fee
          grossRevenue: templateGrossRevenue,
          sales: templateSales.length,
          publishedCount: publishedTemplates.length,
          split: {
            expert: parseFloat(templateSplit?.expertPercentage || '80'),
            platform: parseFloat(templateSplit?.platformPercentage || '20'),
            provider: 0
          },
          status: publishedTemplates.length > 0 ? "active" : "setup"
        },
        affiliateCommissions: {
          name: "Affiliate Commissions",
          description: "Earnings from client bookings via your links",
          revenue: affiliateEarnings.total,
          pending: affiliateEarnings.pending,
          confirmed: affiliateEarnings.confirmed,
          split: {
            expert: parseFloat(affiliateSplit?.expertPercentage || '60'),
            platform: parseFloat(affiliateSplit?.platformPercentage || '20'),
            provider: parseFloat(affiliateSplit?.providerPercentage || '20')
          },
          status: affiliateEarnings.total > 0 ? "active" : "available"
        },
        tips: {
          name: "Tips",
          description: "Gratuity from satisfied travelers",
          revenue: tips.totalAmount,
          count: tips.tips.length,
          split: {
            expert: parseFloat(tipSplit?.expertPercentage || '95'),
            platform: parseFloat(tipSplit?.platformPercentage || '5'),
            provider: 0
          },
          status: tips.tips.length > 0 ? "active" : "available"
        },
        referralBonuses: {
          name: "Referral Bonuses",
          description: "Earn $50 for each qualified expert referral",
          revenue: referrals.filter((r) => r.status === 'paid').reduce((sum: number, r) => sum + parseFloat(r.bonusAmount || '0'), 0),
          referrals: referrals.length,
          qualified: referrals.filter((r) => r.status === 'qualified' || r.status === 'paid').length,
          split: {
            expert: 100,
            platform: 0,
            provider: 0
          },
          status: referrals.length > 0 ? "active" : "available"
        }
      };

      // Total earnings
      const totalRevenue = 
        incomeStreams.serviceBookings.revenue +
        incomeStreams.templateSales.revenue +
        incomeStreams.affiliateCommissions.revenue +
        incomeStreams.tips.revenue +
        incomeStreams.referralBonuses.revenue;

      // Calculate earnings projection based on actual trends (using expert's share)
      const monthlyBookings = completedBookings.length;
      const avgBookingValue = monthlyBookings > 0 ? serviceExpertRevenue / monthlyBookings : 0;
      
      const projections = {
        currentMonthly: totalRevenue,
        projectedGrowth: Math.round(totalRevenue * 1.15), // 15% growth target
        potentialMax: Math.round(totalRevenue * 1.5), // With all optimizations
        avgBookingValue,
        monthlyBookings
      };

      // Generate AI-powered insights based on actual data
      const insights = [];
      
      if (incomeStreams.templateSales.status === 'setup') {
        insights.push({
          type: 'opportunity',
          title: 'Create Your First Template',
          description: 'Publish itinerary templates to earn passive income while you sleep.',
          impact: 'Avg template earns $50-200/month',
          priority: 'high'
        });
      }
      
      if (incomeStreams.affiliateCommissions.status === 'available') {
        insights.push({
          type: 'opportunity',
          title: 'Enable Affiliate Links',
          description: 'Earn commissions when your clients book hotels and activities.',
          impact: `You keep ${affiliateSplit?.expertPercentage || 60}% of each commission`,
          priority: 'high'
        });
      }
      
      if (services.length === 0) {
        insights.push({
          type: 'urgent',
          title: 'Create Your First Service',
          description: 'Set up your consulting or planning services to start earning.',
          impact: 'Unlock your primary income stream',
          priority: 'high'
        });
      }

      res.json({
        summary: {
          totalRevenue,
          availableBalance: earningsData.available,
          pendingBalance: earningsData.pending,
          paidOut: earningsData.paidOut
        },
        incomeStreams,
        projections,
        revenueSplits: {
          serviceBooking: serviceSplit,
          templateSale: templateSplit,
          affiliateCommission: affiliateSplit,
          tip: tipSplit
        },
        insights
      });
    } catch (err) {
      console.error("Error fetching revenue optimization data:", err);
      res.status(500).json({ message: "Failed to fetch revenue optimization data" });
    }
  });

  // === Destination Calendar (Public travel guide) ===
  
  // Get countries with calendar data (public)
  app.get("/api/destination-calendar/countries", async (req, res) => {
    try {
      const countries = await storage.getCalendarCountries();
      res.json(countries);
    } catch (err) {
      console.error("Error fetching calendar countries:", err);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  // Get approved events for a destination (public)
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

  // Get seasons for a destination (public)
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

  // Get contributor's own destination events (authenticated)
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

  // Create a new destination event (authenticated - contributor)
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

  // Update destination event (authenticated - contributor only)
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

  // Submit destination event for approval (authenticated - contributor only)
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

  // Delete destination event (authenticated - contributor only)
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

  // Admin: Get pending destination events
  app.get("/api/admin/destination-events/pending", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const events = await storage.getPendingDestinationEvents();
    res.json(events);
  });

  // Admin: Approve destination event
  app.post("/api/admin/destination-events/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only approve pending events" });
      }

      const approved = await storage.approveDestinationEvent(req.params.id, adminId);
      res.json(approved);
    } catch (err) {
      console.error("Error approving destination event:", err);
      res.status(500).json({ message: "Failed to approve event" });
    }
  });

  // Admin: Reject destination event
  app.post("/api/admin/destination-events/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only reject pending events" });
      }

      const rejected = await storage.rejectDestinationEvent(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting destination event:", err);
      res.status(500).json({ message: "Failed to reject event" });
    }
  });

  // Get single service by ID (public - for booking page)
  app.get("/api/services/:id", async (req, res) => {
    const service = await storage.getProviderServiceById(req.params.id);
    if (!service || service.status !== "active") {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json(service);
  });

  // Browse all active services (public marketplace)
  app.get("/api/services", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const location = req.query.location as string | undefined;
    const services = await storage.getAllActiveServices(categoryId, location);
    res.json(services);
  });

  // Unified Discovery Search (public - with advanced filtering)
  app.get("/api/discover", async (req, res) => {
    const filters = {
      query: req.query.q as string | undefined,
      categoryId: req.query.categoryId as string | undefined,
      location: req.query.location as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
      sortBy: req.query.sortBy as "rating" | "price_low" | "price_high" | "reviews" | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    const result = await storage.unifiedSearch(filters);

    // Track search pattern for trend analytics (non-blocking)
    if (filters.query || filters.location) {
      const userId = (req.user as any)?.claims?.sub;
      storage.createDestinationSearchPattern({
        destination: filters.location || filters.query || "unknown",
        city: filters.location || undefined,
        searchQuery: filters.query || undefined,
        searchType: "discover",
        userId: userId || undefined,
        resultsViewed: result.total,
        date: new Date().toISOString().split("T")[0],
        hour: new Date().getHours(),
      }).catch(err => console.error("Failed to track search pattern:", err));
    }

    res.json(result);
  });

  // Analytics: Get destination search trends
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

  // Analytics: Get expert match trends
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

  // Analytics: Get destination metrics history (time-series)
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

  // === Tourism Analytics Event Tracking (Fire-and-forget) ===
  
  // Track destination search events
  const searchEventSchema = z.object({
    destination: z.string(),
    origin: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    travelers: z.number().optional(),
    experienceType: z.string().optional(),
    searchContext: z.string().optional(), // "discover" | "experience-template" | "quick-start"
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

  // AI-Powered Service Recommendations
  app.post("/api/discover/recommendations", isAuthenticated, async (req, res) => {
    try {
      // Validate API key is configured
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ message: "AI service not configured" });
      }

      // Validate request body
      const requestSchema = z.object({
        query: z.string().optional(),
        destination: z.string().optional(),
        tripType: z.string().optional(),
        budget: z.string().optional(),
      });
      
      const validatedBody = requestSchema.safeParse(req.body);
      if (!validatedBody.success) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      
      const { query, destination, tripType, budget } = validatedBody.data;
      
      // Get all categories and available services for context
      const categories = await storage.getServiceCategories();
      const allServices = await storage.getAllActiveServices();
      
      // Build service summaries for AI context (limit to prevent token overflow)
      const serviceSummaries = allServices.slice(0, 50).map(s => ({
        id: s.id,
        name: s.serviceName,
        category: categories.find((c: { id: string; name: string }) => c.id === s.categoryId)?.name || "Other",
        price: s.price,
        rating: s.averageRating,
        location: s.location,
        description: s.shortDescription || s.description?.substring(0, 100),
      }));
      
      const categoryList = categories.map((c) => `${c.name} (${c.slug || "other"})`).join(", ");
      
      const prompt = `You are a travel service recommendation AI for Traveloure, a travel marketplace.

Based on the user's needs, recommend relevant service categories and specific services they might need.

User's Request:
- Search Query: ${query || "Not specified"}
- Destination: ${destination || "Not specified"}
- Trip Type: ${tripType || "General travel"}
- Budget: ${budget || "Flexible"}

Available Service Categories: ${categoryList}

Available Services (sample):
${JSON.stringify(serviceSummaries, null, 2)}

Please provide recommendations in this JSON format:
{
  "recommendedCategories": [
    {
      "slug": "category-slug",
      "name": "Category Name",
      "reason": "Why this category is relevant"
    }
  ],
  "recommendedServices": [
    {
      "id": "service-id",
      "reason": "Why this service is recommended"
    }
  ],
  "suggestions": "Brief personalized travel tip or suggestion based on their needs"
}

Provide 2-4 category recommendations and up to 5 specific service recommendations if relevant services are available.`;

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are a helpful travel planning assistant. Always respond with valid JSON.",
        messages: [
          { role: "user", content: prompt }
        ],
      });

      const responseText = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
      const recommendations = JSON.parse(responseText);
      
      // Enrich recommendations with full service data
      const enrichedServices = [];
      for (const rec of recommendations.recommendedServices || []) {
        const service = allServices.find(s => s.id === rec.id);
        if (service) {
          enrichedServices.push({
            ...service,
            recommendationReason: rec.reason,
          });
        }
      }
      
      res.json({
        recommendedCategories: recommendations.recommendedCategories || [],
        recommendedServices: enrichedServices,
        suggestions: recommendations.suggestions || "",
      });
    } catch (err) {
      console.error("AI Recommendations error:", err);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Get expert's services by status
  app.get("/api/expert/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const services = await storage.getProviderServicesByStatus(userId, status);
    res.json(services);
  });

  // Toggle service status (pause/activate)
  app.patch("/api/expert/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const { status } = req.body;
      if (!["active", "paused", "draft"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.toggleServiceStatus(req.params.id, status);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Duplicate a service
  app.post("/api/expert/services/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const duplicated = await storage.duplicateService(req.params.id, userId);
      res.status(201).json(duplicated);
    } catch (err) {
      res.status(500).json({ message: "Failed to duplicate service" });
    }
  });

  // Create service from template
  app.post("/api/expert/services/from-template/:templateId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const template = await storage.getServiceTemplate(req.params.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Create service from template
      const serviceData = {
        userId,
        serviceName: template.title,
        description: template.description,
        categoryId: template.categoryId,
        price: template.suggestedPrice || "0",
        serviceType: template.serviceType,
        deliveryMethod: template.deliveryMethod,
        deliveryTimeframe: template.deliveryTimeframe,
        requirements: template.requirements,
        whatIncluded: template.whatIncluded,
        status: "draft",
      };
      
      const service = await storage.createProviderService(serviceData as any);
      res.status(201).json(service);
    } catch (err) {
      console.error("Error creating service from template:", err);
      res.status(500).json({ message: "Failed to create service from template" });
    }
  });

  // === Service Bookings Routes ===
  
  // Get bookings for provider (their services)
  // NOTE: User data is sanitized - experts cannot see full traveler info (email, phone, etc.)
  app.get("/api/expert/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userRole = (req.user as any).claims.role || 'expert';
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ providerId: userId, status });
    
    // Enrich with traveler info (sanitized for privacy)
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const traveler = await storage.getUser(booking.travelerId);
      const sanitizedTraveler = traveler ? sanitizeUserForRole(traveler, userRole, false) : null;
      return {
        ...sanitizeBookingForExpert(booking, userRole, userId),
        traveler: sanitizedTraveler ? {
          ...sanitizedTraveler,
          displayName: getDisplayName(traveler.firstName, traveler.lastName)
        } : null
      };
    }));
    
    res.json(enrichedBookings);
  });

  // Get bookings for traveler (services they booked)
  // Provider bookings (for calendar)
  // NOTE: User data is sanitized - providers cannot see full traveler info
  app.get("/api/provider/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userRole = (req.user as any).claims.role || 'provider';
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ providerId: userId, status });
    
    // Enrich with service details and sanitized traveler info
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const service = await storage.getProviderServiceById(booking.serviceId);
      const traveler = await storage.getUser(booking.travelerId);
      const sanitizedTraveler = traveler ? sanitizeUserForRole(traveler, userRole, false) : null;
      return {
        ...sanitizeBookingForExpert(booking, userRole, userId),
        service,
        traveler: sanitizedTraveler ? {
          ...sanitizedTraveler,
          displayName: getDisplayName(traveler.firstName, traveler.lastName)
        } : null
      };
    }));
    
    res.json(enrichedBookings);
  });

  app.get("/api/my-bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ travelerId: userId, status });
    
    // Enrich bookings with hasReview flag
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const reviews = await storage.getReviewsByBookingId(booking.id);
      return { ...booking, hasReview: reviews.length > 0 };
    }));
    
    res.json(enrichedBookings);
  });

  app.get("/api/service-bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const status = req.query.status as string | undefined;
      const bookings = await storage.getServiceBookings({ travelerId: userId, status });
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const service = await storage.getProviderServiceById(booking.serviceId);
        const provider = await storage.getUser(booking.providerId);
        return {
          ...booking,
          service,
          provider: provider ? { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, profileImage: provider.profileImage } : null,
        };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("Service bookings error:", err);
      res.status(500).json({ message: "Failed to fetch service bookings" });
    }
  });

  app.get("/api/bookings/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const status = req.query.status as string | undefined;
      const bookings = await storage.getServiceBookings({ travelerId: userId, status });
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const reviews = await storage.getReviewsByBookingId(booking.id);
        return { ...booking, hasReview: reviews.length > 0 };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("User bookings error:", err);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/cart/items", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { serviceId, customVenueId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug } = req.body;
      if (!serviceId && !customVenueId) {
        return res.status(400).json({ message: "Service ID or Custom Venue ID is required" });
      }
      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          return res.status(404).json({ message: "Service not found" });
        }
      }
      if (customVenueId) {
        const venue = await storage.getCustomVenue(customVenueId);
        if (!venue) {
          return res.status(404).json({ message: "Custom venue not found" });
        }
        if (venue.userId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      }
      const experienceSlug = rawSlug ? resolveSlug(rawSlug) : "general";
      const item = await storage.addToCart(userId, {
        serviceId: serviceId || undefined,
        customVenueId: customVenueId || undefined,
        quantity: quantity || 1,
        tripId,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
        experienceSlug,
      });
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Failed to add to cart:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Get single booking
  // NOTE: If requester is provider, traveler info is sanitized
  app.get("/api/bookings/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userRole = (req.user as any).claims.role || 'user';
    const booking = await storage.getServiceBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    // Check if user is traveler or provider
    if (booking.travelerId !== userId && booking.providerId !== userId) {
      return res.status(403).json({ message: "Not authorized to view this booking" });
    }
    
    // If the user is the traveler, they see full booking
    // If the user is the provider, sanitize the traveler info
    if (booking.travelerId === userId) {
      res.json(booking);
    } else {
      // Provider viewing - sanitize traveler info
      const traveler = await storage.getUser(booking.travelerId);
      const sanitizedBooking = sanitizeBookingForExpert(booking, userRole, userId);
      res.json({
        ...sanitizedBooking,
        traveler: traveler ? {
          ...sanitizeUserForRole(traveler, userRole, false),
          displayName: getDisplayName(traveler.firstName, traveler.lastName)
        } : null
      });
    }
  });

  // Get client profile (for experts/providers) - sanitized view
  // SECURITY: Experts can only see limited client information for their bookings
  app.get("/api/client/:clientId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userRole = (req.user as any).claims.role || 'user';
    const { clientId } = req.params;
    
    // Check if requester has a legitimate relationship with this client
    // (i.e., they have bookings with this client)
    const bookings = await storage.getServiceBookings({ providerId: userId });
    const hasRelationship = bookings.some(b => b.travelerId === clientId);
    
    // Admins can see any client
    const isAdmin = canSeeFullUserData(userRole);
    
    if (!hasRelationship && !isAdmin) {
      // Log unauthorized access attempt
      storage.logAccess({
        actorId: userId,
        actorRole: userRole,
        action: 'view_profile_denied',
        resourceType: 'user',
        resourceId: clientId,
        targetUserId: clientId,
        metadata: { reason: 'no_relationship' },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return res.status(403).json({ message: "Not authorized to view this client" });
    }
    
    const client = await storage.getUser(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    
    // Log successful profile access
    storage.logAccess({
      actorId: userId,
      actorRole: userRole,
      action: 'view_profile',
      resourceType: 'user',
      resourceId: clientId,
      targetUserId: clientId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    // Return sanitized profile based on role
    const sanitizedClient = sanitizeUserForRole(client, userRole, false);
    res.json({
      ...sanitizedClient,
      displayName: getDisplayName(client.firstName, client.lastName),
      // Include booking stats for this relationship
      bookingCount: bookings.filter(b => b.travelerId === clientId).length
    });
  });

  // Create a booking
  app.post("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = insertServiceBookingSchema.parse(req.body);
      
      // Verify service exists and is active
      const service = await storage.getProviderServiceById(input.serviceId);
      if (!service || service.status !== "active") {
        return res.status(404).json({ message: "Service not found or not available" });
      }
      
      const booking = await storage.createServiceBooking({
        ...input,
        travelerId: userId,
        providerId: service.userId,
      });
      
      // Increment service bookings count
      await storage.incrementServiceBookings(service.id, Number(service.price) || 0);
      
      res.status(201).json(booking);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating booking:", err);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  // Update booking status (provider actions)
  app.patch("/api/expert/bookings/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.providerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const { status, reason } = req.body;
      const updated = await storage.updateServiceBookingStatus(req.params.id, status, reason);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  // Cancel booking (traveler action)
  app.post("/api/bookings/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      if (booking.status !== "pending" && booking.status !== "confirmed") {
        return res.status(400).json({ message: "Cannot cancel this booking" });
      }
      const { reason } = req.body;
      const updated = await storage.updateServiceBookingStatus(req.params.id, "cancelled", reason);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  // === Notifications Routes ===

  // Get user notifications
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const unreadOnly = req.query.unread === "true";
    const notifications = await storage.getNotifications(userId, unreadOnly);

    const enriched = await Promise.all(notifications.map(async (n) => {
      let tripId: string | null = null;
      if (n.relatedType === "trip" && n.relatedId) {
        tripId = n.relatedId;
      } else if (n.relatedType === "booking" && n.relatedId) {
        try {
          const booking = await storage.getServiceBooking(n.relatedId);
          tripId = booking?.tripId ?? null;
        } catch { tripId = null; }
      }
      return { ...n, tripId };
    }));

    res.json(enriched);
  });

  // Get unread count
  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const count = await storage.getUnreadCount(userId);
    res.json({ count });
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const notification = await storage.markAsRead(req.params.id);
    if (notification && notification.userId !== userId) {
      return res.status(403).json({ message: "Not your notification" });
    }
    res.json(notification);
  });

  // Mark all as read
  app.post("/api/notifications/mark-all-read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.markAllAsRead(userId);
    res.json({ success: true });
  });

  // Delete notification
  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    await storage.deleteNotification(req.params.id);
    res.json({ success: true });
  });

  // === Service Reviews Routes ===
  
  // Get reviews for a service
  app.get("/api/services/:serviceId/reviews", async (req, res) => {
    const reviews = await storage.getServiceReviews(req.params.serviceId);
    res.json(reviews);
  });

  // Create a review (only after completed booking)
  app.post("/api/services/:serviceId/reviews", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Verify user has a completed booking for this service
      const bookings = await storage.getServiceBookings({ 
        travelerId: userId, 
        status: "completed" 
      });
      const hasCompletedBooking = bookings.some(b => b.serviceId === req.params.serviceId);
      if (!hasCompletedBooking) {
        return res.status(403).json({ message: "You can only review services you've completed" });
      }
      
      const service = await storage.getProviderServiceById(req.params.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      const input = insertServiceReviewSchema.parse({
        ...req.body,
        serviceId: req.params.serviceId,
        travelerId: userId,
        providerId: service.userId,
      });
      
      const review = await storage.createServiceReview(input);
      res.status(201).json(review);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating review:", err);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // Provider responds to a review
  app.post("/api/expert/reviews/:id/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const review = await storage.getServiceReview(req.params.id);
      if (!review || review.providerId !== userId) {
        return res.status(404).json({ message: "Review not found or not for your service" });
      }
      const { responseText } = req.body;
      if (!responseText) {
        return res.status(400).json({ message: "Response text required" });
      }
      const updated = await storage.addReviewResponse(req.params.id, responseText);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to respond to review" });
    }
  });

  // Get expert's analytics/stats
  app.get("/api/expert/analytics", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getProviderServicesByStatus(userId);
    const bookings = await storage.getServiceBookings({ providerId: userId });
    
    const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
    const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
    const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
      sum + Number(s.averageRating) / arr.length, 0
    );
    
    const pendingBookings = bookings.filter(b => b.status === "pending").length;
    const completedBookings = bookings.filter(b => b.status === "completed").length;
    
    res.json({
      totalServices: services.length,
      activeServices: services.filter(s => s.status === "active").length,
      draftServices: services.filter(s => s.status === "draft").length,
      pausedServices: services.filter(s => s.status === "paused").length,
      totalRevenue,
      totalBookings,
      averageRating: avgRating || null,
      pendingBookings,
      completedBookings,
    });
  });

  app.get("/api/expert/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      const earnings = await storage.getExpertEarnings(userId);
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      res.json({
        summary: { totalRevenue, totalBookings, completedBookings: completedBookings.length, pendingBookings: pendingBookings.length },
        services: services.map(s => ({ id: s.id, serviceName: s.serviceName, status: s.status, bookingsCount: s.bookingsCount, totalRevenue: s.totalRevenue })),
        recentEarnings: earnings.slice(0, 10),
      });
    } catch (err) {
      console.error("Expert dashboard error:", err);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  app.get("/api/provider/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      res.json({
        summary: { totalRevenue, totalBookings, completedBookings: completedBookings.length, pendingBookings: pendingBookings.length },
        services: services.map(s => ({ id: s.id, serviceName: s.serviceName, status: s.status, bookingsCount: s.bookingsCount, totalRevenue: s.totalRevenue })),
      });
    } catch (err) {
      console.error("Provider dashboard error:", err);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  // Get comprehensive expert analytics dashboard data
  app.get("/api/expert/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      const earnings = await storage.getExpertEarnings(userId);
      const templates = await storage.getExpertTemplates(userId);
      
      // Get expert's profile for selected services and specializations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const selectedServicesAtSignup = (expertProfile?.selectedServices as string[]) || [];
      const expertSpecializations = (expertProfile?.specializations as string[]) || [];
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      
      // Calculate key metrics
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
        sum + Number(s.averageRating) / arr.length, 0
      ) || 0;
      
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      const confirmedBookings = bookings.filter(b => b.status === "confirmed");
      
      // Template analytics
      const publishedTemplates = templates.filter(t => t.isPublished);
      const templateRevenue = earnings
        .filter(e => e.type === "template_sale")
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      
      // Calculate conversion metrics
      const inquiryCount = bookings.length;
      const conversionRate = inquiryCount > 0 ? (completedBookings.length / inquiryCount) * 100 : 0;
      
      // Revenue by service type
      const revenueByService = services.reduce((acc: any[], s) => {
        const revenue = Number(s.totalRevenue || 0);
        if (revenue > 0) {
          acc.push({
            service: s.serviceName || "Unnamed Service",
            revenue,
            bookings: s.bookingsCount || 0,
            percentage: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0
          });
        }
        return acc;
      }, []).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      
      // Conversion funnel
      const profileViews = Math.floor(totalBookings * 3.5); // Estimated
      const inquiriesStarted = totalBookings;
      const quoteSent = Math.floor(totalBookings * 0.85);
      const bookingsMade = completedBookings.length + confirmedBookings.length;
      
      const conversionFunnel = [
        { stage: "Profile Views", count: profileViews, percent: 100 },
        { stage: "Inquiries Started", count: inquiriesStarted, percent: profileViews > 0 ? (inquiriesStarted / profileViews) * 100 : 0 },
        { stage: "Quote Sent", count: quoteSent, percent: inquiriesStarted > 0 ? (quoteSent / inquiriesStarted) * 100 : 0 },
        { stage: "Booking Made", count: bookingsMade, percent: quoteSent > 0 ? (bookingsMade / quoteSent) * 100 : 0 },
        { stage: "Completed", count: completedBookings.length, percent: bookingsMade > 0 ? (completedBookings.length / bookingsMade) * 100 : 0 },
      ];
      
      // Calculate benchmarks
      const benchmarks = {
        responseTime: { value: "2 hrs", benchmark: "1 hr", status: "good" },
        conversionRate: { 
          value: `${conversionRate.toFixed(0)}%`, 
          benchmark: "55%", 
          status: conversionRate >= 55 ? "excellent" : conversionRate >= 40 ? "good" : "needs_improvement"
        },
        avgRating: {
          value: avgRating.toFixed(1),
          benchmark: "4.5",
          status: avgRating >= 4.5 ? "excellent" : avgRating >= 4.0 ? "good" : "needs_improvement"
        },
        avgBookingValue: {
          value: `$${totalBookings > 0 ? (totalRevenue / totalBookings).toFixed(0) : 0}`,
          benchmark: "$350",
          status: totalRevenue / (totalBookings || 1) >= 350 ? "excellent" : "good"
        }
      };
      
      // Client lifetime value
      const clientLifetimeValue = {
        average: totalBookings > 0 ? Math.round(totalRevenue / totalBookings * 1.8) : 0,
        repeatRate: 35, // Estimated
        avgBookingsPerClient: 1.8
      };
      
      // Track which selected services have been created vs pending
      const createdServiceNames = services.map(s => (s.serviceName || "").toLowerCase());
      const serviceAlignment = selectedServicesAtSignup.map(serviceName => ({
        name: serviceName,
        status: createdServiceNames.some(cs => cs.includes(serviceName.toLowerCase()) || serviceName.toLowerCase().includes(cs)) 
          ? "created" 
          : "pending"
      }));
      
      res.json({
        expertProfile: {
          selectedServices: selectedServicesAtSignup,
          specializations: expertSpecializations,
          destinations: expertDestinations,
          city: expertProfile?.city,
          country: expertProfile?.country
        },
        serviceAlignment,
        summary: {
          totalRevenue,
          totalBookings,
          avgRating,
          activeServices: services.filter(s => s.status === "active").length,
          publishedTemplates: publishedTemplates.length,
          templateRevenue,
          pendingBookings: pendingBookings.length,
          completedBookings: completedBookings.length,
        },
        keyMetrics: benchmarks,
        conversionFunnel,
        revenueByService,
        clientLifetimeValue,
        earnings: earnings.slice(0, 10)
      });
    } catch (err) {
      console.error("Error fetching expert analytics dashboard:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Get market intelligence for experts - filtered by their markets
  app.get("/api/expert/market-intelligence", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      // Get expert's profile to find their markets/destinations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      const expertCity = expertProfile?.city;
      const expertCountry = expertProfile?.country;
      
      // Fetch all trending destinations from TravelPulse
      const allTrending = await db.select().from(travelPulseTrending).limit(50);
      const allCities = await db.select().from(travelPulseCities).limit(20);
      const allHappeningNow = await db.select().from(travelPulseHappeningNow).limit(20);
      
      // Filter trending to match expert's markets
      let filteredTrending = allTrending;
      if (expertDestinations.length > 0 || expertCity || expertCountry) {
        const marketKeywords = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
        filteredTrending = allTrending.filter(t => {
          const destLower = (t.destinationName || "").toLowerCase();
          const cityLower = (t.city || "").toLowerCase();
          const countryLower = (t.country || "").toLowerCase();
          return marketKeywords.some(keyword => 
            destLower.includes(keyword!) || cityLower.includes(keyword!) || countryLower.includes(keyword!)
          );
        });
        // If no matches, show global trending as fallback
        if (filteredTrending.length === 0) {
          filteredTrending = allTrending.slice(0, 10);
        }
      }
      
      // Filter cities to match expert's markets
      let filteredCities = allCities;
      if (expertDestinations.length > 0 || expertCity || expertCountry) {
        const marketKeywords = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
        filteredCities = allCities.filter(c => {
          const cityLower = (c.cityName || "").toLowerCase();
          const countryLower = (c.country || "").toLowerCase();
          return marketKeywords.some(keyword => 
            cityLower.includes(keyword!) || countryLower.includes(keyword!)
          );
        });
        if (filteredCities.length === 0) {
          filteredCities = allCities.slice(0, 5);
        }
      }
      
      // Filter happening now to match expert's markets
      let filteredHappeningNow = allHappeningNow;
      if (expertDestinations.length > 0 || expertCity || expertCountry) {
        const marketKeywords = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
        filteredHappeningNow = allHappeningNow.filter(h => {
          const cityLower = (h.city || "").toLowerCase();
          return marketKeywords.some(keyword => cityLower.includes(keyword!));
        });
        if (filteredHappeningNow.length === 0) {
          filteredHappeningNow = allHappeningNow.slice(0, 5);
        }
      }
      
      // Generate seasonal demand based on expert's markets
      const seasonalDemandByMarket: Record<string, any[]> = {
        "japan": [{ season: "Cherry Blossom Season", location: "Japan", timing: "Mar-Apr", demandIncrease: 85, suggestedRateIncrease: 25, status: "upcoming", daysAway: 45 }],
        "europe": [{ season: "Summer Peak", location: "Europe", timing: "Jun-Aug", demandIncrease: 120, suggestedRateIncrease: 35, status: "upcoming", daysAway: 120 }],
        "usa": [{ season: "Fall Foliage", location: "New England", timing: "Sep-Oct", demandIncrease: 65, suggestedRateIncrease: 20, status: "future", daysAway: 200 }],
        "caribbean": [{ season: "Winter Holidays", location: "Caribbean", timing: "Dec-Jan", demandIncrease: 95, suggestedRateIncrease: 30, status: "future", daysAway: 280 }],
        "asia": [{ season: "Lunar New Year", location: "Asia", timing: "Jan-Feb", demandIncrease: 90, suggestedRateIncrease: 30, status: "upcoming", daysAway: 30 }],
        "australia": [{ season: "Summer Season", location: "Australia", timing: "Dec-Feb", demandIncrease: 80, suggestedRateIncrease: 25, status: "upcoming", daysAway: 60 }],
      };
      
      // Match seasonal demand to expert's markets
      let seasonalDemand: any[] = [];
      const allMarkets = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
      for (const market of allMarkets) {
        for (const [key, demand] of Object.entries(seasonalDemandByMarket)) {
          if (market?.includes(key) || key.includes(market || "")) {
            seasonalDemand.push(...demand);
          }
        }
      }
      // Remove duplicates and provide fallback
      seasonalDemand = Array.from(new Map(seasonalDemand.map(d => [d.season, d])).values());
      if (seasonalDemand.length === 0) {
        seasonalDemand = Object.values(seasonalDemandByMarket).flat().slice(0, 4);
      }
      
      res.json({
        expertMarkets: {
          destinations: expertDestinations,
          city: expertCity,
          country: expertCountry
        },
        trending: filteredTrending.slice(0, 10).map(t => ({
          destination: t.destinationName,
          score: t.trendScore || 0,
          reason: t.triggerEvent || "Trending destination",
          category: t.destinationType || "destination"
        })),
        cities: filteredCities.slice(0, 5).map(c => ({
          name: c.cityName,
          country: c.country,
          bestTimeToVisit: c.aiBestTimeToVisit || "Year-round",
          summary: c.aiTravelTips || "Explore this destination"
        })),
        happeningNow: filteredHappeningNow.slice(0, 5).map(h => ({
          title: h.title,
          type: h.eventType,
          location: h.city,
          urgency: h.crowdLevel || "moderate"
        })),
        seasonalDemand
      });
    } catch (err) {
      console.error("Error fetching market intelligence:", err);
      res.status(500).json({ message: "Failed to fetch market intelligence" });
    }
  });

  // === Service Recommendation Engine API Endpoints ===

  // Get service recommendations for experts based on TravelPulse trends
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

      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      const recommendations = await serviceRecommendationEngine.getExpertRecommendations(userId, cities, limit);
      
      res.json({ recommendations });
    } catch (err) {
      console.error("Error fetching expert recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Get service recommendations for providers
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

      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      const recommendations = await serviceRecommendationEngine.getProviderRecommendations(userId, location, limit);
      
      res.json({ recommendations, location });
    } catch (err) {
      console.error("Error fetching provider recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Get service recommendations for users (trip planning)
  app.get("/api/recommendations/user", async (req, res) => {
    try {
      const city = req.query.city as string | undefined;
      const experienceType = req.query.experienceType as string | undefined;
      const preferences = req.query.preferences ? (req.query.preferences as string).split(",") : undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const userId = (req.user as any)?.claims?.sub || "anonymous";
      
      // If no city provided, return trending destinations as recommendations
      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      
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

  // Get market intelligence for a city
  app.get("/api/recommendations/market-intelligence/:city", async (req, res) => {
    try {
      const { city } = req.params;
      
      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      const intelligence = await serviceRecommendationEngine.getMarketIntelligence(city);
      
      res.json(intelligence);
    } catch (err) {
      console.error("Error fetching market intelligence:", err);
      res.status(500).json({ message: "Failed to fetch market intelligence" });
    }
  });

  // Get seasonal opportunities
  app.get("/api/recommendations/seasonal/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      
      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      const opportunities = await serviceRecommendationEngine.getSeasonalOpportunities(city, month);
      
      res.json({ opportunities, city, month: month || new Date().getMonth() + 1 });
    } catch (err) {
      console.error("Error fetching seasonal opportunities:", err);
      res.status(500).json({ message: "Failed to fetch seasonal opportunities" });
    }
  });

  // Refresh demand signals for a city (authenticated users only for now)
  app.post("/api/recommendations/refresh/:city", isAuthenticated, async (req, res) => {
    try {
      const { city } = req.params;
      const country = req.query.country as string;
      
      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      const count = await serviceRecommendationEngine.refreshDemandSignalsForCity(city);
      
      res.json({ message: `Generated ${count} demand signals for ${city}`, count });
    } catch (err) {
      console.error("Error refreshing demand signals:", err);
      res.status(500).json({ message: "Failed to refresh demand signals" });
    }
  });

  // Record recommendation conversion (when user acts on a recommendation)
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
      
      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      await serviceRecommendationEngine.recordConversion(id, userId, conversionType, resultId, revenueGenerated);
      
      res.json({ message: "Conversion recorded" });
    } catch (err) {
      console.error("Error recording conversion:", err);
      res.status(500).json({ message: "Failed to record conversion" });
    }
  });

  // Dismiss a recommendation
  app.post("/api/recommendations/:id/dismiss", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      const { serviceRecommendationEngine } = await import("./services/service-recommendation-engine.service");
      await serviceRecommendationEngine.dismissRecommendation(id);
      
      res.json({ message: "Recommendation dismissed" });
    } catch (err) {
      console.error("Error dismissing recommendation:", err);
      res.status(500).json({ message: "Failed to dismiss recommendation" });
    }
  });

  // Get provider analytics dashboard
  app.get("/api/provider/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
        sum + Number(s.averageRating) / arr.length, 0
      ) || 0;
      
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      
      // Monthly breakdown (mock for now)
      const monthlyRevenue = [
        { month: "Jan", revenue: totalRevenue * 0.08, bookings: Math.floor(totalBookings * 0.08) },
        { month: "Feb", revenue: totalRevenue * 0.07, bookings: Math.floor(totalBookings * 0.07) },
        { month: "Mar", revenue: totalRevenue * 0.09, bookings: Math.floor(totalBookings * 0.09) },
        { month: "Apr", revenue: totalRevenue * 0.08, bookings: Math.floor(totalBookings * 0.08) },
        { month: "May", revenue: totalRevenue * 0.10, bookings: Math.floor(totalBookings * 0.10) },
        { month: "Jun", revenue: totalRevenue * 0.12, bookings: Math.floor(totalBookings * 0.12) },
      ];
      
      // Service performance
      const servicePerformance = services.map(s => ({
        id: s.id,
        title: s.serviceName || "Unnamed Service",
        revenue: Number(s.totalRevenue || 0),
        bookings: s.bookingsCount || 0,
        rating: Number(s.averageRating || 0),
        status: s.status
      })).sort((a, b) => b.revenue - a.revenue);
      
      res.json({
        summary: {
          totalRevenue,
          totalBookings,
          avgRating,
          activeServices: services.filter(s => s.status === "active").length,
          pendingBookings: pendingBookings.length,
          completedBookings: completedBookings.length,
        },
        monthlyRevenue,
        servicePerformance,
        benchmarks: {
          avgBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
          categoryAvg: 280,
          topPerformerAvg: 450
        }
      });
    } catch (err) {
      console.error("Error fetching provider analytics:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // === Cart Routes ===

  // Get cart items
  app.get("/api/cart", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const rawSlug = req.query.experience as string | undefined;
    const experienceSlug = rawSlug ? resolveSlug(rawSlug) : undefined;
    const items = await storage.getCartItems(userId, experienceSlug);
    
    // Calculate totals
    const subtotal = items.reduce((sum, item) => {
      const price = parseFloat(item.service?.price || "0");
      return sum + (price * (item.quantity || 1));
    }, 0);
    
    const platformFee = subtotal * 0.20; // 20% platform fee
    const total = subtotal + platformFee;
    
    res.json({
      items,
      subtotal: subtotal.toFixed(2),
      platformFee: platformFee.toFixed(2),
      total: total.toFixed(2),
      itemCount: items.length,
    });
  });

  // Add to cart
  app.post("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { serviceId, customVenueId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug } = req.body;
      
      console.log("[Cart] Add to cart request:", { serviceId, customVenueId, experienceSlug: rawSlug });
      
      if (!serviceId && !customVenueId) {
        return res.status(400).json({ message: "Service ID or Custom Venue ID is required" });
      }
      
      // Verify service or custom venue exists
      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          console.log("[Cart] Service not found for ID:", serviceId);
          return res.status(404).json({ message: "Service not found" });
        }
      }
      
      if (customVenueId) {
        const venue = await storage.getCustomVenue(customVenueId);
        if (!venue) {
          return res.status(404).json({ message: "Custom venue not found" });
        }
        // Verify user owns the custom venue
        if (venue.userId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      }
      
      // Resolve slug aliases
      const experienceSlug = rawSlug ? resolveSlug(rawSlug) : "general";
      
      const item = await storage.addToCart(userId, {
        serviceId: serviceId || undefined,
        customVenueId: customVenueId || undefined,
        quantity: quantity || 1,
        tripId,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
        experienceSlug,
      });
      
      res.status(201).json(item);
    } catch (err) {
      console.error("Add to cart error:", err);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Update cart item
  app.patch("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const { quantity, scheduledDate, notes } = req.body;
      const updated = await storage.updateCartItem(req.params.id, {
        quantity,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove from cart
  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.removeFromCart(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Clear cart
  app.delete("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const experienceSlug = req.query.experience as string | undefined;
      await storage.clearCart(userId, experienceSlug);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // === Checkout & Auto-Contract Generation ===

  // Create booking with auto-contract
  app.post("/api/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId, notes } = req.body;
      
      // Get cart items
      const cartData = await storage.getCartItems(userId);
      
      if (cartData.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }
      
      // Calculate totals
      const subtotal = cartData.reduce((sum, item) => {
        const price = parseFloat(item.service?.price || "0");
        return sum + (price * (item.quantity || 1));
      }, 0);
      const platformFee = subtotal * 0.20;
      const total = subtotal + platformFee;
      
      // Create bookings for each cart item
      const bookings = [];
      for (const item of cartData) {
        if (!item.service) continue;
        
        const price = parseFloat(item.service.price || "0") * (item.quantity || 1);
        const fee = price * 0.20;
        
        // Create contract for this booking
        const contract = await storage.createContract({
          title: `Booking: ${item.service.serviceName}`,
          tripTo: item.service.location || "N/A",
          description: `Service booking for ${item.service.serviceName}. ${notes || ""}`,
          amount: price.toFixed(2),
        });
        
        // Create booking
        const booking = await storage.createServiceBooking({
          serviceId: item.serviceId,
          travelerId: userId,
          providerId: item.service.userId,
          contractId: contract.id,
          tripId: tripId || item.tripId,
          bookingDetails: {
            scheduledDate: item.scheduledDate,
            notes: item.notes || notes,
            quantity: item.quantity || 1,
          },
          totalAmount: price.toFixed(2),
          platformFee: fee.toFixed(2),
          providerEarnings: (price - fee).toFixed(2),
          status: "pending",
        });
        
        // Increment bookings count for the service
        await storage.incrementServiceBookings(item.serviceId, 1);
        
        // Create notification for provider
        await storage.createNotification({
          userId: item.service.userId,
          type: "booking_created",
          title: "New Booking Request",
          message: `You have a new booking for ${item.service.serviceName}`,
          relatedId: booking.id,
          relatedType: "booking",
        });
        
        bookings.push({ booking, contract });
      }
      
      // Clear cart after successful checkout
      await storage.clearCart(userId);

      // Create Stripe payment intent for the total
      const { stripePaymentService } = await import("./services/stripe-payment.service");
      const paymentIntent = await stripePaymentService.createPaymentIntent(
        userId,
        bookings.map((b: any) => b.booking),
        total,
        false
      );
      
      res.status(201).json({
        success: true,
        bookings,
        total: total.toFixed(2),
        paymentIntent,
        message: "Booking created successfully. Complete payment.",
      });
    } catch (err) {
      console.error("Checkout error:", err);
      res.status(500).json({ message: "Checkout failed" });
    }
  });

  // Get contract details
  app.get("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const contract = await storage.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    res.json(contract);
  });

  // === Itinerary Comparison & Optimization Routes ===

  app.post("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { userExperienceId, tripId, title, destination, startDate, endDate, budget, travelers, baselineItems: inlineBaselineItems, experienceTypeSlug } = req.body;

      const [comparison] = await db
        .insert(itineraryComparisons)
        .values({
          userId,
          userExperienceId,
          tripId,
          title: title || "My Itinerary Comparison",
          destination,
          startDate,
          endDate,
          budget: budget?.toString(),
          travelers: travelers || 1,
          experienceTypeSlug: experienceTypeSlug || null,
          status: "generating",
        })
        .returning();

      // Auto-generate AI alternatives immediately
      let baselineItems: any[] = [];

      if (inlineBaselineItems && inlineBaselineItems.length > 0) {
        baselineItems = inlineBaselineItems.map((item: any, index: number) => ({
          id: `inline-${index}`,
          name: item.name,
          description: item.description || "",
          serviceType: item.category || "service",
          price: parseFloat(item.price || "0"),
          rating: item.rating || 4.5,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else {
        // Fall back to cart items
        const cartItemsData = await db
          .select({
            cartItem: cartItems,
            service: providerServices,
          })
          .from(cartItems)
          .leftJoin(providerServices, eq(cartItems.serviceId, providerServices.id))
          .where(eq(cartItems.userId, userId));

        baselineItems = cartItemsData.map((item, index) => ({
          id: item.cartItem.id,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          rating: parseFloat(item.service?.averageRating || "4.5"),
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
          category: item.service?.serviceType || "service",
          provider: "Provider"
        }));
      }

      // Trigger AI optimization in background if we have items
      if (baselineItems.length > 0) {
        const availableServices = await db
          .select()
          .from(providerServices)
          .where(eq(providerServices.status, "active"))
          .limit(100);

        // Ensure dates are in YYYY-MM-DD format
        const formatDate = (d: string | undefined | null) => {
          if (!d) return new Date().toISOString().split('T')[0];
          if (d.includes('T')) return d.split('T')[0];
          return d;
        };

        generateOptimizedItineraries(
          comparison.id,
          userId,
          baselineItems,
          availableServices,
          destination || "Unknown",
          formatDate(startDate),
          formatDate(endDate),
          budget ? parseFloat(budget) : undefined,
          travelers || 1
        ).catch((err) => console.error("Background optimization error:", err));
      }

      res.status(201).json(comparison);
    } catch (error) {
      console.error("Error creating comparison:", error);
      res.status(500).json({ message: "Failed to create comparison" });
    }
  });

  app.get("/api/dashboard/trip-scores", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;

      const allComps = await db
        .select({
          tripId: itineraryComparisons.tripId,
          selectedVariantId: itineraryComparisons.selectedVariantId,
          createdAt: itineraryComparisons.createdAt,
        })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.userId, userId))
        .orderBy(desc(itineraryComparisons.createdAt));

      const seenTripIds = new Set<string>();
      const comps = allComps.filter(c => {
        if (!c.tripId || seenTripIds.has(c.tripId)) return false;
        seenTripIds.add(c.tripId);
        return true;
      });

      const variantIds = comps
        .map(c => c.selectedVariantId)
        .filter((v): v is string => !!v);

      const [variants, shares] = await Promise.all([
        variantIds.length
          ? db
              .select({ id: itineraryVariants.id, optimizationScore: itineraryVariants.optimizationScore })
              .from(itineraryVariants)
              .where(inArray(itineraryVariants.id, variantIds))
          : Promise.resolve([]),
        variantIds.length
          ? db
              .select({ variantId: sharedItineraries.variantId, shareToken: sharedItineraries.shareToken })
              .from(sharedItineraries)
              .where(inArray(sharedItineraries.variantId, variantIds))
          : Promise.resolve([]),
      ]);

      const scoreMap = new Map(variants.map(v => [v.id, v.optimizationScore]));
      const tokenMap = new Map(shares.map(s => [s.variantId, s.shareToken]));

      const result = comps
        .filter(c => !!c.tripId)
        .map(c => ({
          tripId: c.tripId!,
          optimizationScore: c.selectedVariantId ? (scoreMap.get(c.selectedVariantId) ?? null) : null,
          shareToken: c.selectedVariantId ? (tokenMap.get(c.selectedVariantId) ?? null) : null,
        }));

      res.json(result);
    } catch (error) {
      console.error("Error fetching trip scores:", error);
      res.status(500).json({ message: "Failed to fetch trip scores" });
    }
  });

  app.get("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const comparisons = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.userId, userId))
        .orderBy(itineraryComparisons.createdAt);

      res.json(comparisons);
    } catch (error) {
      console.error("Error fetching comparisons:", error);
      res.status(500).json({ message: "Failed to fetch comparisons" });
    }
  });

  app.get("/api/itinerary-comparisons/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const result = await getComparisonWithVariants(req.params.id);

      if (!result) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (result.comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching comparison:", error);
      res.status(500).json({ message: "Failed to fetch comparison" });
    }
  });

  app.post("/api/itinerary-comparisons/:id/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const comparisonId = req.params.id;
      const { baselineItems: inlineBaselineItems } = req.body;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, comparisonId),
      });

      if (!comparison) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let baselineItems: any[] = [];

      if (inlineBaselineItems && inlineBaselineItems.length > 0) {
        baselineItems = inlineBaselineItems.map((item: any, index: number) => ({
          id: `inline-${index}`,
          name: item.name,
          description: item.description || "",
          serviceType: "external",
          price: parseFloat(item.price || "0"),
          rating: item.rating || 4.5,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else if (comparison.userExperienceId) {
        const items = await db
          .select()
          .from(userExperienceItems)
          .where(eq(userExperienceItems.userExperienceId, comparison.userExperienceId));

        baselineItems = items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          serviceType: item.providerServiceId ? "provider" : "external",
          price: parseFloat(item.price || "0"),
          rating: 4.5,
          location: item.location,
          duration: 120,
          dayNumber: 1,
          timeSlot: item.scheduledTime || "morning",
        }));
      } else {
        const cartItemsData = await db
          .select({
            cartItem: cartItems,
            service: providerServices,
          })
          .from(cartItems)
          .leftJoin(providerServices, eq(cartItems.serviceId, providerServices.id))
          .where(eq(cartItems.userId, userId));

        baselineItems = cartItemsData.map((item, index) => ({
          id: item.cartItem.id,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          rating: parseFloat(item.service?.averageRating || "4.5"),
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
        }));
      }

      if (baselineItems.length === 0) {
        return res.status(400).json({ message: "No items to optimize. Add services to your cart or experience first." });
      }

      const availableServices = await db
        .select()
        .from(providerServices)
        .where(eq(providerServices.status, "active"))
        .limit(100);

      res.json({ message: "Optimization started", status: "generating" });

      generateOptimizedItineraries(
        comparisonId,
        userId,
        baselineItems,
        availableServices,
        comparison.destination || "Unknown",
        comparison.startDate || new Date().toISOString(),
        comparison.endDate || new Date().toISOString(),
        comparison.budget ? parseFloat(comparison.budget) : undefined,
        comparison.travelers || 1
      ).catch((err) => console.error("Background optimization error:", err));

    } catch (error) {
      console.error("Error starting optimization:", error);
      res.status(500).json({ message: "Failed to start optimization" });
    }
  });

  app.post("/api/itinerary-comparisons/:id/select", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { variantId } = req.body;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, req.params.id),
      });

      if (!comparison) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await selectVariant(req.params.id, variantId);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: "Variant selected", variant: result.variant });
    } catch (error) {
      console.error("Error selecting variant:", error);
      res.status(500).json({ message: "Failed to select variant" });
    }
  });

  app.post("/api/itinerary-comparisons/:id/apply-to-cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const comparisonId = req.params.id;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, comparisonId),
      });

      if (!comparison || comparison.userId !== userId) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (!comparison.selectedVariantId) {
        return res.status(400).json({ message: "No variant selected" });
      }

      const variantItems = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, comparison.selectedVariantId));

      await db.delete(cartItems).where(eq(cartItems.userId, userId));

      for (const item of variantItems) {
        if (item.providerServiceId) {
          await db.insert(cartItems).values({
            userId,
            serviceId: item.providerServiceId,
            quantity: 1,
            notes: `Day ${item.dayNumber} - ${item.timeSlot}`,
          });
        }
      }

      res.json({ message: "Cart updated with selected itinerary", itemsAdded: variantItems.length });
    } catch (error) {
      console.error("Error applying to cart:", error);
      res.status(500).json({ message: "Failed to apply itinerary to cart" });
    }
  });

  // === COORDINATION HUB API ROUTES ===

  // Vendor Availability Slots
  app.get("/api/vendor-availability/:serviceId", async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { date } = req.query;
      const slots = await storage.getVendorAvailabilitySlots(serviceId, date as string | undefined);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching availability slots:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const slots = await storage.getProviderAvailabilitySlots(userId);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching provider availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const availabilityInput = z.object({
        serviceId: z.string().min(1),
        dayOfWeek: z.number().min(0).max(6).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        date: z.string().min(1),
        isAvailable: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      }).parse(req.body);
      const slot = await storage.createVendorAvailabilitySlot({ ...availabilityInput, providerId: userId });
      res.status(201).json(slot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating availability slot:", error);
      res.status(500).json({ message: "Failed to create availability slot" });
    }
  });

  app.patch("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const updateInput = z.object({
        dayOfWeek: z.number().min(0).max(6).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        date: z.string().optional(),
        isAvailable: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      }).parse(req.body);
      const existingSlot = await storage.getVendorAvailabilitySlot(req.params.id);
      if (!existingSlot) return res.status(404).json({ message: "Slot not found" });
      if (existingSlot.providerId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const slot = await storage.updateVendorAvailabilitySlot(req.params.id, updateInput);
      res.json(slot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating availability slot:", error);
      res.status(500).json({ message: "Failed to update availability slot" });
    }
  });

  app.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existingSlot = await storage.getVendorAvailabilitySlot(req.params.id);
      if (!existingSlot) return res.status(404).json({ message: "Slot not found" });
      if (existingSlot.providerId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteVendorAvailabilitySlot(req.params.id);
      res.json({ message: "Slot deleted" });
    } catch (error) {
      console.error("Error deleting availability slot:", error);
      res.status(500).json({ message: "Failed to delete availability slot" });
    }
  });

  app.post("/api/vendor-availability/:id/book", isAuthenticated, async (req, res) => {
    try {
      const slot = await storage.bookSlot(req.params.id);
      if (!slot) return res.status(404).json({ message: "Slot not found" });
      res.json(slot);
    } catch (error) {
      console.error("Error booking slot:", error);
      res.status(500).json({ message: "Failed to book slot" });
    }
  });

  // Coordination States
  app.get("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const states = await storage.getCoordinationStates(userId);
      res.json(states);
    } catch (error) {
      console.error("Error fetching coordination states:", error);
      res.status(500).json({ message: "Failed to fetch coordination states" });
    }
  });

  app.get("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      res.json(state);
    } catch (error) {
      console.error("Error fetching coordination state:", error);
      res.status(500).json({ message: "Failed to fetch coordination state" });
    }
  });

  app.get("/api/coordination-states/active/:experienceType", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const state = await storage.getActiveCoordinationState(userId, req.params.experienceType);
      res.json(state || null);
    } catch (error) {
      console.error("Error fetching active coordination state:", error);
      res.status(500).json({ message: "Failed to fetch active coordination state" });
    }
  });

  app.post("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const coordInput = z.object({
        experienceType: z.string().min(1).max(100),
        title: z.string().min(1).max(255).optional(),
        status: z.string().max(50).optional(),
        metadata: z.record(z.any()).optional(),
      }).parse(req.body);
      const state = await storage.createCoordinationState({ ...coordInput, userId });
      res.status(201).json(state);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating coordination state:", error);
      res.status(500).json({ message: "Failed to create coordination state" });
    }
  });

  app.patch("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const coordUpdateInput = z.object({
        title: z.string().min(1).max(255).optional(),
        status: z.string().max(50).optional(),
        metadata: z.record(z.any()).optional(),
      }).parse(req.body);
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const updated = await storage.updateCoordinationState(req.params.id, coordUpdateInput);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating coordination state:", error);
      res.status(500).json({ message: "Failed to update coordination state" });
    }
  });

  app.patch("/api/coordination-states/:id/status", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const { status, ...historyEntry } = req.body;
      const updated = await storage.updateCoordinationStatus(req.params.id, status, historyEntry);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coordination status:", error);
      res.status(500).json({ message: "Failed to update coordination status" });
    }
  });

  app.delete("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteCoordinationState(req.params.id);
      res.json({ message: "Coordination state deleted" });
    } catch (error) {
      console.error("Error deleting coordination state:", error);
      res.status(500).json({ message: "Failed to delete coordination state" });
    }
  });

  // Coordination Bookings
  app.get("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const bookings = await storage.getCoordinationBookings(req.params.coordinationId);
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching coordination bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
    try {
      const bookingInput = z.object({
        itemType: z.string().min(1),
        itemId: z.string().min(1),
        itemName: z.string().min(1).max(255),
        vendorName: z.string().min(1).max(255).optional(),
        serviceType: z.string().max(100).optional(),
        status: z.string().max(50).optional(),
        amount: z.string().optional(),
        scheduledDate: z.string().optional(),
        notes: z.string().max(1000).optional(),
      }).parse(req.body);
      const state = await storage.getCoordinationState(req.params.coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any).claims.sub;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const booking = await storage.createCoordinationBooking({ 
        ...bookingInput, 
        coordinationId: req.params.coordinationId 
      });
      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating coordination booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.patch("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const bookingUpdateInput = z.object({
        vendorName: z.string().min(1).max(255).optional(),
        serviceType: z.string().max(100).optional(),
        status: z.string().max(50).optional(),
        amount: z.string().optional(),
        scheduledDate: z.string().optional(),
        notes: z.string().max(1000).optional(),
      }).parse(req.body);
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const updated = await storage.updateCoordinationBooking(req.params.id, bookingUpdateInput);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating coordination booking:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  app.post("/api/coordination-bookings/:id/confirm", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const { bookingReference, confirmationDetails } = req.body;
      const updated = await storage.confirmCoordinationBooking(req.params.id, bookingReference, confirmationDetails);
      res.json(updated);
    } catch (error) {
      console.error("Error confirming booking:", error);
      res.status(500).json({ message: "Failed to confirm booking" });
    }
  });

  app.delete("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteCoordinationBooking(req.params.id);
      res.json({ message: "Booking deleted" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ message: "Failed to delete booking" });
    }
  });

  // Call seed database
  seedDatabase().catch(err => console.error("Error seeding database:", err));

  // Amadeus Travel API Routes
  
  // Search airports/cities for autocomplete - uses database cache first
  app.get("/api/amadeus/locations", async (req, res) => {
    try {
      const { keyword, subType } = req.query;
      if (!keyword || typeof keyword !== 'string') {
        return res.status(400).json({ message: "Keyword is required" });
      }
      
      console.log(`[Amadeus Locations] Searching for: "${keyword}", subType: ${subType}`);
      
      const locationType = subType === 'CITY' ? 'CITY' : 'AIRPORT';
      
      // First, search the database cache
      const cachedLocations = await storage.searchLocationCache(keyword, locationType);
      console.log(`[Amadeus Locations] Found ${cachedLocations.length} cached locations for "${keyword}"`);
      
      if (cachedLocations.length > 0) {
        // Return cached locations using rawData for exact Amadeus API format matching
        const formattedLocations = cachedLocations.map(loc => {
          // If rawData exists, use it directly for exact API format
          if (loc.rawData && typeof loc.rawData === 'object' && Object.keys(loc.rawData).length > 0) {
            return loc.rawData;
          }
          // Fallback: construct from individual fields
          return {
            type: "location",
            subType: loc.locationType,
            name: loc.name,
            detailedName: loc.detailedName,
            id: loc.iataCode,
            iataCode: loc.iataCode,
            geoCode: loc.latitude && loc.longitude ? {
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude)
            } : undefined,
            address: {
              cityName: loc.cityName,
              cityCode: loc.cityCode,
              countryName: loc.countryName,
              countryCode: loc.countryCode,
              regionCode: loc.regionCode,
              stateCode: loc.stateCode,
            },
            timeZoneOffset: loc.timeZoneOffset,
            analytics: loc.travelerScore ? { travelers: { score: loc.travelerScore } } : undefined,
          };
        });
        // Sort by relevance: exact name match first, then by traveler score
        formattedLocations.sort((a: any, b: any) => {
          const keywordLower = keyword.toLowerCase();
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          const cityA = (a.address?.cityName || '').toLowerCase();
          const cityB = (b.address?.cityName || '').toLowerCase();
          
          // Exact match on name or city name gets highest priority
          const exactMatchA = nameA === keywordLower || cityA === keywordLower;
          const exactMatchB = nameB === keywordLower || cityB === keywordLower;
          
          if (exactMatchA && !exactMatchB) return -1;
          if (!exactMatchA && exactMatchB) return 1;
          
          // Then sort by traveler score (higher is better)
          const scoreA = a.analytics?.travelers?.score ?? 0;
          const scoreB = b.analytics?.travelers?.score ?? 0;
          return scoreB - scoreA;
        });
        console.log(`[Amadeus Locations] Sorted results - first: ${(formattedLocations[0] as any)?.name} (score: ${(formattedLocations[0] as any)?.analytics?.travelers?.score ?? 0})`);
        return res.json(formattedLocations);
      }
      
      // If not in cache, fetch from API and cache the results
      const locations = subType === 'CITY' 
        ? await amadeusService.searchCitiesByKeyword(keyword)
        : await amadeusService.searchAirportsByKeyword(keyword);
      
      // Store in cache for future use (expires in 30 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      for (const loc of locations) {
        await storage.upsertLocationCache({
          iataCode: loc.iataCode,
          locationType: loc.subType || locationType,
          name: loc.name,
          detailedName: loc.detailedName,
          cityName: loc.address?.cityName,
          cityCode: loc.address?.cityCode,
          countryName: loc.address?.countryName,
          countryCode: loc.address?.countryCode,
          regionCode: loc.address?.regionCode,
          stateCode: loc.address?.stateCode,
          latitude: loc.geoCode?.latitude?.toString(),
          longitude: loc.geoCode?.longitude?.toString(),
          timeZoneOffset: loc.timeZoneOffset,
          travelerScore: loc.analytics?.travelers?.score,
          rawData: loc,
          expiresAt,
        });
      }
      
      // Sort by relevance: exact name match first, then by traveler score
      locations.sort((a: any, b: any) => {
        const keywordLower = keyword.toLowerCase();
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        const cityA = (a.address?.cityName || '').toLowerCase();
        const cityB = (b.address?.cityName || '').toLowerCase();
        
        // Exact match on name or city name gets highest priority
        const exactMatchA = nameA === keywordLower || cityA === keywordLower;
        const exactMatchB = nameB === keywordLower || cityB === keywordLower;
        
        if (exactMatchA && !exactMatchB) return -1;
        if (!exactMatchA && exactMatchB) return 1;
        
        // Then sort by traveler score (higher is better)
        const scoreA = a.analytics?.travelers?.score ?? 0;
        const scoreB = b.analytics?.travelers?.score ?? 0;
        return scoreB - scoreA;
      });
      
      res.json(locations);
    } catch (error: any) {
      console.error('Location search error:', error);
      res.status(500).json({ message: error.message || "Location search failed" });
    }
  });

  // Search flights
  app.get("/api/amadeus/flights", isAuthenticated, async (req, res) => {
    try {
      const { 
        origin, destination, departureDate, returnDate, 
        adults, children, infants, travelClass, nonStop, max 
      } = req.query;
      
      if (!origin || !destination || !departureDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: origin, destination, departureDate, adults" 
        });
      }
      
      const flights = await amadeusService.searchFlights({
        originLocationCode: origin as string,
        destinationLocationCode: destination as string,
        departureDate: departureDate as string,
        returnDate: returnDate as string | undefined,
        adults: parseInt(adults as string, 10),
        children: children ? parseInt(children as string, 10) : undefined,
        infants: infants ? parseInt(infants as string, 10) : undefined,
        travelClass: travelClass as any,
        nonStop: nonStop === 'true',
        max: max ? parseInt(max as string, 10) : 10,
      });
      
      res.json(flights);
    } catch (error: any) {
      console.error('Flight search error:', error);
      res.status(500).json({ message: error.message || "Flight search failed" });
    }
  });

  // Search hotels by city
  app.get("/api/amadeus/hotels", isAuthenticated, async (req, res) => {
    try {
      const { cityCode, checkInDate, checkOutDate, adults, rooms, currency } = req.query;
      
      if (!cityCode || !checkInDate || !checkOutDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: cityCode, checkInDate, checkOutDate, adults" 
        });
      }
      
      const hotels = await amadeusService.searchHotels({
        cityCode: cityCode as string,
        checkInDate: checkInDate as string,
        checkOutDate: checkOutDate as string,
        adults: parseInt(adults as string, 10),
        roomQuantity: rooms ? parseInt(rooms as string, 10) : 1,
        currency: (currency as string) || 'USD',
      });
      
      res.json(hotels);
    } catch (error: any) {
      console.error('Hotel search error:', error);
      res.status(500).json({ message: error.message || "Hotel search failed" });
    }
  });

  // Search Points of Interest by location
  app.get("/api/amadeus/pois", isAuthenticated, async (req, res) => {
    try {
      const { latitude, longitude, radius, categories } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "latitude and longitude are required" });
      }
      
      const pois = await amadeusService.searchPointsOfInterest({
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radius: radius ? parseInt(radius as string, 10) : 5,
        categories: categories ? (categories as string).split(',') : undefined,
      });
      
      res.json(pois);
    } catch (error: any) {
      console.error('POI search error:', error);
      res.status(500).json({ message: error.message || "POI search failed" });
    }
  });

  // Get POI by ID
  app.get("/api/amadeus/pois/:id", isAuthenticated, async (req, res) => {
    try {
      const poi = await amadeusService.getPointOfInterestById(req.params.id);
      if (!poi) {
        return res.status(404).json({ message: "POI not found" });
      }
      res.json(poi);
    } catch (error: any) {
      console.error('POI get error:', error);
      res.status(500).json({ message: error.message || "Failed to get POI" });
    }
  });

  // Search Amadeus Tours & Activities by location
  app.get("/api/amadeus/activities", isAuthenticated, async (req, res) => {
    try {
      const { latitude, longitude, radius } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "latitude and longitude are required" });
      }
      
      const activities = await amadeusService.searchActivities({
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radius: radius ? parseInt(radius as string, 10) : 20,
      });
      
      res.json(activities);
    } catch (error: any) {
      console.error('Amadeus activities search error:', error);
      res.status(500).json({ message: error.message || "Activities search failed" });
    }
  });

  // Get Amadeus activity by ID
  app.get("/api/amadeus/activities/:id", isAuthenticated, async (req, res) => {
    try {
      const activity = await amadeusService.getActivityById(req.params.id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      res.json(activity);
    } catch (error: any) {
      console.error('Amadeus activity get error:', error);
      res.status(500).json({ message: error.message || "Failed to get activity" });
    }
  });

  // Search airport transfers
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

  app.post("/api/amadeus/transfers", isAuthenticated, async (req, res) => {
    try {
      const parseResult = transferSearchSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body",
          errors: parseResult.error.flatten().fieldErrors
        });
      }
      
      const { startLocationCode, endAddressLine, endCityName, endGeoCode, transferType, startDateTime, passengers } = parseResult.data;
      
      const transfers = await amadeusService.searchTransfers({
        startLocationCode,
        endAddressLine,
        endCityName,
        endGeoCode: endGeoCode as any,
        transferType: transferType as any,
        startDateTime,
        passengers,
      });
      
      res.json(transfers);
    } catch (error: any) {
      console.error('Transfers search error:', error);
      res.status(500).json({ message: error.message || "Transfers search failed" });
    }
  });

  // Get safety ratings for a location
  app.get("/api/amadeus/safety", isAuthenticated, async (req, res) => {
    try {
      const { latitude, longitude, radius } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: "latitude and longitude are required" });
      }
      
      const safetyRatings = await amadeusService.getSafetyRatings({
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radius: radius ? parseInt(radius as string, 10) : 5,
      });
      
      res.json(safetyRatings);
    } catch (error: any) {
      console.error('Safety ratings search error:', error);
      res.status(500).json({ message: error.message || "Safety ratings search failed" });
    }
  });

  // Get safety rating by ID
  app.get("/api/amadeus/safety/:id", isAuthenticated, async (req, res) => {
    try {
      const rating = await amadeusService.getSafetyRatingById(req.params.id);
      if (!rating) {
        return res.status(404).json({ message: "Safety rating not found" });
      }
      res.json(rating);
    } catch (error: any) {
      console.error('Safety rating get error:', error);
      res.status(500).json({ message: error.message || "Failed to get safety rating" });
    }
  });

  // ============ VIATOR API ROUTES ============

  // Search activities by destination (freetext search)
  app.get("/api/viator/activities", isAuthenticated, async (req, res) => {
    try {
      const { destination, currency, count } = req.query;
      
      if (!destination || typeof destination !== 'string') {
        return res.status(400).json({ message: "destination is required" });
      }
      
      // Try to get from API first
      try {
        const result = await viatorService.searchByFreetext(
          destination,
          (currency as string) || 'USD',
          count ? parseInt(count as string, 10) : 20
        );
        res.json(result);
      } catch (apiError: any) {
        // If API fails, check if it's a temporary server error
        if (apiError.message?.includes('500')) {
          console.error('Viator API temporarily unavailable:', apiError.message);
          // Return empty results with a service notice instead of error
          res.json({
            products: [],
            totalCount: 0,
            serviceNotice: "The activities service is temporarily unavailable. Please try again in a few minutes."
          });
        } else {
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error('Viator activity search error:', error);
      res.status(500).json({ message: error.message || "Activity search failed" });
    }
  });

  // Get activity details by product code
  app.get("/api/viator/activities/:productCode", isAuthenticated, async (req, res) => {
    try {
      const { productCode } = req.params;
      
      const product = await viatorService.getProductDetails(productCode);
      
      if (!product) {
        return res.status(404).json({ message: "Activity not found" });
      }
      
      res.json(product);
    } catch (error: any) {
      console.error('Viator product details error:', error);
      res.status(500).json({ message: error.message || "Failed to get activity details" });
    }
  });

  // Check availability for an activity
  app.post("/api/viator/availability", isAuthenticated, async (req, res) => {
    try {
      const { productCode, travelDate, travelers } = req.body;
      
      if (!productCode || !travelDate) {
        return res.status(400).json({ message: "productCode and travelDate are required" });
      }
      
      const paxMix = [{ ageBand: 'ADULT', numberOfTravelers: travelers || 1 }];
      const availability = await viatorService.checkAvailability(productCode, travelDate, paxMix);
      
      res.json(availability);
    } catch (error: any) {
      console.error('Viator availability check error:', error);
      res.status(500).json({ message: error.message || "Availability check failed" });
    }
  });

  // Get Viator destinations
  app.get("/api/viator/destinations", isAuthenticated, async (req, res) => {
    try {
      const destinations = await viatorService.getDestinations();
      res.json(destinations);
    } catch (error: any) {
      console.error('Viator destinations error:', error);
      res.status(500).json({ message: error.message || "Failed to get destinations" });
    }
  });

  // ============ CACHED DATA WITH LOCATIONS API ============

  // Get cached hotels with location data for mapping
  app.get("/api/cache/hotels", isAuthenticated, async (req, res) => {
    try {
      const { cityCode, checkInDate, checkOutDate, adults, rooms, currency } = req.query;
      
      if (!cityCode || !checkInDate || !checkOutDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: cityCode, checkInDate, checkOutDate, adults" 
        });
      }
      
      const result = await cacheService.getHotelsWithCache({
        cityCode: cityCode as string,
        checkInDate: checkInDate as string,
        checkOutDate: checkOutDate as string,
        adults: parseInt(adults as string, 10),
        roomQuantity: rooms ? parseInt(rooms as string, 10) : 1,
        currency: (currency as string) || 'USD',
      });
      
      res.json({
        hotels: result.data,
        fromCache: result.fromCache,
        lastUpdated: result.lastUpdated,
      });
    } catch (error: any) {
      console.error('Cached hotel search error:', error);
      res.status(500).json({ message: error.message || "Hotel search failed" });
    }
  });

  // Get cached activities with location data for mapping
  app.get("/api/cache/activities", async (req, res) => {
    try {
      const { destination, currency, count } = req.query;
      
      if (!destination || typeof destination !== 'string') {
        return res.status(400).json({ message: "destination is required" });
      }
      
      const result = await cacheService.getActivitiesWithCache(
        destination,
        (currency as string) || 'USD',
        count ? parseInt(count as string, 10) : 20
      );
      
      res.json({
        activities: result.data,
        fromCache: result.fromCache,
        lastUpdated: result.lastUpdated,
      });
    } catch (error: any) {
      console.error('Cached activity search error:', error);
      res.status(500).json({ message: error.message || "Activity search failed" });
    }
  });

  // Get cached flights
  app.get("/api/cache/flights", isAuthenticated, async (req, res) => {
    try {
      const { origin, destination, departureDate, returnDate, adults, travelClass, nonStop } = req.query;
      
      if (!origin || !destination || !departureDate || !adults) {
        return res.status(400).json({ 
          message: "Required fields: origin, destination, departureDate, adults" 
        });
      }
      
      const result = await cacheService.getFlightsWithCache({
        originLocationCode: origin as string,
        destinationLocationCode: destination as string,
        departureDate: departureDate as string,
        returnDate: returnDate as string | undefined,
        adults: parseInt(adults as string, 10),
        travelClass: (travelClass as 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST') || 'ECONOMY',
        nonStop: nonStop === 'true',
        max: 20,
      });
      
      res.json({
        flights: result.data,
        fromCache: result.fromCache,
        lastUpdated: result.lastUpdated,
      });
    } catch (error: any) {
      console.error('Cached flight search error:', error);
      res.status(500).json({ message: error.message || "Flight search failed" });
    }
  });

  // Get map markers for hotels in a destination
  app.get("/api/cache/map/hotels", isAuthenticated, async (req, res) => {
    try {
      const { cityCode } = req.query;
      const markers = await cacheService.getCachedHotelsWithLocations(cityCode as string);
      res.json(markers);
    } catch (error: any) {
      console.error('Hotel map markers error:', error);
      res.status(500).json({ message: error.message || "Failed to get hotel markers" });
    }
  });

  // Get map markers for activities in a destination
  app.get("/api/cache/map/activities", isAuthenticated, async (req, res) => {
    try {
      const { destination } = req.query;
      const markers = await cacheService.getCachedActivitiesWithLocations(destination as string);
      res.json(markers);
    } catch (error: any) {
      console.error('Activity map markers error:', error);
      res.status(500).json({ message: error.message || "Failed to get activity markers" });
    }
  });

  // Verify availability before purchase
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

  app.post("/api/cache/verify-availability", isAuthenticated, async (req, res) => {
    try {
      const parseResult = verifyAvailabilitySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: parseResult.error.errors 
        });
      }

      const { items } = parseResult.data;
      
      const results = await Promise.all(items.map(async (item) => {
        if (item.type === 'hotel') {
          const hotelId = item.id.replace('hotel-', '');
          if (!item.checkInDate || !item.checkOutDate) {
            return { ...item, available: false, error: 'checkInDate and checkOutDate required for hotels' };
          }
          const result = await cacheService.verifyHotelAvailability(
            hotelId, 
            item.checkInDate, 
            item.checkOutDate,
            { 
              adults: item.adults, 
              rooms: item.rooms, 
              currency: item.currency 
            }
          );
          return { ...item, ...result };
        } else if (item.type === 'activity') {
          const productCode = item.id.replace('activity-', '');
          const result = await cacheService.verifyActivityAvailability(productCode, item.travelDate);
          return { ...item, ...result };
        }
        return { ...item, available: true };
      }));
      
      res.json({ 
        items: results,
        allAvailable: results.every(r => r.available),
        priceChanges: results.filter((r: any) => r.priceChanged),
      });
    } catch (error: any) {
      console.error('Availability verification error:', error);
      res.status(500).json({ message: error.message || "Verification failed" });
    }
  });

  // Clean up expired cache entries
  app.post("/api/cache/cleanup", isAuthenticated, async (req, res) => {
    try {
      const result = await cacheService.cleanupExpiredCache();
      res.json({ 
        message: "Cache cleanup complete",
        deleted: result,
      });
    } catch (error: any) {
      console.error('Cache cleanup error:', error);
      res.status(500).json({ message: error.message || "Cleanup failed" });
    }
  });

  // ============ FILTERING AND SORTING API ============

  // Zod schemas for filter validation
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

  // Get filtered hotels with pagination
  app.get("/api/cache/filter/hotels", isAuthenticated, async (req, res) => {
    try {
      const parsed = hotelFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid filter parameters", errors: parsed.error.errors });
      }
      const filters = parsed.data;

      const result = await cacheService.getFilteredHotels({
        cityCode: filters.cityCode,
        searchQuery: filters.searchQuery,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        minRating: filters.minRating,
        preferenceTags: filters.preferenceTags ? filters.preferenceTags.split(',').filter(t => t.trim()) : undefined,
        county: filters.county,
        state: filters.state,
        countryCode: filters.countryCode,
        sortBy: filters.sortBy,
        limit: filters.limit,
        offset: filters.offset,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Filter hotels error:', error);
      res.status(500).json({ message: error.message || "Filter failed" });
    }
  });

  // Get filtered activities with pagination
  app.get("/api/cache/filter/activities", isAuthenticated, async (req, res) => {
    try {
      const parsed = activityFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid filter parameters", errors: parsed.error.errors });
      }
      const filters = parsed.data;

      const result = await cacheService.getFilteredActivities({
        destination: filters.destination,
        searchQuery: filters.searchQuery,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        minRating: filters.minRating,
        preferenceTags: filters.preferenceTags ? filters.preferenceTags.split(',').filter(t => t.trim()) : undefined,
        category: filters.category,
        county: filters.county,
        state: filters.state,
        countryCode: filters.countryCode,
        sortBy: filters.sortBy,
        limit: filters.limit,
        offset: filters.offset,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Filter activities error:', error);
      res.status(500).json({ message: error.message || "Filter failed" });
    }
  });

  // Get available preference tags with counts
  app.get("/api/cache/preference-tags/:itemType", isAuthenticated, async (req, res) => {
    try {
      const { itemType } = req.params;
      if (itemType !== 'hotel' && itemType !== 'activity') {
        return res.status(400).json({ message: "itemType must be 'hotel' or 'activity'" });
      }
      const tags = await cacheService.getAvailablePreferenceTags(itemType);
      res.json(tags);
    } catch (error: any) {
      console.error('Get preference tags error:', error);
      res.status(500).json({ message: error.message || "Failed to get preference tags" });
    }
  });

  // Get available categories with counts (for activities)
  app.get("/api/cache/categories", isAuthenticated, async (req, res) => {
    try {
      const categories = await cacheService.getAvailableCategories();
      res.json(categories);
    } catch (error: any) {
      console.error('Get categories error:', error);
      res.status(500).json({ message: error.message || "Failed to get categories" });
    }
  });

  // ============ CACHE SCHEDULER ROUTES ============

  // Get cache freshness status
  app.get("/api/cache/status", isAuthenticated, async (req, res) => {
    try {
      const status = await cacheSchedulerService.getCacheFreshnessStatus();
      res.json(status);
    } catch (error: any) {
      console.error('Get cache status error:', error);
      res.status(500).json({ message: error.message || "Failed to get cache status" });
    }
  });

  // Trigger manual cache refresh (admin only)
  app.post("/api/cache/refresh", isAuthenticated, async (req, res) => {
    try {
      // Check if user is admin (optional - can be enforced later)
      if (cacheSchedulerService.isCurrentlyRefreshing()) {
        return res.status(409).json({ message: "Cache refresh already in progress" });
      }
      
      const stats = await cacheSchedulerService.triggerManualRefresh();
      res.json({
        message: "Cache refresh completed",
        stats,
      });
    } catch (error: any) {
      console.error('Manual cache refresh error:', error);
      res.status(500).json({ message: error.message || "Cache refresh failed" });
    }
  });

  // Pre-checkout verification endpoint
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

  app.post("/api/cache/checkout-verify", isAuthenticated, async (req, res) => {
    try {
      const parsed = checkoutVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }

      const results = await cacheSchedulerService.verifyAndRefreshForCheckout(parsed.data.items);
      
      const allVerified = results.every(r => r.verified);
      const priceChanges = results.filter(r => r.priceChanged);
      
      res.json({
        verified: allVerified,
        items: results,
        priceChanges: priceChanges.length > 0 ? priceChanges : null,
        message: allVerified 
          ? "All items verified successfully" 
          : "Some items could not be verified",
      });
    } catch (error: any) {
      console.error('Checkout verification error:', error);
      res.status(500).json({ message: error.message || "Verification failed" });
    }
  });

  // ============ CLAUDE AI ROUTES ============

  // Zod schemas for Claude API validation
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

  // Optimize itinerary using Claude
  app.post("/api/claude/optimize-itinerary", isAuthenticated, async (req, res) => {
    try {
      const parsed = claudeOptimizeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { destination, startDate, endDate, travelers, budget, cartItems, preferences } = parsed.data;
      
      // Strip rawData from cart items to prevent prompt injection and reduce payload size
      const sanitizedCartItems = cartItems.map(item => ({
        ...item,
        metadata: item.metadata ? { ...item.metadata, rawData: undefined } : undefined,
      }));
      
      const result = await claudeService.optimizeItinerary({
        destination,
        startDate,
        endDate,
        travelers: travelers || 1,
        budget,
        cartItems: sanitizedCartItems,
        preferences,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error('Claude itinerary optimization error:', error);
      res.status(500).json({ message: error.message || "Itinerary optimization failed" });
    }
  });

  // Analyze transportation needs
  app.post("/api/claude/transportation-analysis", isAuthenticated, async (req, res) => {
    try {
      const parsed = claudeTransportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { hotelLocation, activityLocations } = parsed.data;
      
      const result = await claudeService.analyzeTransportationNeeds(hotelLocation, activityLocations);
      res.json(result);
    } catch (error: any) {
      console.error('Claude transportation analysis error:', error);
      res.status(500).json({ message: error.message || "Transportation analysis failed" });
    }
  });

  // Generate transport packages for trip segments
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

  // Full itinerary graph analysis (Airport → Hotel → Activities → Hotel → Airport)
  app.post("/api/claude/full-itinerary-graph", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        flightInfo: z.object({
          arrivalAirport: z.string().optional(),
          arrivalAirportCoords: z.object({ lat: z.number(), lng: z.number() }).optional(),
          departureAirport: z.string().optional(),
          departureAirportCoords: z.object({ lat: z.number(), lng: z.number() }).optional(),
          arrivalTime: z.string().optional(),
          departureTime: z.string().optional(),
        }).optional().default({}),
        hotelLocation: z.object({
          lat: z.number(),
          lng: z.number(),
          address: z.string(),
          name: z.string(),
        }),
        activityLocations: z.array(z.object({
          lat: z.number(),
          lng: z.number(),
          address: z.string(),
          name: z.string(),
          date: z.string().optional(),
          time: z.string().optional(),
        })),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { flightInfo, hotelLocation, activityLocations } = parsed.data;
      
      const result = await claudeService.analyzeFullItineraryGraph(
        flightInfo || {},
        hotelLocation,
        activityLocations
      );
      res.json(result);
    } catch (error: any) {
      console.error('Claude full itinerary graph analysis error:', error);
      res.status(500).json({ message: error.message || "Full itinerary graph analysis failed" });
    }
  });

  // Get travel recommendations
  app.post("/api/claude/recommendations", isAuthenticated, async (req, res) => {
    try {
      const parsed = claudeRecommendationsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }
      
      const { destination, dates, interests } = parsed.data;
      
      const result = await claudeService.generateTravelRecommendations(destination, dates, interests);
      res.json(result);
    } catch (error: any) {
      console.error('Claude recommendations error:', error);
      res.status(500).json({ message: error.message || "Recommendations generation failed" });
    }
  });

  // Google Routes API - Single transit route
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

  // Google Routes API - Multiple transit routes from one origin to many destinations
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

  // Google Maps Geocoding API - Convert place name to coordinates
  const geocodeSchema = z.object({
    address: z.string().min(1),
  });

  const FALLBACK_COORDINATES: Record<string, { lat: number; lng: number; formattedAddress: string }> = {
    "rome": { lat: 41.9028, lng: 12.4964, formattedAddress: "Rome, Italy" },
    "paris": { lat: 48.8566, lng: 2.3522, formattedAddress: "Paris, France" },
    "london": { lat: 51.5074, lng: -0.1278, formattedAddress: "London, United Kingdom" },
    "tokyo": { lat: 35.6762, lng: 139.6503, formattedAddress: "Tokyo, Japan" },
    "new york": { lat: 40.7128, lng: -74.0060, formattedAddress: "New York, NY, USA" },
    "barcelona": { lat: 41.3874, lng: 2.1686, formattedAddress: "Barcelona, Spain" },
    "bangkok": { lat: 13.7563, lng: 100.5018, formattedAddress: "Bangkok, Thailand" },
    "sydney": { lat: -33.8688, lng: 151.2093, formattedAddress: "Sydney, Australia" },
    "dubai": { lat: 25.2048, lng: 55.2708, formattedAddress: "Dubai, UAE" },
    "marrakech": { lat: 31.6295, lng: -7.9811, formattedAddress: "Marrakech, Morocco" },
    "bali": { lat: -8.3405, lng: 115.0920, formattedAddress: "Bali, Indonesia" },
    "istanbul": { lat: 41.0082, lng: 28.9784, formattedAddress: "Istanbul, Turkey" },
    "lisbon": { lat: 38.7223, lng: -9.1393, formattedAddress: "Lisbon, Portugal" },
    "singapore": { lat: 1.3521, lng: 103.8198, formattedAddress: "Singapore" },
    "los angeles": { lat: 34.0522, lng: -118.2437, formattedAddress: "Los Angeles, CA, USA" },
    "miami": { lat: 25.7617, lng: -80.1918, formattedAddress: "Miami, FL, USA" },
    "amsterdam": { lat: 52.3676, lng: 4.9041, formattedAddress: "Amsterdam, Netherlands" },
    "berlin": { lat: 52.5200, lng: 13.4050, formattedAddress: "Berlin, Germany" },
    "hong kong": { lat: 22.3193, lng: 114.1694, formattedAddress: "Hong Kong" },
    "goa": { lat: 15.2993, lng: 74.1240, formattedAddress: "Goa, India" },
  };

  // Geocoding endpoint - public access since it's just a geographic lookup
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
      const fallback = Object.entries(FALLBACK_COORDINATES).find(([key]) => 
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

  // === GROK AI INTEGRATION ROUTES ===

  // Expert Matching - Match experts to traveler needs
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

  app.post("/api/grok/match-experts", isAuthenticated, async (req, res) => {
    try {
      const parsed = expertMatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { travelerProfile, expertIds, limit } = parsed.data;

      // Get expert profiles from database
      const expertsQuery = await db.select()
        .from(users)
        .where(eq(users.role, "local_expert"));

      // Filter to specific expert IDs if provided
      let expertsList = expertIds 
        ? expertsQuery.filter(e => expertIds.includes(e.id))
        : expertsQuery.slice(0, limit || 5);

      if (expertsList.length === 0) {
        return res.json({ matches: [], message: "No experts found" });
      }

      // Get local expert forms for more profile info
      const expertForms = await db.select()
        .from(localExpertForms)
        .where(eq(localExpertForms.status, "approved"));

      const expertProfiles = expertsList.map(expert => {
        const form = expertForms.find((f: any) => f.userId === expert.id);
        return {
          id: expert.id,
          name: `${expert.firstName || ""} ${expert.lastName || ""}`.trim() || "Expert",
          destinations: (form?.destinations as string[]) || [],
          specialties: (form?.specialties as string[]) || [],
          experienceTypes: (form?.experienceTypes as string[]) || [],
          languages: (form?.languages as string[]) || [],
          yearsOfExperience: form?.yearsOfExperience || "1-3 years",
          bio: form?.bio || "",
          averageRating: 4.5,
          reviewCount: 0,
        };
      });

      const matches = await aiOrchestrator.matchExperts(
        travelerProfile,
        expertProfiles,
        { userId, limit }
      );

      // Store match scores in database
      for (const match of matches) {
        await db.insert(expertMatchScores).values({
          expertId: match.expertId,
          travelerId: userId,
          overallScore: match.overallScore,
          destinationMatch: match.breakdown.destinationMatch,
          specialtyMatch: match.breakdown.specialtyMatch,
          experienceTypeMatch: match.breakdown.experienceTypeMatch,
          budgetAlignment: match.breakdown.budgetAlignment,
          availabilityScore: match.breakdown.availabilityScore,
          strengths: match.strengths,
          reasoning: match.reasoning,
          requestContext: travelerProfile,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }).catch(err => console.error("Failed to store match score:", err));

        // Also persist to analytics table for trend tracking
        storage.createExpertMatchAnalytics({
          expertId: match.expertId,
          travelerId: userId,
          matchScore: match.overallScore,
          breakdown: match.breakdown,
          reasoning: match.reasoning,
          travelerDestination: travelerProfile.destination,
          travelerBudget: travelerProfile.budget?.toString(),
          travelerInterests: travelerProfile.interests || [],
          travelerGroupSize: travelerProfile.travelers,
        }).catch(err => console.error("Failed to store match analytics:", err));
      }

      res.json({ matches });
    } catch (error: any) {
      console.error("Grok expert matching error:", error);
      res.status(500).json({ message: error.message || "Expert matching failed" });
    }
  });

  // Content Generation - Generate bio, descriptions, responses
  const contentGenerationSchema = z.object({
    type: z.enum(["bio", "service_description", "inquiry_response", "welcome_message"]),
    context: z.record(z.any()),
    tone: z.enum(["professional", "friendly", "casual"]).optional(),
    length: z.enum(["short", "medium", "long"]).optional(),
  });

  app.post("/api/grok/content/generate", isAuthenticated, async (req, res) => {
    try {
      const parsed = contentGenerationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const result = await aiOrchestrator.generateContent(parsed.data, { userId });
      res.json(result);
    } catch (error: any) {
      console.error("Grok content generation error:", error);
      res.status(500).json({ message: error.message || "Content generation failed" });
    }
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

  app.post("/api/grok/intelligence", isAuthenticated, async (req, res) => {
    try {
      const parsed = intelligenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { destination, dates, topics } = parsed.data;

      // Check cache first
      const cached = await db.select()
        .from(destinationIntelligence)
        .where(eq(destinationIntelligence.destination, destination.toLowerCase()))
        .limit(1);

      if (cached.length > 0 && new Date(cached[0].expiresAt) > new Date()) {
        return res.json(cached[0].intelligenceData);
      }

      const result = await aiOrchestrator.getRealTimeIntelligence(
        { destination, dates, topics },
        { userId }
      );

      // Cache result
      await db.insert(destinationIntelligence).values({
        destination: destination.toLowerCase(),
        intelligenceData: result,
        events: result.events || [],
        weatherForecast: result.weatherForecast || {},
        safetyAlerts: result.safetyAlerts || [],
        trendingExperiences: result.trendingExperiences || [],
        deals: result.deals || [],
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      }).catch(err => console.error("Failed to cache intelligence:", err));

      res.json(result);
    } catch (error: any) {
      console.error("Grok real-time intelligence error:", error);
      res.status(500).json({ message: error.message || "Intelligence gathering failed" });
    }
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

  app.post("/api/grok/itinerary/generate", isAuthenticated, async (req, res) => {
    try {
      const parsed = autonomousItinerarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { tripId, ...itineraryRequest } = parsed.data;

      const result = await aiOrchestrator.generateAutonomousItinerary(itineraryRequest, {
        userId,
        tripId,
      });

      // Store generated itinerary
      const [saved] = await db.insert(aiGeneratedItineraries).values({
        userId,
        tripId,
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

      res.json({ ...result, id: saved.id });
    } catch (error: any) {
      console.error("Grok autonomous itinerary error:", error);
      res.status(500).json({ message: error.message || "Itinerary generation failed" });
    }
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

  // AI Chat endpoint - General purpose chat
  const chatSchema = z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    systemContext: z.string().optional(),
    preferProvider: z.enum(["grok", "claude", "auto"]).optional(),
  });

  app.post("/api/grok/chat", isAuthenticated, async (req, res) => {
    try {
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { messages, systemContext, preferProvider } = parsed.data;

      const { response, provider } = await aiOrchestrator.chat(messages, {
        userId,
        systemContext,
        preferProvider: preferProvider as any,
      });

      res.json({ response, provider });
    } catch (error: any) {
      console.error("Grok chat error:", error);
      res.status(500).json({ message: error.message || "Chat failed" });
    }
  });

  // AI Health check
  app.get("/api/grok/health", async (req, res) => {
    try {
      const health = await aiOrchestrator.healthCheck();
      res.json({ status: "ok", providers: health });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // === EXPERT AI TASKS ROUTES ===
  
  // Get expert's AI tasks
  app.get("/api/expert/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const status = req.query.status as string | undefined;
      
      const tasks = await db.select()
        .from(expertAiTasks)
        .where(status 
          ? and(eq(expertAiTasks.expertId, userId), eq(expertAiTasks.status, status))
          : eq(expertAiTasks.expertId, userId)
        )
        .orderBy(sql`${expertAiTasks.createdAt} DESC`)
        .limit(50);
      
      res.json(tasks);
    } catch (error: any) {
      console.error("Error fetching expert AI tasks:", error);
      res.status(500).json({ message: error.message || "Failed to fetch tasks" });
    }
  });

  // Delegate a task to AI
  const delegateTaskSchema = z.object({
    taskType: z.enum(["client_message", "vendor_research", "itinerary_update", "content_draft", "response_draft"]),
    taskDescription: z.string().min(10, "Task description must be at least 10 characters"),
    clientName: z.string().optional(),
    context: z.record(z.any()).optional(),
  });

  app.post("/api/expert/ai-tasks/delegate", isAuthenticated, async (req, res) => {
    try {
      const parsed = delegateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any).claims.sub;
      const { taskType, taskDescription, clientName, context } = parsed.data;

      // Create task in pending status
      const [task] = await db.insert(expertAiTasks).values({
        expertId: userId,
        taskType,
        taskDescription,
        clientName,
        context: context || {},
        status: "in_progress",
      }).returning();

      // Generate AI content based on task type
      const startTime = Date.now();
      try {
        const contentType = taskType === "client_message" ? "inquiry_response" 
          : taskType === "vendor_research" ? "service_description"
          : taskType === "content_draft" ? "bio"
          : "welcome_message";

        const { result, usage } = await grokService.generateContent({
          type: contentType,
          context: {
            taskType,
            clientName,
            description: taskDescription,
            ...context,
          },
          tone: "professional",
          length: "medium",
        });

        const durationMs = Date.now() - startTime;
        const confidence = Math.floor(85 + Math.random() * 10);
        const qualityScore = (8.5 + Math.random() * 1.0).toFixed(1);

        // Update task with result
        const [updatedTask] = await db.update(expertAiTasks)
          .set({
            status: "pending",
            aiResult: result,
            confidence,
            qualityScore,
            tokensUsed: usage.totalTokens,
            costEstimate: usage.estimatedCost.toFixed(6),
            updatedAt: new Date(),
          })
          .where(eq(expertAiTasks.id, task.id))
          .returning();

        // Log AI interaction
        await db.insert(aiInteractions).values({
          taskType: "content_generation",
          provider: "grok",
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCost: usage.estimatedCost.toFixed(6),
          durationMs,
          success: true,
          userId,
          metadata: { expertTaskId: task.id, taskType },
        });

        res.json(updatedTask);
      } catch (aiError: any) {
        // Update task with error
        await db.update(expertAiTasks)
          .set({
            status: "pending",
            aiResult: { error: aiError.message, fallbackContent: "Unable to generate content. Please try again or write manually." },
            confidence: 0,
            updatedAt: new Date(),
          })
          .where(eq(expertAiTasks.id, task.id));

        throw aiError;
      }
    } catch (error: any) {
      console.error("Error delegating task:", error);
      res.status(500).json({ message: error.message || "Failed to delegate task" });
    }
  });

  // Approve/Send a task
  app.post("/api/expert/ai-tasks/:taskId/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taskId } = req.params;
      const { editedContent } = req.body;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "completed",
          editedContent: editedContent || null,
          wasEdited: !!editedContent,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error approving task:", error);
      res.status(500).json({ message: error.message || "Failed to approve task" });
    }
  });

  // Reject a task
  app.post("/api/expert/ai-tasks/:taskId/reject", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taskId } = req.params;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "rejected",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error rejecting task:", error);
      res.status(500).json({ message: error.message || "Failed to reject task" });
    }
  });

  // Regenerate a task
  app.post("/api/expert/ai-tasks/:taskId/regenerate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { taskId } = req.params;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Mark as regenerating
      await db.update(expertAiTasks)
        .set({ status: "regenerating", updatedAt: new Date() })
        .where(eq(expertAiTasks.id, taskId));

      // Generate new content
      const startTime = Date.now();
      const contentType = task.taskType === "client_message" ? "inquiry_response" 
        : task.taskType === "vendor_research" ? "service_description"
        : task.taskType === "content_draft" ? "bio"
        : "welcome_message";

      const { result, usage } = await grokService.generateContent({
        type: contentType,
        context: {
          taskType: task.taskType,
          clientName: task.clientName,
          description: task.taskDescription,
          previousAttempt: true,
          ...(task.context as object || {}),
        },
        tone: "professional",
        length: "medium",
      });

      const durationMs = Date.now() - startTime;
      const confidence = Math.floor(85 + Math.random() * 10);
      const qualityScore = (8.5 + Math.random() * 1.0).toFixed(1);

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "pending",
          aiResult: result,
          confidence,
          qualityScore,
          tokensUsed: (task.tokensUsed || 0) + usage.totalTokens,
          costEstimate: (parseFloat(task.costEstimate?.toString() || "0") + usage.estimatedCost).toFixed(6),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      // Log AI interaction
      await db.insert(aiInteractions).values({
        taskType: "content_generation",
        provider: "grok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCost: usage.estimatedCost.toFixed(6),
        durationMs,
        success: true,
        userId,
        metadata: { expertTaskId: task.id, taskType: task.taskType, regeneration: true },
      });

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error regenerating task:", error);
      res.status(500).json({ message: error.message || "Failed to regenerate task" });
    }
  });

  // Get expert AI stats
  app.get("/api/expert/ai-stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const tasks = await db.select()
        .from(expertAiTasks)
        .where(and(
          eq(expertAiTasks.expertId, userId),
          sql`${expertAiTasks.createdAt} >= ${thirtyDaysAgo.toISOString()}`
        ));

      const totalDelegated = tasks.length;
      const completed = tasks.filter(t => t.status === "completed").length;
      const edited = tasks.filter(t => t.wasEdited).length;
      const totalTokens = tasks.reduce((sum, t) => sum + (t.tokensUsed || 0), 0);
      const avgQuality = tasks.filter(t => t.qualityScore).reduce((sum, t, _, arr) => 
        sum + parseFloat(t.qualityScore?.toString() || "0") / arr.length, 0
      );

      // Estimate time saved (assume 10 min per task)
      const timeSavedMinutes = completed * 10;

      res.json({
        tasksDelegated: totalDelegated,
        tasksCompleted: completed,
        completionRate: totalDelegated > 0 ? Math.round((completed / totalDelegated) * 100) : 0,
        timeSaved: Math.round(timeSavedMinutes / 60),
        avgQualityScore: avgQuality.toFixed(1),
        editRate: completed > 0 ? Math.round((edited / completed) * 100) : 0,
        tokensUsed: totalTokens,
      });
    } catch (error: any) {
      console.error("Error fetching AI stats:", error);
      res.status(500).json({ message: error.message || "Failed to fetch stats" });
    }
  });

  // =================================================================
  // PHASE 4: Real-Time Destination Intelligence API
  // =================================================================
  
  // Get real-time intelligence for a destination (requires authentication)
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
      const { grokService: grokSvc } = await import("./services/grok.service");
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

  // Phase 5: Autonomous AI Itinerary Generation
  app.post("/api/ai/generate-itinerary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { 
        destination, 
        dates, 
        travelers, 
        budget, 
        eventType, 
        interests, 
        pacePreference,
        mustSeeAttractions,
        dietaryRestrictions,
        mobilityConsiderations,
        tripId
      } = req.body;

      // Validate required fields
      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "Destination is required" });
      }
      if (!dates?.start || !dates?.end) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }
      if (!travelers || typeof travelers !== "number" || travelers < 1) {
        return res.status(400).json({ message: "Number of travelers must be at least 1" });
      }
      if (!interests || !Array.isArray(interests) || interests.length === 0) {
        return res.status(400).json({ message: "At least one interest is required" });
      }

      // Generate itinerary using Grok
      const { grokService } = await import("./services/grok.service");
      const { result, usage } = await grokService.generateAutonomousItinerary({
        destination,
        dates,
        travelers,
        budget: budget || undefined,
        eventType: eventType || undefined,
        interests,
        pacePreference: pacePreference || "moderate",
        mustSeeAttractions: mustSeeAttractions || [],
        dietaryRestrictions: dietaryRestrictions || [],
        mobilityConsiderations: mobilityConsiderations || []
      });

      // Save generated itinerary to database
      const [savedItinerary] = await db.insert(aiGeneratedItineraries).values({
        userId,
        tripId: tripId || null,
        destination,
        startDate: dates.start,
        endDate: dates.end,
        title: result.title,
        summary: result.summary,
        totalEstimatedCost: result.totalEstimatedCost.toString(),
        itineraryData: result.dailyItinerary as any,
        accommodationSuggestions: result.accommodationSuggestions as any,
        packingList: result.packingList as any,
        travelTips: result.travelTips as any,
        provider: "grok",
        status: "generated"
      }).returning();

      // Log AI interaction
      await db.insert(aiInteractions).values({
        taskType: "autonomous_itinerary",
        provider: "grok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
        estimatedCost: usage.estimatedCost.toFixed(6),
        durationMs: 0,
        success: true,
        userId,
        metadata: { destination, dates, travelers, interests, itineraryId: savedItinerary.id },
      });

      // NEW: Create comparison and trigger optimization
      const [comparison] = await db.insert(itineraryComparisons).values({
        userId,
        title: `${destination} Trip`,
        destination,
        startDate: dates.start,
        endDate: dates.end,
        budget: budget?.toString() || null,
        travelers: travelers || 1,
        status: 'generating',
      }).returning();

      // Convert generated itinerary to baseline items (with defensive checks)
      const dailyItinerary = Array.isArray(result.dailyItinerary) ? result.dailyItinerary : [];
      const baselineItems = dailyItinerary.flatMap((day: any, dayIndex: number) => {
        const activities = Array.isArray(day?.activities) ? day.activities : [];
        return activities.map((activity: any) => ({
          id: activity.id || `${day?.day || dayIndex + 1}-${activity.time || 'item'}`,
          name: activity.name || activity.title || 'Activity',
          description: activity.description || '',
          serviceType: activity.type || 'activities',
          price: activity.estimatedCost || 0,
          rating: 4.5,
          location: activity.location || destination,
          duration: activity.duration || 60,
          dayNumber: dayIndex + 1,
          timeSlot: activity.time?.includes('morning') ? 'morning' 
                  : activity.time?.includes('afternoon') ? 'afternoon' 
                  : 'evening',
        }));
      });

      // Get available services for optimization (reduced to 30 for faster AI processing)
      const availableServices = await db
        .select()
        .from(providerServices)
        .where(eq(providerServices.status, 'active'))
        .limit(30);

      // Import optimizer
      const { generateOptimizedItineraries } = await import('./itinerary-optimizer');

      // Only optimize single-destination trips (multi-city is too complex)
      const isMultiCity = destination.includes(';') || destination.includes(',') && destination.split(',').length > 2;
      
      if (!isMultiCity) {
        // Trigger optimization in background for single-destination trips
        generateOptimizedItineraries(
          comparison.id,
          userId,
          baselineItems,
          availableServices,
          destination,
          dates.start,
          dates.end,
          budget,
          travelers,
          tripId || undefined
          // Transport leg calculation is handled inside generateOptimizedItineraries
          // for each variant after metrics are finalized
        ).then(async (_optimResult) => {
          // Optimization complete — transport legs already calculated inside optimizer
        }).catch(err => {
          console.error('Optimization error:', err);
          db.update(itineraryComparisons)
            .set({ status: 'failed' })
            .where(eq(itineraryComparisons.id, comparison.id))
            .catch(console.error);
        });
      } else {
        console.log('Skipping optimization for multi-city trip:', destination);
        // Mark comparison as complete (no optimization for multi-city)
        await db.update(itineraryComparisons)
          .set({ status: 'complete' })
          .where(eq(itineraryComparisons.id, comparison.id));
      }

      // Return comparison ID immediately (include 'id' for backwards compatibility)
      res.json({
        success: true,
        id: savedItinerary.id,
        comparisonId: comparison.id,
        itineraryId: savedItinerary.id,
        message: 'Itinerary generated! Creating optimized variants...',
        ...result,
        createdAt: savedItinerary.createdAt,
        status: savedItinerary.status
      });
    } catch (error: any) {
      console.error("Error generating AI itinerary:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate itinerary. Please try again."
      });
    }
  });

  // Trip Optimization Framework: Generate 3 itinerary variations with real-time intelligence
  app.post("/api/ai/generate-optimized-itineraries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { 
        destination, 
        dates, 
        travelers, 
        budget, 
        eventType, 
        interests, 
        pacePreference,
        cartItems,
        mustSeeAttractions,
        dietaryRestrictions,
        mobilityConsiderations,
        tripId
      } = req.body;

      if (!destination || typeof destination !== "string") {
        return res.status(400).json({ message: "Destination is required" });
      }
      if (!dates?.start || !dates?.end) {
        return res.status(400).json({ message: "Start and end dates are required" });
      }
      if (!travelers || typeof travelers !== "number" || travelers < 1) {
        return res.status(400).json({ message: "Number of travelers must be at least 1" });
      }
      if (!interests || !Array.isArray(interests) || interests.length === 0) {
        return res.status(400).json({ message: "At least one interest is required" });
      }

      const { tripOptimizationService } = await import("./services/trip-optimization.service");
      
      const result = await tripOptimizationService.generateOptimizedItineraries({
        destination,
        dates,
        travelers,
        budget: budget || undefined,
        eventType: eventType || undefined,
        interests,
        pacePreference: pacePreference || "moderate",
        cartItems: cartItems || [],
        mustSeeAttractions: mustSeeAttractions || [],
        dietaryRestrictions: dietaryRestrictions || [],
        mobilityConsiderations: mobilityConsiderations || []
      });

      for (const variation of result.variations) {
        await db.insert(aiGeneratedItineraries).values({
          userId,
          tripId: tripId || null,
          destination,
          startDate: dates.start,
          endDate: dates.end,
          title: `${variation.variationLabel}: ${variation.title}`,
          summary: variation.summary,
          totalEstimatedCost: variation.totalEstimatedCost.toString(),
          itineraryData: variation.dailyItinerary as any,
          accommodationSuggestions: variation.accommodationSuggestions as any,
          packingList: variation.packingList as any,
          travelTips: variation.travelTips as any,
          provider: "grok",
          status: "generated"
        });
      }

      await db.insert(aiInteractions).values({
        taskType: "trip_optimization",
        provider: "grok",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: "0.00",
        durationMs: 0,
        success: true,
        userId,
        metadata: { destination, dates, travelers, interests, variationsGenerated: result.variations.length },
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error generating optimized itineraries:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate optimized itineraries. Please try again."
      });
    }
  });

  // Get user's AI-generated itineraries
  app.get("/api/ai/itineraries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      
      const itineraries = await db.select()
        .from(aiGeneratedItineraries)
        .where(eq(aiGeneratedItineraries.userId, userId))
        .orderBy(sql`${aiGeneratedItineraries.createdAt} DESC`)
        .limit(20);

      res.json(itineraries);
    } catch (error: any) {
      console.error("Error fetching user itineraries:", error);
      res.status(500).json({ message: "Failed to fetch itineraries" });
    }
  });

  // Get single AI-generated itinerary
  app.get("/api/ai/itineraries/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { id } = req.params;
      
      const [itinerary] = await db.select()
        .from(aiGeneratedItineraries)
        .where(and(
          eq(aiGeneratedItineraries.id, id),
          eq(aiGeneratedItineraries.userId, userId)
        ))
        .limit(1);

      if (!itinerary) {
        return res.status(404).json({ message: "Itinerary not found" });
      }

      res.json(itinerary);
    } catch (error: any) {
      console.error("Error fetching itinerary:", error);
      res.status(500).json({ message: "Failed to fetch itinerary" });
    }
  });

  // ============================================
  // TRAVELPULSE API - Real-Time Travel Intelligence
  // ============================================
  
  const { travelPulseService } = await import("./services/travelpulse.service");

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

  // ============================================
  // TRAVELPULSE CITY-LEVEL ENDPOINTS
  // ============================================

  // Get all trending cities for the grid view
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

  // Get full city intelligence (city details + hidden gems + alerts + happening now + activity)
  app.get("/api/travelpulse/cities/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      const intelligence = await travelPulseService.getCityIntelligence(cityName);
      
      if (!intelligence) {
        return res.status(404).json({ message: "City not found" });
      }
      
      res.json(intelligence);
    } catch (error: any) {
      console.error("Error fetching city intelligence:", error);
      res.status(500).json({ message: "Failed to fetch city intelligence", error: error.message });
    }
  });

  // Get hidden gems for a city
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

  // Get live activity for a city
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

  // Get alerts for a city
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

  // Get happening now events for a city
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

  // Get global live activity feed (across all cities)
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

  // Seed cities data (for initial setup)
  app.post("/api/travelpulse/seed", isAuthenticated, async (req, res) => {
    try {
      await travelPulseService.seedTrendingCities();
      res.json({ message: "Cities seeded successfully" });
    } catch (error: any) {
      console.error("Error seeding cities:", error);
      res.status(500).json({ message: "Failed to seed cities", error: error.message });
    }
  });

  // ============================================
  // TRAVELPULSE AI INTELLIGENCE ROUTES (Admin-only)
  // ============================================

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

  // Get AI scheduler status (admin only)
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

  // Manually trigger AI refresh for a specific city (admin only, rate limited)
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

  // Manually trigger AI refresh for all stale cities (admin only, rate limited)
  app.post("/api/travelpulse/ai/refresh-all", requireAdmin, checkAIRateLimit, async (req, res) => {
    try {
      const result = await travelPulseScheduler.triggerManualRefresh();
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering batch AI refresh:", error);
      res.status(500).json({ message: "Failed to trigger batch AI refresh", error: error.message });
    }
  });

  // Get city media (public - for frontend gallery)
  app.get("/api/travelpulse/media/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const { mediaAggregatorService } = await import("./services/media-aggregator.service");
      const media = await mediaAggregatorService.getMediaForCity(cityName, country);
      res.json(media);
    } catch (error: any) {
      console.error("Error getting city media:", error);
      res.status(500).json({ message: "Failed to get city media", error: error.message });
    }
  });

  // Track Unsplash download (required by Unsplash API guidelines)
  // Must be called when a photo is displayed prominently or used
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
      
      const { unsplashService } = await import("./services/unsplash.service");
      await unsplashService.trackDownload(downloadLocationUrl);
      
      res.json({ success: true });
    } catch (error: any) {
      // Don't fail the request - tracking is best-effort
      console.error("Error tracking Unsplash download:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // Get full destination calendar data (seasonal + events) for a city
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

  // AI-enhanced recommendations based on calendar data
  app.get("/api/travelpulse/ai-recommendations/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const { month, budget, preferences, limit } = req.query;
      
      const { aiRecommendationEngineService } = await import("./services/ai-recommendation-engine.service");
      
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

  // Event-aligned recommendations
  app.get("/api/travelpulse/event-recommendations/:cityName/:country/:eventId", async (req, res) => {
    try {
      const { cityName, country, eventId } = req.params;
      
      const { aiRecommendationEngineService } = await import("./services/ai-recommendation-engine.service");
      
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

  // Best time to visit analysis
  app.get("/api/travelpulse/best-time/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      
      const { aiRecommendationEngineService } = await import("./services/ai-recommendation-engine.service");
      
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

  // Get city with full AI intelligence data (admin only)
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

  // Global Calendar - Get all cities ranked by seasonal rating for a given month
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

  // Get all upcoming events globally
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

  // Get enriched recommendations for a city (AI + affiliate/booking links)
  app.get("/api/travelpulse/enriched/:cityName", async (req, res) => {
    try {
      const { cityName } = req.params;
      if (!cityName) {
        return res.status(400).json({ message: "City name is required" });
      }

      const { contentEnrichmentService } = await import("./services/content-enrichment.service");
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

  // Search SERP for venue-specific results
  app.get("/api/travelpulse/serp-search", async (req, res) => {
    try {
      const { query, city, country, type } = req.query;
      if (!city) {
        return res.status(400).json({ message: "City is required" });
      }

      const { serpService } = await import("./services/serp.service");
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

  // Template-aware SERP search with caching
  app.get("/api/serp/template-search", async (req, res) => {
    try {
      const { serpTemplateSearchQuerySchema } = await import("@shared/schema");
      const parseResult = serpTemplateSearchQuerySchema.safeParse(req.query);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const { serviceType, destination, template, priceRange, style, groupSize } = parseResult.data;

      const { serpService } = await import("./services/serp.service");
      
      const queryParams = serpService.buildQueryForTemplate(
        serviceType,
        destination,
        template,
        { priceRange, style, groupSize }
      );

      const results = await serpService.searchAttractions(
        destination,
        "",
        queryParams.query
      );

      res.json({ 
        results,
        query: queryParams.query,
        cached: false,
        source: "serp"
      });
    } catch (error: any) {
      console.error("Error in template SERP search:", error);
      res.status(500).json({ message: "Failed to search", error: error.message });
    }
  });

  // Track SERP provider click
  app.post("/api/serp/track-click", async (req, res) => {
    try {
      const { serpTrackClickBodySchema } = await import("@shared/schema");
      const parseResult = serpTrackClickBodySchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const { providerId, metadata } = parseResult.data;

      const { serpService } = await import("./services/serp.service");
      const userId = (req.user as any)?.id || null;
      
      await serpService.trackClick(providerId, userId, metadata);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error tracking SERP click:", error);
      res.status(500).json({ message: "Failed to track click", error: error.message });
    }
  });

  // Create inquiry to SERP provider
  app.post("/api/serp/inquiry", isAuthenticated, async (req, res) => {
    try {
      const { serpInquiryBodySchema } = await import("@shared/schema");
      const parseResult = serpInquiryBodySchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Validation error",
          errors: parseResult.error.flatten().fieldErrors
        });
      }

      const { 
        serpProviderId, 
        providerName, 
        providerEmail, 
        providerPhone, 
        providerWebsite, 
        message, 
        destination, 
        category, 
        template 
      } = parseResult.data;

      const { serpService } = await import("./services/serp.service");
      
      const inquiry = await serpService.createInquiry({
        userId: (req.user as any).id,
        serpProviderId,
        providerName,
        providerEmail,
        providerPhone,
        providerWebsite,
        message,
        destination,
        category,
        template
      });

      if (!inquiry) {
        return res.status(500).json({ message: "Failed to create inquiry" });
      }

      res.json({ success: true, inquiry });
    } catch (error: any) {
      console.error("Error creating SERP inquiry:", error);
      res.status(500).json({ message: "Failed to create inquiry", error: error.message });
    }
  });

  // Get partnership opportunities (admin)
  app.get("/api/serp/partnerships", isAuthenticated, async (req, res) => {
    try {
      const { limit = "20", byMarket } = req.query;
      
      const { serpService } = await import("./services/serp.service");
      
      if (byMarket === "true") {
        const report = await serpService.getPartnershipReportByMarket();
        return res.json({ byMarket: true, report });
      }

      const opportunities = await serpService.getTopPartnershipOpportunities(parseInt(limit as string));
      res.json({ opportunities });
    } catch (error: any) {
      console.error("Error fetching partnerships:", error);
      res.status(500).json({ message: "Failed to fetch partnerships", error: error.message });
    }
  });

  // ============================================
  // VENUE SEARCH API ROUTES
  // Google Places API integration for venues/vendors
  // ============================================

  // Search for venues by type and location
  app.get("/api/venues/search", async (req, res) => {
    try {
      const { location, type = 'venue', radius, minRating, priceLevel, keyword } = req.query;

      if (!location) {
        return res.status(400).json({ message: "Location parameter is required" });
      }

      const { venueSearchService } = await import("./services/venue-search.service");
      
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

  // Search for wedding vendors (photographers, florists, etc.)
  // IMPORTANT: This route must be defined BEFORE /api/venues/:placeId to avoid being caught by the dynamic route
  app.get("/api/venues/wedding-vendors", async (req, res) => {
    try {
      const { location, vendorType } = req.query;

      if (!location || !vendorType) {
        return res.status(400).json({ message: "Location and vendorType parameters are required" });
      }

      const { venueSearchService } = await import("./services/venue-search.service");
      
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

  // Get venue details by place ID
  app.get("/api/venues/:placeId", async (req, res) => {
    try {
      const { placeId } = req.params;

      const { venueSearchService } = await import("./services/venue-search.service");
      
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

  // ============================================
  // FEVER PARTNER API ROUTES
  // Events and experiences from Fever (feverup.com)
  // ============================================

  // Get Fever service status and supported cities
  app.get("/api/fever/status", async (_req, res) => {
    try {
      const cities = feverService.getSupportedCities();
      const categories = feverService.getCategories();
      const isConfigured = feverService.isReady();

      res.json({
        configured: isConfigured,
        message: isConfigured 
          ? "Fever API is configured and ready" 
          : "Fever API not configured - add FEVER_API_KEY and FEVER_PARTNER_ID secrets",
        supportedCities: cities.length,
        cities: cities.map(c => ({ code: c.code, name: c.name, country: c.country })),
        categories,
      });
    } catch (error) {
      console.error("[Fever] Status check error:", error);
      res.status(500).json({ error: "Failed to get Fever status" });
    }
  });

  // Search events by city
  app.get("/api/fever/events", async (req, res) => {
    try {
      const { 
        city, 
        query, 
        category, 
        startDate, 
        endDate, 
        minPrice, 
        maxPrice, 
        free, 
        page, 
        limit, 
        sortBy 
      } = req.query;

      if (!city || typeof city !== 'string') {
        return res.status(400).json({ error: "City parameter is required" });
      }

      const result = await feverService.searchEvents({
        city,
        query: query as string | undefined,
        category: category as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        isFree: free === 'true',
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        sortBy: sortBy as 'date' | 'popularity' | 'price' | 'rating' | undefined,
      });

      if (!result) {
        return res.status(404).json({ error: "No events found or city not supported" });
      }

      res.json(result);
    } catch (error) {
      console.error("[Fever] Event search error:", error);
      res.status(500).json({ error: "Failed to search Fever events" });
    }
  });

  // Get event details by ID
  app.get("/api/fever/events/:eventId", async (req, res) => {
    try {
      const { eventId } = req.params;
      const event = await feverService.getEventById(eventId);

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      res.json(event);
    } catch (error) {
      console.error("[Fever] Event details error:", error);
      res.status(500).json({ error: "Failed to get event details" });
    }
  });

  // Get upcoming events for a city
  app.get("/api/fever/cities/:cityCode/upcoming", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const { limit, category } = req.query;

      const events = await feverService.getUpcomingEvents(cityCode, {
        limit: limit ? Number(limit) : 10,
        category: category as string | undefined,
      });

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("[Fever] Upcoming events error:", error);
      res.status(500).json({ error: "Failed to get upcoming events" });
    }
  });

  // Get free events for a city
  app.get("/api/fever/cities/:cityCode/free", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const { limit } = req.query;

      const events = await feverService.getFreeEvents(cityCode, {
        limit: limit ? Number(limit) : 20,
      });

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("[Fever] Free events error:", error);
      res.status(500).json({ error: "Failed to get free events" });
    }
  });

  // Get events by date range for a city
  app.get("/api/fever/cities/:cityCode/dates", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const { startDate, endDate, category, limit } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const events = await feverService.getEventsByDateRange(
        cityCode,
        startDate as string,
        endDate as string,
        {
          category: category as string | undefined,
          limit: limit ? Number(limit) : 50,
        }
      );

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("[Fever] Date range events error:", error);
      res.status(500).json({ error: "Failed to get events by date range" });
    }
  });

  // Get list of supported cities
  app.get("/api/fever/cities", async (_req, res) => {
    try {
      const cities = feverService.getSupportedCities();
      res.json({ cities, count: cities.length });
    } catch (error) {
      console.error("[Fever] Cities list error:", error);
      res.status(500).json({ error: "Failed to get cities list" });
    }
  });

  // Merge Fever events with TravelPulse destination events for calendar integration
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

  // ============ FEVER CACHE ENDPOINTS ============

  // Get Fever cache status
  app.get("/api/fever/cache/status", async (_req, res) => {
    try {
      const status = await feverCacheService.getCacheStatus();
      res.json({
        ...status,
        supportedCities: feverService.getSupportedCities().length,
        cacheEnabled: true,
        cacheDurationHours: 24,
      });
    } catch (error) {
      console.error("[FeverCache] Status error:", error);
      res.status(500).json({ error: "Failed to get cache status" });
    }
  });

  // Get cached events for a city (uses cache, refreshes if stale)
  app.get("/api/fever/cache/events/:cityCode", async (req, res) => {
    try {
      const { cityCode } = req.params;
      const events = await feverCacheService.getEventsOrRefresh(cityCode);
      
      res.json({
        events,
        count: events.length,
        fromCache: true,
        cityCode: cityCode.toUpperCase(),
      });
    } catch (error) {
      console.error("[FeverCache] Get events error:", error);
      res.status(500).json({ error: "Failed to get cached events" });
    }
  });

  // Manually refresh cache for a city (admin only)
  app.post("/api/fever/cache/refresh/:cityCode", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { cityCode } = req.params;
      const result = await feverCacheService.refreshCityCache(cityCode);
      
      res.json({
        message: `Refreshed ${result.refreshed} events for ${cityCode}`,
        ...result,
      });
    } catch (error) {
      console.error("[FeverCache] Refresh error:", error);
      res.status(500).json({ error: "Failed to refresh cache" });
    }
  });

  // Get comprehensive location summary for admin panel
  app.get("/api/admin/data/location-summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { feverEventCache, hotelCache, activityCache, flightCache } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");
      
      // Get events by city
      const eventData = await db.select({
        cityCode: feverEventCache.cityCode,
        city: feverEventCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${feverEventCache.lastUpdated})`,
      })
      .from(feverEventCache)
      .groupBy(feverEventCache.cityCode, feverEventCache.city);

      // Get hotels by city
      const hotelData = await db.select({
        cityCode: hotelCache.cityCode,
        city: hotelCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${hotelCache.lastUpdated})`,
      })
      .from(hotelCache)
      .groupBy(hotelCache.cityCode, hotelCache.city);

      // Get activities by destination
      const activityData = await db.select({
        destination: activityCache.destination,
        city: activityCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${activityCache.lastUpdated})`,
      })
      .from(activityCache)
      .groupBy(activityCache.destination, activityCache.city);

      // Get flights by origin/destination
      const flightData = await db.select({
        origin: flightCache.originCode,
        destination: flightCache.destinationCode,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${flightCache.lastUpdated})`,
      })
      .from(flightCache)
      .groupBy(flightCache.originCode, flightCache.destinationCode);

      // Get totals
      const totals = {
        events: eventData.reduce((sum, e) => sum + e.count, 0),
        hotels: hotelData.reduce((sum, h) => sum + h.count, 0),
        activities: activityData.reduce((sum, a) => sum + a.count, 0),
        flights: flightData.reduce((sum, f) => sum + f.count, 0),
      };

      res.json({
        events: eventData,
        hotels: hotelData,
        activities: activityData,
        flights: flightData,
        totals,
      });
    } catch (error) {
      console.error("[Admin] Location summary error:", error);
      res.status(500).json({ error: "Failed to get location summary" });
    }
  });

  // Manually refresh all cities (admin only)
  app.post("/api/fever/cache/refresh-all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const result = await feverCacheService.refreshAllCities();
      
      res.json({
        message: `Refreshed ${result.totalRefreshed} events across all cities`,
        ...result,
      });
    } catch (error) {
      console.error("[FeverCache] Refresh all error:", error);
      res.status(500).json({ error: "Failed to refresh all caches" });
    }
  });

  // Start the scheduler when routes are registered
  travelPulseScheduler.start();

  // === Logistics Intelligence Layer Routes ===

  // --- Coordination / Participants Routes (using asyncHandler for consistent error handling) ---
  app.get("/api/trips/:tripId/participants", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const participants = await coordinationService.getParticipants(req.params.tripId);
    res.json(participants);
  }));

  app.get("/api/trips/:tripId/participants/stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getParticipantStats(req.params.tripId);
    res.json(stats);
  }));

  app.get("/api/trips/:tripId/participants/payment-stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getPaymentStats(req.params.tripId);
    res.json(stats);
  }));

  app.get("/api/trips/:tripId/participants/dietary", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const dietary = await coordinationService.getDietaryRequirements(req.params.tripId);
    res.json(dietary);
  }));

  app.post("/api/trips/:tripId/participants", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!await verifyTripOwnership(req.params.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validatedData = insertTripParticipantSchema.parse({
        ...req.body,
        tripId: req.params.tripId,
      });
      const participant = await coordinationService.createParticipant(validatedData);
      res.status(201).json(participant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create participant" });
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

  app.post("/api/trips/:tripId/participants/bulk-invite", isAuthenticated, async (req, res) => {
    try {
      const { emails } = req.body;
      const participants = await coordinationService.bulkInvite(req.params.tripId, emails);
      res.status(201).json(participants);
    } catch (error) {
      res.status(500).json({ message: "Failed to send invites" });
    }
  });

  // --- Vendor Contracts Routes ---
  app.get("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
    try {
      const contracts = await vendorManagementService.getContracts(req.params.tripId);
      res.json(contracts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  app.get("/api/trips/:tripId/contracts/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await vendorManagementService.getContractStats(req.params.tripId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contract stats" });
    }
  });

  app.get("/api/trips/:tripId/contracts/upcoming-payments", isAuthenticated, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const payments = await vendorManagementService.getUpcomingPayments(req.params.tripId, days);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming payments" });
    }
  });

  app.get("/api/trips/:tripId/contracts/overdue", isAuthenticated, async (req, res) => {
    try {
      const overdue = await vendorManagementService.getOverduePayments(req.params.tripId);
      res.json(overdue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch overdue payments" });
    }
  });

  app.post("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
    try {
      const contract = await vendorManagementService.createContract({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to create contract" });
    }
  });

  app.patch("/api/contracts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const contract = await vendorManagementService.updateContract(req.params.id, req.body);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to update contract" });
    }
  });

  app.post("/api/contracts/:id/payment", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { amount, milestoneName } = req.body;
      const contract = await vendorManagementService.recordPayment(req.params.id, amount, milestoneName);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  app.post("/api/contracts/:id/milestone", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const contract = await vendorManagementService.addPaymentMilestone(req.params.id, req.body);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to add milestone" });
    }
  });

  app.post("/api/contracts/:id/communication", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const contract = await vendorManagementService.logCommunication(req.params.id, req.body);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to log communication" });
    }
  });

  app.delete("/api/contracts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await vendorManagementService.deleteContract(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete contract" });
    }
  });

  // --- Budget / Transactions Routes ---
  app.get("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
    try {
      const transactions = await budgetService.getTransactions(req.params.tripId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/trips/:tripId/budget/summary", isAuthenticated, async (req, res) => {
    try {
      const budget = parseFloat(req.query.budget as string) || 0;
      const summary = await budgetService.getBudgetSummary(req.params.tripId, budget);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch budget summary" });
    }
  });

  app.get("/api/trips/:tripId/budget/categories", isAuthenticated, async (req, res) => {
    try {
      const breakdown = await budgetService.getCategoryBreakdown(req.params.tripId);
      res.json(breakdown);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category breakdown" });
    }
  });

  app.get("/api/trips/:tripId/budget/settle-up", isAuthenticated, async (req, res) => {
    try {
      const settleUp = await budgetService.getSettleUpSummary(req.params.tripId);
      res.json(settleUp);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate settle up" });
    }
  });

  app.post("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
    try {
      const transaction = await budgetService.createTransaction({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(transaction);
    } catch (error) {
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  app.post("/api/trips/:tripId/transactions/split", isAuthenticated, async (req, res) => {
    try {
      const { totalAmount, category, description, paidByParticipantId, splits } = req.body;
      const transactions = await budgetService.createSplitTransaction(
        req.params.tripId,
        totalAmount,
        category,
        description,
        paidByParticipantId,
        splits
      );
      res.status(201).json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to create split transaction" });
    }
  });

  app.post("/api/trips/:tripId/budget/calculate-split", isAuthenticated, async (req, res) => {
    try {
      const { totalAmount, method, customSplits } = req.body;
      const splits = await budgetService.calculateSplit(req.params.tripId, totalAmount, method, customSplits);
      res.json(splits);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate split" });
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

  // --- Itinerary Intelligence Routes ---
  app.get("/api/trips/:tripId/itinerary-items", isAuthenticated, async (req, res) => {
    try {
      const items = await itineraryIntelligenceService.getItems(req.params.tripId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch itinerary items" });
    }
  });

  app.get("/api/trips/:tripId/itinerary/schedules", isAuthenticated, async (req, res) => {
    try {
      const schedules = await itineraryIntelligenceService.getDaySchedules(req.params.tripId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch day schedules" });
    }
  });

  app.get("/api/trips/:tripId/itinerary/analyze", isAuthenticated, async (req, res) => {
    try {
      const analysis = await itineraryIntelligenceService.analyzeItinerary(req.params.tripId);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze itinerary" });
    }
  });

  app.get("/api/trips/:tripId/itinerary/recommendations", isAuthenticated, async (req, res) => {
    try {
      const destination = req.query.destination as string || "destination";
      const recommendations = await itineraryIntelligenceService.getAIRecommendations(req.params.tripId, destination);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });

  app.post("/api/trips/:tripId/itinerary-items", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const userName = (req.user as any).claims.name || "User";
      const item = await itineraryIntelligenceService.createItem({
        ...req.body,
        tripId: req.params.tripId,
      });
      logItineraryChange(req.params.tripId, userName, `Added "${item.title}"`, "add", "owner", item.id);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create itinerary item" });
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

  app.post("/api/trips/:tripId/itinerary/reorder", isAuthenticated, async (req, res) => {
    try {
      const userName = (req.user as any).claims.name || "User";
      const { dayNumber, itemIds } = req.body;
      const items = await itineraryIntelligenceService.reorderItems(req.params.tripId, dayNumber, itemIds);
      logItineraryChange(req.params.tripId, userName, `Reordered Day ${dayNumber} activities`, "reorder", "owner");
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder items" });
    }
  });

  app.post("/api/trips/:tripId/itinerary/optimize-order", isAuthenticated, async (req, res) => {
    try {
      const { dayNumber } = req.body;
      const optimizedOrder = await itineraryIntelligenceService.optimizeOrder(req.params.tripId, dayNumber);
      res.json({ optimizedOrder });
    } catch (error) {
      res.status(500).json({ message: "Failed to optimize order" });
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

  // POST /api/trips/:tripId/activate-transport
  // Creates or reuses an itinerary comparison+variant for the trip's AI-generated itinerary,
  // then calculates and persists real transport legs so users can select modes.
  app.post("/api/trips/:tripId/activate-transport", isAuthenticated, async (req, res) => {
    try {
      const { tripId } = req.params;
      const userId = (req as any).user?.id;

      const [trip] = await db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
      if (!trip) return res.status(404).json({ error: "Trip not found" });

      const [genItinerary] = await db
        .select()
        .from(generatedItineraries)
        .where(eq(generatedItineraries.tripId, tripId));
      if (!genItinerary?.itineraryData) {
        return res.status(404).json({ error: "No generated itinerary found for this trip" });
      }

      let [comparison] = await db
        .select()
        .from(itineraryComparisons)
        .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)));

      if (!comparison) {
        const [created] = await db.insert(itineraryComparisons).values({
          userId,
          tripId,
          title: trip.title || trip.destination || "My Trip",
          destination: trip.destination,
          status: "active",
        }).returning();
        comparison = created;
      }

      let [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(and(
          eq(itineraryVariants.comparisonId, comparison.id),
          eq(itineraryVariants.source, "ai")
        ));

      if (!variant) {
        const [created] = await db.insert(itineraryVariants).values({
          comparisonId: comparison.id,
          name: "AI Generated",
          source: "ai",
          status: "active",
        }).returning();
        variant = created;
      }

      const data: any = genItinerary.itineraryData;
      const daysData: any[] = data?.days || data?.dailyItinerary || [];

      const activities: import("./services/transport-leg-calculator").ActivityLocation[] = [];
      for (const day of daysData) {
        const dayNum: number = day.day || day.dayNumber || 1;
        const dayActs: any[] = day.activities || [];
        dayActs.forEach((act: any, idx: number) => {
          if (act.lat && act.lng) {
            activities.push({
              id: act.id || `day${dayNum}-act${idx}`,
              name: act.title || act.name || "Activity",
              lat: parseFloat(act.lat),
              lng: parseFloat(act.lng),
              scheduledTime: act.time || act.startTime || `${9 + idx}:00`,
              dayNumber: dayNum,
              order: idx,
            });
          }
        });
      }

      if (activities.length < 2) {
        return res.json({ variantId: variant.id, legs: [], message: "Not enough geolocated activities to calculate transport" });
      }

      await calculateTransportLegs(variant.id, activities, trip.destination || "", {});

      const savedLegs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, variant.id));

      return res.json({
        variantId: variant.id,
        legs: savedLegs.map(leg => ({
          id: leg.id,
          legOrder: leg.legOrder,
          dayNumber: leg.dayNumber,
          fromName: leg.fromName,
          toName: leg.toName,
          fromLat: leg.fromLat,
          fromLng: leg.fromLng,
          toLat: leg.toLat,
          toLng: leg.toLng,
          recommendedMode: leg.recommendedMode,
          userSelectedMode: leg.userSelectedMode,
          distanceDisplay: leg.distanceDisplay,
          estimatedDurationMinutes: leg.estimatedDurationMinutes,
          estimatedCostUsd: leg.estimatedCostUsd,
          alternativeModes: leg.alternativeModes || [],
        })),
      });
    } catch (err: any) {
      console.error("Activate transport error:", err);
      res.status(500).json({ error: "Failed to activate transport" });
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

  // --- Emergency Routes ---
  app.get("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
    try {
      const contacts = await emergencyService.getContacts(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });

  app.get("/api/trips/:tripId/emergency-contacts/by-type", isAuthenticated, async (req, res) => {
    try {
      const contacts = await emergencyService.getContactsByType(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });

  app.post("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
    try {
      const contact = await emergencyService.createContact({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to create emergency contact" });
    }
  });

  app.patch("/api/emergency-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await emergencyService.getContact(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Emergency contact not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const contact = await emergencyService.updateContact(req.params.id, req.body);
      res.json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to update emergency contact" });
    }
  });

  app.delete("/api/emergency-contacts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const existing = await emergencyService.getContact(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Emergency contact not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await emergencyService.deleteContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete emergency contact" });
    }
  });

  app.post("/api/trips/:tripId/emergency/initialize", isAuthenticated, async (req, res) => {
    try {
      const { countryCode } = req.body;
      const result = await emergencyService.initializeTripEmergencyInfo(req.params.tripId, countryCode);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize emergency info" });
    }
  });

  app.get("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
      const alerts = await emergencyService.getActiveAlerts(req.params.tripId);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get("/api/trips/:tripId/alerts/summary", isAuthenticated, async (req, res) => {
    try {
      const summary = await emergencyService.getAlertSummary(req.params.tripId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alert summary" });
    }
  });

  app.post("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
      const alert = await emergencyService.createAlert({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to create alert" });
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

  app.get("/api/emergency/numbers/:countryCode", async (req, res) => {
    try {
      const numbers = emergencyService.getEmergencyNumbers(req.params.countryCode);
      res.json(numbers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency numbers" });
    }
  });

  app.get("/api/emergency/embassy/:countryCode", async (req, res) => {
    try {
      const embassy = emergencyService.getEmbassyInfo(req.params.countryCode);
      res.json(embassy);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch embassy info" });
    }
  });

  app.get("/api/emergency/rebooking-options/:itemType", isAuthenticated, async (req, res) => {
    try {
      const tripId = req.query.tripId as string;
      const options = await emergencyService.getRebookingOptions(tripId, req.params.itemType);
      res.json(options);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rebooking options" });
    }
  });

  // ============ SPONTANEOUS ACTIVITIES & LIVE INTEL ENGINE ============
  
  // GET /api/spontaneous/opportunities - Get spontaneous opportunities based on location
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

  // GET /api/spontaneous/preferences - Get user spontaneity preferences
  app.get("/api/spontaneous/preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const preferences = await opportunityEngineService.getUserPreferences(userId);
      res.json(preferences || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  // POST /api/spontaneous/preferences - Save user spontaneity preferences
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

  // POST /api/spontaneous/:id/book - Book a spontaneous opportunity
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

  // GET /api/spontaneous/quick-search/:window - Quick search for opportunities
  app.get("/api/spontaneous/quick-search/:window", async (req, res) => {
    try {
      const window = req.params.window as "tonight" | "tomorrow" | "weekend" | "surprise_me";
      const city = req.query.city as string | undefined;
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
      
      const userId = (req.user as any)?.claims?.sub || null;
      
      const opportunities = await opportunityEngineService.getOpportunities(userId, {
        lat,
        lng,
        city,
        timeWindow: window,
        limit: 12,
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

  // Register AI Discovery routes
  await registerDiscoveryRoutes(app);

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

  // Get available categories
  app.get("/api/discovery/categories", async (_req, res) => {
    try {
      const { grokDiscoveryService } = await import("./services/grok-discovery.service");
      const categories = await grokDiscoveryService.getAvailableCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  // Get gems for a destination
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

  // Get a specific gem and increment view
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

  // Get destinations with gems
  app.get("/api/discovery/destinations", async (_req, res) => {
    try {
      const destinations = await grokDiscoveryService.getDestinationsWithGems();
      res.json({ destinations });
    } catch (error: any) {
      console.error("Get destinations error:", error);
      res.status(500).json({ message: "Failed to get destinations", error: error.message });
    }
  });

  // Get discovery job history
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

  // ==================== AFFILIATE PARTNER MANAGEMENT ====================
  
  const { affiliateScraperService } = await import("./services/affiliate-scraper.service");

  // Get partner categories
  app.get("/api/affiliate/categories", async (_req, res) => {
    try {
      const categories = await affiliateScraperService.getPartnerCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  // Create affiliate partner
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

  // Get all affiliate partners
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

  // Get single affiliate partner
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

  // Update affiliate partner
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

  // Delete affiliate partner
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

  // Trigger partner website scrape
  app.post("/api/affiliate/partners/:id/scrape", isAuthenticated, async (req, res) => {
    try {
      const result = await affiliateScraperService.scrapePartnerWebsite(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error("Scrape error:", error);
      res.status(500).json({ message: "Failed to scrape partner website", error: error.message });
    }
  });

  // Get scrape jobs for a partner
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

  // Get all affiliate products
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

  // Get single product
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

  // Track affiliate click
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

  // Get products for a specific location (for itinerary integration)
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

  // === Content Tracking System API ===

  // Get content tracking summary (admin only)
  app.get("/api/admin/content/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const summary = await storage.getContentTrackingSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content summary", error: error.message });
    }
  });

  // Get all content registry entries (admin only)
  app.get("/api/admin/content/registry", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { status, contentType, ownerId, flagged, limit, offset } = req.query;
      const content = await storage.getContentRegistry({
        status: status as string,
        contentType: contentType as string,
        ownerId: ownerId as string,
        flagged: flagged === 'true',
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content registry", error: error.message });
    }
  });

  // Get content by tracking number
  app.get("/api/admin/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const content = await storage.getContentByTrackingNumber(trackingNumber);
      if (!content) {
        return res.status(404).json({ message: "Content not found" });
      }

      // Get related data
      const versions = await storage.getContentVersions(trackingNumber);
      const flags = await storage.getContentFlags(trackingNumber);
      const invoices = await storage.getInvoicesByTrackingNumber(trackingNumber);

      res.json({
        content,
        versions,
        flags,
        invoices,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content details", error: error.message });
    }
  });

  // Register new content (manual registration via API)
  app.post("/api/admin/content/register", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { contentType, contentId, ownerId, title, description, status, metadata } = req.body;

      if (!contentType || !contentId) {
        return res.status(400).json({ message: "contentType and contentId are required" });
      }

      // Auto-generate tracking number for manual API registration
      const trackingNumber = await storage.generateTrackingNumber('TRV');

      const content = await storage.registerContent({
        trackingNumber,
        contentType,
        contentId,
        ownerId,
        title,
        description,
        status: status || 'published',
        metadata: metadata || {},
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to register content", error: error.message });
    }
  });

  // Get moderation queue (flagged content)
  app.get("/api/admin/content/moderation/queue", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const queue = await storage.getModerationQueue();
      res.json(queue);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get moderation queue", error: error.message });
    }
  });

  // Moderate content
  app.post("/api/admin/content/:trackingNumber/moderate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const { action, notes } = req.body;

      if (!['approve', 'suspend', 'delete'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be: approve, suspend, or delete" });
      }

      const result = await storage.moderateContent(
        trackingNumber,
        userId,
        action,
        notes
      );

      if (!result) {
        return res.status(404).json({ message: "Content not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to moderate content", error: error.message });
    }
  });

  // Flag content
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

  // Get pending flags (admin only)
  app.get("/api/admin/content/flags/pending", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const flags = await storage.getPendingFlags();
      res.json(flags);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pending flags", error: error.message });
    }
  });

  // Resolve flag (admin only)
  app.post("/api/admin/content/flags/:flagId/resolve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { flagId } = req.params;
      const { resolution } = req.body;

      if (!resolution) {
        return res.status(400).json({ message: "resolution is required" });
      }

      const result = await storage.resolveFlag(flagId, userId, resolution);
      if (!result) {
        return res.status(404).json({ message: "Flag not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to resolve flag", error: error.message });
    }
  });

  // === Content Invoices API ===

  // Create invoice for content
  app.post("/api/admin/invoices", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber, customerId, providerId, invoiceType, amount, currency, taxAmount, discountAmount, notes, dueDate } = req.body;

      if (!trackingNumber || !invoiceType || !amount) {
        return res.status(400).json({ message: "trackingNumber, invoiceType, and amount are required" });
      }

      const totalAmount = amount + (taxAmount || 0) - (discountAmount || 0);

      const invoice = await storage.createContentInvoice({
        invoiceNumber: `INV-${trackingNumber}`,
        trackingNumber,
        customerId,
        providerId,
        invoiceType,
        amount,
        currency: currency || 'USD',
        taxAmount: taxAmount || 0,
        discountAmount: discountAmount || 0,
        totalAmount,
        notes,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create invoice", error: error.message });
    }
  });

  // Get invoice by number
  app.get("/api/admin/invoices/:invoiceNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const invoice = await storage.getContentInvoice(invoiceNumber);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoice", error: error.message });
    }
  });

  // Update invoice status
  app.patch("/api/admin/invoices/:invoiceNumber/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const { status, paymentReference } = req.body;

      if (!status) {
        return res.status(400).json({ message: "status is required" });
      }

      const result = await storage.updateInvoiceStatus(invoiceNumber, status, paymentReference);
      if (!result) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update invoice status", error: error.message });
    }
  });

  // Get invoices by customer
  app.get("/api/invoices/my", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const invoices = await storage.getInvoicesByCustomer(user.claims.sub);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoices", error: error.message });
    }
  });

  // =============================================
  // AI Usage & Cost Tracking Endpoints (Admin)
  // =============================================

  // Get AI usage summary with cost breakdown
  app.get("/api/admin/ai-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const summary = await aiUsageService.getSummary(start, end);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage summary", error: error.message });
    }
  });

  // Get daily AI usage for charts
  app.get("/api/admin/ai-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const dailyUsage = await aiUsageService.getDailyUsage(days);
      res.json(dailyUsage);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily AI usage", error: error.message });
    }
  });

  // Get recent AI usage logs
  app.get("/api/admin/ai-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await aiUsageService.getRecentLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage logs", error: error.message });
    }
  });

  // Get AI pricing info
  app.get("/api/admin/ai-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      res.json({
        providers: {
          grok: {
            models: {
              'grok-2': { input: 200, output: 1000 },
              'grok-2-vision': { input: 200, output: 1000 },
              'grok-4': { input: 300, output: 1500 },
              'grok-4.1-fast': { input: 20, output: 50 },
            },
            note: "Prices in cents per 1M tokens"
          },
          anthropic: {
            models: {
              'claude-3-sonnet': { input: 300, output: 1500 },
              'claude-3-opus': { input: 1500, output: 7500 },
            },
            note: "Prices in cents per 1M tokens"
          }
        },
        lastUpdated: "2026-01-27"
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pricing info", error: error.message });
    }
  });

  // External API Usage Tracking (Amadeus, etc.)
  app.get("/api/admin/api-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const summary = await apiUsageService.getUsageSummary(30);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage summary", error: error.message });
    }
  });

  app.get("/api/admin/api-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const daily = await apiUsageService.getDailyUsage(30);
      res.json(daily);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily API usage", error: error.message });
    }
  });

  app.get("/api/admin/api-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const logs = await apiUsageService.getRecentLogs(100);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage logs", error: error.message });
    }
  });

  app.get("/api/admin/api-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('./services/api-usage.service');
      const pricing = apiUsageService.getPricingInfo();
      res.json(pricing);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API pricing info", error: error.message });
    }
  });

  // === Revenue Tracking Endpoints ===

  // Admin unified revenue dashboard
  app.get("/api/admin/revenue/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const dashboard = await revenueTrackingService.getUnifiedDashboard();
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue dashboard", error: error.message });
    }
  });

  // Platform revenue summary with filters
  app.get("/api/admin/revenue/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      
      const summary = await storage.getPlatformRevenueSummary(startDate, endDate);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue summary", error: error.message });
    }
  });

  // Platform revenue transactions list
  app.get("/api/admin/revenue/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      const sourceType = req.query.sourceType ? String(req.query.sourceType) : undefined;
      
      const transactions = await storage.getPlatformRevenue({ startDate, endDate, sourceType });
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue transactions", error: error.message });
    }
  });

  // Revenue report by content tracking number
  app.get("/api/admin/revenue/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const report = await revenueTrackingService.getContentRevenueReport(req.params.trackingNumber);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content revenue report", error: error.message });
    }
  });

  // Provider earnings endpoints
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings
  app.get("/api/provider/earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const earnings = await storage.getProviderEarnings(userId);
      res.json(earnings);
    } catch (error: any) {
      console.error("Provider earnings error:", error);
      res.status(500).json({ message: "Failed to get provider earnings", error: error.message });
    }
  });

  app.get("/api/provider/earnings/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const summary = await storage.getProviderEarningsSummary(userId);
      res.json(summary);
    } catch (error: any) {
      console.error("Provider earnings summary error:", error);
      res.status(500).json({ message: "Failed to get provider earnings summary", error: error.message });
    }
  });

  app.get("/api/provider/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const details = await revenueTrackingService.getProviderRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Provider earnings details error:", error);
      res.status(500).json({ message: "Failed to get provider earnings details", error: error.message });
    }
  });

  // Provider payout requests
  app.get("/api/provider/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const payouts = await storage.getProviderPayouts(userId);
      res.json(payouts);
    } catch (error: any) {
      console.error("Provider payouts error:", error);
      res.status(500).json({ message: "Failed to get provider payouts", error: error.message });
    }
  });

  app.post("/api/provider/payouts/request", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { amount, payoutMethod } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid payout amount" });
      }

      const summary = await storage.getProviderEarningsSummary(userId);
      if (amount > summary.available) {
        return res.status(400).json({ error: "Insufficient available balance" });
      }

      const payout = await storage.createProviderPayout({
        providerId: userId,
        amount: String(amount),
        payoutMethod: payoutMethod || 'bank_transfer',
        status: 'pending',
      });
      
      res.json(payout);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to request payout", error: error.message });
    }
  });

  // Expert earnings details endpoint
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings
  app.get("/api/expert/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { revenueTrackingService } = await import('./services/revenue-tracking.service');
      const details = await revenueTrackingService.getExpertRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Expert earnings details error:", error);
      res.status(500).json({ message: "Failed to get expert earnings details", error: error.message });
    }
  });

  // === Stripe Connect Onboarding ===

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

      const { stripeConnectService } = await import('./services/stripe-connect.service');
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

      const { stripeConnectService } = await import('./services/stripe-connect.service');
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

      const { stripeConnectService } = await import('./services/stripe-connect.service');
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

  // === Admin Payouts Management ===

  app.get("/api/admin/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const status = req.query.status as string | undefined;
      const validStatuses = ['pending', 'processing', 'approved', 'completed', 'failed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status filter" });
      }
      const [expertPayouts, providerPayouts] = await Promise.all([
        storage.getAllExpertPayouts(status),
        storage.getAllProviderPayouts(status),
      ]);
      const allPayouts = [
        ...expertPayouts.map(p => ({ ...p, requesterType: 'expert' as const })),
        ...providerPayouts.map(p => ({ ...p, requesterType: 'provider' as const })),
      ].sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      res.json(allPayouts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get payouts", error: error.message });
    }
  });

  app.patch("/api/admin/payouts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { id } = req.params;
      const { status, notes, transactionId, payoutReference, requesterType } = req.body;
      const validStatuses = ['processing', 'completed', 'failed'];
      const validTypes = ['expert', 'provider'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: processing, completed, failed" });
      }
      if (!requesterType || !validTypes.includes(requesterType)) {
        return res.status(400).json({ error: "Invalid requesterType. Must be 'expert' or 'provider'" });
      }
      let updated;
      if (status === 'completed') {
        const recipientId = requesterType === 'expert'
          ? (await db.select({ expertId: expertPayouts.expertId }).from(expertPayouts).where(eq(expertPayouts.id, id)))[0]?.expertId
          : (await db.select({ providerId: providerPayouts.providerId }).from(providerPayouts).where(eq(providerPayouts.id, id)))[0]?.providerId;

        if (!recipientId) {
          return res.status(404).json({ error: "Payout not found" });
        }

        const recipientStripe = await storage.getUserStripeAccount(recipientId);

        if (recipientStripe.stripeAccountId && recipientStripe.canReceivePayments) {
          try {
            const { stripeConnectService } = await import('./services/stripe-connect.service');
            const payoutAmount = requesterType === 'expert'
              ? (await db.select({ amount: expertPayouts.amount }).from(expertPayouts).where(eq(expertPayouts.id, id)))[0]?.amount
              : (await db.select({ amount: providerPayouts.amount }).from(providerPayouts).where(eq(providerPayouts.id, id)))[0]?.amount;

            const transfer = await stripeConnectService.createTransfer(
              parseFloat(payoutAmount || '0'),
              'usd',
              recipientStripe.stripeAccountId,
              `Traveloure ${requesterType} payout`,
              { payoutId: id, requesterType, recipientId }
            );

            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'completed', notes, transfer.transferId);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'completed', notes, transfer.transferId);
            }
          } catch (stripeError: any) {
            console.error('Stripe transfer failed:', stripeError);
            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            }
            return res.json({ ...updated, stripeError: stripeError.message });
          }
        } else {
          return res.status(400).json({
            error: "Recipient does not have an active Stripe Connect account. They must complete onboarding first.",
            recipientId,
            hasStripeAccount: !!recipientStripe.stripeAccountId,
            canReceivePayments: recipientStripe.canReceivePayments,
          });
        }
      } else {
        if (requesterType === 'expert') {
          updated = await storage.updateExpertPayoutStatus(id, status, notes, transactionId);
        } else {
          updated = await storage.updateProviderPayoutStatus(id, status, notes, payoutReference);
        }
      }
      if (!updated) {
        return res.status(404).json({ error: "Payout not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update payout", error: error.message });
    }
  });

  // === Logistics: Temporal Anchors ===

  app.get("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      res.json(anchors);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get temporal anchors", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const body = { ...req.body, tripId: req.params.tripId };

      if (!body.anchorDatetime && body.dayNumber && body.suggestedTime) {
        const startDate = trip.startDate?.toString() || new Date().toISOString().split('T')[0];
        const tripStart = new Date(startDate);
        const anchorDate = new Date(tripStart);
        anchorDate.setDate(anchorDate.getDate() + (body.dayNumber - 1));
        const [h, m] = body.suggestedTime.split(':');
        anchorDate.setHours(parseInt(h), parseInt(m), 0, 0);
        body.anchorDatetime = anchorDate.toISOString();
        delete body.dayNumber;
        delete body.suggestedTime;
      }

      const input = insertTemporalAnchorSchema.parse(body);
      const anchor = await storage.createTemporalAnchor(input);
      res.status(201).json(anchor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
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

  // === Logistics: Day Boundaries ===

  app.get("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      res.json(boundaries);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get day boundaries", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const input = insertDayBoundarySchema.parse({ ...req.body, tripId: req.params.tripId });
      const boundary = await storage.createDayBoundary(input);
      res.status(201).json(boundary);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === Logistics: Schedule Validation ===

  app.post("/api/trips/:tripId/validate-schedule", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      const boundaries = await storage.getDayBoundaries(req.params.tripId);

      // Check for conflicts: activities overlapping anchor buffer zones
      const conflicts: Array<{ anchorId: string; anchorType: string; conflict: string }> = [];

      for (const anchor of anchors) {
        const anchorTime = new Date(anchor.anchorDatetime).getTime();
        const bufferStart = anchorTime - (anchor.bufferBefore || 0) * 60000;
        const bufferEnd = anchorTime + (anchor.bufferAfter || 0) * 60000;

        // Check against proposed items in the request body
        const proposedItems = req.body.items || [];
        for (const item of proposedItems) {
          if (item.startTime && item.dayNumber) {
            const itemStart = new Date(`${item.date || ''}T${item.startTime}`).getTime();
            const itemEnd = item.endTime ? new Date(`${item.date || ''}T${item.endTime}`).getTime() : itemStart + (item.durationMinutes || 60) * 60000;

            if (itemStart < bufferEnd && itemEnd > bufferStart) {
              conflicts.push({
                anchorId: anchor.id,
                anchorType: anchor.anchorType,
                conflict: `Activity "${item.title}" overlaps with ${anchor.anchorType} buffer zone (${anchor.description || ''})`,
              });
            }
          }
        }
      }

      res.json({
        valid: conflicts.length === 0,
        conflicts,
        anchorsChecked: anchors.length,
        boundariesChecked: boundaries.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to validate schedule", error: error.message });
    }
  });

  // === Logistics: Energy Calculation ===

  app.post("/api/trips/:tripId/calculate-energy", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      // Get all itinerary items for the trip grouped by day
      const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, req.params.tripId));

      const dayMap = new Map<number, typeof items>();
      for (const item of items) {
        const day = item.dayNumber;
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day)!.push(item);
      }

      const energyByDay: Array<{ dayNumber: number; startingEnergy: number; activityDepletion: number; endingEnergy: number; breakdown: Array<{ itemId: string; title: string; energyCost: number }> }> = [];

      for (const [dayNumber, dayItems] of Array.from(dayMap)) {
        let depletion = 0;
        const breakdown: Array<{ itemId: string; title: string; energyCost: number }> = [];

        for (const item of dayItems) {
          const cost = item.energyCost || 20;
          depletion += cost;
          breakdown.push({ itemId: item.id, title: item.title, energyCost: cost });
        }

        const startingEnergy = 100;
        const endingEnergy = Math.max(0, startingEnergy - depletion);

        energyByDay.push({ dayNumber, startingEnergy, activityDepletion: depletion, endingEnergy, breakdown });

        // Save to database
        await storage.saveEnergyTracking({
          tripId: req.params.tripId,
          dayNumber,
          startingEnergy,
          activityDepletion: depletion,
          endingEnergy,
          recoveryNeeded: endingEnergy < 20,
          recoveryReason: endingEnergy < 20 ? `Energy critically low (${endingEnergy}%) - consider lighter activities` : null,
          energyBreakdown: breakdown,
        });
      }

      res.json({
        tripId: req.params.tripId,
        totalDays: energyByDay.length,
        energyByDay,
        warnings: energyByDay.filter(d => d.endingEnergy < 30).map(d => `Day ${d.dayNumber}: energy drops to ${d.endingEnergy}%`),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to calculate energy", error: error.message });
    }
  });

  // === Logistics: Template Presets ===

  app.get("/api/logistics/presets/:templateSlug", async (req, res) => {
    try {
      const { getPresetsForTemplate } = await import('./services/logistics-presets.service');
      const presets = getPresetsForTemplate(req.params.templateSlug);
      if (!presets) {
        return res.json({ anchors: [], dayBoundaries: [] });
      }
      res.json(presets);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get presets", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/generate-presets", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { templateSlug, eventDate, userExperienceId } = req.body;
      if (!templateSlug || !eventDate) {
        return res.status(400).json({ message: "templateSlug and eventDate are required" });
      }

      const { generatePresetsForTrip } = await import('./services/logistics-presets.service');
      const result = await generatePresetsForTrip(
        req.params.tripId,
        templateSlug,
        eventDate,
        userExperienceId
      );
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate presets", error: error.message });
    }
  });

  app.post("/api/trips/:tripId/anchors/:anchorId/impacts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { detectAnchorImpacts } = await import('./services/logistics-presets.service');
      const impacts = await detectAnchorImpacts(req.params.tripId, req.params.anchorId);
      res.json({ impacts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to detect impacts", error: error.message });
    }
  });

  // === Logistics: AI Anchor Suggestions ===

  app.post("/api/trips/:tripId/anchor-suggestions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { templateSlug } = req.body;
      const startDate = trip.startDate?.toString() || new Date().toISOString().split('T')[0];
      const endDate = trip.endDate?.toString() || startDate;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const numberOfDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);

      const { generateAnchorSuggestions } = await import('./services/anchor-suggestion.service');
      const suggestions = await generateAnchorSuggestions({
        tripId: req.params.tripId,
        destination: trip.destination || "Unknown",
        templateSlug: templateSlug || trip.eventType || "travel",
        startDate,
        endDate,
        numberOfDays,
      });
      res.json({ suggestions });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate suggestions", error: error.message });
    }
  });

  app.get("/api/trips/:tripId/anchor-optimization", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && !["expert", "local_expert"].includes(user.role)) {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { analyzeAnchorOptimization } = await import('./services/anchor-suggestion.service');
      const tips = await analyzeAnchorOptimization(req.params.tripId);
      res.json({ tips });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze anchors", error: error.message });
    }
  });

  // ==========================================
  // Expert/Provider Logistics Integration
  // ==========================================

  // === Expert: Client Constraint Visibility ===

  app.get("/api/expert/trips/:tripId/constraints", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (!["expert", "local_expert"].includes(user.role) && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      const energy = await storage.getEnergyTracking(req.params.tripId);
      const vendorCoord = await storage.getVendorCoordination(req.params.tripId);
      const bookingReqs = await storage.getBookingRequestsByTrip(req.params.tripId);

      const { analyzeAnchorOptimization } = await import('./services/anchor-suggestion.service');
      const tips = await analyzeAnchorOptimization(req.params.tripId);

      res.json({
        trip: {
          id: trip.id,
          title: trip.title,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          eventType: trip.eventType,
        },
        anchors,
        dayBoundaries: boundaries,
        energyTracking: energy,
        vendorCoordination: vendorCoord,
        bookingRequests: bookingReqs,
        optimizationTips: tips,
        summary: {
          totalAnchors: anchors.length,
          immovableAnchors: anchors.filter(a => a.isImmovable).length,
          confirmedVendors: vendorCoord.filter(v => v.status === 'confirmed' || v.status === 'contract_signed').length,
          pendingVendors: vendorCoord.filter(v => v.status === 'pending' || v.status === 'contacted').length,
          warningCount: tips.filter(t => t.severity === 'warning' || t.severity === 'critical').length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load constraints", error: error.message });
    }
  });

  app.post("/api/expert/find-providers", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (!["expert", "local_expert"].includes(user.role) && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const { date, startTime, endTime, serviceType } = req.body;
      const dayOfWeek = new Date(date).getDay();

      const { providerAvailabilitySchedule } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const { db } = await import('./db');

      const schedules = await db.select()
        .from(providerAvailabilitySchedule)
        .where(
          and(
            eq(providerAvailabilitySchedule.dayOfWeek, dayOfWeek),
            eq(providerAvailabilitySchedule.isAvailable, true)
          )
        );

      const matching = schedules.filter(s => {
        return s.startTime <= startTime && s.endTime >= endTime;
      });

      const { providerBlackoutDates } = await import('@shared/schema');
      const blackouts = await db.select().from(providerBlackoutDates);
      const blockedProviders = new Set(
        blackouts
          .filter(b => date >= b.startDate && date <= b.endDate)
          .map(b => b.providerId)
      );

      const available = matching.filter(s => !blockedProviders.has(s.providerId));

      res.json({
        availableProviders: available.map(s => ({
          providerId: s.providerId,
          availableFrom: s.startTime,
          availableUntil: s.endTime,
          pricingModifier: s.pricingModifier,
          preferredSlots: s.preferredSlots,
        })),
        totalFound: available.length,
        blockedCount: matching.length - available.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to find providers", error: error.message });
    }
  });

  // === Expert: Vendor Coordination ===

  app.get("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (!["expert", "local_expert"].includes(user.role) && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendors = await storage.getVendorCoordination(req.params.tripId);
      const confirmed = vendors.filter(v => v.status === 'confirmed' || v.status === 'contract_signed');
      const pending = vendors.filter(v => v.status === 'pending' || v.status === 'contacted');
      res.json({ vendors, confirmed, pending, total: vendors.length });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load vendors", error: error.message });
    }
  });

  app.post("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (!["expert", "local_expert"].includes(user.role) && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendorInput = z.object({
        vendorName: z.string().min(1).max(255),
        serviceType: z.string().min(1).max(100),
        vendorCategory: z.string().min(1).max(100),
        status: z.string().max(50).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        notes: z.string().max(1000).optional(),
        quotedAmount: z.string().optional(),
      }).parse(req.body);
      const vendor = await storage.createVendorCoordination({
        ...vendorInput,
        tripId: req.params.tripId,
        expertId: userId,
      });
      res.json(vendor);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add vendor", error: error.message });
    }
  });

  app.put("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (!["expert", "local_expert"].includes(user.role) && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendorUpdateInput = z.object({
        vendorName: z.string().min(1).max(255).optional(),
        serviceType: z.string().min(1).max(100).optional(),
        status: z.string().max(50).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        notes: z.string().max(1000).optional(),
        quotedAmount: z.string().optional(),
      }).parse(req.body);
      const updated = await storage.updateVendorCoordination(req.params.vendorId, vendorUpdateInput);
      if (!updated) return res.status(404).json({ message: "Vendor not found" });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update vendor", error: error.message });
    }
  });

  app.delete("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (!["expert", "local_expert"].includes(user.role) && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      await storage.deleteVendorCoordination(req.params.vendorId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete vendor", error: error.message });
    }
  });

  // === Provider: Availability Management ===

  app.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const schedule = await storage.getProviderAvailability(userId);
      const blackouts = await storage.getProviderBlackoutDates(userId);
      res.json({ schedule, blackoutDates: blackouts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load availability", error: error.message });
    }
  });

  app.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const scheduleInput = z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().min(1),
        endTime: z.string().min(1),
        isAvailable: z.boolean().optional(),
      }).parse(req.body);
      const entry = await storage.setProviderAvailability({
        ...scheduleInput,
        providerId: userId,
      });
      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to set availability", error: error.message });
    }
  });

  app.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderAvailability(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete availability", error: error.message });
    }
  });

  app.post("/api/provider/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const blackoutInput = z.object({
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        reason: z.string().max(500).optional(),
      }).parse(req.body);
      const blackout = await storage.addProviderBlackoutDate({
        ...blackoutInput,
        providerId: userId,
      });
      res.json(blackout);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add blackout date", error: error.message });
    }
  });

  app.delete("/api/provider/blackout-dates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderBlackoutDate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete blackout date", error: error.message });
    }
  });

  // === Provider: Booking Requests ===

  app.get("/api/provider/booking-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const requests = await storage.getBookingRequests(userId);
      res.json({ requests });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load requests", error: error.message });
    }
  });

  app.post("/api/coordination/booking-request", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const requestInput = z.object({
        providerId: z.string().min(1),
        tripId: z.string().min(1),
        serviceType: z.string().min(1).max(100),
        requestedDate: z.string().min(1),
        requestedStartTime: z.string().min(1),
        requestedEndTime: z.string().min(1),
        message: z.string().max(2000).optional(),
        budget: z.string().optional(),
      }).parse(req.body);
      const request = await storage.createBookingRequest({
        ...requestInput,
        expertId: userId,
      });
      res.json(request);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create booking request", error: error.message });
    }
  });

  app.put("/api/provider/booking-requests/:requestId/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const responseInput = z.object({
        status: z.enum(["accepted", "rejected", "counter_offered"]),
        counterOffer: z.string().optional().nullable(),
        providerResponse: z.string().max(2000).optional(),
      }).parse(req.body);
      const updated = await storage.updateBookingRequest(req.params.requestId, {
        status: responseInput.status,
        counterOffer: responseInput.counterOffer || null,
        providerResponse: responseInput.providerResponse,
      });
      if (!updated) return res.status(404).json({ message: "Request not found" });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to respond", error: error.message });
    }
  });

  // ==========================================
  // Constraint Propagation & Workflow Services
  // ==========================================

  app.post("/api/coordination/propagate/:tripId/:anchorId", isAuthenticated, async (req, res) => {
    try {
      const { propagateAnchorChange } = await import('./services/constraint-propagation.service');
      const result = await propagateAnchorChange(
        req.params.tripId,
        req.params.anchorId,
        req.body.previousDatetime
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to propagate", error: error.message });
    }
  });

  app.post("/api/coordination/match-providers", isAuthenticated, async (req, res) => {
    try {
      const { findMatchingProviders } = await import('./services/provider-matching.service');
      const result = await findMatchingProviders(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to match providers", error: error.message });
    }
  });

  app.post("/api/coordination/booking-context/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildBookingContext } = await import('./services/provider-matching.service');
      const { date, startTime, endTime } = req.body;
      const context = await buildBookingContext(req.params.tripId, date, startTime, endTime);
      res.json(context);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build context", error: error.message });
    }
  });

  // === Wedding Coordination ===

  app.get("/api/coordination/wedding-timeline/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildWeddingTimeline } = await import('./services/wedding-coordination.service');
      const timeline = await buildWeddingTimeline(req.params.tripId);
      res.json(timeline);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build wedding timeline", error: error.message });
    }
  });

  app.get("/api/coordination/wedding-gaps/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getWeddingVendorGaps } = await import('./services/wedding-coordination.service');
      const gaps = await getWeddingVendorGaps(req.params.tripId);
      res.json({ gaps });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze vendor gaps", error: error.message });
    }
  });

  // === Corporate Coordination ===

  app.get("/api/coordination/corporate-summary/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getCorporateLogisticsSummary } = await import('./services/corporate-coordination.service');
      const summary = await getCorporateLogisticsSummary(req.params.tripId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load corporate summary", error: error.message });
    }
  });

  app.post("/api/coordination/staggered-arrivals/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { generateStaggeredArrivalPlan } = await import('./services/corporate-coordination.service');
      const plan = await generateStaggeredArrivalPlan(
        req.params.tripId,
        req.body.date,
        req.body.options
      );
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate arrival plan", error: error.message });
    }
  });

  app.post("/api/coordination/split-activities/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { generateSplitActivityPlan } = await import('./services/corporate-coordination.service');
      const plan = await generateSplitActivityPlan(
        req.params.tripId,
        req.body.date,
        req.body.tracks
      );
      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate split activities", error: error.message });
    }
  });

  // === Admin Users Management ===
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      const role = req.query.role as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      let conditions: any[] = [];
      if (search) {
        conditions.push(
          or(
            like(users.email, `%${search}%`),
            like(users.firstName, `%${search}%`),
            like(users.lastName, `%${search}%`)
          )
        );
      }
      if (role) {
        conditions.push(eq(users.role, role));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const allUsers = await db.select().from(users).where(whereClause).limit(limit).offset(offset).orderBy(desc(users.createdAt));
      const [totalResult] = await db.select({ count: count() }).from(users).where(whereClause);

      const enrichedUsers = await Promise.all(allUsers.map(async (u) => {
        const userTrips = await db.select({ count: count() }).from(trips).where(eq(trips.userId, u.id));
        const userBookings = await db.select().from(serviceBookings).where(eq(serviceBookings.travelerId, u.id));
        const totalSpent = userBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        return {
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          email: u.email || "",
          role: u.role || "user",
          status: "active",
          joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
          trips: userTrips[0]?.count || 0,
          spent: `$${totalSpent.toLocaleString()}`,
        };
      }));

      res.json({
        users: enrichedUsers,
        total: totalResult?.count || 0,
        page,
        limit,
      });
    } catch (err) {
      console.error("Admin users error:", err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Suspend/Unsuspend user
  app.patch("/api/admin/users/:id/suspend", isAuthenticated, async (req, res) => {
    try {
      const admin = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!admin || admin.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.params.id;
      const { suspended } = req.body;

      if (typeof suspended !== "boolean") {
        return res.status(400).json({ message: "suspended must be a boolean" });
      }

      const targetUser = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await db.update(users).set({ suspended }).where(eq(users.id, userId));

      res.json({
        success: true,
        user: {
          id: userId,
          suspended,
        },
      });
    } catch (err) {
      console.error("Suspend user error:", err);
      res.status(500).json({ message: "Failed to update user suspension status" });
    }
  });

  // Change user role
  app.patch("/api/admin/users/:id/role", isAuthenticated, async (req, res) => {
    try {
      const admin = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!admin || admin.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.params.id;
      const { role } = req.body;
      const currentAdminId = admin.id;

      // Prevent self-role-change
      if (userId === currentAdminId) {
        return res.status(400).json({ message: "Cannot change your own role" });
      }

      const validRoles = ["user", "travel_expert", "local_expert", "event_planner", "service_provider", "executive_assistant", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const targetUser = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await db.update(users).set({ role }).where(eq(users.id, userId));

      res.json({
        success: true,
        user: {
          id: userId,
          role,
        },
      });
    } catch (err) {
      console.error("Change user role error:", err);
      res.status(500).json({ message: "Failed to change user role" });
    }
  });

  // === Admin Trips/Plans Management ===
  app.get("/api/admin/trips", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      const status = req.query.status as string | undefined;

      let conditions: any[] = [];
      if (search) {
        conditions.push(
          or(
            like(trips.title, `%${search}%`),
            like(trips.destination, `%${search}%`)
          )
        );
      }
      if (status) {
        conditions.push(eq(trips.status, status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const allTrips = await db.select().from(trips).where(whereClause).orderBy(desc(trips.createdAt)).limit(100);

      const enrichedTrips = await Promise.all(allTrips.map(async (t) => {
        const owner = await storage.getUser(t.userId || '');
        return {
          id: t.id,
          title: t.title || "Untitled Trip",
          type: t.eventType || "Travel",
          destination: t.destination || "TBD",
          startDate: t.startDate,
          endDate: t.endDate,
          guests: t.numberOfTravelers || 1,
          budget: t.budget ? `$${Number(t.budget).toLocaleString()}` : "N/A",
          status: t.status || "draft",
          user: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email : "Unknown",
          created: t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
        };
      }));

      const statusCounts = {
        total: enrichedTrips.length,
        active: enrichedTrips.filter(t => t.status === "planning" || t.status === "confirmed").length,
        pending: enrichedTrips.filter(t => t.status === "draft").length,
        completed: enrichedTrips.filter(t => t.status === "completed").length,
      };

      res.json({ trips: enrichedTrips, stats: statusCounts });
    } catch (err) {
      console.error("Admin trips error:", err);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  // === Admin Analytics Overview ===
  app.get("/api/admin/analytics/overview", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await db.select().from(users);
      const allBookings = await storage.getServiceBookings({});
      const allTrips = await db.select().from(trips);
      const allReviews = await db.select().from(serviceReviews);

      const totalUsers = allUsers.length;
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);

      const destCounts: Record<string, { bookings: number; revenue: number }> = {};
      allTrips.forEach(t => {
        const dest = t.destination || "Unknown";
        if (!destCounts[dest]) destCounts[dest] = { bookings: 0, revenue: 0 };
        destCounts[dest].bookings++;
        destCounts[dest].revenue += Number(t.budget || 0);
      });
      const topDestinations = Object.entries(destCounts)
        .map(([name, data]) => ({ name, bookings: data.bookings, revenue: `$${data.revenue.toLocaleString()}` }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5);

      const roleCounts: Record<string, number> = {};
      allUsers.forEach(u => {
        const role = u.role || "user";
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
      const userDemographics = Object.entries(roleCounts)
        .map(([segment, count]) => ({
          segment: segment.charAt(0).toUpperCase() + segment.slice(1) + "s",
          percentage: Math.round((count / totalUsers) * 100),
        }))
        .sort((a, b) => b.percentage - a.percentage);

      const now = new Date();
      const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weeklyActivity = weekDays.map((day, i) => {
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() - (now.getDay() - i));
        const dayUsers = allUsers.filter(u => {
          if (!u.createdAt) return false;
          const d = new Date(u.createdAt);
          return d.toDateString() === dayDate.toDateString();
        }).length;
        return { day, users: dayUsers };
      });

      const avgRating = allReviews.length > 0
        ? allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length
        : 0;

      res.json({
        metrics: [
          { label: "Total Users", value: totalUsers.toLocaleString(), change: `+${allUsers.filter(u => { const d = u.createdAt ? new Date(u.createdAt) : null; return d && d > new Date(now.getTime() - 30*24*60*60*1000); }).length} this month`, positive: true },
          { label: "Total Bookings", value: allBookings.length.toLocaleString(), change: `${completedBookings.length} completed`, positive: true },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, change: `${allBookings.filter(b => b.status === "pending").length} pending`, positive: true },
          { label: "Avg Rating", value: avgRating.toFixed(1), change: `${allReviews.length} reviews`, positive: avgRating >= 4.0 },
        ],
        topDestinations,
        userDemographics,
        weeklyActivity,
      });
    } catch (err) {
      console.error("Admin analytics error:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Country/Region Analytics
  app.get("/api/admin/analytics/by-country", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get experts by country
      const expertsByCountry = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
        pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`);

      // Get providers by country (from serviceProviderForms)
      const { serviceProviderForms } = await import("@shared/schema");
      const providersByCountry = await db.select({
        country: serviceProviderForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
        pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.country)
      .orderBy(sql`count(*) desc`);

      // Get trips by destination country (extract country from destination string)
      const tripsByDestination = await db.select({
        destination: trips.destination,
        count: sql<number>`count(*)::int`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      // Get bookings summary
      const allBookings = await storage.getServiceBookings({});
      const bookingsByStatus = {
        total: allBookings.length,
        completed: allBookings.filter(b => b.status === "completed").length,
        pending: allBookings.filter(b => b.status === "pending").length,
        cancelled: allBookings.filter(b => b.status === "cancelled").length,
      };

      res.json({
        expertsByCountry: expertsByCountry.map(e => ({
          country: e.country || "Unknown",
          total: e.count,
          approved: e.approved || 0,
          pending: e.pending || 0,
        })),
        providersByCountry: providersByCountry.map(p => ({
          country: p.country || "Unknown",
          total: p.count,
          approved: p.approved || 0,
          pending: p.pending || 0,
        })),
        tripsByDestination: tripsByDestination.map(t => ({
          destination: t.destination || "Unknown",
          count: t.count,
        })),
        bookingsSummary: bookingsByStatus,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Country analytics error:", err);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  // Expert Analytics - detailed breakdown
  app.get("/api/admin/analytics/experts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Experts by country
      const byCountry = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`);

      // Experts by city
      const byCity = await db.select({
        city: localExpertForms.city,
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.city, localExpertForms.country)
      .orderBy(sql`count(*) desc`)
      .limit(15);

      // Expert application status summary
      const statusSummary = await db.select({
        status: localExpertForms.status,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.status);

      // Experts by experience level
      const byExperience = await db.select({
        years: localExpertForms.yearsOfExperience,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.yearsOfExperience)
      .orderBy(sql`count(*) desc`);

      res.json({
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        byCity: byCity.map(c => ({
          city: c.city || "Unknown",
          country: c.country || "",
          count: c.count,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        byExperience: byExperience.map(e => ({
          years: e.years || "Unknown",
          count: e.count,
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Expert analytics error:", err);
      res.status(500).json({ message: "Failed to fetch expert analytics" });
    }
  });

  // Provider Analytics - detailed breakdown
  app.get("/api/admin/analytics/providers", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceProviderForms, providerServices, serviceBookings } = await import("@shared/schema");

      // Providers by business type
      const byBusinessType = await db.select({
        businessType: serviceProviderForms.businessType,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.businessType)
      .orderBy(sql`count(*) desc`);

      // Providers by country
      const byCountry = await db.select({
        country: serviceProviderForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.country)
      .orderBy(sql`count(*) desc`);

      // Provider application status summary
      const statusSummary = await db.select({
        status: serviceProviderForms.status,
        count: sql<number>`count(*)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.status);

      // Active services count
      const activeServices = await db.select({
        count: sql<number>`count(*)::int`,
      })
      .from(providerServices)
      .where(eq(providerServices.status, "active"));

      // Top providers by bookings
      const topProviders = await db.select({
        userId: providerServices.userId,
        serviceName: providerServices.serviceName,
        bookingsCount: providerServices.bookingsCount,
        totalRevenue: providerServices.totalRevenue,
        averageRating: providerServices.averageRating,
      })
      .from(providerServices)
      .orderBy(desc(providerServices.bookingsCount))
      .limit(10);

      res.json({
        byBusinessType: byBusinessType.map(b => ({
          type: b.businessType || "Unknown",
          total: b.count,
          approved: b.approved || 0,
        })),
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        activeServicesCount: activeServices[0]?.count || 0,
        topProviders: topProviders.map(p => ({
          serviceName: p.serviceName,
          bookings: p.bookingsCount || 0,
          revenue: `$${Number(p.totalRevenue || 0).toLocaleString()}`,
          rating: Number(p.averageRating || 0).toFixed(1),
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Provider analytics error:", err);
      res.status(500).json({ message: "Failed to fetch provider analytics" });
    }
  });

  // === Tourism Analytics Dashboard ===
  app.get("/api/admin/analytics/tourism", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceBookings, providerServices, localExpertForms, serviceProviderForms } = await import("@shared/schema");

      // 1. Destination Demand - Most searched/booked destinations
      const destinationDemand = await db.select({
        destination: trips.destination,
        searchCount: sql<number>`count(*)::int`,
        totalBudget: sql<number>`sum(COALESCE(budget::numeric, 0))::numeric`,
        avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(15);

      // 2. Booking Trends Over Time (last 12 months)
      const bookingTrends = await db.select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric`,
      })
      .from(serviceBookings)
      .where(sql`created_at >= now() - interval '12 months'`)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

      // 3. Source Markets - Where travelers come from (experts/providers by country as proxy)
      const sourceMarkets = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(isNotNull(localExpertForms.country))
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Also get user sign-up trends by month as additional source market data
      const usersByMonth = await db.select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`created_at >= now() - interval '12 months'`)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

      // 4. Spending Patterns by Destination
      const spendingPatterns = await db.select({
        destination: trips.destination,
        avgSpend: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
        minSpend: sql<number>`min(COALESCE(budget::numeric, 0))::numeric`,
        maxSpend: sql<number>`max(COALESCE(budget::numeric, 0))::numeric`,
        tripCount: sql<number>`count(*)::int`,
      })
      .from(trips)
      .where(sql`budget > 0`)
      .groupBy(trips.destination)
      .orderBy(sql`avg(COALESCE(budget::numeric, 0)) desc`)
      .limit(10);

      // 5. Party Composition (based on adults, kids, numberOfTravelers)
      const allTrips = await db.select({
        adults: trips.adults,
        kids: trips.kids,
        numberOfTravelers: trips.numberOfTravelers,
      }).from(trips);

      const partyComposition = {
        solo: 0,
        couples: 0,
        families: 0,
        groups: 0,
      };

      allTrips.forEach(trip => {
        const adults = trip.adults || 1;
        const kids = trip.kids || 0;
        const total = trip.numberOfTravelers || adults + kids;

        if (total === 1) {
          partyComposition.solo++;
        } else if (total === 2 && kids === 0) {
          partyComposition.couples++;
        } else if (kids > 0) {
          partyComposition.families++;
        } else if (total > 2) {
          partyComposition.groups++;
        } else {
          partyComposition.couples++;
        }
      });

      // 6. Seasonality - Bookings by month (using trip start dates)
      const seasonality = await db.select({
        month: sql<number>`EXTRACT(MONTH FROM start_date)::int`,
        count: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
      })
      .from(trips)
      .where(isNotNull(trips.startDate))
      .groupBy(sql`EXTRACT(MONTH FROM start_date)`)
      .orderBy(sql`EXTRACT(MONTH FROM start_date)`);

      // 7. Event Types breakdown
      const eventTypes = await db.select({
        eventType: trips.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(trips)
      .groupBy(trips.eventType)
      .orderBy(sql`count(*) desc`);

      // 8. Summary metrics
      const totalTrips = allTrips.length;
      const totalBookings = await db.select({ count: sql<number>`count(*)::int` }).from(serviceBookings);
      const completedBookings = await db.select({ 
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric` 
      })
      .from(serviceBookings)
      .where(eq(serviceBookings.status, "completed"));

      const avgTripDuration = await db.select({
        avgDays: sql<number>`avg(EXTRACT(DAY FROM (end_date - start_date)))::numeric`,
      })
      .from(trips)
      .where(sql`start_date IS NOT NULL AND end_date IS NOT NULL`);

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      res.json({
        destinationDemand: destinationDemand.map(d => ({
          destination: d.destination || "Unknown",
          searches: d.searchCount,
          totalBudget: Math.round(Number(d.totalBudget || 0)),
          avgBudget: Math.round(Number(d.avgBudget || 0)),
        })),
        bookingTrends: bookingTrends.map(b => ({
          month: b.month,
          bookings: b.count,
          revenue: Math.round(Number(b.revenue || 0)),
        })),
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          travelers: s.count,
        })),
        userGrowth: usersByMonth.map(u => ({
          month: u.month,
          users: u.count,
        })),
        spendingPatterns: spendingPatterns.map(s => ({
          destination: s.destination || "Unknown",
          avgSpend: Math.round(Number(s.avgSpend || 0)),
          minSpend: Math.round(Number(s.minSpend || 0)),
          maxSpend: Math.round(Number(s.maxSpend || 0)),
          trips: s.tripCount,
        })),
        partyComposition: [
          { type: "Solo", count: partyComposition.solo, color: "#8884d8" },
          { type: "Couples", count: partyComposition.couples, color: "#82ca9d" },
          { type: "Families", count: partyComposition.families, color: "#ffc658" },
          { type: "Groups", count: partyComposition.groups, color: "#ff7c43" },
        ],
        seasonality: monthNames.map((name, i) => {
          const monthData = seasonality.find(s => s.month === i + 1);
          return {
            month: name,
            monthNum: i + 1,
            bookings: monthData?.count || 0,
            avgBudget: Math.round(Number(monthData?.avgBudget || 0)),
          };
        }),
        eventTypes: eventTypes.map(e => ({
          type: e.eventType || "vacation",
          count: e.count,
        })),
        summary: {
          totalTrips,
          totalBookings: totalBookings[0]?.count || 0,
          completedBookings: completedBookings[0]?.count || 0,
          totalRevenue: Math.round(Number(completedBookings[0]?.revenue || 0)),
          avgTripDuration: Math.round(Number(avgTripDuration[0]?.avgDays || 0)),
          avgPartySize: totalTrips > 0 
            ? Math.round(allTrips.reduce((sum, t) => sum + (t.numberOfTravelers || t.adults || 1) + (t.kids || 0), 0) / totalTrips * 10) / 10
            : 0,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Tourism analytics error:", err);
      res.status(500).json({ message: "Failed to fetch tourism analytics" });
    }
  });

  // === Admin System Health ===
  app.get("/api/admin/system/health", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dbStart = Date.now();
      let dbStatus = "operational";
      try {
        await db.select({ count: count() }).from(users);
      } catch {
        dbStatus = "degraded";
      }
      const dbLatency = Date.now() - dbStart;

      const services = [
        { service: "Web Server", status: "operational", uptime: "99.9%", latency: `${process.uptime().toFixed(0)}s uptime` },
        { service: "Database", status: dbStatus, uptime: dbLatency < 100 ? "99.9%" : "99.0%", latency: `${dbLatency}ms` },
        { service: "AI Processing", status: "operational", uptime: "99.5%" },
        { service: "Payment Gateway", status: "operational", uptime: "99.9%" },
        { service: "Email Service", status: "operational", uptime: "99.5%" },
        { service: "CDN", status: "operational", uptime: "99.9%" },
      ];

      let aiUsage = { used: 0, limit: 1000000, cost: "$0" };
      let apiUsage = { transactions: 0, volume: "$0" };
      try {
        const { aiUsageService: aiSvc } = await import('./services/ai-usage.service');
        const summary = await aiSvc.getSummary();
        aiUsage = { used: summary.totalTokens || 0, limit: 1000000, cost: `$${(summary.totalCostDollars || 0).toFixed(2)}` };
      } catch {}

      try {
        const allBookings = await storage.getServiceBookings({});
        const completedBookings = allBookings.filter(b => b.status === "completed");
        const volume = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        apiUsage = { transactions: allBookings.length, volume: `$${volume.toLocaleString()}` };
      } catch {}

      res.json({
        services,
        apiUsage: {
          claude: aiUsage,
          stripe: apiUsage,
          email: { sent: 0, bounceRate: "0%" },
        },
      });
    } catch (err) {
      console.error("System health error:", err);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  // === Admin Global Search ===
  app.get("/api/admin/search", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const q = (req.query.q as string) || "";
      if (!q.trim()) {
        return res.json({ results: [], counts: {} });
      }

      const searchPattern = `%${q}%`;

      const matchedUsers = await db.select().from(users)
        .where(or(
          like(users.email, searchPattern),
          like(users.firstName, searchPattern),
          like(users.lastName, searchPattern)
        ))
        .limit(10);

      const matchedTrips = await db.select().from(trips)
        .where(or(
          like(trips.title, searchPattern),
          like(trips.destination, searchPattern)
        ))
        .limit(10);

      const matchedServices = await db.select().from(providerServices)
        .where(or(
          like(providerServices.serviceName, searchPattern),
          like(providerServices.location, searchPattern)
        ))
        .limit(10);

      const results = [
        ...matchedUsers.map(u => ({
          id: u.id,
          type: ["expert", "local_expert"].includes(u.role ?? "") ? "expert" as const : ["provider", "service_provider"].includes(u.role ?? "") ? "provider" as const : "user" as const,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          description: u.email || "",
          meta: `Role: ${u.role || "user"}`,
        })),
        ...matchedTrips.map(t => ({
          id: t.id,
          type: "plan" as const,
          name: t.title || "Untitled Trip",
          description: `${t.destination || "TBD"} - ${t.startDate || ""}`,
          meta: t.budget ? `Budget: $${Number(t.budget).toLocaleString()}` : undefined,
        })),
        ...matchedServices.map(s => ({
          id: s.id,
          type: "provider" as const,
          name: s.serviceName || "Unnamed Service",
          description: s.location || "",
          meta: s.averageRating ? `${s.averageRating} rating` : undefined,
        })),
      ];

      const [userCount] = await db.select({ count: count() }).from(users);
      const [expertCount] = await db.select({ count: count() }).from(users).where(eq(users.role, "expert"));
      const [tripCount] = await db.select({ count: count() }).from(trips);
      const [serviceCount] = await db.select({ count: count() }).from(providerServices);

      res.json({
        results,
        counts: {
          users: userCount?.count || 0,
          experts: expertCount?.count || 0,
          providers: serviceCount?.count || 0,
          plans: tripCount?.count || 0,
        },
      });
    } catch (err) {
      console.error("Admin search error:", err);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // === Platform Stats (Public) ===
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

  // === Admin Notifications (admin-specific) ===
  app.get("/api/admin/notifications", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = user.claims.sub;
      const adminNotifications = await db.select().from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(50);

      const enriched = adminNotifications.map(n => ({
        id: n.id,
        type: n.type?.includes("warning") || n.type?.includes("dispute") ? "warning"
          : n.type?.includes("success") || n.type?.includes("payment") ? "success"
          : n.type?.includes("alert") ? "alert"
          : "info",
        category: n.relatedType || "System",
        title: n.title || "Notification",
        message: n.message || "",
        time: n.createdAt ? getRelativeTime(n.createdAt) : "Unknown",
        read: n.isRead || false,
      }));

      res.json(enriched);
    } catch (err) {
      console.error("Admin notifications error:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

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

  // GET /api/trips/:id/share-info — Returns share token + expert review status for a trip (owner only)
  app.get("/api/trips/:id/share-info", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
      const tripId = req.params.id;

      const comparisons = await db
        .select({ id: itineraryComparisons.id, selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)));

      if (comparisons.length === 0) return res.json({});

      const variantIds = comparisons.map(c => c.id);
      const variantRows = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(inArray(itineraryVariants.comparisonId, variantIds));

      if (variantRows.length === 0) return res.json({});

      const vids = variantRows.map(v => v.id);
      const shares = await db
        .select()
        .from(sharedItineraries)
        .where(and(inArray(sharedItineraries.variantId, vids), eq(sharedItineraries.sharedByUserId, userId)))
        .orderBy(sharedItineraries.createdAt);

      if (shares.length === 0) return res.json({});

      const latest = shares[shares.length - 1];
      return res.json({
        shareToken: latest.shareToken,
        variantId: latest.variantId,
        expertStatus: latest.expertStatus,
        expertNotes: latest.expertNotes,
        expertDiff: latest.expertDiff,
      });
    } catch (err: any) {
      console.error("Share info error:", err);
      res.status(500).json({ error: "Failed to fetch share info" });
    }
  });

  // GET /api/itinerary-share/:token — PUBLIC
  app.get("/api/itinerary-share/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Shared itinerary not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "This share link has expired" });
      }

      await db
        .update(sharedItineraries)
        .set({ viewCount: (shared.viewCount || 0) + 1, lastViewedAt: new Date() })
        .where(eq(sharedItineraries.id, shared.id));

      const [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, shared.variantId));

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

      const [exportCache] = await db
        .select()
        .from(mapsExportCache)
        .where(eq(mapsExportCache.variantId, shared.variantId));

      const [sharer] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, shared.sharedByUserId));

      const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
      const days = dayNumbers.map(dayNum => {
        const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const dayLegs = legs.filter(l => l.dayNumber === dayNum).sort((a, b) => a.legOrder - b.legOrder);

        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;
        let dateStr = "";
        if (startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + dayNum - 1);
          dateStr = d.toISOString().split("T")[0];
        }

        return {
          dayNumber: dayNum,
          date: dateStr,
          activities: dayItems.map(item => ({
            id: item.id,
            name: item.name,
            startTime: item.startTime,
            endTime: item.endTime,
            lat: item.latitude ? parseFloat(item.latitude as any) : null,
            lng: item.longitude ? parseFloat(item.longitude as any) : null,
            category: item.serviceType,
            cost: item.price ? parseFloat(item.price as any) : 0,
            description: item.description,
            location: item.location,
            duration: item.duration,
          })),
          transportLegs: dayLegs.map(leg => ({
            id: leg.id,
            legOrder: leg.legOrder,
            fromName: leg.fromName,
            toName: leg.toName,
            recommendedMode: leg.recommendedMode,
            userSelectedMode: leg.userSelectedMode,
            distanceDisplay: leg.distanceDisplay,
            distanceMeters: leg.distanceMeters,
            estimatedDurationMinutes: leg.estimatedDurationMinutes,
            estimatedCostUsd: leg.estimatedCostUsd,
            energyCost: leg.energyCost,
            alternativeModes: leg.alternativeModes,
            linkedProductUrl: leg.linkedProductUrl,
            fromLat: leg.fromLat,
            fromLng: leg.fromLng,
            toLat: leg.toLat,
            toLng: leg.toLng,
          })),
        };
      });

      const totalTransportCost = legs.reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
      const totalTransportMinutes = legs.reduce((sum, l) => sum + (l.estimatedDurationMinutes || 0), 0);

      res.json({
        variant: {
          id: variant.id,
          name: variant.name,
          description: variant.description,
          destination: comparison?.destination,
          dateRange: {
            start: comparison?.startDate,
            end: comparison?.endDate,
          },
          totalCost: variant.totalCost,
          optimizationScore: variant.optimizationScore,
          days,
          transportSummary: {
            totalLegs: legs.length,
            totalMinutes: totalTransportMinutes,
            totalCostUsd: Math.round(totalTransportCost * 100) / 100,
          },
        },
        mapsLinks: {
          googleMapsPerDay: exportCache?.googleMapsUrls || {},
          appleMapsPerDay: exportCache?.appleMapsUrls || {},
          appleMapsWebPerDay: exportCache?.appleMapsWebUrls || {},
          kmlDownloadUrl: `/api/itinerary-share/${token}/export/kml`,
          gpxDownloadUrl: `/api/itinerary-share/${token}/export/gpx`,
        },
        sharedBy: sharer
          ? {
              name: [sharer.firstName, sharer.lastName].filter(Boolean).join(" ") || "A traveler",
              avatarUrl: sharer.profileImageUrl,
              userId: sharer.id,
            }
          : { name: "A traveler", avatarUrl: null, userId: null },
        permissions: shared.permissions,
        expertStatus: shared.expertStatus,
        expertNotes: shared.expertNotes || null,
        expertDiff: shared.expertDiff || null,
        transportPreferences: shared.transportPreferences,
        shareToken: token,
        isOwner: !!(shared.sharedByUserId && (req as any).user?.id === shared.sharedByUserId),
      });
    } catch (err: any) {
      console.error("Get shared itinerary error:", err);
      res.status(500).json({ error: "Failed to load shared itinerary" });
    }
  });

  // GET /api/trips/:tripId/transport-legs
  // Returns transport legs for the most recent selected variant associated with a trip
  app.get("/api/trips/:tripId/transport-legs", isAuthenticated, async (req, res) => {
    try {
      const { tripId } = req.params;
      const userId = (req.user as any).claims.sub;

      const tripOwned = await verifyTripOwnership(tripId, userId);
      if (!tripOwned) {
        return res.status(404).json({ error: "Trip not found" });
      }

      const [comparison] = await db
        .select({ selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(
          and(
            eq(itineraryComparisons.tripId, tripId),
            isNotNull(itineraryComparisons.selectedVariantId)
          )
        )
        .orderBy(desc(itineraryComparisons.createdAt))
        .limit(1);

      if (!comparison?.selectedVariantId) {
        return res.json({ legs: [], variantId: null });
      }

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, comparison.selectedVariantId))
        .orderBy(asc(transportLegs.legOrder));

      res.json({ legs, variantId: comparison.selectedVariantId });
    } catch (err: any) {
      console.error("Get trip transport legs error:", err);
      res.status(500).json({ error: "Failed to load transport legs" });
    }
  });

  // PATCH /api/transport-legs/:legId/mode
  // Accepts either authenticated session (owner) or a suggest-permissions shareToken (expert without login)
  app.patch("/api/transport-legs/:legId/mode", async (req, res) => {
    try {
      const { legId } = req.params;
      const { selectedMode, shareToken } = req.body;
      const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;

      if (!selectedMode) return res.status(400).json({ error: "selectedMode is required" });
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

      await db
        .update(transportLegs)
        .set({
          userSelectedMode: selectedMode,
          estimatedDurationMinutes: newDuration,
          estimatedCostUsd: newCost ?? null,
          energyCost: newEnergy ?? 0,
          updatedAt: new Date(),
        })
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
          id: legId,
          userSelectedMode: selectedMode,
          estimatedDurationMinutes: newDuration,
          estimatedCostUsd: newCost,
          energyCost: newEnergy,
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

  // GET /api/itinerary-share/:token/export/kml
  app.get("/api/itinerary-share/:token/export/kml", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let kmlContent = cached?.kmlContent;

      if (!kmlContent) {
        const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        kmlContent = generateKml({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ kmlContent }).where(eq(mapsExportCache.variantId, shared.variantId));
      }

      res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.kml"`);
      res.send(kmlContent);
    } catch (err: any) {
      console.error("KML export error:", err);
      res.status(500).json({ error: "Failed to generate KML" });
    }
  });

  // GET /api/itinerary-share/:token/export/gpx
  app.get("/api/itinerary-share/:token/export/gpx", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let gpxContent = cached?.gpxContent;

      if (!gpxContent) {
        const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        gpxContent = generateGpx({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ gpxContent }).where(eq(mapsExportCache.variantId, shared.variantId));
      }

      res.setHeader("Content-Type", "application/gpx+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.gpx"`);
      res.send(gpxContent);
    } catch (err: any) {
      console.error("GPX export error:", err);
      res.status(500).json({ error: "Failed to generate GPX" });
    }
  });

  // GET /api/itinerary-share/:token/navigate/:dayNumber/:legOrder
  app.get("/api/itinerary-share/:token/navigate/:dayNumber/:legOrder", async (req, res) => {
    try {
      const { token, dayNumber, legOrder } = req.params;
      const { platform = "google", currentLat, currentLng } = req.query as Record<string, string>;

      const [shared] = await db
        .select({ variantId: sharedItineraries.variantId })
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [leg] = await db
        .select()
        .from(transportLegs)
        .where(
          and(
            eq(transportLegs.variantId, shared.variantId),
            eq(transportLegs.dayNumber, parseInt(dayNumber)),
            eq(transportLegs.legOrder, parseInt(legOrder))
          )
        );

      if (!leg) return res.status(404).json({ error: "Leg not found" });

      const mode = leg.userSelectedMode || leg.recommendedMode;
      const fromLat = currentLat ? parseFloat(currentLat) : leg.fromLat;
      const fromLng = currentLng ? parseFloat(currentLng) : leg.fromLng;

      let url: string;
      if (platform === "apple") {
        url = buildAppleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      } else {
        url = buildGoogleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      }

      res.redirect(302, url);
    } catch (err: any) {
      console.error("Navigate error:", err);
      res.status(500).json({ error: "Failed to build navigation URL" });
    }
  });

  // GET /api/transport-legs/user — returns all transport legs for the current user across all shared itineraries
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

  // GET /api/itinerary-variants/:variantId/transport-legs
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

  // POST /api/itinerary-variants/:variantId/calculate-transport
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

  // POST /api/itinerary-share/:token/suggest — DEPRECATED: Expert suggests modifications (legacy)
  // Use POST /api/expert-review/:shareToken/submit instead (stores full snapshot)
  app.post("/api/itinerary-share/:token/suggest", async (req, res) => {
    try {
      const { token } = req.params;
      const { notes, activityDiffs, transportDiffs } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) return res.status(401).json({ error: "Authentication required to submit suggestions" });
      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow suggestions" });
      }

      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId, name: itineraryVariants.name })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      // Build diff payload
      const expertDiff = {
        activityDiffs: activityDiffs || {},
        transportDiffs: transportDiffs || {},
        submittedAt: new Date().toISOString(),
      };

      // Save diff + notes + update status on shared_itineraries
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = 'review_sent', expert_notes = ${notes}, expert_diff = ${JSON.stringify(expertDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
      );

      // Send notification to the owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await db.insert(notifications).values({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert has reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
        });
      }

      res.json({ success: true, message: "Edits sent to traveler" });
    } catch (err: any) {
      console.error("Expert suggest error:", err);
      res.status(500).json({ error: "Failed to send suggestions" });
    }
  });

  // PATCH /api/itinerary-share/:token/acknowledge — Owner accepts or rejects expert edits
  app.patch("/api/itinerary-share/:token/acknowledge", async (req, res) => {
    try {
      const { token } = req.params;
      const { action } = req.body;
      const userId = (req as any).user?.id;

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });

      // Only the original sharer (owner) can acknowledge
      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
      );

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("Acknowledge expert edits error:", err);
      res.status(500).json({ error: "Failed to acknowledge edits" });
    }
  });

  // POST /api/expert-review/:shareToken/submit — Expert submits diff + notes to expert_updated_itineraries
  app.post("/api/expert-review/:shareToken/submit", async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { notes, activityDiffs, transportDiffs } = req.body;
      const userId = (req as any).user?.id;

      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });
      if (!userId) return res.status(401).json({ error: "Authentication required to submit expert edits" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, shareToken));

      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow expert edits" });
      }

      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId, name: itineraryVariants.name })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination, tripId: itineraryComparisons.tripId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      // Build full itinerary snapshot: original items with expert diffs applied
      const originalItems = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, shared.variantId));

      const originalLegs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

      const resolvedActivityDiffs = activityDiffs || {};
      const resolvedTransportDiffs = transportDiffs || {};

      // Helper: merge HH:MM expert edit with the original ISO date to produce a full ISO timestamp
      const mergeExpertTime = (originalISO: string | null | undefined, hhMM: string | undefined): string | null | undefined => {
        if (!hhMM) return originalISO;
        if (!originalISO) return originalISO;
        try {
          const base = new Date(originalISO);
          const [h, m] = hhMM.split(":").map(Number);
          base.setHours(h, m, 0, 0);
          return base.toISOString();
        } catch {
          return originalISO;
        }
      };

      const editedActivities = originalItems.map(item => {
        const diff = resolvedActivityDiffs[item.id];
        if (!diff) return { id: item.id, name: item.name, startTime: item.startTime, endTime: item.endTime, dayNumber: item.dayNumber, sortOrder: item.sortOrder, location: item.location, description: item.description };
        return {
          id: item.id,
          name: diff.name ?? item.name,
          startTime: mergeExpertTime(item.startTime, diff.startTime) ?? item.startTime,
          endTime: item.endTime,
          dayNumber: item.dayNumber,
          sortOrder: item.sortOrder,
          location: item.location,
          description: diff.note ? `${item.description || ""}\nExpert note: ${diff.note}`.trim() : item.description,
          expertNote: diff.note,
        };
      });

      const editedLegs = originalLegs.map(leg => {
        const diff = resolvedTransportDiffs[leg.id];
        if (!diff) return { id: leg.id, legOrder: leg.legOrder, dayNumber: leg.dayNumber, recommendedMode: leg.recommendedMode, userSelectedMode: leg.userSelectedMode };
        return { id: leg.id, legOrder: leg.legOrder, dayNumber: leg.dayNumber, recommendedMode: leg.recommendedMode, userSelectedMode: diff.newMode };
      });

      const itinerarySnapshot = {
        variantId: shared.variantId,
        variantName: variant.name,
        editedAt: new Date().toISOString(),
        activities: editedActivities,
        transportLegs: editedLegs,
        expertNotes: notes,
        diffs: {
          activityDiffs: resolvedActivityDiffs,
          transportDiffs: resolvedTransportDiffs,
        },
      };

      const expertDiff = {
        activityDiffs: resolvedActivityDiffs,
        transportDiffs: resolvedTransportDiffs,
        submittedAt: new Date().toISOString(),
      };

      // Save full edited snapshot + message to expert_updated_itineraries
      await db.insert(expertUpdatedItineraries).values({
        tripId: comparison?.tripId || null,
        shareToken,
        itineraryData: itinerarySnapshot,
        message: notes,
        status: "pending",
        createdById: userId,
      });

      // Update shared_itineraries with status + diff for traveler review
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = 'review_sent', expert_notes = ${notes}, expert_diff = ${JSON.stringify(expertDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
      );

      // Notify the itinerary owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await db.insert(notifications).values({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
        });
      }

      res.json({ success: true, message: "Edits submitted and traveler notified" });
    } catch (err: any) {
      console.error("Expert review submit error:", err);
      res.status(500).json({ error: "Failed to submit expert edits" });
    }
  });

  // PATCH /api/expert-review/:shareToken/acknowledge — Owner acknowledges expert edits
  app.patch("/api/expert-review/:shareToken/acknowledge", async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { action, acceptedDiffIds, rejectedDiffIds } = req.body;
      const userId = (req as any).user?.id;

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, shareToken));

      if (!shared) return res.status(404).json({ error: "Share not found" });

      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";

      // If partial accept/reject, update expert_diff to reflect accepted subset
      if (action === "accept" && (acceptedDiffIds || rejectedDiffIds)) {
        const currentDiff = shared.expertDiff;
        if (currentDiff && rejectedDiffIds?.length > 0) {
          const updatedActivityDiffs = { ...currentDiff.activityDiffs };
          const updatedTransportDiffs = { ...currentDiff.transportDiffs };
          for (const id of rejectedDiffIds) {
            delete updatedActivityDiffs[id];
            delete updatedTransportDiffs[id];
          }
          const updatedDiff = { ...currentDiff, activityDiffs: updatedActivityDiffs, transportDiffs: updatedTransportDiffs };
          await db.execute(
            sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, expert_diff = ${JSON.stringify(updatedDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
          );
        } else {
          await db.execute(
            sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
          );
        }
      } else {
        await db.execute(
          sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
        );
      }

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("Expert review acknowledge error:", err);
      res.status(500).json({ error: "Failed to acknowledge edits" });
    }
  });

  // Social sharing meta-tag injection for /itinerary-view/:token
  // This route intercepts the SPA route and injects Open Graph tags into the HTML
  // so social crawlers (Twitter, Facebook, Slack, etc.) see them in <head>.
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

  // ============================================
  // DATA TRACKING & MONETIZATION APIs
  // ============================================

  // Track search events (called from frontend)
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

  // Track page views
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

  // Track booking funnel events
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

  // === DATA REPORTS FOR MONETIZATION ===

  // Destination Demand Report (sell to tourism boards)
  app.get("/api/admin/reports/destination-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { searchAnalytics, demandSignals } = await import("@shared/schema");
      
      // Aggregate search data by destination
      const destinationDemand = await db.select({
        destination: searchAnalytics.destination,
        searchCount: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${searchAnalytics.userId})::int`,
        avgTravelers: sql<number>`avg(${searchAnalytics.travelers})::numeric(10,1)`,
        topOriginCountries: sql<string>`array_agg(distinct ${searchAnalytics.ipCountry}) filter (where ${searchAnalytics.ipCountry} is not null)`,
      })
      .from(searchAnalytics)
      .where(isNotNull(searchAnalytics.destination))
      .groupBy(searchAnalytics.destination)
      .orderBy(sql`count(*) desc`)
      .limit(50);

      res.json({
        reportType: "destination_demand",
        generatedAt: new Date().toISOString(),
        data: destinationDemand,
        summary: {
          totalDestinations: destinationDemand.length,
          totalSearches: destinationDemand.reduce((sum, d) => sum + d.searchCount, 0),
        }
      });
    } catch (err) {
      console.error("Destination demand report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Service Provider Market Report
  app.get("/api/admin/reports/provider-market", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceProviderForms, providerServices } = await import("@shared/schema");
      
      // Market overview by business type
      const marketByType = await db.select({
        businessType: serviceProviderForms.businessType,
        providerCount: sql<number>`count(*)::int`,
        countries: sql<number>`count(distinct ${serviceProviderForms.country})::int`,
      })
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.status, "approved"))
      .groupBy(serviceProviderForms.businessType)
      .orderBy(sql`count(*) desc`);

      // Top performing services
      const topServices = await db.select({
        serviceName: providerServices.serviceName,
        bookings: providerServices.bookingsCount,
        revenue: providerServices.totalRevenue,
        rating: providerServices.averageRating,
      })
      .from(providerServices)
      .where(eq(providerServices.status, "active"))
      .orderBy(desc(providerServices.bookingsCount))
      .limit(20);

      res.json({
        reportType: "provider_market",
        generatedAt: new Date().toISOString(),
        marketByType,
        topServices,
      });
    } catch (err) {
      console.error("Provider market report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Geographic Insights Report (sell to countries/tourism boards)
  app.get("/api/admin/reports/geographic-insights", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Travelers by origin
      const travelerOrigins = await db.select({
        country: trips.destination,
        tripCount: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(cast(${trips.budget} as numeric))::numeric(10,2)`,
        avgTravelers: sql<number>`avg(${trips.numberOfTravelers})::numeric(10,1)`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Expert coverage by region
      const expertCoverage = await db.select({
        country: localExpertForms.country,
        city: localExpertForms.city,
        expertCount: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.country, localExpertForms.city)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      res.json({
        reportType: "geographic_insights",
        generatedAt: new Date().toISOString(),
        travelerOrigins,
        expertCoverage,
        insights: {
          topDestinations: travelerOrigins.slice(0, 5).map(t => t.country),
          underservedMarkets: expertCoverage.filter(e => e.expertCount < 3).map(e => `${e.city}, ${e.country}`),
        }
      });
    } catch (err) {
      console.error("Geographic insights error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Conversion Funnel Report
  app.get("/api/admin/reports/conversion-funnel", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { bookingFunnelAnalytics } = await import("@shared/schema");
      
      const funnelData = await db.select({
        stage: bookingFunnelAnalytics.funnelStage,
        count: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${bookingFunnelAnalytics.userId})::int`,
        avgPrice: sql<number>`avg(${bookingFunnelAnalytics.price})::numeric(10,2)`,
      })
      .from(bookingFunnelAnalytics)
      .groupBy(bookingFunnelAnalytics.funnelStage);

      const stages = ["search", "view", "cart", "checkout", "payment", "complete"];
      const orderedFunnel = stages.map(stage => {
        const data = funnelData.find(f => f.stage === stage);
        return {
          stage,
          count: data?.count || 0,
          uniqueUsers: data?.uniqueUsers || 0,
          avgPrice: data?.avgPrice || 0,
        };
      });

      res.json({
        reportType: "conversion_funnel",
        generatedAt: new Date().toISOString(),
        funnel: orderedFunnel,
        conversionRates: {
          searchToView: orderedFunnel[0].count > 0 ? ((orderedFunnel[1].count / orderedFunnel[0].count) * 100).toFixed(1) + "%" : "0%",
          viewToCart: orderedFunnel[1].count > 0 ? ((orderedFunnel[2].count / orderedFunnel[1].count) * 100).toFixed(1) + "%" : "0%",
          cartToComplete: orderedFunnel[2].count > 0 ? ((orderedFunnel[5].count / orderedFunnel[2].count) * 100).toFixed(1) + "%" : "0%",
        }
      });
    } catch (err) {
      console.error("Conversion funnel error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });


  // Track activity/service interactions
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

  // Activity Demand Report - What activities are trending
  app.get("/api/admin/reports/activity-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { activityBookingAnalytics } = await import("@shared/schema");
      
      // Activity types by popularity
      const byActivityType = await db.select({
        activityType: activityBookingAnalytics.activityType,
        views: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'viewed' then 1 else 0 end)::int`,
        inquiries: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'inquired' then 1 else 0 end)::int`,
        bookings: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end)::int`,
        revenue: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then ${activityBookingAnalytics.price} else 0 end)::numeric(12,2)`,
        avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
        avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
      })
      .from(activityBookingAnalytics)
      .groupBy(activityBookingAnalytics.activityType)
      .orderBy(sql`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end) desc`);

      // Activities by destination
      const byDestination = await db.select({
        destination: activityBookingAnalytics.destination,
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Activities by trip type
      const byTripType = await db.select({
        tripType: activityBookingAnalytics.tripType,
        activityType: activityBookingAnalytics.activityType,
        count: sql<number>`count(*)::int`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Top origin countries for activities
      const byOriginCountry = await db.select({
        originCountry: activityBookingAnalytics.travelerOriginCountry,
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.travelerOriginCountry, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      res.json({
        reportType: "activity_demand",
        generatedAt: new Date().toISOString(),
        byActivityType: byActivityType.map(a => ({
          type: a.activityType,
          views: a.views || 0,
          inquiries: a.inquiries || 0,
          bookings: a.bookings || 0,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
          avgPrice: `$${Number(a.avgPrice || 0).toFixed(0)}`,
          avgGroupSize: a.avgGroupSize || 0,
          conversionRate: a.views > 0 ? `${((a.bookings / a.views) * 100).toFixed(1)}%` : "0%",
        })),
        byDestination,
        byTripType,
        byOriginCountry: byOriginCountry.map(o => ({
          country: o.originCountry || "Unknown",
          activityType: o.activityType,
          bookings: o.bookings,
          avgSpend: `$${Number(o.avgSpend || 0).toFixed(0)}`,
        })),
        insights: {
          topActivities: byActivityType.slice(0, 5).map(a => a.activityType),
          highestRevenue: byActivityType.sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 3).map(a => a.activityType),
          highestConversion: byActivityType.filter(a => a.views > 10).sort((a, b) => (b.bookings / b.views) - (a.bookings / a.views)).slice(0, 3).map(a => a.activityType),
        }
      });
    } catch (err) {
      console.error("Activity demand report error:", err);
      res.status(500).json({ message: "Failed to generate activity report" });
    }
  });

  // Activity trends by category (for selling to specific industries)
  app.get("/api/admin/reports/activity-trends/:activityType", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const activityType = req.params.activityType;
      const { activityBookingAnalytics } = await import("@shared/schema");
      
      // Detailed breakdown for specific activity type
      const destinations = await db.select({
        destination: activityBookingAnalytics.destination,
        country: activityBookingAnalytics.country,
        bookings: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
        avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.country)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      const travelerProfiles = await db.select({
        tripType: activityBookingAnalytics.tripType,
        originCountry: activityBookingAnalytics.travelerOriginCountry,
        count: sql<number>`count(*)::int`,
        avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
        avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.travelerOriginCountry)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      res.json({
        reportType: `activity_trends_${activityType}`,
        activityType,
        generatedAt: new Date().toISOString(),
        topDestinations: destinations,
        travelerProfiles,
        summary: {
          totalBookings: destinations.reduce((sum, d) => sum + d.bookings, 0),
          totalRevenue: `$${destinations.reduce((sum, d) => sum + Number(d.revenue || 0), 0).toLocaleString()}`,
          topMarket: destinations[0]?.destination || "N/A",
        }
      });
    } catch (err) {
      console.error("Activity trends report error:", err);
      res.status(500).json({ message: "Failed to generate activity trends" });
    }
  });


  // Track enhanced trip analytics
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

  // Destination Benchmark Report (premium product for tourism boards)
  app.get("/api/admin/reports/destination-benchmark/:destination", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const destination = decodeURIComponent(req.params.destination);
      const { tripAnalyticsEnhanced, activityBookingAnalytics } = await import("@shared/schema");
      
      // Aggregate destination metrics
      const metrics = await db.select({
        totalTrips: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
        avgLengthOfStay: sql<number>`avg(${tripAnalyticsEnhanced.lengthOfStay})::numeric(5,1)`,
        avgLeadTime: sql<number>`avg(${tripAnalyticsEnhanced.leadTimeDays})::numeric(5,1)`,
        avgPartySize: sql<number>`avg(${tripAnalyticsEnhanced.partySize})::numeric(5,1)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination),
        eq(tripAnalyticsEnhanced.destinationRegion, destination)
      ));

      // Source markets
      const sourceMarkets = await db.select({
        country: tripAnalyticsEnhanced.originCountry,
        count: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.originCountry)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Trip purposes
      const tripPurposes = await db.select({
        purpose: tripAnalyticsEnhanced.tripPurpose,
        count: sql<number>`count(*)::int`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.tripPurpose)
      .orderBy(sql`count(*) desc`);

      // Party compositions
      const partyTypes = await db.select({
        composition: tripAnalyticsEnhanced.partyComposition,
        count: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.partyComposition)
      .orderBy(sql`count(*) desc`);

      // Top activities
      const activities = await db.select({
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        or(
          eq(activityBookingAnalytics.destination, destination),
          eq(activityBookingAnalytics.country, destination),
          eq(activityBookingAnalytics.city, destination)
        ),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Seasonality (by month)
      const seasonality = await db.select({
        month: sql<string>`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`,
        count: sql<number>`count(*)::int`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(sql`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`)
      .orderBy(sql`count(*) desc`);

      res.json({
        reportType: "destination_benchmark",
        destination,
        generatedAt: new Date().toISOString(),
        overview: metrics[0] || {},
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          visitors: s.count,
          avgSpend: `$${Number(s.avgSpend || 0).toLocaleString()}`,
          share: metrics[0]?.totalTrips ? `${((s.count / metrics[0].totalTrips) * 100).toFixed(1)}%` : "0%",
        })),
        tripPurposes: tripPurposes.map(t => ({
          purpose: t.purpose || "Unknown",
          count: t.count,
        })),
        partyTypes: partyTypes.map(p => ({
          type: p.composition || "Unknown",
          count: p.count,
          avgSpend: `$${Number(p.avgSpend || 0).toLocaleString()}`,
        })),
        topActivities: activities.map(a => ({
          activity: a.activityType,
          bookings: a.bookings,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
        })),
        seasonality: seasonality.map(s => ({
          month: s.month?.trim() || "Unknown",
          bookings: s.count,
        })),
        insights: {
          topSourceMarket: sourceMarkets[0]?.country || "N/A",
          primaryTripPurpose: tripPurposes[0]?.purpose || "N/A",
          mostPopularActivity: activities[0]?.activityType || "N/A",
          peakSeason: seasonality[0]?.month?.trim() || "N/A",
        }
      });
    } catch (err) {
      console.error("Destination benchmark error:", err);
      res.status(500).json({ message: "Failed to generate benchmark report" });
    }
  });


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
  app.post("/api/trips/:tripId/analytics/infer", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const tripId = req.params.tripId;
      
      // Verify ownership
      const trip = await storage.getTrip(tripId);
      if (!trip || trip.userId !== userId) {
        return res.status(404).json({ message: "Trip not found" });
      }

      await inferTripAnalytics(tripId, userId);
      res.json({ success: true, message: "Analytics captured" });
    } catch (err) {
      console.error("Infer analytics error:", err);
      res.status(500).json({ message: "Failed to capture analytics" });
    }
  });

  // Track searches automatically (what destinations were considered)
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

  // Auto-capture accommodation preference from hotel searches/bookings
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

  // === Admin Activity Feed ===

  app.get("/api/admin/activity/recent", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      const rows = await db
        .select({
          id: accessAuditLogs.id,
          actorId: accessAuditLogs.actorId,
          actorRole: accessAuditLogs.actorRole,
          action: accessAuditLogs.action,
          resourceType: accessAuditLogs.resourceType,
          resourceId: accessAuditLogs.resourceId,
          ipAddress: accessAuditLogs.ipAddress,
          createdAt: accessAuditLogs.createdAt,
          actorEmail: users.email,
          actorFirstName: users.firstName,
          actorLastName: users.lastName,
        })
        .from(accessAuditLogs)
        .leftJoin(users, eq(accessAuditLogs.actorId, users.id))
        .orderBy(desc(accessAuditLogs.createdAt))
        .limit(limit);

      res.json(rows);
    } catch (err) {
      console.error("Get activity error:", err);
      res.status(500).json({ message: "Failed to fetch activity feed" });
    }
  });

  // === Admin Flagged Content Queue ===

  app.get("/api/admin/flagged-content", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const rows = await db
        .select({
          id: contentRegistry.id,
          trackingNumber: contentRegistry.trackingNumber,
          contentType: contentRegistry.contentType,
          contentId: contentRegistry.contentId,
          title: contentRegistry.title,
          status: contentRegistry.status,
          flagReason: contentRegistry.flagReason,
          flaggedAt: contentRegistry.flaggedAt,
          ownerId: contentRegistry.ownerId,
          ownerEmail: users.email,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(contentRegistry)
        .leftJoin(users, eq(contentRegistry.ownerId, users.id))
        .where(eq(contentRegistry.status, "flagged"))
        .orderBy(desc(contentRegistry.flaggedAt))
        .limit(limit);

      res.json(rows);
    } catch (err) {
      console.error("Get flagged content error:", err);
      res.status(500).json({ message: "Failed to fetch flagged content" });
    }
  });

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

  app.get("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const rows = await db.select().from(platformSettings);
      const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      res.json(settings);
    } catch (err) {
      console.error("Get settings error:", err);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const dbUser = await storage.getUser(userId);
      if (!dbUser || dbUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const updates = req.body as Record<string, string>;
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        return res.status(400).json({ message: "Invalid settings payload" });
      }

      const BOOLEAN_KEYS = new Set([
        "ai_recommendations_enabled", "new_registrations_enabled",
        "travelpulse_enabled", "credit_system_enabled", "affiliate_bookings_enabled",
      ]);
      const COMMISSION_KEYS = new Set([
        "expert_commission_min", "expert_commission_max",
        "provider_commission_min", "provider_commission_max",
      ]);
      const ALLOWED_KEYS = new Set([
        ...Object.keys(DEFAULT_SETTINGS),
      ]);

      const errors: string[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (!ALLOWED_KEYS.has(key)) {
          errors.push(`Unknown setting key: ${key}`);
          continue;
        }
        const strValue = String(value);
        if (BOOLEAN_KEYS.has(key)) {
          if (strValue !== "true" && strValue !== "false") {
            errors.push(`Setting '${key}' must be 'true' or 'false'`);
            continue;
          }
        } else if (COMMISSION_KEYS.has(key)) {
          const num = parseFloat(strValue);
          if (!Number.isFinite(num) || num < 0 || num > 100) {
            errors.push(`Setting '${key}' must be a number between 0 and 100`);
            continue;
          }
        }
        await db.insert(platformSettings)
          .values({ key, value: strValue, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: { value: strValue, updatedAt: new Date() },
          });
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: "Validation errors", errors });
      }

      res.json({ success: true, message: "Settings saved successfully" });
    } catch (err) {
      console.error("Save settings error:", err);
      res.status(500).json({ message: "Failed to save settings" });
    }
  });

}
