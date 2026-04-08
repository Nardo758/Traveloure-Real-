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
import { verifyTripOwnership, logItineraryChange, sanitizeInput, sanitizeObject, mapFeverCategoryToEventType } from "./route-utils";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });


export function registerProviderRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/provider-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const form = await storage.getServiceProviderForm(userId);
    res.json(form || null);
  });

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

  app.get("/api/provider-services", async (req, res) => {
    const services = await storage.getAllProviderServices();
    res.json(services);
  });

  app.get("/api/provider/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getProviderServices(userId);
    res.json(services);
  });

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

  app.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const [schedule, blackoutDates] = await Promise.all([
        storage.getProviderAvailability(userId),
        storage.getProviderBlackoutDates(userId),
      ]);
      res.json({ schedule, blackoutDates });
    } catch (error) {
      console.error("Error fetching provider availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const availabilityInput = z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().min(1),
        endTime: z.string().min(1),
        isAvailable: z.boolean().optional().default(true),
        pricingModifier: z.number().optional().default(0),
        pricingReason: z.string().max(255).optional(),
      }).parse(req.body);
      const entry = await storage.setProviderAvailability({ ...availabilityInput, providerId: userId });
      res.status(201).json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating availability schedule:", error);
      res.status(500).json({ message: "Failed to create availability schedule" });
    }
  });

  app.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteProviderAvailability(req.params.id);
      res.json({ message: "Schedule entry deleted" });
    } catch (error) {
      console.error("Error deleting availability schedule:", error);
      res.status(500).json({ message: "Failed to delete availability schedule" });
    }
  });

  app.post("/api/provider/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const blackoutInput = z.object({
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        reason: z.string().max(500).nullable().optional(),
      }).parse(req.body);
      const blackout = await storage.addProviderBlackoutDate({ ...blackoutInput, providerId: userId });
      res.status(201).json(blackout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error adding blackout date:", error);
      res.status(500).json({ message: "Failed to add blackout date" });
    }
  });

  app.delete("/api/provider/blackout-dates/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteProviderBlackoutDate(req.params.id);
      res.json({ message: "Blackout date deleted" });
    } catch (error) {
      console.error("Error deleting blackout date:", error);
      res.status(500).json({ message: "Failed to delete blackout date" });
    }
  });

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
      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const details = await revenueTrackingService.getProviderRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Provider earnings details error:", error);
      res.status(500).json({ message: "Failed to get provider earnings details", error: error.message });
    }
  });

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
}
