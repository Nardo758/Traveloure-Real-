import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
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
  eaClientRelationships,
  eaExecutives, insertEaExecutiveSchema,
  eaEvents, insertEaEventSchema,
  eaTravelArrangements, insertEaTravelArrangementSchema,
  eaGifts, insertEaGiftSchema,
  eaSavedVenues, insertEaSavedVenueSchema,
  eaCommunications, insertEaCommunicationSchema,
  eaAiTasks, insertEaAiTaskSchema,
  userAndExpertContracts,
  expertSelectedServices,
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

function resolveSlug(slug: string): string {
  const slugMap: Record<string, string> = {
    "culinary": "dining", "food-tour": "dining", "restaurants": "dining",
    "adventure": "activities", "outdoor": "activities", "sport": "activities",
    "history": "cultural", "arts": "cultural", "museum": "cultural",
    "spa": "wellness", "yoga": "wellness", "meditation": "wellness",
    "transport": "transportation", "transfer": "transportation", "shuttle": "transportation",
    "hotel": "accommodation", "hostel": "accommodation", "resort": "accommodation",
  };
  return slugMap[slug.toLowerCase()] || slug;
}


  const expertBookingRequestSchema = z.object({
    tripId: z.string().optional(),
    notes: z.string().optional().default(""),
    serviceId: z.string().optional(),
    bookingMetadata: z.record(z.any()).optional(),
  });

router.post("/api/expert-booking-requests", isAuthenticated, async (req, res) => {
    try {
      const validation = expertBookingRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Invalid request body" 
        });
      }
      
      const { tripId, notes, serviceId, bookingMetadata } = validation.data;
      const userId = (req.user as any).claims.sub;
      
      // Only validate trip ownership when a tripId is provided
      if (tripId) {
        const trip = await storage.getTrip(tripId);
        if (trip && trip.userId !== userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }
      }

      let bookingId: string | undefined;

      // If a specific service is requested, create a service_bookings row
      // All financial and attribution values are derived server-side from the service record
      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          return res.status(404).json({ message: "Service not found" });
        }
        // Derive provider and pricing server-side — never trust client input
        const providerId = service.userId;
        const totalAmount = Number(service.price ?? 0);
        const shareRate = Number(service.revenueShareRate ?? EXPERT_SHARE_RATE);
        const platformFeeAmt = (totalAmount * (1 - shareRate)).toFixed(2);
        const providerEarningsAmt = (totalAmount * shareRate).toFixed(2);

        const booking = await storage.createServiceBooking({
          serviceId,
          travelerId: userId,
          providerId,
          tripId: tripId || null,
          bookingDetails: { notes },
          status: "pending",
          totalAmount: String(totalAmount),
          platformFee: platformFeeAmt,
          providerEarnings: providerEarningsAmt,
          ...(bookingMetadata ? { bookingMetadata } : {}),
        } as any);
        bookingId = booking.id;

        // Notify the expert/provider that a new booking request has arrived
        try {
          const traveler = await storage.getUser(userId);
          const travelerName = traveler
            ? [traveler.firstName, traveler.lastName].filter(Boolean).join(" ") || traveler.email || "A traveler"
            : "A traveler";
          await storage.createNotification({
            userId: providerId,
            type: "booking_request",
            title: "New Booking Request",
            message: `${travelerName} requested "${service.serviceName}" ($${totalAmount.toFixed(2)})`,
            relatedId: booking.id,
            relatedType: "booking",
            data: {
              bookingId: booking.id,
              serviceName: service.serviceName,
              travelerName,
              amount: totalAmount.toFixed(2),
            },
          });

          // Send email alert to the provider
          const provider = await storage.getUser(providerId);
          if (provider?.email) {
            const { sendBookingAlertEmail } = await import("../services/email.service");
            const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ") || provider.email;
            await sendBookingAlertEmail({
              providerEmail: provider.email,
              providerName,
              bookingId: booking.id,
              serviceName: service.serviceName,
              travelerName,
              amount: totalAmount.toFixed(2),
            });
          }
        } catch (notifErr) {
          // Non-fatal: log but don't fail the booking creation
          console.error("Failed to create booking notification:", notifErr);
        }
      }
      
      res.status(201).json({ 
        success: true, 
        message: bookingId
          ? "Booking request submitted successfully"
          : "Inquiry submitted — no service selected so no booking record was created",
        tripId,
        bookingId: bookingId || null,
        bookingCreated: !!bookingId,
        requestedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error creating expert booking request:", err);
      res.status(500).json({ message: "Failed to submit expert booking request" });
    }
  });

  // Get generated itinerary for a trip

router.get("/api/my-bookings", isAuthenticated, async (req, res) => {
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


router.get("/api/service-bookings", isAuthenticated, async (req, res) => {
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
          provider: provider ? { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, profileImage: provider.profileImageUrl } : null,
        };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("Service bookings error:", err);
      res.status(500).json({ message: "Failed to fetch service bookings" });
    }
  });


router.get("/api/bookings/user", isAuthenticated, async (req, res) => {
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


router.post("/api/cart/resolve-trip", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { experienceSlug, userExperienceId } = req.body;

    // 1. Get all cart items for this user (optionally filtered by experience slug)
    const items: any[] = experienceSlug
      ? await storage.getCartItems(userId, experienceSlug)
      : await storage.getCartItems(userId);

    // 2. Reuse an existing tripId if any cart item already has one
    const existingTripId = items.find((i) => i.tripId)?.tripId;
    if (existingTripId) {
      const trip = await storage.getTrip(existingTripId);
      if (trip && trip.userId === userId) {
        return res.json({ tripId: existingTripId, created: false, trip });
      }
    }

    // 3. Infer destination: most common city across cart items
    const cityCounts: Record<string, number> = {};
    for (const item of items) {
      const city =
        (item.contentMeta as any)?.city ||
        item.service?.location ||
        null;
      if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
    }
    const destination =
      Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "Your Destination";

    // 4. Infer start date: earliest scheduledDate, or today + 30 days
    const scheduledDates = items
      .map((i) => (i.scheduledDate ? new Date(i.scheduledDate) : null))
      .filter(Boolean) as Date[];
    const defaultStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const inferredStart =
      scheduledDates.length > 0
        ? scheduledDates.reduce((min, d) => (d < min ? d : min), scheduledDates[0])
        : defaultStart;
    const inferredEnd = new Date(inferredStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const startDate = inferredStart.toISOString().split("T")[0];
    const endDate = inferredEnd.toISOString().split("T")[0];

    // 5. Create the trip with inferred metadata
    const title = `Your ${destination} trip`;
    const trip = await storage.createTrip({
      userId,
      title,
      destination,
      startDate,
      endDate,
      numberOfTravelers: 2,
      status: "draft",
    });

    // 6. Backfill tripId on all matching cart items
    const whereClause = experienceSlug
      ? and(eq(cartItems.userId, userId), eq(cartItems.experienceSlug, experienceSlug))
      : eq(cartItems.userId, userId);
    await db.update(cartItems).set({ tripId: trip.id }).where(whereClause);

    // 7. Link to user_experience if one was provided (idempotent)
    if (userExperienceId) {
      await db
        .update(userExperiences)
        .set({ tripId: trip.id })
        .where(
          and(
            eq(userExperiences.id, userExperienceId),
            eq(userExperiences.userId, userId)
          )
        );
    }

    res.json({ tripId: trip.id, created: true, trip });
  } catch (err) {
    console.error("Error resolving cart trip:", err);
    res.status(500).json({ message: "Failed to resolve trip" });
  }
});

router.post("/api/cart/items", async (req, res) => {
    try {
      const userId = req.user ? (req.user as any).claims.sub : null;
      const guestSessionId = !userId ? (req.headers["x-guest-session"] as string | undefined) : undefined;

      if (!userId && !guestSessionId) {
        return res.status(400).json({ message: "Authentication or guest session required" });
      }

      const { serviceId, customVenueId, contentType, contentId, contentMeta, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug } = req.body;

      if (!serviceId && !customVenueId && !contentId) {
        return res.status(400).json({ message: "One of serviceId, customVenueId, or contentId is required" });
      }

      if (contentId) {
        const validTypes = ["gem", "hotel", "activity", "service"];
        if (contentType && !validTypes.includes(contentType)) {
          return res.status(400).json({ message: "Invalid contentType. Must be gem, hotel, activity, or service" });
        }
      }

      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          return res.status(404).json({ message: "Service not found" });
        }
      }
      if (customVenueId) {
        // Custom venues are user-owned resources — guests cannot add them
        if (!userId) {
          return res.status(403).json({ message: "Authentication required to add custom venues to cart" });
        }
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
        contentType: contentType || undefined,
        contentId: contentId || undefined,
        contentMeta: contentMeta || undefined,
        quantity: quantity || 1,
        tripId,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
        experienceSlug,
        guestSessionId,
      });
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Failed to add to cart:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Get single booking
  // NOTE: If requester is provider, traveler info is sanitized

router.get("/api/bookings/:id", isAuthenticated, async (req, res) => {
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

router.post("/api/bookings", isAuthenticated, async (req, res) => {
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
      } as any);
      
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

router.patch("/api/service-bookings/:id/visa-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.providerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const VALID_VISA_STATUSES = ["pending", "submitted", "in_review", "approved", "rejected"];
      const { visaApplicationStatus, notes, documentChecklist } = req.body;
      if (!VALID_VISA_STATUSES.includes(visaApplicationStatus)) {
        return res.status(400).json({ message: "Invalid visa application status" });
      }
      const metadata: Record<string, any> = { visaApplicationStatus };
      if (notes !== undefined) metadata.visaStatusNotes = notes;
      if (documentChecklist !== undefined) {
        if (!Array.isArray(documentChecklist)) {
          return res.status(400).json({ message: "documentChecklist must be an array" });
        }
        metadata.documentChecklist = documentChecklist.map((item: any) => ({
          label: String(item.label || ""),
          checked: Boolean(item.checked),
        }));
      }
      metadata.visaStatusUpdatedAt = new Date().toISOString();
      const updated = await storage.updateServiceBookingMetadata(req.params.id, metadata);

      // Send notification to the traveler about the visa status change
      try {
        const service = await storage.getProviderServiceById(booking.serviceId);
        const serviceName = (service as any)?.title || service?.serviceName || "your visa application";
        const statusMessages: Record<string, string> = {
          pending: `Your visa application for ${serviceName} is being prepared.`,
          submitted: `Your visa application for ${serviceName} has been submitted to the embassy.`,
          in_review: `Your visa application for ${serviceName} is currently under review.`,
          approved: `Great news! Your visa application for ${serviceName} has been approved.`,
          rejected: `Your visa application for ${serviceName} has been rejected. Please contact your expert for next steps.`,
        };
        const statusTitles: Record<string, string> = {
          pending: "Visa Application: Pending",
          submitted: "Visa Application: Submitted",
          in_review: "Visa Application: Under Review",
          approved: "Visa Application: Approved",
          rejected: "Visa Application: Rejected",
        };
        await storage.createNotification({
          userId: booking.travelerId,
          type: "visa_status_update",
          title: statusTitles[visaApplicationStatus] || "Visa Application Update",
          message: statusMessages[visaApplicationStatus] || `Your visa application status has been updated to: ${visaApplicationStatus}.`,
          relatedId: booking.id,
          relatedType: "booking",
          data: { bookingId: booking.id, visaApplicationStatus, serviceName: (service as any)?.title || service?.serviceName },
        });
      } catch (notifErr) {
        console.error("Failed to create visa status notification:", notifErr);
      }

      res.json(updated);
    } catch (err) {
      console.error("Visa status update error:", err);
      res.status(500).json({ message: "Failed to update visa status" });
    }
  });

  // Update traveler's document checklist checked state

router.patch("/api/service-bookings/:id/document-checklist", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const { documentChecklist } = req.body;
      if (!Array.isArray(documentChecklist)) {
        return res.status(400).json({ message: "documentChecklist must be an array" });
      }
      const sanitized = documentChecklist.map((item: any) => ({
        label: String(item.label || ""),
        checked: Boolean(item.checked),
      }));
      const updated = await storage.updateServiceBookingMetadata(req.params.id, { documentChecklist: sanitized });
      res.json(updated);
    } catch (err) {
      console.error("Document checklist update error:", err);
      res.status(500).json({ message: "Failed to update document checklist" });
    }
  });

  // Cancel booking (traveler action)

router.post("/api/bookings/:id/cancel", isAuthenticated, async (req, res) => {
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

router.get("/api/cart", async (req, res) => {
    const rawSlug = req.query.experience as string | undefined;
    const experienceSlug = rawSlug ? resolveSlug(rawSlug) : undefined;

    let items: any[];
    if (req.user) {
      const userId = (req.user as any).claims.sub;
      items = await storage.getCartItems(userId, experienceSlug);
    } else {
      const guestSessionId = req.headers["x-guest-session"] as string | undefined;
      if (!guestSessionId) {
        return res.json({ items: [], subtotal: "0.00", platformFee: "0.00", total: "0.00", itemCount: 0 });
      }
      items = await storage.getGuestCartItems(guestSessionId, experienceSlug);
    }

    // Per-item commission lookup — matches the logic in /api/checkout so the
    // quoted fee never diverges from the charged fee.
    const distinctIds = Array.from(new Set(
      items.filter(i => i.service?.categoryId).map(i => i.service!.categoryId as string)
    ));
    const cartCatMap = new Map<string, string>(); // categoryId → fee-config slug
    if (distinctIds.length > 0) {
      const catRows = await db.select({ id: serviceCategories.id, slug: serviceCategories.slug })
        .from(serviceCategories)
        .where(inArray(serviceCategories.id, distinctIds));
      for (const row of catRows) {
        cartCatMap.set(row.id, serviceCategorySlugToFeeCategory(row.slug));
      }
    }

    const safeRate = (v: any, fb: number) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fb; };

    let subtotal = 0;
    let platformFeeTotal = 0;
    for (const item of items) {
      const price = parseFloat(item.service?.price || "0") * (item.quantity || 1);
      const feeCategory = item.service?.categoryId
        ? (cartCatMap.get(item.service.categoryId) ?? "default")
        : "default";
      const rates = await resolveCommissionRates(feeCategory);
      const expertShare = safeRate(item.service?.revenueShareRate, rates.expertShareRate);
      subtotal += price;
      platformFeeTotal += price * (1 - expertShare);
    }

    res.json({
      items,
      subtotal: subtotal.toFixed(2),
      platformFee: platformFeeTotal.toFixed(2),
      total: (subtotal + platformFeeTotal).toFixed(2),
      itemCount: items.length,
    });
  });

  // Add to cart

router.post("/api/cart", async (req, res) => {
    try {
      const userId = req.user ? (req.user as any).claims.sub : null;
      const guestSessionId = !userId ? (req.headers["x-guest-session"] as string | undefined) : undefined;

      if (!userId && !guestSessionId) {
        return res.status(400).json({ message: "Authentication or guest session required" });
      }

      const { serviceId, customVenueId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug } = req.body;
      
      console.log("[Cart] Add to cart request:", { serviceId, customVenueId, experienceSlug: rawSlug, guest: !userId });
      
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
        // Custom venues are user-owned resources — guests cannot add them
        if (!userId) {
          return res.status(403).json({ message: "Authentication required to add custom venues to cart" });
        }
        const venue = await storage.getCustomVenue(customVenueId);
        if (!venue) {
          return res.status(404).json({ message: "Custom venue not found" });
        }
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
        guestSessionId,
      });
      
      res.status(201).json(item);
    } catch (err) {
      console.error("Add to cart error:", err);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Migrate guest cart after login/signup

router.post("/api/cart/migrate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { guestSessionId } = req.body;
      if (!guestSessionId || typeof guestSessionId !== "string") {
        return res.status(400).json({ message: "guestSessionId is required" });
      }
      const result = await storage.migrateGuestCart(guestSessionId, userId);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("Cart migration error:", err);
      res.status(500).json({ message: "Failed to migrate cart" });
    }
  });

  // Update cart item

router.patch("/api/cart/:id", async (req, res) => {
    try {
      const existing = await storage.getCartItemById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Cart item not found" });

      // Ownership check: must be authenticated owner OR matching guest session
      const userId = req.user ? (req.user as any).claims.sub : null;
      const guestSessionId = req.headers["x-guest-session"] as string | undefined;
      const isOwner =
        (userId && existing.userId === userId) ||
        (guestSessionId && existing.guestSessionId === guestSessionId);
      if (!isOwner) return res.status(403).json({ message: "Forbidden" });

      const { quantity, scheduledDate, notes } = req.body;
      const updated = await storage.updateCartItem(req.params.id, {
        quantity,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
      });
      
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove from cart

router.delete("/api/cart/:id", async (req, res) => {
    try {
      const existing = await storage.getCartItemById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Cart item not found" });

      // Ownership check: must be authenticated owner OR matching guest session
      const userId = req.user ? (req.user as any).claims.sub : null;
      const guestSessionId = req.headers["x-guest-session"] as string | undefined;
      const isOwner =
        (userId && existing.userId === userId) ||
        (guestSessionId && existing.guestSessionId === guestSessionId);
      if (!isOwner) return res.status(403).json({ message: "Forbidden" });

      await storage.removeFromCart(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Clear cart

router.delete("/api/cart", isAuthenticated, async (req, res) => {
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

router.get("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const contract = await storage.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    res.json(contract);
  });

  // === Itinerary Comparison & Optimization Routes ===


router.get("/api/vendor-availability/:serviceId", async (req, res) => {
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


router.post("/api/vendor-availability/:id/book", isAuthenticated, async (req, res) => {
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

router.get("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const states = await storage.getCoordinationStates(userId);
      res.json(states);
    } catch (error) {
      console.error("Error fetching coordination states:", error);
      res.status(500).json({ message: "Failed to fetch coordination states" });
    }
  });


router.get("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
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


router.get("/api/coordination-states/active/:experienceType", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const state = await storage.getActiveCoordinationState(userId, req.params.experienceType);
      res.json(state || null);
    } catch (error) {
      console.error("Error fetching active coordination state:", error);
      res.status(500).json({ message: "Failed to fetch active coordination state" });
    }
  });


router.post("/api/coordination-states", isAuthenticated, async (req, res) => {
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


router.patch("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
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


router.patch("/api/coordination-states/:id/status", isAuthenticated, async (req, res) => {
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


router.delete("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
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

router.get("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
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


router.post("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
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


router.patch("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
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


router.post("/api/coordination-bookings/:id/confirm", isAuthenticated, async (req, res) => {
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


router.delete("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
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

  // Amadeus Travel API Routes
  
  // Search airports/cities for autocomplete - uses database cache first

router.patch("/api/contracts/:id", isAuthenticated, async (req, res) => {
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


router.post("/api/contracts/:id/payment", isAuthenticated, async (req, res) => {
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


router.post("/api/contracts/:id/milestone", isAuthenticated, async (req, res) => {
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


router.post("/api/contracts/:id/communication", isAuthenticated, async (req, res) => {
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


router.delete("/api/contracts/:id", isAuthenticated, async (req, res) => {
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

router.post("/api/coordination/booking-request", isAuthenticated, async (req, res) => {
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


router.post("/api/coordination/propagate/:tripId/:anchorId", isAuthenticated, async (req, res) => {
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


router.post("/api/coordination/match-providers", isAuthenticated, async (req, res) => {
    try {
      const { findMatchingProviders } = await import('../services/provider-matching.service');
      const result = await findMatchingProviders(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to match providers", error: error.message });
    }
  });


router.post("/api/coordination/booking-context/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildBookingContext } = await import('../services/provider-matching.service');
      const { date, startTime, endTime } = req.body;
      const context = await buildBookingContext(req.params.tripId, date, startTime, endTime);
      res.json(context);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build context", error: error.message });
    }
  });

  // === Wedding Coordination ===


router.get("/api/coordination/wedding-timeline/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { buildWeddingTimeline } = await import('../services/wedding-coordination.service');
      const timeline = await buildWeddingTimeline(req.params.tripId);
      res.json(timeline);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to build wedding timeline", error: error.message });
    }
  });


router.get("/api/coordination/wedding-gaps/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getWeddingVendorGaps } = await import('../services/wedding-coordination.service');
      const gaps = await getWeddingVendorGaps(req.params.tripId);
      res.json({ gaps });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze vendor gaps", error: error.message });
    }
  });

  // === Corporate Coordination ===


router.get("/api/coordination/corporate-summary/:tripId", isAuthenticated, async (req, res) => {
    try {
      const { getCorporateLogisticsSummary } = await import('../services/corporate-coordination.service');
      const summary = await getCorporateLogisticsSummary(req.params.tripId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load corporate summary", error: error.message });
    }
  });


router.post("/api/coordination/staggered-arrivals/:tripId", isAuthenticated, async (req, res) => {
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


router.post("/api/coordination/split-activities/:tripId", isAuthenticated, async (req, res) => {
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

  // === Admin Users Management ===

export default router;
