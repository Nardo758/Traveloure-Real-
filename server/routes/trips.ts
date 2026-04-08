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


export function registerTripRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
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

  // === Basic Trip CRUD ===
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
    const userId = (req.user as any).claims.sub;
    if (trip.userId !== userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(trip);
  });

  app.post(api.trips.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.trips.create.input.parse(req.body);
      const sanitizedInput = sanitizeObject(input);
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
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

  // === Tourist Places ===
  app.get(api.touristPlaces.search.path, async (req, res) => {
    const query = req.query.query as string;
    if (!query) return res.json([]);
    const results = await storage.searchTouristPlaces(query);
    res.json(results);
  });
}
