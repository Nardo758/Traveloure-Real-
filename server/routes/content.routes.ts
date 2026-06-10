import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { geocodeAddress } from "../utils/geocode";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { 
  users, contactSubmissions, helpGuideTrips, touristPlaceResults, touristPlacesSearches, 
  aiBlueprints, vendors, insertVendorSchema,
  insertLocalExpertFormSchema, insertServiceProviderFormSchema,
  insertProviderServiceSchema, insertServiceCategorySchema,
  insertServiceSubcategorySchema, insertFaqSchema,
  insertServiceTemplateSchema, insertServiceBookingSchema, insertServiceReviewSchema,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  userExperienceItems, userExperiences, providerServices, cartItems, trips,
  serviceBookings, serviceReviews, reviewModerationLogs, notifications, wallets, creditTransactions, serviceProviderForms,
  insertCustomVenueSchema, insertGeneratedItinerarySchema,
  insertTemporalAnchorSchema, insertDayBoundarySchema, insertEnergyTrackingSchema,
  temporalAnchors, itineraryItems, generatedItineraries,
  userAndExpertChats, insertUserAndExpertChatSchema,
  expertPayouts, providerPayouts,
  eaClientRelationships,
  eaExecutives, insertEaExecutiveSchema,
  eaEvents, insertEaEventSchema,
  eaTravelArrangements, insertEaTravelArrangementSchema,
  eaGifts, insertEaGiftSchema,
  eaSavedVenues, insertEaSavedVenueSchema,
  eaCommunications, insertEaCommunicationSchema,
  eaAiTasks, insertEaAiTaskSchema,
  userAndExpertContracts,
  localKnowledgeNuggets, insertLocalKnowledgeNuggetSchema,
  contentPlacementRules,
  type InsertContentPlacementRule,
} from "@shared/schema";
import {
  TAB_CONTENT_TYPE_MAP,
  TAB_AFFILIATE_CATEGORIES,
  SURFACE_DEFAULT_CONTENT_TYPES,
  SURFACE_DEFAULT_AFFILIATE_CATEGORIES,
  SURFACE_SLUGS,
} from "@shared/content-surface-map";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "../itinerary-optimizer";
import { amadeusService } from "../services/amadeus.service";
import { viatorService } from "../services/viator.service";
import { cacheService } from "../services/cache.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { claudeService } from "../services/claude.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "../services/routes.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService } from "../services/grok.service";
import { feverService } from "../services/fever.service";
import { feverCacheService } from "../services/fever-cache.service";
import { expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow, serviceCategories, visaRequirementsCache, expertServiceOfferings, expertServiceCategories, cityNeighborhoods, travelPulseHiddenGems } from "@shared/schema";
import { coordinationService } from "../services/coordination.service";
import { vendorManagementService } from "../services/vendor-management.service";
import { budgetService } from "../services/budget.service";
import { itineraryIntelligenceService } from "../services/itinerary-intelligence.service";
import { emergencyService } from "../services/emergency.service";
import { experienceCatalogService } from "../services/experience-catalog.service";
import { opportunityEngineService } from "../services/opportunity-engine.service";
import { aiUsageService } from "../services/ai-usage.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "../utils/data-sanitizer";
import { transportLegs, sharedItineraries, mapsExportCache, expertUpdatedItineraries, affiliateProducts, contentRegistry } from "@shared/schema";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "../services/transport-leg-calculator";
import { buildGoogleNavUrl, buildAppleNavUrl } from "../services/maps-url-builder";
import { generateKml } from "../services/kml-generator";
import { generateGpx } from "../services/gpx-generator";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "../infrastructure";
import { 
  insertTripParticipantSchema, 
  insertVendorContractSchema, 
  insertTripTransactionSchema,
  insertItineraryItemSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema,
  insertProviderAvailabilityScheduleSchema,
  insertProviderBlackoutDateSchema,
  tripExpertAdvisors,
} from "@shared/schema";
import {
  EXPERT_SHARE_RATE,
  PLATFORM_FEE_RATE,
  resolveCommissionRates,
  type CommissionRates,
} from "../services/commission";
import instagramRoutes from "./instagram";
import bookingsRoutes from "./bookings";
import bookingActionsRoutes from "./booking-actions";
import messagesRouter from "./messages";
import myItineraryRoutes from "./my-itinerary.routes";
import transportHubRoutes from "./transport-hub.routes";
import plancardRoutes from "./plancard.routes";
import identityRoutes from "./identity.routes";
import webhooksRoutes from "./webhooks.routes";
import { affiliateClicks } from "@shared/schema";
import { travelPulseService } from "../services/travelpulse.service";
import { travelPulseScheduler } from "../services/travelpulse-scheduler.service";
import { trackAnthropicResponse } from "../services/ai-cost-tracker";

const router = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    })
    .trim();
}

function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      (result as Record<string, any>)[key] = sanitizeInput(result[key]);
    }
  }
  return result;
}

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

function mapFeverCategoryToEventType(category: string): string {
  const categoryMap: Record<string, string> = {
    'experiences': 'cultural', 'concerts': 'cultural', 'theater': 'cultural',
    'exhibitions': 'cultural', 'festivals': 'cultural', 'nightlife': 'nightlife',
    'food-drink': 'culinary', 'sports': 'sports', 'wellness': 'wellness',
    'tours': 'cultural', 'classes': 'cultural', 'family': 'family',
  };
  return categoryMap[category] || 'other';
}

function serviceCategorySlugToFeeCategory(slug: string | null | undefined): string {
  if (!slug) return "default";
  if (/transport|logistics|shuttle|transfer/.test(slug)) return "transportation";
  if (/lodg|accommodation|hotel|hostel|resort/.test(slug)) return "accommodation";
  if (/dining|food|culinary|restaurant/.test(slug)) return "dining";
  if (/tour|experience|activit|adventure|outdoor/.test(slug)) return "activities";
  if (/flight|air|airline/.test(slug)) return "flights";
  if (/car.?rental|rental|vehicle/.test(slug)) return "car_rental";
  if (/insurance|safety|security/.test(slug)) return "insurance";
  return "default";
}


function mapFeverCategoryToEventTypeLocal(category: string): string {
  return mapFeverCategoryToEventType(category);
}

router.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

router.get("/api/status", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ─── Phase 7: Offering type catalogs (public; read-only) ─────────────────────
  // Powers /earn — the traveler/onboarding page that lists what providers and
  // experts can offer. Phase 2 seeded these tables (75 provider + 39 expert rows).
  // No auth: pre-signup discovery surface.

  // GET /api/offering-types/services?market=kyoto
  // Returns active service_offering_types. Optional ?market filter intersects
  // marketScoped (universal rows always included).
  router.get("/api/offering-types/services", async (req, res) => {
    try {
      const market = typeof req.query.market === "string" ? req.query.market.trim() : null;
      const result = await db.execute(sql`
        SELECT
          offering_type_key,
          category_key,
          display_name,
          tagline,
          is_surprising,
          market_scoped,
          sort_order
        FROM service_offering_types
        WHERE is_active = true
          AND (
            ${market}::text IS NULL
            OR market_scoped IS NULL
            OR ${market}::text = ANY(market_scoped)
          )
        ORDER BY is_surprising DESC, sort_order ASC, display_name ASC
      `);
      // 5-min cache — catalog data drifts slowly; admin edits show up promptly.
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(result.rows ?? []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/offering-types/experts?tier=advisory
  // Returns active expert_offering_types. Optional ?tier filter.
  router.get("/api/offering-types/experts", async (req, res) => {
    try {
      const tier = typeof req.query.tier === "string" ? req.query.tier.trim() : null;
      const result = await db.execute(sql`
        SELECT
          offering_type_key,
          service_tier,
          display_name,
          tagline,
          delivery_formats,
          is_surprising,
          sort_order
        FROM expert_offering_types
        WHERE is_active = true
          AND (${tier}::text IS NULL OR service_tier = ${tier}::text)
        ORDER BY is_surprising DESC, sort_order ASC, display_name ASC
      `);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(result.rows ?? []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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


router.post("/api/contact", async (req, res) => {
    try {
      const input = contactSchema.parse(req.body);

      // Persist the submission
      const [submission] = await db.insert(contactSubmissions).values({
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        subject: input.subject,
        message: input.message,
        reason: (input as any).reason || null,
        preferredContactMethod: input.preferredContactMethod || null,
        source: (input as any).source || "contact_page",
        ipAddress: (req.ip || req.socket.remoteAddress || "").toString().slice(0, 45),
        userAgent: (req.headers["user-agent"] || "").toString().slice(0, 500),
      }).returning();

      // Notify all admins (fire & forget)
      try {
        const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
        for (const admin of admins) {
          try {
            await storage.createNotification({
              userId: admin.id,
              type: "contact_submission",
              title: `New ${(input as any).reason || "Contact"} Inquiry`,
              message: `${input.name} (${input.email}): ${input.subject}`,
              relatedId: submission.id,
              relatedType: "contact_submission",
              data: {
                submissionId: submission.id,
                name: input.name,
                email: input.email,
                subject: input.subject,
                reason: (input as any).reason,
              },
            });
          } catch (notifErr) {
            console.error(`Failed to notify admin ${admin.id}:`, notifErr);
          }
        }
      } catch (notifyErr) {
        console.error("Failed to notify admins of contact submission:", notifyErr);
      }

      res.status(200).json({
        success: true,
        submissionId: submission.id,
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
  
  // Start a chat with an expert

router.post("/api/chat/start", isAuthenticated, async (req, res) => {
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
router.use("/api/instagram", instagramRoutes);

  // Bookings API routes - Stripe payments, availability, pricing
router.use("/api/bookings", bookingsRoutes);

  // Booking Actions API routes - Expert Review, Save, Share
router.use("/api", bookingActionsRoutes);
router.use("/api/messages", messagesRouter);

  // My Itinerary routes - final itinerary view with smart sequencing
router.use(myItineraryRoutes);

  // Transport Hub routes - booking interface for transport legs
router.use(transportHubRoutes);

  // PlanCard routes - change tracking, comments, structured day data
router.use(plancardRoutes);

  // Identity verification routes (Stripe Identity + Persona KYB)
router.use("/api/identity", identityRoutes);
  // Webhook handlers for Stripe Identity and Persona — mounted at /api/webhooks
router.use("/api/webhooks", webhooksRoutes);

  // Trips Routes

router.post("/api/generated-itineraries", isAuthenticated, async (req, res) => {
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
    tripId: z.string().optional(),
    notes: z.string().optional().default(""),
    serviceId: z.string().optional(),
    bookingMetadata: z.record(z.any()).optional(),
  });


router.get("/api/generated-itineraries/:tripId", isAuthenticated, async (req, res) => {
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

router.post("/api/ai/generate-blueprint", isAuthenticated, async (req, res) => {
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
      trackAnthropicResponse(completion, { sourceType: "ai_traveler" });

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

router.post("/api/ai/chat", isAuthenticated, async (req, res) => {
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
      trackAnthropicResponse(completion, { sourceType: "ai_chat" });

      const response = completion.content[0]?.type === "text" ? completion.content[0].text : "I'm sorry, I couldn't process your request.";
      res.json({ response });
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ message: "Failed to process chat request" });
    }
  });

  // Experience AI Optimization endpoint
  // Restricted to admin/expert only (CON-A.P1): full LLM optimization is delivered to
  // travelers via the gated paid path (/api/optimization-payments → /confirm), not here.

router.post("/api/ai/optimize-experience", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || (user.role !== "admin" && user.role !== "expert")) {
        return res.status(403).json({ message: "Admin or expert access required" });
      }
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
      trackAnthropicResponse(completion, { sourceType: "ai_optimization" });

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

router.get("/api/city-neighborhoods", async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(cityNeighborhoods)
        .orderBy(cityNeighborhoods.city, cityNeighborhoods.name);
      res.json(rows);
    } catch (err) {
      console.error("Error fetching city neighborhoods:", err);
      res.status(500).json({ message: "Failed to fetch neighborhoods" });
    }
  });

  // === Location View aggregation orchestrator (v2 spec §3, §5, §10) ===
  // Thin routing layer that fans out to existing TravelPulse / enriched /
  // recommendation / events services and returns one shaped payload with
  // per-section { data, error } envelopes for graceful degradation.

router.get("/api/discover/location/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const country = typeof req.query.country === "string" ? req.query.country : null;
      const month = req.query.month ? Number(req.query.month) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const { locationViewService } = await import("../services/location-view.service");
      const payload = await locationViewService.getLocationView(city, country, { month, year, limit });
      res.set("Cache-Control", "public, max-age=300");
      res.json(payload);
    } catch (err: any) {
      console.error("Error building location view:", err);
      res.status(500).json({ message: "Failed to build location view", error: err?.message });
    }
  });

  // === Service Categories Routes ===

  // Get all categories

router.get("/api/service-categories", async (req, res) => {
    const categories = await storage.getServiceCategories();
    res.json(categories);
  });


router.get("/api/service-categories/provider-counts", async (_req, res) => {
    try {
      const counts = await db
        .select({
          categoryId: sql<string | null>`category_id`,
          count: sql<number>`count(*)::int`,
        })
        .from(serviceProviderForms)
        .where(sql`category_id is not null`)
        .groupBy(sql`category_id`);
      const map: Record<string, number> = {};
      counts.forEach(c => { if (c.categoryId) map[c.categoryId] = c.count; });
      res.json(map);
    } catch (error: any) {
      console.error("Failed to fetch provider counts:", error?.message || error);
      res.status(500).json({});
    }
  });

  // Create category (admin)

router.post("/api/service-categories", isAuthenticated, async (req, res) => {
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

router.get("/api/service-categories/:categoryId/subcategories", async (req, res) => {
    const subcategories = await storage.getServiceSubcategories(req.params.categoryId);
    res.json(subcategories);
  });

  // Create subcategory (admin)

router.post("/api/service-subcategories", isAuthenticated, async (req, res) => {
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

router.get("/api/custom-venues", async (req, res) => {
    const { userId, tripId, experienceType } = req.query;
    const venues = await storage.getCustomVenues(
      userId as string | undefined,
      tripId as string | undefined,
      experienceType as string | undefined
    );
    res.json(venues);
  });

  // Get single custom venue

router.get("/api/custom-venues/:id", async (req, res) => {
    const venue = await storage.getCustomVenue(req.params.id);
    if (!venue) {
      return res.status(404).json({ message: "Custom venue not found" });
    }
    res.json(venue);
  });

  // Create custom venue

router.post("/api/custom-venues", isAuthenticated, async (req, res) => {
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

router.patch("/api/custom-venues/:id", isAuthenticated, async (req, res) => {
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

router.delete("/api/custom-venues/:id", isAuthenticated, async (req, res) => {
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

router.get("/api/experience-types", async (req, res) => {
    const types = await storage.getExperienceTypes();
    // Filter out legacy slugs that have been aliased
    const legacySlugs = Object.keys(slugAliases);
    const filteredTypes = types.filter(t => !legacySlugs.includes(t.slug));
    res.json(filteredTypes);
  });

  // Get experience type by slug (with alias resolution)

router.get("/api/experience-types/:slug", async (req, res) => {
    const resolvedSlug = resolveSlug(req.params.slug);
    const type = await storage.getExperienceTypeBySlug(resolvedSlug);
    if (!type) {
      return res.status(404).json({ message: "Experience type not found" });
    }
    res.json(type);
  });

  // Get template steps for an experience type

router.get("/api/experience-types/:id/steps", async (req, res) => {
    const steps = await storage.getExperienceTemplateSteps(req.params.id);
    res.json(steps);
  });

  // Get template tabs with filters for an experience type

router.get("/api/experience-types/:id/tabs", async (req, res) => {
    try {
      const tabs = await storage.getExperienceTemplateTabs(req.params.id);
      res.json(tabs);
    } catch (error) {
      console.error("Error fetching template tabs:", error);
      res.status(500).json({ message: "Failed to fetch template tabs" });
    }
  });

  // Get universal filters for an experience type

router.get("/api/experience-types/:id/universal-filters", async (req, res) => {
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

router.get("/api/catalog/search", async (req, res) => {
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
        type,
        experienceTypeSlug,
        tabSlug
      } = req.query;

      const validContentTypes = ["activity", "event", "hotel", "flight", "poi", "transfer", "safety", "restaurant"] as const;
      type ContentType = typeof validContentTypes[number];
      const parsedTypes: ContentType[] | undefined = type
        ? (type as string).split(",").filter((t): t is ContentType => validContentTypes.includes(t as ContentType))
        : undefined;

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
        type: parsedTypes && parsedTypes.length > 0 ? parsedTypes : undefined,
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

router.get("/api/catalog/search-hybrid", async (req, res) => {
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

router.get("/api/catalog/templates/:slug", async (req, res) => {
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

router.get("/api/catalog/items/:type/:id", async (req, res) => {
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

router.get("/api/catalog/destinations", async (req, res) => {
    try {
      const destinations = await experienceCatalogService.getDestinations();
      res.json(destinations);
    } catch (error) {
      console.error("Error fetching destinations:", error);
      res.status(500).json({ message: "Failed to fetch destinations" });
    }
  });

  // === Travelpayouts Provider Routes ===

  // Flights: Aviasales

router.get("/api/catalog/flights", isAuthenticated, async (req, res) => {
    try {
      const { searchAviasalesFlights } = await import("../services/travelpayouts/aviasales.service");
      const { searchKiwiFlights } = await import("../services/travelpayouts/kiwi.service");
      const { origin, destination, departDate, returnDate, currency, limit, provider } = req.query;

      if (!origin) return res.status(400).json({ message: "origin is required" });

      const [aviasales, kiwi] = await Promise.allSettled([
        !provider || provider === "aviasales"
          ? searchAviasalesFlights({ origin: origin as string, destination: destination as string, departDate: departDate as string, returnDate: returnDate as string, currency: currency as string, limit: limit ? parseInt(limit as string) : 10 })
          : Promise.resolve([]),
        !provider || provider === "kiwi"
          ? searchKiwiFlights({ flyFrom: origin as string, flyTo: destination as string, dateFrom: departDate as string, currency: currency as string, limit: limit ? parseInt(limit as string) : 10 })
          : Promise.resolve([]),
      ]);

      const items = [
        ...(aviasales.status === "fulfilled" ? aviasales.value : []),
        ...(kiwi.status === "fulfilled" ? kiwi.value : []),
      ];

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("Flights search error:", error);
      res.status(500).json({ message: "Failed to search flights" });
    }
  });

  // Flights: Kiwi Nomad routing

router.get("/api/catalog/nomad", isAuthenticated, async (req, res) => {
    try {
      const { searchKiwiNomad } = await import("../services/travelpayouts/kiwi.service");
      const { cities, nights_from, nights_to, currency } = req.query;

      if (!cities) return res.status(400).json({ message: "cities[] is required" });

      const cityList = Array.isArray(cities) ? cities as string[] : (cities as string).split(",");
      const items = await searchKiwiNomad({
        cities: cityList,
        nights_in_dst_from: nights_from ? parseInt(nights_from as string) : undefined,
        nights_in_dst_to: nights_to ? parseInt(nights_to as string) : undefined,
        currency: currency as string,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("Nomad search error:", error);
      res.status(500).json({ message: "Failed to search nomad routes" });
    }
  });

  // Transfers: GetTransfer

router.get("/api/catalog/transfers", isAuthenticated, async (req, res) => {
    try {
      const { searchGetTransferOptions } = await import("../services/travelpayouts/gettransfer.service");
      const { from, to, date, passengers, currency } = req.query;

      if (!from || !to) return res.status(400).json({ message: "from and to are required" });

      const items = await searchGetTransferOptions({
        from: from as string,
        to: to as string,
        date: date as string,
        passengers: passengers ? parseInt(passengers as string) : 2,
        currency: currency as string,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("Transfers search error:", error);
      res.status(500).json({ message: "Failed to search transfers" });
    }
  });

  // Car Rentals: DiscoverCars

router.get("/api/catalog/cars", isAuthenticated, async (req, res) => {
    try {
      const { searchDiscoverCars } = await import("../services/travelpayouts/discovercars.service");
      const { location, pickup, dropoff, dropoffLocation, currency, limit } = req.query;

      if (!location && !pickup) return res.status(400).json({ message: "location or pickup is required" });
      if (!pickup) return res.status(400).json({ message: "pickup date is required" });
      if (!dropoff) return res.status(400).json({ message: "dropoff date is required" });

      const items = await searchDiscoverCars({
        pickupLocation: (location || pickup) as string,
        pickupDate: pickup as string,
        dropoffDate: dropoff as string,
        dropoffLocation: dropoffLocation as string,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 10,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("Car rental search error:", error);
      res.status(500).json({ message: "Failed to search car rentals" });
    }
  });

  // eSIM: Airalo

router.get("/api/catalog/esim", isAuthenticated, async (req, res) => {
    try {
      const { searchAiraloEsim } = await import("../services/travelpayouts/airalo.service");
      const { country, countryCode, limit } = req.query;

      const items = await searchAiraloEsim({
        country: country as string,
        countryCode: countryCode as string,
        limit: limit ? parseInt(limit as string) : 10,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("eSIM search error:", error);
      res.status(500).json({ message: "Failed to search eSIM plans" });
    }
  });

  // Activities: Tiqets

router.get("/api/catalog/tiqets", isAuthenticated, async (req, res) => {
    try {
      const { searchTiqetsProducts } = await import("../services/travelpayouts/tiqets.service");
      const { destination, city, currency, limit } = req.query;

      const items = await searchTiqetsProducts({
        city: (city || destination) as string,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 20,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("Tiqets search error:", error);
      res.status(500).json({ message: "Failed to search Tiqets products" });
    }
  });

  // Activities: WeGoTrip

router.get("/api/catalog/wegotrip", isAuthenticated, async (req, res) => {
    try {
      const { searchWeGoTripProducts } = await import("../services/travelpayouts/wegotrip.service");
      const { destination, city, limit } = req.query;

      const items = await searchWeGoTripProducts({
        city: (city || destination) as string,
        limit: limit ? parseInt(limit as string) : 20,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("WeGoTrip search error:", error);
      res.status(500).json({ message: "Failed to search WeGoTrip products" });
    }
  });

  // Activities: Viator discounted feed

router.get("/api/catalog/viator-feed", isAuthenticated, async (req, res) => {
    try {
      const { searchViatorFeedProducts } = await import("../services/travelpayouts/viator-feed.service");
      const { destination, currency, limit } = req.query;

      const items = await searchViatorFeedProducts({
        destination: destination as string,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 20,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("Viator feed error:", error);
      res.status(500).json({ message: "Failed to fetch Viator feed" });
    }
  });

  // Ground transport: Omio

router.get("/api/catalog/ground-transport", isAuthenticated, async (req, res) => {
    try {
      const { searchOmioRoutes } = await import("../services/travelpayouts/omio.service");
      const { origin, destination, limit } = req.query;

      const items = await searchOmioRoutes({
        origin: origin as string,
        destination: destination as string,
        limit: limit ? parseInt(limit as string) : 10,
      });

      res.json({ items, total: items.length });
    } catch (error) {
      console.error("Ground transport error:", error);
      res.status(500).json({ message: "Failed to search ground transport" });
    }
  });

  // HotelLook hotel search (instant-connect ⚡)

router.get("/api/catalog/hotels-look", isAuthenticated, async (req, res) => {
    try {
      const { searchHotellook } = await import("../services/travelpayouts/hotellook.service");
      const { destination, currency, limit } = req.query;
      if (!destination) return res.status(400).json({ message: "destination required" });
      const items = await searchHotellook({
        destination: destination as string,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 20,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("HotelLook error:", err);
      res.status(500).json({ message: "Failed to search HotelLook" });
    }
  });

  // Agoda hotels (instant-connect ⚡)

router.get("/api/catalog/agoda", isAuthenticated, async (req, res) => {
    try {
      const { searchAgoda } = await import("../services/travelpayouts/agoda.service");
      const { destination, checkIn, checkOut, guests, limit } = req.query;
      if (!destination) return res.status(400).json({ message: "destination required" });
      const items = await searchAgoda({
        destination: destination as string,
        checkIn: checkIn as string,
        checkOut: checkOut as string,
        guests: guests ? parseInt(guests as string) : 2,
        limit: limit ? parseInt(limit as string) : 4,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("Agoda error:", err);
      res.status(500).json({ message: "Failed to search Agoda" });
    }
  });

  // Booking.com hotels via Travelpayouts affiliate (instant-connect ⚡)

router.get("/api/catalog/booking", isAuthenticated, async (req, res) => {
    try {
      const { searchBooking } = await import("../services/travelpayouts/booking.service");
      const { destination, checkIn, checkOut, guests, limit, currency } = req.query;
      if (!destination) return res.status(400).json({ message: "destination required" });
      const items = await searchBooking({
        destination: destination as string,
        checkIn: checkIn as string,
        checkOut: checkOut as string,
        guests: guests ? parseInt(guests as string) : 2,
        limit: limit ? parseInt(limit as string) : 5,
        currency: currency as string,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("Booking.com (TP) error:", err);
      res.status(500).json({ message: "Failed to fetch Booking.com results" });
    }
  });

  // GetYourGuide activities (instant-connect ⚡)

router.get("/api/catalog/activities-gyg", isAuthenticated, async (req, res) => {
    try {
      const { searchGetYourGuide } = await import("../services/travelpayouts/getyourguide.service");
      const { destination, currency, limit } = req.query;
      if (!destination) return res.status(400).json({ message: "destination required" });
      const items = await searchGetYourGuide({
        destination: destination as string,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 12,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("GetYourGuide error:", err);
      res.status(500).json({ message: "Failed to search GetYourGuide" });
    }
  });

  // Klook Asia activities (instant-connect ⚡)

router.get("/api/catalog/klook", isAuthenticated, async (req, res) => {
    try {
      const { searchKlook } = await import("../services/travelpayouts/klook.service");
      const { destination, currency, limit } = req.query;
      if (!destination) return res.status(400).json({ message: "destination required" });
      const items = await searchKlook({
        destination: destination as string,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 6,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("Klook error:", err);
      res.status(500).json({ message: "Failed to search Klook" });
    }
  });

  // Travel insurance — SafetyWing (instant-connect ⚡)

router.get("/api/catalog/insurance", isAuthenticated, async (req, res) => {
    try {
      const { searchSafetyWingPlans } = await import("../services/travelpayouts/safetywing.service");
      const { destination, travelers, limit } = req.query;
      const items = await searchSafetyWingPlans({
        destination: destination as string,
        travelers: travelers ? parseInt(travelers as string) : 1,
        limit: limit ? parseInt(limit as string) : 3,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("SafetyWing error:", err);
      res.status(500).json({ message: "Failed to fetch insurance plans" });
    }
  });

  // Busbud bus routes (instant-connect ⚡)

router.get("/api/catalog/bus", isAuthenticated, async (req, res) => {
    try {
      const { searchBusbud } = await import("../services/travelpayouts/busbud.service");
      const { origin, destination, date, passengers, limit, currency } = req.query;
      const items = await searchBusbud({
        origin: (origin as string) || "",
        destination: (destination as string) || "",
        date: date as string,
        passengers: passengers ? parseInt(passengers as string) : 1,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 10,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("Busbud error:", err);
      res.status(500).json({ message: "Failed to search Busbud" });
    }
  });

  // Airport transfers — Kiwi Taxi + Welcome Pickups (instant-connect ⚡)

router.get("/api/catalog/airport-transfers", isAuthenticated, async (req, res) => {
    try {
      const { searchKiwiTaxi } = await import("../services/travelpayouts/kiwitaxi.service");
      const { searchWelcomePickups } = await import("../services/travelpayouts/welcomepickups.service");
      const { from, to, destination, date, passengers, limit } = req.query;

      const dest = (to || destination) as string || "";
      const origin = (from as string) || "";

      const [kiwiItems, welcomeItems] = await Promise.all([
        searchKiwiTaxi({ from: origin, to: dest, date: date as string, passengers: passengers ? parseInt(passengers as string) : 2, limit: 3 }),
        searchWelcomePickups({ destination: dest, from: origin, passengers: passengers ? parseInt(passengers as string) : 2, limit: 2 }),
      ]);

      const items = [...kiwiItems, ...welcomeItems];
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("Airport transfers error:", err);
      res.status(500).json({ message: "Failed to search airport transfers" });
    }
  });

  // Stasher luggage storage (instant-connect ⚡)

router.get("/api/catalog/luggage-storage", isAuthenticated, async (req, res) => {
    try {
      const { searchStasher } = await import("../services/travelpayouts/stasher.service");
      const { destination, date, days, bags, limit } = req.query;
      if (!destination) return res.status(400).json({ message: "destination required" });
      const items = await searchStasher({
        destination: destination as string,
        date: date as string,
        days: days ? parseInt(days as string) : 1,
        bags: bags ? parseInt(bags as string) : 1,
        limit: limit ? parseInt(limit as string) : 6,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("Stasher error:", err);
      res.status(500).json({ message: "Failed to search Stasher" });
    }
  });

  // Rentalcars.com car hire (instant-connect ⚡)

router.get("/api/catalog/rentalcars", isAuthenticated, async (req, res) => {
    try {
      const { searchRentalcars } = await import("../services/travelpayouts/rentalcars.service");
      const { pickupLocation, pickupDate, dropoffDate, driverAge, limit, currency } = req.query;
      if (!pickupLocation) return res.status(400).json({ message: "pickupLocation required" });
      const items = await searchRentalcars({
        pickupLocation: pickupLocation as string,
        pickupDate: pickupDate as string,
        dropoffDate: dropoffDate as string,
        driverAge: driverAge ? parseInt(driverAge as string) : 30,
        currency: currency as string,
        limit: limit ? parseInt(limit as string) : 4,
      });
      res.json({ items, total: items.length });
    } catch (err) {
      console.error("Rentalcars error:", err);
      res.status(500).json({ message: "Failed to search Rentalcars" });
    }
  });

  // Alias: /api/destinations -> /api/catalog/destinations

router.get("/api/destinations", async (req, res) => {
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

router.get("/api/user-experiences", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experiences = await storage.getUserExperiences(userId);
    res.json(experiences);
  });

  // Get single experience with items

router.get("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const items = await storage.getUserExperienceItems(req.params.id);
    res.json({ ...experience, items });
  });

  // Create new experience

router.post("/api/user-experiences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const experience = await storage.createUserExperience({ ...req.body, userId });

      // Auto-create a linked trip
      let tripId: string | null = experience.tripId ?? null;
      if (!tripId) {
        const expType = experience.experienceTypeId
          ? await db.select().from(experienceTypes).where(eq(experienceTypes.id, experience.experienceTypeId)).then(r => r[0])
          : null;
        const today = new Date().toISOString().split("T")[0];
        const startDate = experience.eventDate || today;
        const trip = await storage.createTrip({
          userId,
          title: experience.title || (expType ? `${expType.name} Trip` : "My Trip"),
          destination: experience.location || "TBD",
          startDate,
          endDate: startDate,
          eventType: expType?.slug || "vacation",
          status: "draft",
        });
        tripId = trip.id;
        const updated = await storage.updateUserExperience(experience.id, { tripId });
        return res.status(201).json(updated || { ...experience, tripId });
      }

      res.status(201).json(experience);
    } catch (err) {
      res.status(500).json({ message: "Failed to create experience" });
    }
  });

  // Update experience

router.patch("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }

    const updates = req.body;

    // Auto-create linked trip on first save if not already linked
    if (!experience.tripId && !updates.tripId) {
      try {
        const expType = experience.experienceTypeId
          ? await db.select().from(experienceTypes).where(eq(experienceTypes.id, experience.experienceTypeId)).then(r => r[0])
          : null;
        const today = new Date().toISOString().split("T")[0];
        const startDate = updates.eventDate || experience.eventDate || today;
        const destination = updates.location || experience.location || "TBD";
        const title = updates.title || experience.title || (expType ? `${expType.name} Trip` : "My Trip");
        const trip = await storage.createTrip({
          userId,
          title,
          destination,
          startDate,
          endDate: startDate,
          eventType: expType?.slug || "vacation",
          status: "draft",
        });
        updates.tripId = trip.id;
      } catch (tripErr) {
        console.error("Failed to auto-create trip on experience update:", tripErr);
      }
    }

    const updated = await storage.updateUserExperience(req.params.id, updates);
    res.json(updated);
  });

  // Delete experience

router.delete("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    await storage.deleteUserExperience(req.params.id);
    res.status(204).send();
  });

  // Add item to experience

router.post("/api/user-experiences/:id/items", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const item = await storage.addUserExperienceItem({ ...req.body, userExperienceId: req.params.id });
    res.status(201).json(item);
  });

  // Update experience item

router.patch("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    const updated = await storage.updateUserExperienceItem(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json(updated);
  });

  // Remove experience item

router.delete("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    await storage.removeUserExperienceItem(req.params.id);
    res.status(204).send();
  });

  // === FAQ Routes ===
  
  // Get all FAQs

router.get("/api/faqs", async (req, res) => {
    const category = req.query.category as string | undefined;
    const faqsList = await storage.getFAQs(category);
    res.json(faqsList);
  });

  // Create FAQ (admin)

router.post("/api/faqs", isAuthenticated, async (req, res) => {
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

router.patch("/api/faqs/:id", isAuthenticated, async (req, res) => {
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

router.delete("/api/faqs/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteFAQ(req.params.id);
    res.status(204).send();
  });

  // === Wallet & Credits Routes ===
  
  // Get current user's wallet

router.get("/api/service-templates", async (_req, res) => {
    try {
      const rows = await db.select({
        id:           expertServiceOfferings.id,
        name:         expertServiceOfferings.name,
        description:  expertServiceOfferings.description,
        price:        expertServiceOfferings.price,
        isDefault:    expertServiceOfferings.isDefault,
        sortOrder:    expertServiceOfferings.sortOrder,
        createdAt:    expertServiceOfferings.createdAt,
        categoryName: expertServiceCategories.name,
      })
      .from(expertServiceOfferings)
      .leftJoin(expertServiceCategories, eq(expertServiceOfferings.categoryId, expertServiceCategories.id))
      .where(eq(expertServiceOfferings.isDefault, true))
      .orderBy(expertServiceOfferings.sortOrder);

      const esoTemplates = rows.map(o => ({
        id:               o.id,
        title:            o.name,
        description:      o.description,
        categoryId:       null,
        serviceType:      null,
        deliveryMethod:   null,
        deliveryTimeframe: null,
        suggestedPrice:   o.price,
        requirements:     null,
        whatIncluded:     null,
        isActive:         o.isDefault ?? true,
        sortOrder:        o.sortOrder,
        createdAt:        o.createdAt,
        category:         o.categoryName,
      }));

      // If ESO has no isDefault=true rows yet (clean DB / partial seed),
      // fall back to legacy service_templates so the UI always shows templates.
      if (esoTemplates.length === 0) {
        const stRows = await storage.getServiceTemplates();
        return res.json(stRows.map((t: any) => ({ ...t, suggestedPrice: t.suggestedPrice ?? t.price })));
      }

      res.json(esoTemplates);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch service templates" });
    }
  });

  // Get single template — tries expert_service_offerings first, falls back to service_templates

router.get("/api/service-templates/:id", async (req, res) => {
    const esoRow = await db.select().from(expertServiceOfferings)
      .where(eq(expertServiceOfferings.id, req.params.id)).then(r => r[0]);
    if (esoRow) {
      return res.json({
        id: esoRow.id, title: esoRow.name, description: esoRow.description,
        categoryId: null, serviceType: null, deliveryMethod: null, deliveryTimeframe: null,
        suggestedPrice: esoRow.price, requirements: null, whatIncluded: null,
        isActive: esoRow.isDefault ?? true, sortOrder: esoRow.sortOrder, createdAt: esoRow.createdAt,
      });
    }
    const template = await storage.getServiceTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  });

  // Create template (admin only)

router.get("/api/destination-calendar/countries", async (req, res) => {
    try {
      const countries = await storage.getCalendarCountries();
      res.json(countries);
    } catch (err) {
      console.error("Error fetching calendar countries:", err);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  // Get approved events for a destination (public)

router.get("/api/destination-calendar/events", async (req, res) => {
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

router.get("/api/destination-calendar/seasons", async (req, res) => {
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

router.get("/api/destination-calendar/my-events", isAuthenticated, async (req, res) => {
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

router.post("/api/destination-calendar/events", isAuthenticated, async (req, res) => {
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

router.put("/api/destination-calendar/events/:id", isAuthenticated, async (req, res) => {
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

router.post("/api/destination-calendar/events/:id/submit", isAuthenticated, async (req, res) => {
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

router.delete("/api/destination-calendar/events/:id", isAuthenticated, async (req, res) => {
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

router.get("/api/services/:id", async (req, res) => {
    const service = await storage.getProviderServiceById(req.params.id);
    if (!service || service.status !== "active") {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json(service);
  });

  // Public provider verification status (for service detail page badge)

router.get("/api/services", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const location = req.query.location as string | undefined;
    const services = await storage.getAllActiveServices(categoryId, location);
    res.json(services);
  });

  // Unified Discovery Search (public - with advanced filtering)

router.get("/api/discover", async (req, res) => {
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

router.get("/api/analytics/search-trends", isAuthenticated, async (req, res) => {
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

router.get("/api/analytics/expert-match-trends/:expertId", isAuthenticated, async (req, res) => {
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

router.get("/api/analytics/destination-metrics/:destination", isAuthenticated, async (req, res) => {
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


router.post("/api/analytics/search-event", async (req, res) => {
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


router.post("/api/analytics/itinerary-generated", async (req, res) => {
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
        } as any,
      } as any).catch((err: any) => console.error("[Analytics] Failed to track itinerary generation:", err));
      
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


router.post("/api/analytics/booking", async (req, res) => {
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

router.post("/api/discover/recommendations", isAuthenticated, async (req, res) => {
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
      trackAnthropicResponse(completion, { sourceType: "ai_traveler" });

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

router.get("/api/notifications", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const unreadOnly = req.query.unread === "true";
    const notifications = await storage.getNotifications(userId, unreadOnly);
    res.json(notifications);
  });

  // Get unread count

router.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const count = await storage.getUnreadCount(userId);
    res.json({ count });
  });

  // Mark notification as read

router.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const notification = await storage.markAsRead(req.params.id);
    if (notification && notification.userId !== userId) {
      return res.status(403).json({ message: "Not your notification" });
    }
    res.json(notification);
  });

  // Mark all as read

router.post("/api/notifications/mark-all-read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.markAllAsRead(userId);
    res.json({ success: true });
  });

  // Delete notification

router.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    await storage.deleteNotification(req.params.id);
    res.json({ success: true });
  });

  // === Service Reviews Routes ===
  
  // Get reviews for a service (public: approved only)

router.get("/api/services/:serviceId/reviews", async (req, res) => {
    const all = await storage.getServiceReviews(req.params.serviceId);
    const visible = all
      .filter(r => (r as any).status === "approved" || (r as any).status === "removed")
      .map(r => {
        if ((r as any).status === "removed") {
          return { id: r.id, status: "removed", createdAt: r.createdAt };
        }
        return r;
      });
    res.json(visible);
  });

  // Flag a review (any authenticated user)
router.post("/api/reviews/:id/flag", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { reason } = req.body;
      const [review] = await db.select().from(serviceReviews).where(eq(serviceReviews.id, req.params.id)).limit(1);
      if (!review) return res.status(404).json({ message: "Review not found" });
      if (review.status === "removed") return res.status(400).json({ message: "Review already removed" });
      await db.update(serviceReviews).set({ status: "flagged", flagReason: reason || null }).where(eq(serviceReviews.id, req.params.id));
      await db.insert(reviewModerationLogs).values({ reviewId: req.params.id, action: "flag", actorId: userId, reason: reason || null });
      res.json({ success: true });
    } catch (err) {
      console.error("Flag review error:", err);
      res.status(500).json({ message: "Failed to flag review" });
    }
  });

  // Create a review (only after completed booking)

router.post("/api/services/:serviceId/reviews", isAuthenticated, async (req, res) => {
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
        status: "pending",
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

router.get("/api/amadeus/locations", async (req, res) => {
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

router.get("/api/amadeus/flights", isAuthenticated, async (req, res) => {
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

router.get("/api/amadeus/hotels", isAuthenticated, async (req, res) => {
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

router.get("/api/amadeus/pois", isAuthenticated, async (req, res) => {
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

router.get("/api/amadeus/pois/:id", isAuthenticated, async (req, res) => {
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

router.get("/api/amadeus/activities", isAuthenticated, async (req, res) => {
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

router.get("/api/amadeus/activities/:id", isAuthenticated, async (req, res) => {
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


router.post("/api/amadeus/transfers", isAuthenticated, async (req, res) => {
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

router.get("/api/amadeus/safety", isAuthenticated, async (req, res) => {
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

router.get("/api/amadeus/safety/:id", isAuthenticated, async (req, res) => {
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

router.get("/api/viator/activities", isAuthenticated, async (req, res) => {
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

router.get("/api/viator/activities/:productCode", isAuthenticated, async (req, res) => {
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

router.post("/api/viator/availability", isAuthenticated, async (req, res) => {
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

router.get("/api/viator/destinations", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/hotels", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/activities", async (req, res) => {
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

router.get("/api/cache/flights", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/map/hotels", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/map/activities", isAuthenticated, async (req, res) => {
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


router.post("/api/cache/verify-availability", isAuthenticated, async (req, res) => {
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

router.post("/api/cache/cleanup", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/filter/hotels", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/filter/activities", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/preference-tags/:itemType", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/categories", isAuthenticated, async (req, res) => {
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

router.get("/api/cache/status", isAuthenticated, async (req, res) => {
    try {
      const status = await cacheSchedulerService.getCacheFreshnessStatus();
      res.json(status);
    } catch (error: any) {
      console.error('Get cache status error:', error);
      res.status(500).json({ message: error.message || "Failed to get cache status" });
    }
  });

  // Trigger manual cache refresh (admin only)

router.post("/api/cache/refresh", isAuthenticated, async (req, res) => {
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


router.post("/api/cache/checkout-verify", isAuthenticated, async (req, res) => {
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

router.post("/api/claude/optimize-itinerary", isAuthenticated, async (req, res) => {
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

router.post("/api/claude/transportation-analysis", isAuthenticated, async (req, res) => {
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


router.post("/api/transport-packages/generate", isAuthenticated, async (req, res) => {
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
      trackAnthropicResponse(aiResponse, { sourceType: "ai_content" });

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

router.post("/api/claude/full-itinerary-graph", isAuthenticated, async (req, res) => {
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

router.post("/api/claude/recommendations", isAuthenticated, async (req, res) => {
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

router.post("/api/routes/transit", isAuthenticated, async (req, res) => {
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


router.post("/api/routes/transit-multi", isAuthenticated, async (req, res) => {
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

router.post("/api/geocode", async (req, res) => {
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


router.post("/api/grok/match-experts", isAuthenticated, async (req, res) => {
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


router.post("/api/grok/content/generate", isAuthenticated, async (req, res) => {
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


router.post("/api/grok/intelligence", isAuthenticated, async (req, res) => {
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


router.post("/api/grok/itinerary/generate", isAuthenticated, async (req, res) => {
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

  const chatSchema = z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    systemContext: z.string().optional(),
    preferProvider: z.enum(["grok", "claude", "auto"]).optional(),
  });

router.post("/api/grok/chat", isAuthenticated, async (req, res) => {
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

router.get("/api/grok/health", async (req, res) => {
    try {
      const health = await aiOrchestrator.healthCheck();
      res.json({ status: "ok", providers: health });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // === EXPERT AI TASKS ROUTES ===
  
  // Get expert's AI tasks

router.get("/api/destination-intelligence", isAuthenticated, async (req, res) => {
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

  // Phase 5: Autonomous AI Itinerary Generation

router.post("/api/ai/generate-itinerary", isAuthenticated, async (req, res) => {
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

  // Trip Optimization Framework: Generate 3 itinerary variations with real-time intelligence

router.post("/api/ai/generate-optimized-itineraries", isAuthenticated, async (req, res) => {
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

  // Get user's AI-generated itineraries

router.get("/api/ai/itineraries", isAuthenticated, async (req, res) => {
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

router.get("/api/ai/itineraries/:id", isAuthenticated, async (req, res) => {
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
  
router.get("/api/travelpulse/trending/:city", async (req, res) => {
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


router.post("/api/travelpulse/truth-check", async (req, res) => {
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


router.get("/api/travelpulse/destination/:city/:name", async (req, res) => {
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


router.get("/api/travelpulse/livescore/:city/:entity", async (req, res) => {
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


router.get("/api/travelpulse/calendar/:city", async (req, res) => {
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


router.get("/api/travelpulse/help-decide", async (req, res) => {
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

router.get("/api/travelpulse/cities", async (req, res) => {
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

router.get("/api/travelpulse/cities/:cityName", async (req, res) => {
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

router.get("/api/travelpulse/cities/:cityName/hidden-gems", async (req, res) => {
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

router.get("/api/travelpulse/cities/:cityName/activity", async (req, res) => {
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

router.get("/api/travelpulse/cities/:cityName/alerts", async (req, res) => {
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

router.get("/api/travelpulse/cities/:cityName/happening-now", async (req, res) => {
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

router.get("/api/travelpulse/activity/global", async (req, res) => {
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

router.post("/api/travelpulse/seed", isAuthenticated, async (req, res) => {
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

router.get("/api/travelpulse/ai/status", requireAdmin, async (req, res) => {
    try {
      const status = travelPulseScheduler.getStatus();
      const citiesNeedingRefresh = await travelPulseService.getCitiesNeedingRefresh();
      res.json({
        scheduler: status,
        citiesNeedingRefresh: citiesNeedingRefresh.length,
        cities: citiesNeedingRefresh.map(c => ({ name: c.cityName, country: c.country, lastAiUpdate: c.aiGeneratedAt })),
        feedbackLoop: {
          lastRunAt: status.feedbackLoop.lastRunAt,
          totalSignalsProcessed: status.feedbackLoop.totalSignalsProcessed,
          totalCycles: status.feedbackLoop.totalRunCount,
          citiesProcessedLifetime: status.feedbackLoop.citiesProcessed,
          description: "Demand signal regeneration pass runs after every city intelligence cycle. Funnel events (view, cart, complete) increment service_demand_signals in real time. Zero-result searches via /api/track/search boost supply-gap scores as gap/opportunity signals.",
        },
      });
    } catch (error: any) {
      console.error("Error getting AI status:", error);
      res.status(500).json({ message: "Failed to get AI status", error: error.message });
    }
  });

  // Manually trigger AI refresh for a specific city (admin only, rate limited)

router.post("/api/travelpulse/ai/refresh/:cityName/:country", requireAdmin, checkAIRateLimit, async (req, res) => {
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

router.post("/api/travelpulse/ai/refresh-all", requireAdmin, checkAIRateLimit, async (req, res) => {
    try {
      const result = await travelPulseScheduler.triggerManualRefresh();
      res.json(result);
    } catch (error: any) {
      console.error("Error triggering batch AI refresh:", error);
      res.status(500).json({ message: "Failed to trigger batch AI refresh", error: error.message });
    }
  });

  // Get city media (public - for frontend gallery)

router.get("/api/travelpulse/media/:cityName/:country", async (req, res) => {
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

  // Track Unsplash download (required by Unsplash API guidelines)
  // Must be called when a photo is displayed prominently or used

router.post("/api/travelpulse/media/track-download", async (req, res) => {
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

  // Get full destination calendar data (seasonal + events) for a city

router.get("/api/travelpulse/destination-calendar/:cityName/:country", async (req, res) => {
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

router.get("/api/travelpulse/ai-recommendations/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      const { month, budget, preferences, limit } = req.query;
      
      const { aiRecommendationEngineService } = await import("../services/recommendation.service");
      
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

router.get("/api/travelpulse/event-recommendations/:cityName/:country/:eventId", async (req, res) => {
    try {
      const { cityName, country, eventId } = req.params;
      
      const { aiRecommendationEngineService } = await import("../services/recommendation.service");
      
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

router.get("/api/travelpulse/best-time/:cityName/:country", async (req, res) => {
    try {
      const { cityName, country } = req.params;
      
      const { aiRecommendationEngineService } = await import("../services/recommendation.service");
      
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

router.get("/api/travelpulse/ai/city/:cityName", requireAdmin, async (req, res) => {
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

router.get("/api/travelpulse/global-calendar", async (req, res) => {
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

router.get("/api/travelpulse/global-events", async (req, res) => {
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

router.get("/api/travelpulse/enriched/:cityName", async (req, res) => {
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

  // Search SERP for venue-specific results

router.get("/api/travelpulse/serp-search", async (req, res) => {
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

  // Template-aware SERP search with caching

router.get("/api/serp/template-search", async (req, res) => {
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

  // Track SERP provider click

router.post("/api/serp/track-click", async (req, res) => {
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

  // Create inquiry to SERP provider

router.post("/api/serp/inquiry", isAuthenticated, async (req, res) => {
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

  // Get partnership opportunities (admin)

router.get("/api/serp/partnerships", isAuthenticated, async (req, res) => {
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

  // ============================================
  // GEOCODE HELPER (for map centering)
  // ============================================


router.get("/api/geocode", async (req, res) => {
    try {
      const { address } = req.query as { address?: string };
      if (!address) return res.status(400).json({ message: "address required" });
      if (!process.env.GOOGLE_MAPS_API_KEY) return res.status(503).json({ message: "Maps API not configured" });
      const result = await geocodeAddress(address);
      if (!result) return res.status(404).json({ message: "Location not found" });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: "Geocode failed", error: e.message });
    }
  });

  // ============================================
  // LIVE EXPERIENCE SEARCH (Google Places + Platform)
  // Used by the Expert Workspace Browse tab
  // ============================================


router.get("/api/search/experiences", async (req, res) => {
    try {
      const { q, destination, category } = req.query as Record<string, string>;
      if (!q && !destination) {
        return res.status(400).json({ message: "q or destination is required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      const results: any[] = [];

      // ── Google Places Text Search ──
      if (apiKey) {
        const catToType: Record<string, string> = {
          dining: "restaurant",
          hotels: "lodging",
          activities: "tourist_attraction|museum|amusement_park|park|spa",
          all: "",
        };
        const typeFilter = catToType[category || "all"] || "";
        const searchQuery = [q, destination].filter(Boolean).join(" in ");
        const placesUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
        placesUrl.searchParams.set("query", searchQuery);
        placesUrl.searchParams.set("key", apiKey);
        if (typeFilter) placesUrl.searchParams.set("type", typeFilter.split("|")[0]);

        const resp = await fetch(placesUrl.toString());
        if (resp.ok) {
          const data: any = await resp.json();
          const priceLabelMap: Record<number, string> = { 0: "Free", 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
          const catFromTypes = (types: string[]): string => {
            if (types.some(t => ["restaurant","food","cafe","bakery","bar"].includes(t))) return "dining";
            if (types.some(t => ["lodging","hotel"].includes(t))) return "hotel";
            if (types.some(t => ["museum","art_gallery","place_of_worship","tourist_attraction"].includes(t))) return "culture";
            if (types.some(t => ["amusement_park","park","spa","night_club"].includes(t))) return "activity";
            return "activity";
          };
          for (const place of (data.results || []).slice(0, 15)) {
            const photoRef = place.photos?.[0]?.photo_reference;
            results.push({
              id: `gp_${place.place_id}`,
              source: "google_places",
              placeId: place.place_id,
              name: place.name,
              address: place.formatted_address,
              category: catFromTypes(place.types || []),
              rating: place.rating ?? null,
              reviewCount: place.user_ratings_total ?? null,
              priceLevel: place.price_level ?? null,
              priceLabel: place.price_level != null ? priceLabelMap[place.price_level] : null,
              location: place.geometry?.location ?? null,
              photoUrl: photoRef
                ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photoRef}&key=${apiKey}`
                : null,
              mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            });
          }
        }
      }

      // ── Platform providers (secondary) ──
      try {
        const platformProviders = await storage.getProviderServices({ status: "active" } as any);
        const dest = (destination || "").toLowerCase();
        const qLower = (q || "").toLowerCase();
        const catLower = (category || "").toLowerCase();
        for (const p of platformProviders) {
          const nameMatch = p.serviceName?.toLowerCase().includes(qLower);
          const catMatch = !catLower || catLower === "all" || p.serviceType?.toLowerCase().includes(catLower) || (p as any).category?.toLowerCase().includes(catLower);
          const destMatch = !dest || p.location?.toLowerCase().includes(dest);
          if ((nameMatch || destMatch) && catMatch) {
            results.push({
              id: `pl_${p.id}`,
              source: "platform",
              name: p.serviceName,
              address: p.location || null,
              category: p.serviceType || (p as any).category || "activity",
              rating: null,
              reviewCount: null,
              priceLevel: null,
              priceLabel: p.price ? `$${p.price}` : null,
              location: null,
              photoUrl: null,
              mapsUrl: null,
              platformId: p.id,
            });
          }
        }
      } catch (_) {}

      res.json({ results, count: results.length });
    } catch (error: any) {
      console.error("Error in /api/search/experiences:", error);
      res.status(500).json({ message: "Search failed", error: error.message });
    }
  });

  // ============================================
  // VENUE SEARCH API ROUTES
  // Google Places API integration for venues/vendors
  // ============================================

  // Search for venues by type and location

router.get("/api/venues/search", async (req, res) => {
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

  // Search for wedding vendors (photographers, florists, etc.)
  // IMPORTANT: This route must be defined BEFORE /api/venues/:placeId to avoid being caught by the dynamic route

router.get("/api/venues/wedding-vendors", async (req, res) => {
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

  // Get venue details by place ID

router.get("/api/venues/:placeId", async (req, res) => {
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

  // ============================================
  // FEVER PARTNER API ROUTES
  // Events and experiences from Fever (feverup.com)
  // ============================================

  // Get Fever service status and supported cities

router.get("/api/fever/status", async (_req, res) => {
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

router.get("/api/fever/events", async (req, res) => {
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

router.get("/api/fever/events/:eventId", async (req, res) => {
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

router.get("/api/fever/cities/:cityCode/upcoming", async (req, res) => {
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

router.get("/api/fever/cities/:cityCode/free", async (req, res) => {
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

router.get("/api/fever/cities/:cityCode/dates", async (req, res) => {
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

router.get("/api/fever/cities", async (_req, res) => {
    try {
      const cities = feverService.getSupportedCities();
      res.json({ cities, count: cities.length });
    } catch (error) {
      console.error("[Fever] Cities list error:", error);
      res.status(500).json({ error: "Failed to get cities list" });
    }
  });

  // Merge Fever events with TravelPulse destination events for calendar integration

router.get("/api/travelpulse/fever-events/:cityName", async (req, res) => {
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

router.get("/api/fever/cache/status", async (_req, res) => {
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

router.get("/api/fever/cache/events/:cityCode", async (req, res) => {
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

router.post("/api/fever/cache/refresh/:cityCode", isAuthenticated, async (req, res) => {
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

router.post("/api/fever/cache/refresh-all", isAuthenticated, async (req, res) => {
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

router.patch("/api/participants/:id", isAuthenticated, async (req, res) => {
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


router.patch("/api/participants/:id/rsvp", isAuthenticated, async (req, res) => {
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


router.post("/api/participants/:id/payment", isAuthenticated, async (req, res) => {
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


router.delete("/api/participants/:id", isAuthenticated, async (req, res) => {
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


router.post("/api/budget/convert-currency", isAuthenticated, async (req, res) => {
    try {
      const { amount, fromCurrency, toCurrency } = req.body;
      const conversion = await budgetService.convertCurrency(amount, fromCurrency, toCurrency);
      res.json(conversion);
    } catch (error) {
      res.status(500).json({ message: "Failed to convert currency" });
    }
  });


router.post("/api/budget/calculate-tip", isAuthenticated, async (req, res) => {
    try {
      const { amount, countryCode, serviceType } = req.body;
      const tip = budgetService.calculateTip(amount, countryCode, serviceType);
      res.json(tip);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate tip" });
    }
  });


router.patch("/api/transactions/:id", isAuthenticated, async (req, res) => {
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


router.delete("/api/transactions/:id", isAuthenticated, async (req, res) => {
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
  // Authoritative GET: requires trip ownership or expert assignment; returns items grouped by day

router.patch("/api/emergency-contacts/:id", isAuthenticated, async (req, res) => {
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


router.delete("/api/emergency-contacts/:id", isAuthenticated, async (req, res) => {
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


router.post("/api/alerts/:id/acknowledge", isAuthenticated, async (req, res) => {
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


router.post("/api/alerts/:id/dismiss", isAuthenticated, async (req, res) => {
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


router.get("/api/emergency/numbers/:countryCode", async (req, res) => {
    try {
      const numbers = emergencyService.getEmergencyNumbers(req.params.countryCode);
      res.json(numbers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency numbers" });
    }
  });


router.get("/api/emergency/embassy/:countryCode", async (req, res) => {
    try {
      const embassy = emergencyService.getEmbassyInfo(req.params.countryCode);
      res.json(embassy);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch embassy info" });
    }
  });


router.get("/api/emergency/rebooking-options/:itemType", isAuthenticated, async (req, res) => {
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

router.get("/api/spontaneous/opportunities", async (req, res) => {
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

router.get("/api/spontaneous/preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const preferences = await opportunityEngineService.getUserPreferences(userId);
      res.json(preferences || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  // POST /api/spontaneous/preferences - Save user spontaneity preferences

router.post("/api/spontaneous/preferences", isAuthenticated, async (req, res) => {
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

router.post("/api/spontaneous/:id/book", isAuthenticated, async (req, res) => {
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

router.get("/api/spontaneous/quick-search/:window", async (req, res) => {
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

  // === Affiliate Booking Requests ===


router.post("/api/affiliate-booking-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { itemName, itemDescription, partnerName, partnerCategory, affiliateUrl, travelDate, travelers, userNotes } = req.body;
      if (!itemName || !partnerName || !affiliateUrl) {
        return res.status(400).json({ message: "itemName, partnerName, and affiliateUrl are required" });
      }
      // Auto-assign to an expert based on category (city match optional, fallback any expert)
      const allExperts: any[] = await db.select({ id: users.id }).from(users).where(eq((users as any).role, "expert")).limit(10);
      const expertId = allExperts.length > 0 ? allExperts[0].id : null;
      const status = expertId ? "assigned" : "pending";
      const record = await storage.createAffiliateBookingRequest({
        userId, expertId, itemName, itemDescription: itemDescription ?? null,
        partnerName, partnerCategory: partnerCategory ?? null,
        affiliateUrl, travelDate: travelDate ?? null,
        travelers: travelers ?? 1, userNotes: userNotes ?? null,
        expertNotes: null, confirmationRef: null, price: null,
        status,
      });
      // Never return affiliateUrl to client
      const { affiliateUrl: _url, ...safe } = record;
      return res.json(safe);
    } catch (err: any) {
      console.error("[AffiliateBooking] create error:", err);
      return res.status(500).json({ message: "Failed to create booking request" });
    }
  });


router.get("/api/affiliate-booking-requests/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const records = await storage.getAffiliateBookingRequestsByUser(userId);
      return res.json(records);
    } catch (err: any) {
      console.error("[AffiliateBooking] user list error:", err);
      return res.status(500).json({ message: "Failed to fetch booking requests" });
    }
  });


router.get("/api/affiliate-booking-requests/expert", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "expert" && user.role !== "admin") {
        return res.status(403).json({ message: "Expert role required" });
      }
      const records = await storage.getAffiliateBookingRequestsByExpert(user.id);
      return res.json(records);
    } catch (err: any) {
      console.error("[AffiliateBooking] expert list error:", err);
      return res.status(500).json({ message: "Failed to fetch booking requests" });
    }
  });


// Map a booking's travelDate onto a 1-based trip day: (travelDate − trip.start) + 1,
// clamped to the trip's [start, end] range. Falls back to day 1 when travelDate is
// absent/unparseable or the trip has no start date.
function deriveItineraryDayNumber(
  travelDate: string | null | undefined,
  trip: { startDate?: string | null; endDate?: string | null } | undefined | null,
): number {
  if (!travelDate || !trip?.startDate) return 1;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${trip.startDate}T00:00:00Z`);
  const travel = Date.parse(`${travelDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(travel)) return 1;
  let day = Math.floor((travel - start) / DAY_MS) + 1;
  if (day < 1) day = 1;
  if (trip.endDate) {
    const end = Date.parse(`${trip.endDate}T00:00:00Z`);
    if (!Number.isNaN(end)) {
      const maxDay = Math.floor((end - start) / DAY_MS) + 1;
      if (maxDay >= 1 && day > maxDay) day = maxDay;
    }
  }
  return day;
}

router.patch("/api/affiliate-booking-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "expert" && user.role !== "admin") {
        return res.status(403).json({ message: "Expert role required" });
      }
      const { id } = req.params;
      // tripId is intentionally NOT in this blind-allow list — it is only attached
      // after the cross-trip guard below passes (Phase 2.3). Never blindly trust it.
      const allowed = ["status", "expertNotes", "confirmationRef", "price", "expertId"] as const;
      const data: any = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      // Self-assign: if setting expertId, use current user
      if (data.expertId === "self") data.expertId = user.id;
      const prior = await storage.getAffiliateBookingRequestById(id);
      if (!prior) return res.status(404).json({ message: "Request not found" });

      // Phase 2.3 cross-trip guard. Attaching a booking to a Trip + logging it onto
      // that Trip's itinerary is gated on a confirm transition AND BOTH:
      //   (a) the booking belongs to the trip's owner (booking.userId === trip.userId)
      //   (b) the confirming expert is assigned to that trip (trip_expert_advisors row)
      // Fail-closed: if either fails, the booking is still marked confirmed but is
      // NOT attached to / logged onto the trip, and the block is surfaced as an
      // anomaly (durable note + response flag). Never log onto a trip the traveler
      // doesn't own.
      const requestedTripId = typeof req.body.tripId === "string" ? req.body.tripId : null;
      const isConfirming = data.status === "confirmed" && prior.status !== "confirmed";
      let trip: Awaited<ReturnType<typeof storage.getTrip>> | undefined;
      let attachmentBlocked = false;
      let attachmentReason: string | null = null;

      if (requestedTripId && isConfirming) {
        trip = await storage.getTrip(requestedTripId);
        const ownerOk = !!trip && !!prior.userId && prior.userId === trip.userId;
        const assignedOk = await storage.isExpertAssignedToTrip(requestedTripId, user.id);
        if (ownerOk && assignedOk) {
          data.tripId = requestedTripId; // attachment granted
        } else {
          attachmentBlocked = true;
          attachmentReason = !trip
            ? "trip_not_found"
            : !ownerOk
              ? "booking_not_owned_by_trip_traveler"
              : "expert_not_assigned_to_trip";
          // Durable, non-destructive anomaly note the expert/admin can see.
          const marker = `[ATTACHMENT BLOCKED] ${attachmentReason} — confirmed without linking to trip ${requestedTripId} @ ${new Date().toISOString()}`;
          const baseNotes = data.expertNotes ?? prior.expertNotes ?? "";
          data.expertNotes = baseNotes ? `${baseNotes}\n${marker}` : marker;
        }
      }

      const updated = await storage.updateAffiliateBookingRequest(id, data);
      if (!updated) return res.status(404).json({ message: "Request not found" });

      // Log onto the canonical Trip/PlanCard only when attachment was granted (first
      // confirm wins — guarded on the transition so a repeat PATCH never duplicates).
      if (updated.status === "confirmed" && updated.tripId && prior.status !== "confirmed") {
        await storage.createItineraryItem({
          tripId: updated.tripId,
          title: updated.itemName,
          description: updated.itemDescription ?? `Booked via ${updated.partnerName}`,
          itemType: "activity",
          status: "confirmed",
          dayNumber: deriveItineraryDayNumber(updated.travelDate, trip),
          scheduledDate: updated.travelDate ?? null,
          bookingReference: updated.confirmationRef ?? null,
          bookingStatus: "confirmed",
          confirmationNumber: updated.confirmationRef ?? null,
          estimatedCost: updated.price ?? null,
          actualCost: updated.price ?? null,
          suggestedBy: "expert",
        } as any);
      }

      if (attachmentBlocked) {
        console.warn(`[AffiliateBooking] attachment blocked for ${id} (expert ${user.id}): ${attachmentReason}`);
        return res.json({ ...updated, attachmentBlocked: true, attachmentReason });
      }
      // Include affiliateUrl for expert responses
      return res.json(updated);
    } catch (err: any) {
      console.error("[AffiliateBooking] patch error:", err);
      return res.status(500).json({ message: "Failed to update booking request" });
    }
  });

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

export async function registerDiscoveryRoutes() {
  const { grokDiscoveryService } = await import("../services/grok-discovery.service");

  // Local admin guard (mirrors the one in registerRoutes)
  const requireAdmin = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const user = await db.select().from(users).where(eq(users.id, req.user?.claims?.sub)).then((r: any[]) => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Trigger discovery for a destination

router.post("/api/discovery/scan", isAuthenticated, async (req, res) => {
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

router.get("/api/discovery/categories", async (_req, res) => {
    try {
      const { grokDiscoveryService } = await import("../services/grok-discovery.service");
      const categories = await grokDiscoveryService.getAvailableCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  // Get gems for a destination

router.get("/api/discovery/gems", async (req, res) => {
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

router.get("/api/discovery/gems/:id", async (req, res) => {
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

router.get("/api/discovery/destinations", async (_req, res) => {
    try {
      const destinations = await grokDiscoveryService.getDestinationsWithGems();
      res.json({ destinations });
    } catch (error: any) {
      console.error("Get destinations error:", error);
      res.status(500).json({ message: "Failed to get destinations", error: error.message });
    }
  });

  // Get discovery job history

router.get("/api/discovery/jobs", isAuthenticated, async (req, res) => {
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
  
  const { affiliateScraperService } = await import("../services/affiliate-scraper.service");

  // Get partner categories

router.get("/api/affiliate/categories", async (_req, res) => {
    try {
      const categories = await affiliateScraperService.getPartnerCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get categories", error: error.message });
    }
  });

  // Create affiliate partner

router.post("/api/affiliate/partners", isAuthenticated, async (req, res) => {
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

router.get("/api/affiliate/partners", async (req, res) => {
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

router.get("/api/affiliate/partners/:id", async (req, res) => {
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

router.patch("/api/affiliate/partners/:id", isAuthenticated, async (req, res) => {
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

router.delete("/api/affiliate/partners/:id", isAuthenticated, async (req, res) => {
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

router.post("/api/affiliate/partners/:id/scrape", isAuthenticated, async (req, res) => {
    try {
      const result = await affiliateScraperService.scrapePartnerWebsite(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error("Scrape error:", error);
      res.status(500).json({ message: "Failed to scrape partner website", error: error.message });
    }
  });

  // Get scrape jobs for a partner

router.get("/api/affiliate/partners/:id/jobs", isAuthenticated, async (req, res) => {
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

router.get("/api/affiliate/products", async (req, res) => {
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

router.get("/api/affiliate/products/:id", async (req, res) => {
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

  // Content Hub Discover endpoint — returns curated affiliate + registry items matched to a destination.
  // When a ?surface= param is provided (e.g. "travelpulse-discover"), explicit content_placement_rules
  // for that surface + city are fetched first (pinned items float to the top). The normal ILIKE
  // fallback still runs but excludes sourceIds already covered by explicit rules to avoid duplicates.

router.get("/api/content/discover", async (req, res) => {
    try {
      const destination = (req.query.destination as string || "").trim();
      const tabParam = (req.query.tab as string || "").trim();
      const surfaceParam = (req.query.surface as string || "").trim();
      // Support both ?content_types=foo,bar (string) and ?content_types[]=foo&content_types[]=bar (array)
      const rawContentTypes = req.query.content_types;
      const contentTypesParam: string = Array.isArray(rawContentTypes)
        ? (rawContentTypes as string[]).join(",")
        : (rawContentTypes as string || "").trim();

      if (!destination) {
        return res.json({ items: [], total: 0 });
      }

      // Extract city and country from destination string "City, Country"
      const parts = destination.split(",");
      const city = parts[0].trim();
      const country = parts.length > 1 ? parts[parts.length - 1].trim() : city;

      // Tab → content type and affiliate category mappings (from shared/content-surface-map.ts)
      const allowedContentTypes = tabParam && TAB_CONTENT_TYPE_MAP[tabParam]
        ? TAB_CONTENT_TYPE_MAP[tabParam]
        : contentTypesParam
          ? contentTypesParam.split(",").map(t => t.trim()).filter(Boolean)
          : ["experience", "template", "service", "media", "other"];

      const affiliateCategoryFilter = tabParam && TAB_AFFILIATE_CATEGORIES[tabParam]
        ? TAB_AFFILIATE_CATEGORIES[tabParam]
        : null;

      // ── Step 1: Explicit placement rules (when surface is provided) ───────────
      // Fetch city's current pulse score so we can honour minPulseScore thresholds.
      let cityPulseScore = 0;
      if (surfaceParam) {
        const pulseRow = await db
          .select({ pulseScore: travelPulseCities.pulseScore })
          .from(travelPulseCities)
          .where(ilike(travelPulseCities.cityName, `%${city}%`))
          .limit(1);
        cityPulseScore = pulseRow[0]?.pulseScore ?? 0;
      }

      // Load active placement rules for this surface + city.
      // A rule matches when isPinned=true OR cityPulseScore >= minPulseScore.
      const placementRules = surfaceParam
        ? await storage.getContentPlacementRules({
            cityName: city,
            surface: surfaceParam,
            isActive: true,
          })
        : [];

      const eligibleRules = placementRules.filter(
        r => r.isPinned || (r.minPulseScore ?? 0) <= cityPulseScore
      );

      // Separate rules by source type and collect sourceIds
      const pinnedAffiliateIds = eligibleRules
        .filter(r => r.contentSource === "affiliate_product" && r.isPinned)
        .map(r => r.sourceId).filter(Boolean) as string[];
      const pinnedRegistryIds = eligibleRules
        .filter(r => r.contentSource === "content_registry" && r.isPinned)
        .map(r => r.sourceId).filter(Boolean) as string[];
      const eligibleAffiliateIds = eligibleRules
        .filter(r => r.contentSource === "affiliate_product")
        .map(r => r.sourceId).filter(Boolean) as string[];
      const eligibleRegistryIds = eligibleRules
        .filter(r => r.contentSource === "content_registry")
        .map(r => r.sourceId).filter(Boolean) as string[];

      // Fetch explicitly-placed affiliate products
      const placedAffiliate = eligibleAffiliateIds.length
        ? await db.select().from(affiliateProducts)
            .where(and(
              eq(affiliateProducts.isActive, true),
              inArray(affiliateProducts.id, eligibleAffiliateIds)
            ))
        : [];

      // Fetch explicitly-placed registry items
      const placedRegistry = eligibleRegistryIds.length
        ? await db.select().from(contentRegistry)
            .where(and(
              eq(contentRegistry.status, "published"),
              inArray(contentRegistry.id, eligibleRegistryIds)
            ))
        : [];

      // ── Step 2: ILIKE fallback (excludes items already covered by rules) ─────
      const affiliateBaseCondition = and(
        eq(affiliateProducts.isActive, true),
        or(
          ilike(affiliateProducts.city, `%${city}%`),
          ilike(affiliateProducts.country, `%${country}%`),
          ilike(affiliateProducts.location, `%${city}%`)
        )
      );
      const affiliateCategoryCondition = affiliateCategoryFilter
        ? and(affiliateBaseCondition, or(
            ...affiliateCategoryFilter.map(cat => ilike(affiliateProducts.category, `%${cat}%`))
          ))
        : affiliateBaseCondition;

      // Use notInArray to safely exclude IDs already covered by placement rules
      const affiliateItems = await db
        .select()
        .from(affiliateProducts)
        .where(
          eligibleAffiliateIds.length
            ? and(affiliateCategoryCondition, sql`${affiliateProducts.id}::text != ALL(ARRAY[${sql.raw(eligibleAffiliateIds.map(id => `'${id.replace(/'/g, "''")}'`).join(','))}]::text[])`)
            : affiliateCategoryCondition
        )
        .limit(20);

      // Query content_registry for published items with location metadata matching destination.
      // Exclude registry items already loaded via placement rules.
      const registryItems = await db
        .select()
        .from(contentRegistry)
        .where(
          and(
            eq(contentRegistry.status, "published"),
            sql`(
              ${contentRegistry.metadata}->>'location' ILIKE ${'%' + city + '%'}
              OR ${contentRegistry.metadata}->>'city' ILIKE ${'%' + city + '%'}
              OR ${contentRegistry.metadata}->>'country' ILIKE ${'%' + country + '%'}
              OR ${contentRegistry.metadata}->>'destination' ILIKE ${'%' + city + '%'}
            )`,
            inArray(contentRegistry.contentType, allowedContentTypes as any),
            ...(eligibleRegistryIds.length
              ? [sql`${contentRegistry.id}::text != ALL(ARRAY[${sql.raw(eligibleRegistryIds.map(id => `'${id.replace(/'/g, "''")}'`).join(','))}]::text[])`]
              : [])
          )
        )
        .limit(20);

      // ── Normalizer helpers ────────────────────────────────────────────────────
      const normalizeAffiliate = (p: any, isPinned = false) => ({
        id: `affiliate-${p.id}`,
        sourceId: p.id,
        type: "affiliate" as const,
        contentCategory: p.category || "experience",
        title: p.name,
        description: p.shortDescription || p.description || "",
        cover_image: p.imageUrl || null,
        price: p.price ? String(p.price) : null,
        price_display: p.price ? `${p.currency || "USD"} ${parseFloat(p.price).toFixed(0)}` : null,
        affiliate_url: p.affiliateUrl || p.productUrl || null,
        source: "Affiliate Partner",
        rating: p.rating ? parseFloat(String(p.rating)) : null,
        city: p.city || null,
        country: p.country || null,
        duration: p.duration || null,
        highlights: p.highlights || [],
        metadata: p.metadata || {},
        isPinned,
        tracking: {
          productId: p.id,
          partnerId: null as string | null,
          isAffiliateTracked: true,
        },
      });

      const normalizeRegistry = (r: any, isPinned = false) => {
        const meta = r.metadata || {};
        const affiliateUrl = meta.affiliate_url || null;
        const metaPartnerId: string | null = meta.partnerId || meta.partner_id || null;
        return {
          id: `registry-${r.id}`,
          sourceId: r.id,
          type: "curated" as const,
          contentCategory: r.contentType,
          title: r.title || "Curated Experience",
          description: r.description || "",
          cover_image: meta.cover_image || meta.imageUrl || meta.image_url || null,
          price: meta.price ? String(meta.price) : null,
          price_display: meta.price ? `USD ${parseFloat(meta.price).toFixed(0)}` : null,
          affiliate_url: affiliateUrl,
          source: "Traveloure Curated",
          rating: meta.rating ? parseFloat(String(meta.rating)) : null,
          city: meta.city || meta.location || city,
          country: meta.country || country,
          duration: meta.duration || null,
          highlights: meta.highlights || [],
          metadata: meta,
          isPinned,
          tracking: {
            productId: null as string | null,
            partnerId: metaPartnerId,
            isAffiliateTracked: !!(affiliateUrl && metaPartnerId),
          },
        };
      };

      // ── Assemble final list ───────────────────────────────────────────────────
      // Order: pinned placed items → other placed items → ILIKE fallback items
      const placedAffiliateCards = placedAffiliate.map(p =>
        normalizeAffiliate(p, pinnedAffiliateIds.includes(p.id))
      );
      const placedRegistryCards = placedRegistry.map(r =>
        normalizeRegistry(r, pinnedRegistryIds.includes(r.id))
      );

      const pinnedItems = [
        ...placedAffiliateCards.filter(c => c.isPinned),
        ...placedRegistryCards.filter(c => c.isPinned),
      ];
      const placedItems = [
        ...placedAffiliateCards.filter(c => !c.isPinned),
        ...placedRegistryCards.filter(c => !c.isPinned),
      ];
      const fallbackItems = [
        ...affiliateItems.map(p => normalizeAffiliate(p)),
        ...registryItems.map(r => normalizeRegistry(r)),
      ];

      const allItems = [...pinnedItems, ...placedItems, ...fallbackItems];

      res.json({ items: allItems, total: allItems.length });
    } catch (err: any) {
      console.error("Content discover error:", err);
      res.status(500).json({ message: "Failed to fetch curated content", items: [], total: 0 });
    }
  });

  // Content Hub Checkout — creates Stripe Checkout Session for non-affiliate curated items.
  // Price, title, and currency are resolved server-side from the DB record; client-supplied
  // values are ignored to prevent price-tampering attacks.

router.post("/api/content/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      const userEmail = user?.email || undefined;

      const { itemId, itemType } = req.body;
      if (!itemId || !itemType) {
        return res.status(400).json({ message: "itemId and itemType are required" });
      }

      // --- Server-side item resolution (price is NOT trusted from client) ---
      let resolvedTitle: string;
      let resolvedPrice: number;       // in whole currency units, e.g. 49.99
      let resolvedCurrency: string;
      let resolvedDestination: string;

      if (itemType === "affiliate") {
        const [product] = await db
          .select()
          .from(affiliateProducts)
          .where(eq(affiliateProducts.id, itemId))
          .limit(1);
        if (!product) return res.status(404).json({ message: "Item not found" });
        if (!product.price || parseFloat(String(product.price)) <= 0) {
          return res.status(400).json({ message: "This item is not available for direct purchase" });
        }
        resolvedTitle = product.name;
        resolvedPrice = parseFloat(String(product.price));
        resolvedCurrency = (product.currency || "USD").toLowerCase();
        resolvedDestination = product.city || product.country || "";
      } else {
        // content_registry
        const [item] = await db
          .select()
          .from(contentRegistry)
          .where(eq(contentRegistry.id, itemId))
          .limit(1);
        if (!item) return res.status(404).json({ message: "Item not found" });
        const meta = (item.metadata as any) || {};
        if (!meta.price || parseFloat(String(meta.price)) <= 0) {
          return res.status(400).json({ message: "This item is not available for direct purchase" });
        }
        resolvedTitle = item.title || "Curated Experience";
        resolvedPrice = parseFloat(String(meta.price));
        resolvedCurrency = (meta.currency || "USD").toLowerCase();
        resolvedDestination = meta.city || meta.destination || meta.location || "";
      }

      const { getBaseUrl } = await import("../services/stripe.service");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });

      const baseUrl = getBaseUrl();
      const amountCents = Math.round(resolvedPrice * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: resolvedCurrency,
              product_data: {
                name: resolvedTitle,
                description: resolvedDestination
                  ? `Curated experience in ${resolvedDestination}`
                  : 'Curated Traveloure experience',
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'content_hub_purchase',
          userId,
          itemId: String(itemId),
          itemType,
        },
        success_url: `${baseUrl}/discover?purchase=success`,
        cancel_url: `${baseUrl}/discover?purchase=cancelled`,
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (err: any) {
      console.error("Content checkout error:", err);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Content Hub Affiliate Redirect — unified intermediary for ALL affiliate-linked content hub items.
  // Routes through the established affiliateScraperService.trackClick() path so all content-hub
  // affiliate clicks share the same tracking flow as other affiliate clicks.
  // For affiliate_products rows: productId is passed (valid FK).
  // For content_registry rows: partnerId from metadata is passed when present; otherwise neither
  //   ID is set (both FK fields are nullable) — the service still inserts the tracking row,
  //   then throws "not found" (expected); we catch it and return our locally-resolved URL.

router.post("/api/content/affiliate-redirect", async (req, res) => {
    try {
      const { itemId, itemType } = req.body;
      if (!itemId || !itemType) {
        return res.status(400).json({ message: "itemId and itemType are required" });
      }

      let affiliateUrl: string | null = null;
      const trackPayload: Record<string, any> = {
        initiatedBy: "user" as const,
        referrer: req.headers.referer || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        ipAddress: req.ip || undefined,
      };
      const authUserId = (req.user as any)?.claims?.sub || null;
      if (authUserId) trackPayload.userId = authUserId;

      if (itemType === "affiliate") {
        const [product] = await db
          .select()
          .from(affiliateProducts)
          .where(eq(affiliateProducts.id, itemId))
          .limit(1);
        if (!product) return res.status(404).json({ message: "Item not found" });
        affiliateUrl = product.affiliateUrl || product.productUrl || null;
        trackPayload.productId = product.id;  // valid FK → affiliate_products.id
      } else {
        // content_registry
        const [item] = await db
          .select()
          .from(contentRegistry)
          .where(eq(contentRegistry.id, itemId))
          .limit(1);
        if (!item) return res.status(404).json({ message: "Item not found" });
        const meta = (item.metadata as any) || {};
        affiliateUrl = meta.affiliate_url || null;
        // Pass partnerId when metadata carries a valid affiliate_partners FK value
        const metaPartnerId = meta.partnerId || meta.partner_id || null;
        if (metaPartnerId) trackPayload.partnerId = metaPartnerId;
      }

      if (!affiliateUrl) {
        return res.status(400).json({ message: "No affiliate URL available for this item" });
      }

      // Route through established service tracking path.
      // For registry items without productId/partnerId the service inserts the row (both FK cols are
      // nullable → null is valid), then throws "Product or partner not found" because it cannot look
      // up a return URL. We catch that narrow error and use our already-resolved affiliateUrl.
      const { affiliateScraperService } = await import("../services/affiliate-scraper.service");
      try {
        await affiliateScraperService.trackClick(trackPayload as any);
      } catch (trackErr: any) {
        if (trackErr?.message && !trackErr.message.includes("not found")) {
          console.error("Affiliate click tracking error:", trackErr);
        }
        // Otherwise: expected for registry items with no partner/product FK — insert already committed
      }

      res.json({ url: affiliateUrl });
    } catch (err: any) {
      console.error("Affiliate redirect error:", err);
      res.status(500).json({ message: "Failed to process affiliate redirect" });
    }
  });

  // Track affiliate click

router.post("/api/affiliate/track-click", async (req, res) => {
    try {
      const { productId, partnerId, userId, tripId, itineraryItemId, initiatedBy, agentType, sessionId } = req.body;
      
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
        initiatedBy: initiatedBy || "user",
        agentType: agentType || null,
        sessionId: sessionId || null,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to track click", error: error.message });
    }
  });

  // Lightweight iVisa / generic partner affiliate click tracker.
  // Unlike /api/affiliate/track-click this endpoint does NOT require a DB-stored productId/partnerId.
  // It inserts directly into affiliate_clicks with those FKs as null and uses `sessionId` to
  // record the partner name (e.g. "ivisa") so revenue reports can filter by it.

router.post("/api/affiliates/track", async (req, res) => {
    try {
      const { partner, destination, tripId, itineraryId } = req.body;
      if (!partner) {
        return res.status(400).json({ message: "partner is required" });
      }
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || null;
      await db.insert(affiliateClicks).values({
        productId: null,
        partnerId: null,
        userId: userId || null,
        tripId: tripId || itineraryId || null,
        referrer: req.headers.referer || null,
        userAgent: (req.headers["user-agent"] as string) || null,
        ipAddress: req.ip || null,
        initiatedBy: "user",
        agentType: null,
        sessionId: [partner, destination].filter(Boolean).join(":") || partner,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error tracking affiliates click:", error);
      res.status(500).json({ message: "Failed to track click" });
    }
  });

  // Admin: Affiliate reconciliation

router.get("/api/affiliate/products/by-location", async (req, res) => {
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

router.post("/api/content/:trackingNumber/flag", isAuthenticated, async (req, res) => {
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

router.get("/api/platform/stats", async (_req, res) => {
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

router.post("/api/track/search", async (req, res) => {
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

      // Feed zero-result searches back into demand signal layer as gap/opportunity signals (non-blocking)
      if (req.body.resultsCount === 0 && req.body.destination) {
        const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
        serviceRecommendationEngine
          .recordNoResultsSignal(req.body.destination, req.body.searchType)
          .catch((err: any) =>
            console.error("[track/search] no-results demand signal update failed:", err?.message),
          );
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Track search error:", err);
      res.status(500).json({ success: false });
    }
  });

  // Track page views

router.post("/api/track/pageview", async (req, res) => {
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

router.post("/api/track/funnel", async (req, res) => {
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

      // Feed this funnel event back into the demand signal layer (non-blocking)
      const { serviceRecommendationEngine } = await import("../services/service-recommendation-engine.service");
      serviceRecommendationEngine
        .recordFunnelEventAsSignal({
          stage: req.body.stage,
          serviceType: req.body.serviceType,
          destination: req.body.destination,
        })
        .catch((err: any) =>
          console.error("[track/funnel] demand signal update failed:", err?.message),
        );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false });
    }
  });

  // === DATA REPORTS FOR MONETIZATION ===

  // Destination Demand Report (sell to tourism boards)

router.post("/api/track/activity", async (req, res) => {
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

router.post("/api/track/trip-enhanced", async (req, res) => {
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

router.post("/api/track/destination-search", async (req, res) => {
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

  // ─── Booking Fee Config (Admin) ─────────────────────────────────────────────

router.post("/api/track/accommodation-preference", async (req, res) => {
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

  // ─── Cross-sell Click Events ─────────────────────────────────────────────────
  // POST /api/cross-sell-events
  // Tracks clicks on cross-sell service chips. Lightweight write — persistence
  // and analytics aggregation are handled by the "Cross-sell conversion tracking"
  // downstream task. This endpoint simply validates and acknowledges.

  const crossSellEventSchema = z.object({
    sourceContentId: z.string().min(1),
    sourceContentType: z.string().min(1),
    targetServiceId: z.string().min(1),
    eventType: z.enum(["click"]),
  });

  router.post("/api/cross-sell-events", async (req, res) => {
    try {
      const parsed = crossSellEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
      }
      // Lightweight acknowledgement — downstream conversion tracking task handles DB persistence.
      res.status(201).json({ ok: true, received: parsed.data });
    } catch (err: any) {
      console.error("[cross-sell-events] error:", err.message);
      res.status(500).json({ ok: false });
    }
  });

  // ─── Content-to-Supply Matching ─────────────────────────────────────────────
  // GET /api/content-match?type=restaurant&neighborhood=arashiyama&city=Kyoto&limit=3
  // Returns matched provider services and experts for a given content context.

  const contentMatchQuerySchema = z.object({
    type: z.string().min(1, "type is required"),
    neighborhood: z.string().optional().default(""),
    city: z.string().optional().default(""),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    limit: z.coerce.number().int().min(1).max(10).optional().default(3),
  });

  router.get("/api/content-match", async (req, res) => {
    try {
      const parsed = contentMatchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid query parameters",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { resolveMatches } = await import("../services/content-matching.service");
      const result = await resolveMatches({
        type: parsed.data.type,
        neighborhood: parsed.data.neighborhood || undefined,
        city: parsed.data.city || undefined,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        limit: parsed.data.limit,
      });

      res.json(result);
    } catch (err: any) {
      console.error("[content-match] error:", err.message);
      res.status(500).json({ providers: [], experts: [], affiliateFallback: true });
    }
  });

} // end registerDiscoveryRoutes

// === Exchange Rate Endpoint (top-level, always registered) ===
let _exchangeRateCache: { rates: Record<string, number>; fetchedAt: number } | null = null;
const EXCHANGE_RATE_TTL_MS = 60 * 60 * 1000;

router.get("/api/exchange-rates", async (_req, res) => {
  try {
    const now = Date.now();
    if (_exchangeRateCache && now - _exchangeRateCache.fetchedAt < EXCHANGE_RATE_TTL_MS) {
      return res.json({ base: "USD", rates: _exchangeRateCache.rates, cachedAt: _exchangeRateCache.fetchedAt });
    }
    const resp = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,SGD");
    if (!resp.ok) throw new Error(`Frankfurter API error: ${resp.status}`);
    const data = await resp.json() as { rates: Record<string, number> };
    _exchangeRateCache = { rates: data.rates, fetchedAt: now };
    res.json({ base: "USD", rates: data.rates, cachedAt: now });
  } catch (err) {
    console.error("Exchange rate fetch error:", err);
    const fallback = { EUR: 0.92, GBP: 0.79, JPY: 149.50, AUD: 1.53, SGD: 1.34 };
    res.json({ base: "USD", rates: fallback, cachedAt: Date.now(), fallback: true });
  }
});

export default router;
