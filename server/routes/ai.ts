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


export function registerAiRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
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

}
