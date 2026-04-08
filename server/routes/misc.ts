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

  app.get("/api/service-categories/:categoryId/subcategories", async (req, res) => {
    const subcategories = await storage.getServiceSubcategories(req.params.categoryId);
    res.json(subcategories);
  });

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

  app.get("/api/custom-venues", async (req, res) => {
    const { userId, tripId, experienceType } = req.query;
    const venues = await storage.getCustomVenues(
      userId as string | undefined,
      tripId as string | undefined,
      experienceType as string | undefined
    );
    res.json(venues);
  });

  app.get("/api/custom-venues/:id", async (req, res) => {
    const venue = await storage.getCustomVenue(req.params.id);
    if (!venue) {
      return res.status(404).json({ message: "Custom venue not found" });
    }
    res.json(venue);
  });

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

  app.delete("/api/custom-venues/:id", isAuthenticated, async (req, res) => {
    await storage.deleteCustomVenue(req.params.id);
    res.status(204).send();
  });

  app.get("/api/experience-types", async (req, res) => {
    const types = await storage.getExperienceTypes();
    // Filter out legacy slugs that have been aliased
    const legacySlugs = Object.keys(slugAliases);
    const filteredTypes = types.filter(t => !legacySlugs.includes(t.slug));
    res.json(filteredTypes);
  });

  app.get("/api/experience-types/:slug", async (req, res) => {
    const resolvedSlug = resolveSlug(req.params.slug);
    const type = await storage.getExperienceTypeBySlug(resolvedSlug);
    if (!type) {
      return res.status(404).json({ message: "Experience type not found" });
    }
    res.json(type);
  });

  app.get("/api/experience-types/:id/steps", async (req, res) => {
    const steps = await storage.getExperienceTemplateSteps(req.params.id);
    res.json(steps);
  });

  app.get("/api/experience-types/:id/tabs", async (req, res) => {
    try {
      const tabs = await storage.getExperienceTemplateTabs(req.params.id);
      res.json(tabs);
    } catch (error) {
      console.error("Error fetching template tabs:", error);
      res.status(500).json({ message: "Failed to fetch template tabs" });
    }
  });

  app.get("/api/experience-types/:id/universal-filters", async (req, res) => {
    try {
      const filters = await storage.getExperienceUniversalFilters(req.params.id);
      res.json(filters);
    } catch (error) {
      console.error("Error fetching universal filters:", error);
      res.status(500).json({ message: "Failed to fetch universal filters" });
    }
  });

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

  app.get("/api/catalog/destinations", async (req, res) => {
    try {
      const destinations = await experienceCatalogService.getDestinations();
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching destinations:", error);
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  app.get("/api/destinations", async (req, res) => {
    try {
      const destinations = await experienceCatalogService.getDestinations();
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching destinations:", error);
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  app.get("/api/user-experiences", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experiences = await storage.getUserExperiences(userId);
    res.json(experiences);
  });

  app.get("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const items = await storage.getUserExperienceItems(req.params.id);
    res.json({ ...experience, items });
  });

  app.post("/api/user-experiences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const experience = await storage.createUserExperience({ ...req.body, userId });
      res.status(201).json(experience);
    } catch (err) {
      res.status(500).json({ message: "Failed to create experience" });
    }
  });

  app.patch("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const updated = await storage.updateUserExperience(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    await storage.deleteUserExperience(req.params.id);
    res.status(204).send();
  });

  app.post("/api/user-experiences/:id/items", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const item = await storage.addUserExperienceItem({ ...req.body, userExperienceId: req.params.id });
    res.status(201).json(item);
  });

  app.patch("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    const updated = await storage.updateUserExperienceItem(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json(updated);
  });

  app.delete("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    await storage.removeUserExperienceItem(req.params.id);
    res.status(204).send();
  });

  app.get("/api/faqs", async (req, res) => {
    const category = req.query.category as string | undefined;
    const faqsList = await storage.getFAQs(category);
    res.json(faqsList);
  });

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

  app.delete("/api/faqs/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteFAQ(req.params.id);
    res.status(204).send();
  });

  app.get("/api/wallet", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getOrCreateWallet(userId);
    res.json(wallet);
  });

  app.get("/api/credits/balance", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getOrCreateWallet(userId);
    const balance = wallet.credits ?? 0;
    const total = Math.max(balance, 250);
    res.json({ balance, total });
  });

  app.get("/api/wallet/transactions", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getWallet(userId);
    if (!wallet) {
      return res.json([]);
    }
    const transactions = await storage.getCreditTransactions(wallet.id);
    res.json(transactions);
  });

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

      const { getBaseUrl } = await import("../services/stripe.service");
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

  app.get("/api/service-templates", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const templates = await storage.getServiceTemplates(categoryId);
    res.json(templates);
  });

  app.get("/api/service-templates/:id", async (req, res) => {
    const template = await storage.getServiceTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  });

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

  app.get("/api/revenue-splits", async (req, res) => {
    try {
      const splits = await storage.getRevenueSplits();
      res.json(splits);
    } catch (err) {
      console.error("Error fetching revenue splits:", err);
      res.status(500).json({ message: "Failed to fetch revenue splits" });
    }
  });

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

  app.get("/api/services/:id", async (req, res) => {
    const service = await storage.getProviderServiceById(req.params.id);
    if (!service || service.status !== "active") {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json(service);
  });

  app.get("/api/services", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const location = req.query.location as string | undefined;
    const services = await storage.getAllActiveServices(categoryId, location);
    res.json(services);
  });

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

  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const count = await storage.getUnreadCount(userId);
    res.json({ count });
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const notification = await storage.markAsRead(req.params.id);
    if (notification && notification.userId !== userId) {
      return res.status(403).json({ message: "Not your notification" });
    }
    res.json(notification);
  });

  app.post("/api/notifications/mark-all-read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.markAllAsRead(userId);
    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    await storage.deleteNotification(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/services/:serviceId/reviews", async (req, res) => {
    const reviews = await storage.getServiceReviews(req.params.serviceId);
    res.json(reviews);
  });

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

  app.get("/api/viator/destinations", isAuthenticated, async (req, res) => {
    try {
      const destinations = await viatorService.getDestinations();
      res.json(destinations);
    } catch (error: any) {
      console.error('Viator destinations error:', error);
      res.status(500).json({ message: error.message || "Failed to get destinations" });
    }
  });

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

  app.get("/api/cache/categories", isAuthenticated, async (req, res) => {
    try {
      const categories = await cacheService.getAvailableCategories();
      res.json(categories);
    } catch (error: any) {
      console.error('Get categories error:', error);
      res.status(500).json({ message: error.message || "Failed to get categories" });
    }
  });

  app.get("/api/cache/status", isAuthenticated, async (req, res) => {
    try {
      const status = await cacheSchedulerService.getCacheFreshnessStatus();
      res.json(status);
    } catch (error: any) {
      console.error('Get cache status error:', error);
      res.status(500).json({ message: error.message || "Failed to get cache status" });
    }
  });

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

  app.get("/api/grok/health", async (req, res) => {
    try {
      const health = await aiOrchestrator.healthCheck();
      res.json({ status: "ok", providers: health });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
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
      const { grokService } = await import("../services/grok.service");
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
      const { generateOptimizedItineraries } = await import('../itinerary-optimizer');

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

      const { tripOptimizationService } = await import("../services/trip-optimization.service");
      
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

      const { serpService } = await import("../services/serp.service");
      
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

      const { serpService } = await import("../services/serp.service");
      const userId = (req.user as any)?.id || null;
      
      await serpService.trackClick(providerId, userId, metadata);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error tracking SERP click:", error);
      res.status(500).json({ message: "Failed to track click", error: error.message });
    }
  });

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

      const { serpService } = await import("../services/serp.service");
      
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

  app.get("/api/serp/partnerships", isAuthenticated, async (req, res) => {
    try {
      const { limit = "20", byMarket } = req.query;
      
      const { serpService } = await import("../services/serp.service");
      
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

  app.get("/api/fever/cities", async (_req, res) => {
    try {
      const cities = feverService.getSupportedCities();
      res.json({ cities, count: cities.length });
    } catch (error) {
      console.error("[Fever] Cities list error:", error);
      res.status(500).json({ error: "Failed to get cities list" });
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

      const activities: import("../services/transport-leg-calculator").ActivityLocation[] = [];
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

  app.get("/api/logistics/presets/:templateSlug", async (req, res) => {
    try {
      const { getPresetsForTemplate } = await import('../services/logistics-presets.service');
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

      const { generatePresetsForTrip } = await import('../services/logistics-presets.service');
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

      const { detectAnchorImpacts } = await import('../services/logistics-presets.service');
      const impacts = await detectAnchorImpacts(req.params.tripId, req.params.anchorId);
      res.json({ impacts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to detect impacts", error: error.message });
    }
  });

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

      const { generateAnchorSuggestions } = await import('../services/anchor-suggestion.service');
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

      const { analyzeAnchorOptimization } = await import('../services/anchor-suggestion.service');
      const tips = await analyzeAnchorOptimization(req.params.tripId);
      res.json({ tips });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze anchors", error: error.message });
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

  app.post("/api/coordination/propagate/:tripId/:anchorId", isAuthenticated, async (req, res) => {
    try {
      const { propagateAnchorChange } = await import('../services/constraint-propagation.service');
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
      const { findMatchingProviders } = await import('../services/provider-matching.service');
      const result = await findMatchingProviders(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to match providers", error: error.message });
    }
  });

  app.post("/api/coordination/booking-context/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildBookingContext } = await import('../services/provider-matching.service');
      const { date, startTime, endTime } = req.body;
      const context = await buildBookingContext(req.params.tripId, date, startTime, endTime);
      res.json(context);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build context", error: error.message });
    }
  });

  app.get("/api/coordination/wedding-timeline/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildWeddingTimeline } = await import('../services/wedding-coordination.service');
      const timeline = await buildWeddingTimeline(req.params.tripId);
      res.json(timeline);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build wedding timeline", error: error.message });
    }
  });

  app.get("/api/coordination/wedding-gaps/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getWeddingVendorGaps } = await import('../services/wedding-coordination.service');
      const gaps = await getWeddingVendorGaps(req.params.tripId);
      res.json({ gaps });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze vendor gaps", error: error.message });
    }
  });

  app.get("/api/coordination/corporate-summary/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getCorporateLogisticsSummary } = await import('../services/corporate-coordination.service');
      const summary = await getCorporateLogisticsSummary(req.params.tripId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load corporate summary", error: error.message });
    }
  });

  app.post("/api/coordination/staggered-arrivals/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { generateStaggeredArrivalPlan } = await import('../services/corporate-coordination.service');
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
      const { generateSplitActivityPlan } = await import('../services/corporate-coordination.service');
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

  app.get("/api/trips/:id/itinerary-token", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
      const tripId = req.params.id;

      // Find the latest comparison with a selected variant for this trip
      const [comp] = await db
        .select({ id: itineraryComparisons.id, selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)))
        .orderBy(desc(itineraryComparisons.createdAt))
        .limit(1);

      if (!comp?.selectedVariantId) return res.json({ shareToken: null });

      // Check for existing share by this owner for this variant
      const [existing] = await db
        .select({ shareToken: sharedItineraries.shareToken })
        .from(sharedItineraries)
        .where(and(
          eq(sharedItineraries.variantId, comp.selectedVariantId),
          eq(sharedItineraries.sharedByUserId, userId),
        ))
        .limit(1);

      if (existing) return res.json({ shareToken: existing.shareToken });

      // Create a new self-share
      const shareToken = crypto.randomUUID();
      await db.insert(sharedItineraries).values({
        shareToken,
        variantId: comp.selectedVariantId,
        sharedByUserId: userId,
        sharedWithUserId: null,
        permissions: "view",
        transportPreferences: null,
      });

      return res.json({ shareToken });
    } catch (err: any) {
      console.error("Itinerary token error:", err);
      res.status(500).json({ error: "Failed to get itinerary token" });
    }
  });

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

  app.patch("/api/trips/:tripId/transport-mode", async (req, res) => {
    const VALID_TIMING = ["in_advance", "real_time"];
    const VALID_SOURCE = ["traveloure", "external"];
    try {
      const { tripId } = req.params;
      const { selectedMode, bookingTiming, providerSource } = req.body;
      const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;

      if (!selectedMode) return res.status(400).json({ error: "selectedMode is required" });
      if (bookingTiming !== undefined && bookingTiming !== null && !VALID_TIMING.includes(bookingTiming)) {
        return res.status(400).json({ error: `bookingTiming must be one of: ${VALID_TIMING.join(", ")}` });
      }
      if (providerSource !== undefined && providerSource !== null && !VALID_SOURCE.includes(providerSource)) {
        return res.status(400).json({ error: `providerSource must be one of: ${VALID_SOURCE.join(", ")}` });
      }
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      // Resolve selectedVariantId for this trip
      const [comparison] = await db
        .select({ id: itineraryComparisons.id, userId: itineraryComparisons.userId, selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.tripId, tripId));

      if (!comparison) return res.status(404).json({ error: "Trip not found" });
      if (comparison.userId !== userId) return res.status(403).json({ error: "Not authorized to update this trip" });
      if (!comparison.selectedVariantId) return res.status(422).json({ error: "Trip has no selected variant" });

      const bulkSet: Record<string, any> = {
        userSelectedMode: selectedMode,
        updatedAt: new Date(),
      };
      if (bookingTiming !== undefined) bulkSet.bookingTiming = bookingTiming;
      if (providerSource !== undefined) bulkSet.providerSource = providerSource;

      await db
        .update(transportLegs)
        .set(bulkSet)
        .where(eq(transportLegs.variantId, comparison.selectedVariantId));

      const updatedLegs = await db
        .select({ id: transportLegs.id, userSelectedMode: transportLegs.userSelectedMode })
        .from(transportLegs)
        .where(eq(transportLegs.variantId, comparison.selectedVariantId));

      res.json({ updated: updatedLegs.length, selectedMode, bookingTiming: bookingTiming ?? null, providerSource: providerSource ?? null });
    } catch (err: any) {
      console.error("Bulk trip transport mode error:", err);
      res.status(500).json({ error: "Failed to update transport modes" });
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
