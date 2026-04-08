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


export function registerServiceBookingRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
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
}
