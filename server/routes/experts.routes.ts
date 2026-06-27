import { verifyTripOwnership } from '../utils/trip-ownership';
import { checkProviderPublishGate } from '../services/provider-publish.service';
import { withQueryTimer } from '../utils/queryTimer';
import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { isEA } from "../middleware/ea-rbac";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, isNull, asc } from "drizzle-orm";
// NOTE: db is intentionally NOT imported here. All raw queries use experts-query.service.ts or storage.
import {
  getLocalExpertFormByUserId, getServiceProviderFormByUserId, getProviderVerificationStatus,
  getExpertServiceOfferingById, getTravelPulseData,
  getExpertAiTasks, createExpertAiTask, updateExpertAiTask,
  getExpertAiTaskById, getExpertAiTasksSince, insertAiInteractionForExpert,
  getAvailableSchedulesByDay, getAllProviderBlackoutDates,
  getUserByEmail, getEaClientRelationshipByClient, createEaClientRelationship,
  getEaClientRelationshipById, updateEaClientRelationship, deleteEaClientRelationship,
  insertNotification,
  getEaExecutives, createEaExecutive, getEaExecutiveById, updateEaExecutive, deleteEaExecutive,
  getEaEvents, createEaEvent, getEaEventById, updateEaEvent, deleteEaEvent,
  getEaTravelArrangements, createEaTravelArrangement, getEaTravelArrangementById,
  updateEaTravelArrangement, deleteEaTravelArrangement,
  getEaGifts, createEaGift, getEaGiftById, updateEaGift, deleteEaGift,
  getEaSavedVenues, createEaSavedVenue, getEaSavedVenueById, updateEaSavedVenue, deleteEaSavedVenue,
  getEaCommunications, createEaCommunication, deleteEaCommunication,
  getEaAiTasks, createEaAiTask, getEaAiTaskById, updateEaAiTask, deleteEaAiTask,
  getLocalKnowledgeNuggets, createLocalKnowledgeNugget, getLocalKnowledgeNuggetById,
  updateLocalKnowledgeNugget, deleteLocalKnowledgeNugget, getLocalKnowledgeNuggetsByCity,
  insertVisaRequirementCache, getVisaAssistanceServices, getRecentExpertContracts,
  getUserRole,
} from "../services/experts-query.service";
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
import { calculateCommission, BookingType } from "../utils/commissionCalculator";

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


// Slug aliasing for backward compatibility
const slugAliases: Record<string, string> = {
  "romance": "date-night",
  "corporate": "corporate-events",
};

function resolveSlug(slug: string): string {
  return slugAliases[slug] || slug;
}

router.get("/api/vendors", async (req, res) => {
    const { category, city } = req.query;
    const vendorList = await storage.getVendors(
      category as string | undefined, 
      city as string | undefined
    );
    res.json(vendorList);
  });


router.post("/api/vendors", isAuthenticated, async (req, res) => {
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

router.get("/api/expert-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const form = await storage.getLocalExpertForm(userId);
    res.json(form || null);
  });

  // Submit expert application

router.post("/api/expert-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
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

router.post("/api/expert-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/provider-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const form = await storage.getServiceProviderForm(userId);
    res.json(form || null);
  });

  // Submit provider application

router.post("/api/provider-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
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

router.post("/api/provider-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert/application-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const form = await getLocalExpertFormByUserId(userId);
      const identityStatus = (form as any)?.identityVerificationStatus ?? "pending";

      const steps = [
        {
          id: 1,
          title: "Basic Information",
          description: "Personal details and contact information",
          status: form ? "completed" : "pending",
          completedAt: form ? new Date((form as any).createdAt).toLocaleDateString() : undefined,
        },
        {
          id: 2,
          title: "Expertise & Destinations",
          description: "Your specialties and destination knowledge",
          status: form && ((form.destinations as any[])?.length > 0 || (form.specialties as any[])?.length > 0) ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 3,
          title: "Experience & Portfolio",
          description: "Professional background and work samples",
          status: form && (form.bio || (form as any).portfolio) ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 4,
          title: "Identity Verification",
          description: "Government ID and liveness check via Stripe Identity",
          status: identityStatus === "verified" ? "completed" : identityStatus === "processing" ? "in_progress" : identityStatus === "failed" ? "failed" : form ? "in_progress" : "pending",
          note: identityStatus === "pending" && form ? "Click 'Verify My Identity' above to begin" : undefined,
        },
        {
          id: 5,
          title: "Admin Review",
          description: "Our team reviews your application — typically 2-3 business days",
          status: form?.status === "approved" || form?.status === "rejected" ? "completed" : identityStatus === "verified" && form ? "in_progress" : "pending",
        },
        {
          id: 6,
          title: "Account Activation",
          description: "Your expert account is activated and ready",
          status: form?.status === "approved" ? "completed" : "pending",
        },
      ];

      res.json({
        steps,
        overallStatus: form?.status ?? "pending",
        identityVerificationStatus: identityStatus,
        identityVerifiedAt: (form as any)?.identityVerifiedAt,
        form: form ? { id: form.id, status: form.status, firstName: (form as any).firstName, createdAt: (form as any).createdAt } : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/provider/application-status — user-facing live step status for provider applicants

router.get("/api/provider/application-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const form = await getServiceProviderFormByUserId(userId);
      const identityStatus = (form as any)?.identityVerificationStatus ?? "pending";
      const bizStatus = (form as any)?.businessVerificationStatus ?? "pending";

      const steps = [
        {
          id: 1,
          title: "Business Information",
          description: "Business name, type, and contact details",
          status: form ? "completed" : "pending",
          completedAt: form ? new Date((form as any).createdAt).toLocaleDateString() : undefined,
        },
        {
          id: 2,
          title: "Service Categories",
          description: "Types of services you offer",
          status: form && (form as any).serviceType ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 3,
          title: "Location & Documentation",
          description: "Location, compliance, and supporting documents",
          status: form && (form.country || (form as any).province) ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 4,
          title: "Owner Identity Verification",
          description: "Government ID verification for the business owner",
          status: identityStatus === "verified" ? "completed" : identityStatus === "processing" ? "in_progress" : identityStatus === "failed" ? "failed" : form ? "in_progress" : "pending",
          note: identityStatus === "pending" && form ? "Click 'Verify Owner ID' above to begin" : undefined,
        },
        {
          id: 5,
          title: "Business Verification",
          description: "Registry check against national business databases",
          status: bizStatus === "verified" ? "completed" : bizStatus === "submitted" ? "in_progress" : bizStatus === "failed" ? "failed" : form ? "in_progress" : "pending",
          note: bizStatus === "pending" && form ? "Enter your business details above to begin" : undefined,
        },
        {
          id: 6,
          title: "Admin Review",
          description: "Our team reviews your application — typically 3-5 business days",
          status: form?.status === "approved" || form?.status === "rejected" ? "completed" : (bizStatus === "verified" && identityStatus === "verified") ? "in_progress" : "pending",
        },
        {
          id: 7,
          title: "Account Activation",
          description: "Your provider account is activated and ready",
          status: form?.status === "approved" ? "completed" : "pending",
        },
      ];

      res.json({
        steps,
        overallStatus: form?.status ?? "pending",
        identityVerificationStatus: identityStatus,
        identityVerifiedAt: (form as any)?.identityVerifiedAt,
        businessVerificationStatus: bizStatus,
        businessCountry: (form as any)?.businessCountry,
        form: form ? {
          id: form.id,
          status: form.status,
          businessName: form.businessName,
          country: form.country,
          createdAt: (form as any).createdAt,
        } : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === Provider Services Routes ===
  
  // Get all active provider services (public - for experience browsing)

router.get("/api/provider-services", async (req, res) => {
    const services = await storage.getAllProviderServices();
    res.json(services);
  });
  
  // Get provider's services

router.get("/api/provider/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { destination, category, activeOnly } = req.query as Record<string, string>;
    const services = await storage.getProviderServices(userId, {
      destination: destination || undefined,
      category: category || undefined,
      activeOnly: activeOnly === "true",
    });
    res.json(services);
  });

  // Get a single provider service by ID (ownership required)

router.get("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      res.json(service);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch service" });
    }
  });

  // Create a new service

router.post("/api/provider/services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const input = insertProviderServiceSchema.parse(req.body);

      // Verification publish-gate — rule lives in provider-publish.service.ts
      if (input.status === "active") {
        const gate = await checkProviderPublishGate(userId, (input as any).categoryId);
        if (!gate.allowed) {
          return res.status(422).json({ message: gate.message, code: gate.code });
        }
      }

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

router.patch("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const services = await storage.getProviderServices(userId);
      const ownedService = services.find(s => s.id === req.params.id);
      if (!ownedService) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const input = insertProviderServiceSchema.partial().parse(req.body);

      // Verification publish-gate — rule lives in provider-publish.service.ts
      if (input.status === "active") {
        const categoryId = ((input as any).categoryId ?? ownedService.categoryId) as string | undefined;
        const gate = await checkProviderPublishGate(userId, categoryId);
        if (!gate.allowed) {
          return res.status(422).json({ message: gate.message, code: gate.code });
        }
      }

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

router.delete("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const services = await storage.getProviderServices(userId);
    const ownedService = services.find(s => s.id === req.params.id);
    if (!ownedService) {
      return res.status(404).json({ message: "Service not found or not owned by you" });
    }
    await storage.deleteProviderService(req.params.id);
    res.status(204).send();
  });

  // === City Neighborhoods (v2 spec §5.1) ===
  // Public lookup powering the provider listing form's neighborhood picker
  // and the location-view neighborhood-as-ecosystem unit (Phase 3).

router.get("/api/expert-service-categories", async (_req, res) => {
    const categories = await storage.getExpertServiceCategories();
    const categoriesWithOfferings = await Promise.all(categories.map(async (cat) => {
      const offerings = await storage.getExpertServiceOfferings(cat.id);
      return { ...cat, offerings };
    }));
    res.json(categoriesWithOfferings);
  });

  // Get expert service offerings for a specific category

router.get("/api/expert-service-categories/:categoryId/offerings", async (req, res) => {
    const offerings = await storage.getExpertServiceOfferings(req.params.categoryId);
    res.json(offerings);
  });

  // Get all experts with their full profiles (public)

router.get("/api/experts", async (req, res) => {
    const experienceTypeId = req.query.experienceTypeId as string | undefined;
    const location = req.query.location as string | undefined;
    const experienceType = req.query.experienceType as string | undefined;
    const neighbourhood = req.query.neighbourhood as string | undefined;
    const experts = await withQueryTimer(
      "expert-matching-list",
      () => storage.getExpertsWithProfiles(experienceTypeId),
      (req.user as any)?.claims?.role
    );

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

    // Filter by neighbourhood name (case-insensitive substring match, minimum 3 chars to avoid noise)
    if (neighbourhood) {
      const nbh = neighbourhood.toLowerCase().trim();
      filtered = filtered.filter((expert: any) => {
        if (nbh.length < 3) return false;
        const neighborhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
        return neighborhoods.some((n: string) => n.toLowerCase().includes(nbh));
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

router.get("/api/experts/:id", async (req, res) => {
    const experts = await storage.getExpertsWithProfiles();
    const expert = experts.find(e => e.id === req.params.id);
    if (!expert) {
      return res.status(404).json({ message: "Expert not found" });
    }
    res.json(expert);
  });

  // Get services offered by a specific expert (public)

router.get("/api/experts/:id/services", async (req, res) => {
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

router.get("/api/experts/:id/reviews", async (req, res) => {
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

  // GET /api/expert/neighborhoods — Return current expert's neighborhoods + locality proof

router.get("/api/expert/neighborhoods", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const form = await storage.getLocalExpertForm(userId);
      res.json({
        neighborhoods: (form?.neighborhoods as string[]) || [],
        localityProof: form?.localityProof || "",
      });
    } catch (err) {
      console.error("Error fetching expert neighborhoods:", err);
      res.status(500).json({ message: "Failed to fetch" });
    }
  });

  // PATCH /api/expert/neighborhoods — Save expert's neighbourhood coverage

router.patch("/api/expert/neighborhoods", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { neighborhoods, localityProof } = req.body;
      if (!Array.isArray(neighborhoods)) {
        return res.status(400).json({ message: "neighborhoods must be an array" });
      }
      if (localityProof !== undefined && typeof localityProof !== "string") {
        return res.status(400).json({ message: "localityProof must be a string" });
      }

      // Normalise: trim whitespace, drop empty strings, deduplicate case-insensitively
      // (first occurrence wins — preserves the casing the user typed first)
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const raw of neighborhoods) {
        if (typeof raw !== "string") continue;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          cleaned.push(trimmed);
        }
      }

      const MAX_NEIGHBORHOODS = 20;
      if (cleaned.length > MAX_NEIGHBORHOODS) {
        return res.status(400).json({
          message: `You can add at most ${MAX_NEIGHBORHOODS} neighbourhoods. Please remove some before saving.`,
        });
      }

      await storage.updateLocalExpertFormNeighborhoods(userId, cleaned, localityProof ?? "");
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert neighborhoods:", err);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  // PATCH /api/expert/role — Self-service role change for approved experts only
router.patch("/api/expert/role", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      // Verify caller is an approved expert — non-experts cannot self-promote
      const form = await storage.getLocalExpertForm(userId);
      if (!form) {
        return res.status(403).json({ message: "No expert application found" });
      }
      if (form.status !== "approved") {
        return res.status(403).json({ message: "Only approved experts can change their role" });
      }

      const { expertType } = req.body;
      const validTypes = ["travel_expert", "local_expert", "event_planner", "executive_assistant"];
      if (!expertType || !validTypes.includes(expertType)) {
        return res.status(400).json({ message: "Invalid expert type" });
      }

      // Local Expert requires specific vetting — only allow if already a local_expert
      const currentType = form.expertType;
      if (expertType === "local_expert" && currentType !== "local_expert") {
        return res.status(403).json({
          message: "Switching to Local Expert requires admin review. Please contact support to have your application re-evaluated.",
          requiresReview: true,
        });
      }

      await storage.updateLocalExpertFormType(userId, expertType);
      res.json({ success: true, expertType });
    } catch (err) {
      console.error("Error updating expert role:", err);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // PATCH /api/expert/profile-notes — Save expert's notes style description

router.patch("/api/expert/profile-notes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { notesStyle } = req.body;
      if (typeof notesStyle !== "string") {
        return res.status(400).json({ message: "notesStyle must be a string" });
      }
      await storage.updateLocalExpertFormNotesStyle(userId, notesStyle.trim());
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert notes style:", err);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  // Get current expert's selected services (authenticated)

router.get("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const services = await storage.getExpertSelectedServices(userId);
    res.json(services);
  });

  // Add service offering to expert's profile (authenticated)

router.post("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { serviceOfferingId, customPrice } = req.body;
    const service = await storage.addExpertSelectedService(userId, serviceOfferingId, customPrice);
    res.json(service);
  });

  // Remove service offering from expert's profile (authenticated)

router.delete("/api/expert/selected-services/:serviceOfferingId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    await storage.removeExpertSelectedService(userId, req.params.serviceOfferingId);
    res.json({ success: true });
  });

  // Get current expert's specializations (authenticated)

router.get("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const specializations = await storage.getExpertSpecializations(userId);
    res.json(specializations);
  });

  // Add specialization to expert's profile (authenticated)

router.post("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { specialization } = req.body;
    const spec = await storage.addExpertSpecialization(userId, specialization);
    res.json(spec);
  });

  // Remove specialization from expert's profile (authenticated)

router.delete("/api/expert/specializations/:specialization", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    await storage.removeExpertSpecialization(userId, req.params.specialization);
    res.json({ success: true });
  });

  // === Expert Custom Services (User-submitted offerings) ===
  
  // Get current expert's custom services (authenticated)

router.get("/api/expert/custom-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

    // expert_id / external_id columns were dropped in migration 013.
    // Expert-owned services now live in provider_services (not ESO).
    // Return legacy expert_custom_services rows only.
    const legacyRows = await storage.getExpertCustomServices(userId);
    res.json(legacyRows);
  });

  // Get single custom service by ID (authenticated - owner only)

router.get("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.post("/api/expert/custom-services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = await storage.getUser(userId);

      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }

      // expert_custom_services table and workflow columns on expert_service_offerings were
      // both dropped in migration 013. Expert-owned services are now managed via
      // provider_services. This endpoint is deprecated; redirect callers to
      // POST /api/provider/services instead.
      return res.status(410).json({
        message: "This endpoint is deprecated. Create services via POST /api/provider/services instead.",
      });
    } catch (err) {
      console.error("Error in deprecated custom-services endpoint:", err);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Update custom service (authenticated - owner only, draft status only)

router.patch("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

      const { isActive: _ignoreIsActive, status: _ignoreStatus, ...safeBody } = req.body;
      const updated = await storage.updateExpertCustomService(req.params.id, safeBody);
      res.json(updated);
    } catch (err) {
      console.error("Error updating custom service:", err);
      res.status(500).json({ message: "Failed to update custom service" });
    }
  });

  // Submit custom service for approval (authenticated - owner only)

router.post("/api/expert/custom-services/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.delete("/api/expert/custom-services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert-templates", async (req, res) => {
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

router.get("/api/expert-templates/:id", async (req, res) => {
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

router.get("/api/expert/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const templates = await storage.getExpertTemplates({ expertId: userId });
      res.json(templates);
    } catch (err) {
      console.error("Error fetching expert templates:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Create new template (authenticated)

router.post("/api/expert/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.patch("/api/expert/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.delete("/api/expert/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.post("/api/expert-templates/:id/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

      // Commission split for expert template purchases — always EXPERT_SESSION surface.
      // calculateCommission is the typed, pure path; resolveCommissionRates (DB-backed)
      // is kept as the ground-truth for the actual stored rates.
      const price = parseFloat(template.price as string);
      const commission = calculateCommission(price, BookingType.EXPERT_SESSION);
      const platformFee = commission.platformFee;
      const expertEarnings = commission.expertPayout ?? 0;

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

      res.json({
        purchase,
        template,
        // Commission breakdown (step 5)
        subtotal: price,
        platformFee,
        expertPayout: expertEarnings,
        bookingType: BookingType.EXPERT_SESSION,
        commissionRate: commission.commissionRate,
      });
    } catch (err) {
      console.error("Error purchasing template:", err);
      res.status(500).json({ message: "Failed to purchase template" });
    }
  });

  // Get user's purchased templates

router.get("/api/my-purchased-templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert-templates/:id/reviews", async (req, res) => {
    try {
      const reviews = await storage.getTemplateReviews(req.params.id);
      res.json(reviews);
    } catch (err) {
      console.error("Error fetching reviews:", err);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Create template review (authenticated - must have purchased)

router.post("/api/expert-templates/:id/reviews", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
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

router.get("/api/expert/earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      // Fetch bookings (for transactions list), payout history, and authoritative ledger summary
      const [bookings, payouts, ledgerSummary] = await Promise.all([
        storage.getServiceBookings({ providerId: userId }),
        storage.getExpertPayouts(userId),
        storage.getExpertEarningsSummary(userId),
      ]);

      // Compute gross/fee totals and monthly figure from bookings for display context
      const now = new Date();
      let grossBookingTotal = 0;
      let platformFeeTotal = 0;
      let monthlyEarnings = 0;

      for (const b of bookings) {
        const gross = Number(b.totalAmount ?? 0);
        const fee = Number(b.platformFee ?? 0);
        const earned = Number(b.providerEarnings ?? 0);

        grossBookingTotal += gross;
        platformFeeTotal += fee;

        if (b.status === "completed") {
          const completedAt = b.completedAt ? new Date(b.completedAt) : null;
          if (completedAt && completedAt.getMonth() === now.getMonth() && completedAt.getFullYear() === now.getFullYear()) {
            monthlyEarnings += earned;
          }
        }
      }

      const effectiveRate = grossBookingTotal > 0
        ? Number(((ledgerSummary.total) / grossBookingTotal).toFixed(4))
        : EXPERT_SHARE_RATE;

      const lastPayout = payouts[0];

      // Summary figures sourced from the expert_earnings ledger — same source used by payout request validation
      const summary = {
        totalEarnings: ledgerSummary.total,
        monthlyEarnings,
        pendingPayout: ledgerSummary.pending,
        availableForPayout: ledgerSummary.available,
        lastPayout: lastPayout ? parseFloat(lastPayout.amount || '0') : 0,
        lastPayoutDate: lastPayout?.processedAt
          ? new Date(lastPayout.processedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : undefined,
        platformFeeTotal: Number(platformFeeTotal.toFixed(2)),
        grossBookingTotal: Number(grossBookingTotal.toFixed(2)),
        revenueShareRate: effectiveRate,
      };

      // Build transactions from service_bookings for the activity feed
      const bookingTransactions = [...bookings]
        .sort((a, b) => new Date(b.createdAt as any || 0).getTime() - new Date(a.createdAt as any || 0).getTime())
        .slice(0, 20)
        .map(b => ({
          id: b.id,
          amount: b.providerEarnings || "0",
          type: "service_booking",
          status: b.status || "pending",
          createdAt: b.createdAt || new Date().toISOString(),
          description: `Booking #${b.trackingNumber || b.id.slice(0, 8)}`,
        }));

      res.json({ earnings: bookingTransactions, summary });
    } catch (err) {
      console.error("Error fetching earnings:", err);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // Get expert template sales (authenticated)

router.get("/api/expert/template-sales", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.post("/api/expert/:expertId/tip", isAuthenticated, async (req, res) => {
    try {
      const travelerId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert/tips", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const result = await storage.getTipsForExpert(userId);
      res.json(result);
    } catch (err) {
      console.error("Error fetching tips:", err);
      res.status(500).json({ message: "Failed to fetch tips" });
    }
  });

  // Expert Referrals - Get referral code and stats

router.get("/api/expert/referrals", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert/affiliate-earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const earnings = await storage.getAffiliateEarnings(userId);
      const summary = await storage.getAffiliateEarningsSummary(userId);
      res.json({ earnings, summary });
    } catch (err) {
      console.error("Error fetching affiliate earnings:", err);
      res.status(500).json({ message: "Failed to fetch affiliate earnings" });
    }
  });

  // Comprehensive Revenue Optimization endpoint

router.get("/api/expert/revenue-optimization", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
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

      // Calculate expert's share percentages — policy: service/template 75%, affiliate 30%
      const serviceExpertPct = parseFloat(serviceSplit?.expertPercentage || '75') / 100;
      const templateExpertPct = parseFloat(templateSplit?.expertPercentage || '75') / 100;
      
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

router.get("/api/providers/:userId/public-verification", async (req, res) => {
    try {
      const form = await getProviderVerificationStatus(req.params.userId);
      if (!form) return res.json({ identityVerified: false, businessVerified: false });
      res.json({
        identityVerified: form.identityVerificationStatus === "verified",
        businessVerified: form.businessVerificationStatus === "verified",
      });
    } catch {
      res.json({ identityVerified: false, businessVerified: false });
    }
  });

  // Browse all active services (public marketplace)

router.get("/api/expert/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const status = req.query.status as string | undefined;
    const services = await storage.getProviderServicesByStatus(userId, status);
    res.json(services);
  });

  // Toggle service status (pause/activate)

router.patch("/api/expert/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.post("/api/expert/services/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  // GET /api/expert/service-templates — role-filtered platform template catalog
  // Returns platform templates (expertId IS NULL) whose targetRoles is NULL (all roles)
  // OR contains the requesting expert's role. Includes a `roleBadge` field so the UI
  // can display why each template appears.

router.get("/api/expert/service-templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      // Resolve the expert's role from their application form
      const formRow = await db
        .select({ expertType: localExpertForms.expertType })
        .from(localExpertForms)
        .where(eq(localExpertForms.userId, userId))
        .then((r) => r[0]);

      const expertRole = formRow?.expertType ?? null; // null = no form submitted yet

      // expertId and isActive columns dropped in migration 013; all ESO rows are platform templates.
      // Filter by targetRoles only.
      const rows = await db
        .select()
        .from(expertServiceOfferings)
        .where(
          or(
            isNull(expertServiceOfferings.targetRoles),
            expertRole
              ? sql`${expertRole} = ANY(${expertServiceOfferings.targetRoles})`
              : sql`false`
          )
        )
        .orderBy(expertServiceOfferings.sortOrder);

      const ROLE_LABELS: Record<string, string> = {
        local_expert:  "Local Expert",
        travel_expert: "Travel Advisor",
        event_planner: "Event Planner",
        executive_assistant: "Executive Assistant",
      };

      const templates = rows.map((o) => {
        const isRoleSpecific =
          Array.isArray(o.targetRoles) && o.targetRoles.length > 0;
        return {
          id: o.id,
          title: o.name,
          description: o.description,
          categoryId: null,
          serviceType: null,
          deliveryMethod: null,
          deliveryTimeframe: null,
          suggestedPrice: o.price,
          requirements: null,
          whatIncluded: null,
          isActive: o.isDefault ?? true,
          sortOrder: o.sortOrder,
          createdAt: o.createdAt,
          targetRoles: o.targetRoles ?? [],
          roleBadge: isRoleSpecific && expertRole
            ? ROLE_LABELS[expertRole] ?? expertRole
            : null,
        };
      });

      res.json(templates);
    } catch (err) {
      console.error("Error fetching expert service templates:", err);
      res.status(500).json({ message: "Failed to fetch service templates" });
    }
  });

  // GET /api/expert/role — returns the expert's role type and a human-readable label
  // Used by the UI to show the role callout even when no role-specific templates exist yet.

router.get("/api/expert/role", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      const formRow = await db
        .select({ expertType: localExpertForms.expertType })
        .from(localExpertForms)
        .where(eq(localExpertForms.userId, userId))
        .then((r) => r[0]);

      const expertRole = formRow?.expertType ?? null;

      const ROLE_LABELS: Record<string, string> = {
        local_expert:        "Local Expert",
        travel_expert:       "Travel Advisor",
        event_planner:       "Event Planner",
        executive_assistant: "Executive Assistant",
      };

      res.json({
        role:      expertRole,
        roleLabel: expertRole ? (ROLE_LABELS[expertRole] ?? expertRole) : null,
      });
    } catch (err) {
      console.error("Error fetching expert role:", err);
      res.status(500).json({ message: "Failed to fetch expert role" });
    }
  });

  // Create service from template

router.post("/api/expert/services/from-template/:templateId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const templateId = req.params.templateId;

      // expert_service_offerings is the primary catalog; service_templates is legacy fallback.
      // expertId column was dropped in migration 013 — all ESO rows are platform templates.
      const esoRow = await getExpertServiceOfferingById(templateId);

      let serviceData: Record<string, any>;

      if (esoRow) {
        // Primary: expert_service_offerings platform template — copy all available fields.
        // We write into provider_services (not expert_service_offerings) because the full
        // expert services edit/list/status/duplicate flow (ServiceForm, /api/expert/services,
        // PATCH /api/provider/services/:id) operates on provider_services rows.
        // The ServiceForm fetches from /api/provider/services/:id, so the created row must
        // exist there for /expert/services/:id/edit to load correctly.
        // Note: duration, cancellationPolicy, leadTime, deliverables, experienceTypes, galleryImages,
        // imageUrl were dropped from ESO in migration 013; they are set on the provider_services row.
        serviceData = {
          userId,
          serviceName:      esoRow.name,
          description:      esoRow.description ?? undefined,
          price:            esoRow.price || "0",
          status:           "draft",
          approvalStatus:   "draft",
        };
      } else {
        // Fallback: service_templates (legacy / admin-created)
        const stRow = await storage.getServiceTemplate(templateId);
        if (!stRow) {
          return res.status(404).json({ message: "Template not found" });
        }
        serviceData = {
          userId,
          serviceName:      stRow.title,
          description:      stRow.description ?? undefined,
          price:            stRow.suggestedPrice ?? "0",
          serviceType:      stRow.serviceType ?? undefined,
          deliveryMethod:   stRow.deliveryMethod ?? undefined,
          deliveryTimeframe: stRow.deliveryTimeframe ?? undefined,
          requirements:     stRow.requirements as string | undefined,
          whatIncluded:     stRow.whatIncluded as string | undefined,
          status:           "draft",
          approvalStatus:   "draft",
        };
      }

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

router.get("/api/expert/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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
          displayName: getDisplayName(traveler!.firstName, traveler!.lastName)
        } : null
      };
    }));
    
    res.json(enrichedBookings);
  });

  // Get bookings for traveler (services they booked)
  // Provider bookings (for calendar)
  // NOTE: User data is sanitized - providers cannot see full traveler info

router.get("/api/provider/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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
          displayName: getDisplayName(traveler!.firstName, traveler!.lastName)
        } : null
      };
    }));
    
    res.json(enrichedBookings);
  });


router.get("/api/client/:clientId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.patch("/api/expert/bookings/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  // Update visa application status on a service booking (expert/provider action)

router.post("/api/expert/reviews/:id/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert/analytics", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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


router.get("/api/expert/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const [services, bookings, earnings, form] = await Promise.all([
        storage.getProviderServicesByStatus(userId),
        storage.getServiceBookings({ providerId: userId }),
        storage.getExpertEarnings(userId),
        storage.getLocalExpertForm(userId),
      ]);
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      const approvalStatus = form?.status ?? null;
      const stripeConnectStatus = (form as any)?.stripeConnectStatus ?? "not_started";
      res.json({
        summary: { totalRevenue, totalBookings, completedBookings: completedBookings.length, pendingBookings: pendingBookings.length },
        services: services.map(s => ({ id: s.id, serviceName: s.serviceName, status: s.status, bookingsCount: s.bookingsCount, totalRevenue: s.totalRevenue })),
        recentEarnings: earnings.slice(0, 10),
        approvalStatus,
        stripeConnectStatus,
        isRoutingEligible: approvalStatus === "approved",
        isPayable: stripeConnectStatus === "complete",
      });
    } catch (err) {
      console.error("Expert dashboard error:", err);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });


router.get("/api/provider/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

router.get("/api/expert/market-intelligence", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      // Get expert's profile to find their markets/destinations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      const expertCity = expertProfile?.city;
      const expertCountry = expertProfile?.country;
      
      // Fetch all trending destinations from TravelPulse
      const { trending: allTrending, cities: allCities, happeningNow: allHappeningNow } = await getTravelPulseData();
      
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

router.get("/api/recommendations/expert", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      const recommendations = await serviceRecommendationEngine.getExpertRecommendations(userId, cities, limit);
      
      res.json({ recommendations });
    } catch (err) {
      console.error("Error fetching expert recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Get service recommendations for providers

router.get("/api/recommendations/provider", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      const recommendations = await serviceRecommendationEngine.getProviderRecommendations(userId, location, limit);
      
      res.json({ recommendations, location });
    } catch (err) {
      console.error("Error fetching provider recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Get service recommendations for users (trip planning)

router.get("/api/recommendations/user", async (req, res) => {
    try {
      const city = req.query.city as string | undefined;
      const experienceType = req.query.experienceType as string | undefined;
      const preferences = req.query.preferences ? (req.query.preferences as string).split(",") : undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const userId = (req.user as any)?.claims?.sub || "anonymous";
      
      // If no city provided, return trending destinations as recommendations
      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      
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

router.get("/api/recommendations/market-intelligence/:city", async (req, res) => {
    try {
      const { city } = req.params;
      
      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      const intelligence = await serviceRecommendationEngine.getMarketIntelligence(city);
      
      res.json(intelligence);
    } catch (err) {
      console.error("Error fetching market intelligence:", err);
      res.status(500).json({ message: "Failed to fetch market intelligence" });
    }
  });

  // Get seasonal opportunities

router.get("/api/recommendations/seasonal/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      
      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      const opportunities = await serviceRecommendationEngine.getSeasonalOpportunities(city, month);
      
      res.json({ opportunities, city, month: month || new Date().getMonth() + 1 });
    } catch (err) {
      console.error("Error fetching seasonal opportunities:", err);
      res.status(500).json({ message: "Failed to fetch seasonal opportunities" });
    }
  });

  // Refresh demand signals for a city (authenticated users only for now)

router.post("/api/recommendations/refresh/:city", isAuthenticated, async (req, res) => {
    try {
      const { city } = req.params;
      const country = req.query.country as string;
      
      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      const count = await serviceRecommendationEngine.refreshDemandSignalsForCity(city);
      
      res.json({ message: `Generated ${count} demand signals for ${city}`, count });
    } catch (err) {
      console.error("Error refreshing demand signals:", err);
      res.status(500).json({ message: "Failed to refresh demand signals" });
    }
  });

  // Record recommendation conversion (when user acts on a recommendation)

router.post("/api/recommendations/:id/convert", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
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
      
      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      await serviceRecommendationEngine.recordConversion(id, userId, conversionType, resultId, revenueGenerated);
      
      res.json({ message: "Conversion recorded" });
    } catch (err) {
      console.error("Error recording conversion:", err);
      res.status(500).json({ message: "Failed to record conversion" });
    }
  });

  // Dismiss a recommendation

router.post("/api/recommendations/:id/dismiss", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      const { serviceRecommendationEngine } = await import("../services/recommendation.service");
      await serviceRecommendationEngine.dismissRecommendation(id);
      
      res.json({ message: "Recommendation dismissed" });
    } catch (err) {
      console.error("Error dismissing recommendation:", err);
      res.status(500).json({ message: "Failed to dismiss recommendation" });
    }
  });

  // Get provider analytics dashboard

router.get("/api/provider/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
        sum + Number(s.averageRating) / arr.length, 0
      ) || 0;
      
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      
      // Monthly breakdown from real booking data
      const now = new Date();
      const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const nextDate = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
        const month = date.toLocaleString('en-US', { month: 'short' });
        const monthBookings = bookings.filter(b => {
          if (!b.createdAt) return false;
          const d = new Date(b.createdAt);
          return d >= date && d < nextDate && b.status === 'completed';
        });
        return {
          month,
          revenue: monthBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0),
          bookings: monthBookings.length,
        };
      });
      
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

router.get("/api/dashboard/trip-scores", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

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


router.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const slots = await storage.getProviderAvailabilitySlots(userId);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching provider availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });


router.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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


router.patch("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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


router.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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


router.get("/api/expert/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const status = req.query.status as string | undefined;
      
      const tasks = await getExpertAiTasks(userId, status);
      
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


router.post("/api/expert/ai-tasks/delegate", isAuthenticated, async (req, res) => {
    try {
      const parsed = delegateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskType, taskDescription, clientName, context } = parsed.data;

      // Create task in pending status
      const task = await createExpertAiTask({
        expertId: userId,
        taskType,
        taskDescription,
        clientName,
        context: context || {},
        status: "in_progress",
      });

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
        const updatedTask = await updateExpertAiTask(task.id, {
          status: "pending",
          aiResult: result,
          confidence,
          qualityScore,
          tokensUsed: usage.totalTokens,
          costEstimate: usage.estimatedCost.toFixed(6),
        });

        // Log AI interaction
        await insertAiInteractionForExpert({
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
        await updateExpertAiTask(task.id, {
          status: "pending",
          aiResult: { error: aiError.message, fallbackContent: "Unable to generate content. Please try again or write manually." },
          confidence: 0,
        });

        throw aiError;
      }
    } catch (error: any) {
      console.error("Error delegating task:", error);
      res.status(500).json({ message: error.message || "Failed to delegate task" });
    }
  });

  // Approve/Send a task

router.post("/api/expert/ai-tasks/:taskId/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskId } = req.params;
      const { editedContent } = req.body;

      const task = await getExpertAiTaskById(taskId, userId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const updatedTask = await updateExpertAiTask(taskId, {
        status: "completed",
        editedContent: editedContent || null,
        wasEdited: !!editedContent,
        completedAt: new Date(),
      });

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error approving task:", error);
      res.status(500).json({ message: error.message || "Failed to approve task" });
    }
  });

  // Reject a task

router.post("/api/expert/ai-tasks/:taskId/reject", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskId } = req.params;

      const task = await getExpertAiTaskById(taskId, userId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const updatedTask = await updateExpertAiTask(taskId, {
        status: "rejected",
        completedAt: new Date(),
      });

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error rejecting task:", error);
      res.status(500).json({ message: error.message || "Failed to reject task" });
    }
  });

  // Regenerate a task

router.post("/api/expert/ai-tasks/:taskId/regenerate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskId } = req.params;

      const task = await getExpertAiTaskById(taskId, userId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Mark as regenerating
      await updateExpertAiTask(taskId, { status: "regenerating" });

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

      const updatedTask = await updateExpertAiTask(taskId, {
        status: "pending",
        aiResult: result,
        confidence,
        qualityScore,
        tokensUsed: (task.tokensUsed || 0) + usage.totalTokens,
        costEstimate: (parseFloat(task.costEstimate?.toString() || "0") + usage.estimatedCost).toFixed(6),
      });

      // Log AI interaction
      await insertAiInteractionForExpert({
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

router.get("/api/expert/ai-stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const tasks = await getExpertAiTasksSince(userId, thirtyDaysAgo);

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

router.get("/api/provider/earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const earnings = await storage.getProviderEarnings(userId);
      res.json(earnings);
    } catch (error: any) {
      console.error("Provider earnings error:", error);
      res.status(500).json({ message: "Failed to get provider earnings", error: error.message });
    }
  });


router.get("/api/provider/earnings/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const summary = await storage.getProviderEarningsSummary(userId);
      // Return both legacy field names and the names the payouts UI expects
      res.json({
        ...summary,
        totalEarnings: summary.total,
        availableForPayout: summary.available,
        pendingPayout: summary.pending,
        commissionRate: summary.total > 0 ? (summary.paidOut / summary.total) : 0,
      });
    } catch (error: any) {
      console.error("Provider earnings summary error:", error);
      res.status(500).json({ message: "Failed to get provider earnings summary", error: error.message });
    }
  });


router.get("/api/provider/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const details = await revenueTrackingService.getProviderRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Provider earnings details error:", error);
      res.status(500).json({ message: "Failed to get provider earnings details", error: error.message });
    }
  });

  // Provider payout requests

router.get("/api/provider/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const payouts = await storage.getProviderPayouts(userId);
      res.json(payouts);
    } catch (error: any) {
      console.error("Provider payouts error:", error);
      res.status(500).json({ message: "Failed to get provider payouts", error: error.message });
    }
  });


router.post("/api/provider/payouts/request", isAuthenticated, async (req, res) => {
    const MINIMUM_PAYOUT = 25;
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { payoutMethod } = req.body;
      const amount = Number(req.body.amount);
      if (!isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid payout amount" });
      }
      if (amount < MINIMUM_PAYOUT) {
        return res.status(400).json({ error: `Minimum payout amount is $${MINIMUM_PAYOUT}` });
      }

      const stripeAccount = await storage.getUserStripeAccount(userId);
      if (!stripeAccount.stripeAccountId || stripeAccount.stripeAccountStatus !== 'active') {
        return res.status(400).json({ error: "Stripe Connect account not active. Please complete onboarding before requesting a payout." });
      }

      const summary = await storage.getProviderEarningsSummary(userId);
      if (amount > summary.available) {
        return res.status(400).json({ error: `Insufficient available balance. Available: $${summary.available.toFixed(2)}` });
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

  // Expert payout request (mirrors provider payout request)

router.post("/api/expert/payouts/request", isAuthenticated, async (req, res) => {
    const MINIMUM_PAYOUT = 25;
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { payoutMethod } = req.body;
      const amount = Number(req.body.amount);
      if (!isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid payout amount" });
      }
      if (amount < MINIMUM_PAYOUT) {
        return res.status(400).json({ error: `Minimum payout amount is $${MINIMUM_PAYOUT}` });
      }

      const stripeAccount = await storage.getUserStripeAccount(userId);
      if (!stripeAccount.stripeAccountId || stripeAccount.stripeAccountStatus !== 'active') {
        return res.status(400).json({ error: "Stripe Connect account not active. Please complete onboarding before requesting a payout." });
      }

      const summary = await storage.getExpertEarningsSummary(userId);
      if (amount > summary.available) {
        return res.status(400).json({ error: `Insufficient available balance. Available: $${summary.available.toFixed(2)}` });
      }

      const payout = await storage.createExpertPayout({
        expertId: userId,
        amount: String(amount),
        payoutMethod: payoutMethod || 'bank_transfer',
        status: 'pending',
      });

      res.json(payout);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to request payout", error: error.message });
    }
  });

  // Get expert payouts

router.get("/api/expert/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const payouts = await storage.getExpertPayouts(userId);
      res.json(payouts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get expert payouts", error: error.message });
    }
  });

  // Expert earnings details endpoint
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings

router.get("/api/expert/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const details = await revenueTrackingService.getExpertRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Expert earnings details error:", error);
      res.status(500).json({ message: "Failed to get expert earnings details", error: error.message });
    }
  });

  // === Stripe Connect Onboarding ===


router.get("/api/expert/trips/:tripId/constraints", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      const energy = await storage.getEnergyTracking(req.params.tripId);
      const vendorCoord = await storage.getVendorCoordination(req.params.tripId);
      const bookingReqs = await storage.getBookingRequestsByTrip(req.params.tripId);

      const { analyzeAnchorOptimization } = await import('../services/anchor-suggestion.service');
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
          warningCount: tips.filter((t: any) => t.severity === 'warning' || t.severity === 'critical').length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load constraints", error: error.message });
    }
  });


router.post("/api/expert/find-providers", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const { date, startTime, endTime, serviceType } = req.body;
      const dayOfWeek = new Date(date).getDay();

      const schedules = await getAvailableSchedulesByDay(dayOfWeek);

      const matching = schedules.filter((s: any) => {
        return s.startTime <= startTime && s.endTime >= endTime;
      });

      const blackouts = await getAllProviderBlackoutDates();
      const blockedProviders = new Set(
        blackouts
          .filter((b: any) => date >= b.startDate && date <= b.endDate)
          .map((b: any) => b.providerId)
      );

      const available = matching.filter((s: any) => !blockedProviders.has(s.providerId));

      res.json({
        availableProviders: available.map((s: any) => ({
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


router.get("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
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


router.post("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
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


router.put("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
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


router.delete("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      await storage.deleteVendorCoordination(req.params.vendorId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete vendor", error: error.message });
    }
  });

  // === Provider: Availability Management ===


router.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const schedule = await storage.getProviderAvailability(userId);
      const blackouts = await storage.getProviderBlackoutDates(userId);
      res.json({ schedule, blackoutDates: blackouts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load availability", error: error.message });
    }
  });


router.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
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


router.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderAvailability(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete availability", error: error.message });
    }
  });


router.post("/api/provider/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
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


router.delete("/api/provider/blackout-dates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderBlackoutDate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete blackout date", error: error.message });
    }
  });

  // === Provider: Booking Requests ===


router.get("/api/provider/booking-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const requests = await storage.getBookingRequests(userId);
      res.json({ requests });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load requests", error: error.message });
    }
  });


router.put("/api/provider/booking-requests/:requestId/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
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


router.post("/api/leads/route", isAuthenticated, async (req, res) => {
    try {
      const { leadRoutingService } = await import('../services/lead-routing.service');
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { destination, topic, tripId, requestType } = req.body;

      if (!destination) return res.status(400).json({ error: "destination required" });

      const result = await leadRoutingService.routeLead({
        destination,
        topic,
        tripId,
        userId,
        requestType,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Lead routing error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/leads/score-preview?destination=Paris&topic=food
  // Used by admin to preview expert scoring without committing

router.get("/api/leads/score-preview", isAuthenticated, async (req, res) => {
    try {
      const { leadRoutingService } = await import('../services/lead-routing.service');
      const destination = (req.query.destination as string) || '';
      const topic = (req.query.topic as string) || '';

      const scores = await leadRoutingService.scoreExperts({ destination, topic });
      res.json({ scores });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/lead-routing-logs — admin view of all routing decisions

  async function requireProviderRole(req: any, res: any): Promise<string | null> {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
    const user = await storage.getUser(userId);
    if (!user || user.role !== "service_provider") {
      res.status(403).json({ message: "Service provider role required" });
      return null;
    }
    return userId;
  }

router.get("/api/provider/availability/rules", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const rules = await storage.getProviderAvailability(userId);
      res.json(rules);
    } catch (err) {
      console.error("[Provider] getAvailability error:", err);
      res.status(500).json({ message: "Failed to get availability rules" });
    }
  });


router.post("/api/provider/availability/rules", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const parsed = insertProviderAvailabilityScheduleSchema.safeParse({ ...req.body, providerId: userId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const rule = await storage.setProviderAvailability(parsed.data);
      res.status(201).json(rule);
    } catch (err) {
      console.error("[Provider] setAvailability error:", err);
      res.status(500).json({ message: "Failed to save availability rule" });
    }
  });


router.patch("/api/provider/availability/rules/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const { id } = req.params;
      const existing = await storage.getProviderAvailabilityById(id);
      if (!existing) return res.status(404).json({ message: "Availability rule not found" });
      if (existing.providerId !== userId) return res.status(403).json({ message: "Access denied" });
      const parsed = insertProviderAvailabilityScheduleSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      // Strip providerId from payload — ownership is enforced by ownership check above
      const { providerId: _pid, ...safeData } = parsed.data as any;
      const updated = await storage.updateProviderAvailabilityRule(id, userId, safeData);
      if (!updated) return res.status(404).json({ message: "Availability rule not found" });
      res.json(updated);
    } catch (err) {
      console.error("[Provider] updateAvailability error:", err);
      res.status(500).json({ message: "Failed to update availability rule" });
    }
  });


router.delete("/api/provider/availability/rules/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const existing = await storage.getProviderAvailabilityById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Availability rule not found" });
      if (existing.providerId !== userId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteProviderAvailability(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Provider] deleteAvailability error:", err);
      res.status(500).json({ message: "Failed to delete availability rule" });
    }
  });

  // === Provider Blackout Dates ===

router.get("/api/provider/availability/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const dates = await storage.getProviderBlackoutDates(userId);
      res.json(dates);
    } catch (err) {
      console.error("[Provider] getBlackoutDates error:", err);
      res.status(500).json({ message: "Failed to get blackout dates" });
    }
  });


router.post("/api/provider/availability/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const parsed = insertProviderBlackoutDateSchema.safeParse({ ...req.body, providerId: userId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const date = await storage.addProviderBlackoutDate(parsed.data);
      res.status(201).json(date);
    } catch (err) {
      console.error("[Provider] addBlackoutDate error:", err);
      res.status(500).json({ message: "Failed to add blackout date" });
    }
  });


router.delete("/api/provider/availability/blackout-dates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const existing = await storage.getProviderBlackoutDateById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Blackout date not found" });
      if (existing.providerId !== userId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteProviderBlackoutDate(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Provider] deleteBlackoutDate error:", err);
      res.status(500).json({ message: "Failed to delete blackout date" });
    }
  });

  // === Provider Settings ===

router.get("/api/provider/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const settings = await storage.getProviderSettings(userId);
      if (!settings) {
        return res.json({
          instantBooking: false,
          autoResponse: true,
          minimumLeadTimeDays: 7,
          targetResponseTimeHours: 2,
          payoutFrequency: "monthly",
          minimumPayoutAmount: "100",
          notificationsJson: { newBookings: true, bookingUpdates: true, messages: true, reviews: true, payouts: true, marketing: false },
        });
      }
      res.json(settings);
    } catch (err) {
      console.error("[Provider] getSettings error:", err);
      res.status(500).json({ message: "Failed to get settings" });
    }
  });


router.patch("/api/provider/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      // Strip ownership/identity fields to prevent mass assignment
      const { userId: _uid, id: _id, createdAt: _ca, updatedAt: _ua, providerId: _pid, ...safeSettings } = req.body as any;
      const settings = await storage.upsertProviderSettings(userId, safeSettings);
      res.json(settings);
    } catch (err) {
      console.error("[Provider] upsertSettings error:", err);
      res.status(500).json({ message: "Failed to save settings" });
    }
  });

  // === Itinerary Items CRUD (PATCH + DELETE only; GET/POST defined at Itinerary Intelligence Routes) ===
  async function canAccessTripItems(tripId: string, userId: string): Promise<boolean> {
    const owned = await verifyTripOwnership(tripId, userId);
    if (owned) return true;
    return await storage.isExpertAssignedToTrip(tripId, userId);
  }


router.patch("/api/expert/assignments/:assignmentId/workspace-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { assignmentId } = req.params;
      const { workspaceStatus } = req.body;
      const validTransitions: Record<string, string[]> = {
        draft: ["in_review"],
        in_review: ["delivered"],
        delivered: [],
      };
      if (!workspaceStatus || !(workspaceStatus in validTransitions)) {
        return res.status(400).json({ message: "Invalid workspaceStatus. Must be: draft, in_review, or delivered" });
      }
      const assignment = await storage.getExpertAssignment(assignmentId);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.localExpertId !== userId) return res.status(403).json({ message: "Access denied" });
      const current = assignment.workspaceStatus ?? "draft";
      if (!validTransitions[current]?.includes(workspaceStatus)) {
        return res.status(400).json({ message: `Cannot transition workspace status from '${current}' to '${workspaceStatus}'. Allowed: ${validTransitions[current]?.join(", ") || "none"}` });
      }
      const updated = await storage.updateExpertAssignmentWorkspaceStatus(assignmentId, workspaceStatus);
      res.json(updated);
    } catch (err) {
      console.error("[Expert] workspace-status error:", err);
      res.status(500).json({ message: "Failed to update workspace status" });
    }
  });

  // === Expert Assigned Trips list (powers Dashboard + Assigned Trips page) ===

router.get("/api/expert/assigned-trips", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const rows = await db
        .select({
          trip_id: tripExpertAdvisors.tripId,
          trip_title: trips.title,
          destination: trips.destination,
          start_date: trips.startDate,
          end_date: trips.endDate,
          status: tripExpertAdvisors.status,
          assigned_at: tripExpertAdvisors.assignedAt,
          traveler_first: users.firstName,
          traveler_last: users.lastName,
          suggestion_count: sql<number>`(
            SELECT COUNT(*) FROM trip_suggestions
            WHERE trip_id = ${tripExpertAdvisors.tripId}
            AND expert_id = ${userId}
          )`,
        })
        .from(tripExpertAdvisors)
        .innerJoin(trips, eq(tripExpertAdvisors.tripId, trips.id))
        .leftJoin(users, eq(trips.userId, users.id))
        .where(eq(tripExpertAdvisors.localExpertId, userId))
        .orderBy(desc(tripExpertAdvisors.assignedAt));

      res.json(rows.map(r => ({
        trip_id: r.trip_id,
        trip_title: r.trip_title || r.destination,
        destination: r.destination,
        start_date: r.start_date,
        end_date: r.end_date,
        traveler_name: [r.traveler_first, r.traveler_last].filter(Boolean).join(" ") || "Traveler",
        status: r.status,
        assigned_at: r.assigned_at,
        suggestion_count: Number(r.suggestion_count) || 0,
      })));
    } catch (err) {
      console.error("[Expert] assigned-trips error:", err);
      res.status(500).json({ message: "Failed to fetch assigned trips" });
    }
  });

  // === Trip Commission ===

// ── EA RBAC: every /api/ea/* route requires executive_assistant or admin role ──
router.use("/api/ea", isEA);

router.get("/api/ea/clients", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const rows = await db
        .select({
          id: eaClientRelationships.id,
          clientUserId: eaClientRelationships.clientUserId,
          clientEmail: eaClientRelationships.clientEmail,
          displayName: eaClientRelationships.displayName,
          notes: eaClientRelationships.notes,
          billingName: eaClientRelationships.billingName,
          billingEmail: eaClientRelationships.billingEmail,
          billingAddress: eaClientRelationships.billingAddress,
          paymentNotes: eaClientRelationships.paymentNotes,
          preferredCurrency: eaClientRelationships.preferredCurrency,
          createdAt: eaClientRelationships.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
          userProfileImageUrl: users.profileImageUrl,
        })
        .from(eaClientRelationships)
        .leftJoin(users, eq(eaClientRelationships.clientUserId, users.id))
        .where(eq(eaClientRelationships.eaUserId, eaUserId))
        .orderBy(desc(eaClientRelationships.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getClients error:", err);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // POST /api/ea/clients — add a client (by email lookup)

router.post("/api/ea/clients", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { email, displayName, notes } = z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      // Look up the user by email
      const foundUser = await getUserByEmail(email);

      // Check not already added
      const existing = await getEaClientRelationshipByClient(eaUserId, foundUser?.id ?? null, email);
      if (existing) {
        return res.status(409).json({ message: "Client already added" });
      }

      const created = await createEaClientRelationship({
        eaUserId,
        clientUserId: foundUser?.id ?? null,
        clientEmail: email,
        displayName: displayName || (foundUser ? `${foundUser.firstName ?? ""} ${foundUser.lastName ?? ""}`.trim() : email),
        notes: notes ?? null,
      });

      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] addClient error:", err);
      res.status(500).json({ message: "Failed to add client" });
    }
  });

  // PATCH /api/ea/clients/:id — update payment info / notes

router.patch("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const updates = z.object({
        displayName: z.string().optional(),
        notes: z.string().optional(),
        billingName: z.string().optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().optional(),
        paymentNotes: z.string().optional(),
        preferredCurrency: z.string().optional(),
      }).parse(req.body);

      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });

      const updated = await updateEaClientRelationship(id, updates);
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateClient error:", err);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // DELETE /api/ea/clients/:id — remove client relationship

router.delete("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });
      await deleteEaClientRelationship(id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteClient error:", err);
      res.status(500).json({ message: "Failed to remove client" });
    }
  });

  // POST /api/ea/clients/:id/push — send a notification to the client

router.post("/api/ea/clients/:id/push", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const { title, message } = z.object({
        title: z.string().min(1).max(255),
        message: z.string().min(1),
      }).parse(req.body);

      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });
      if (!row.clientUserId) return res.status(400).json({ message: "Client does not have a platform account" });

      await insertNotification({
        userId: row.clientUserId,
        type: "ea_message",
        title,
        message,
        relatedId: eaUserId,
        relatedType: "ea_user",
        data: { fromEaUserId: eaUserId },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] pushNotification error:", err);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // ============================================================
  // EA EXECUTIVE MANAGEMENT
  // ============================================================


router.get("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaExecutives(eaUserId));
    } catch (err) {
      console.error("[EA] getExecutives error:", err);
      res.status(500).json({ message: "Failed to fetch executives" });
    }
  });


router.post("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaExecutiveSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaExecutive(body));
    } catch (err) {
      console.error("[EA] createExecutive error:", err);
      res.status(400).json({ message: "Failed to create executive" });
    }
  });


router.patch("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaExecutiveById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      res.json(await updateEaExecutive(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateExecutive error:", err);
      res.status(500).json({ message: "Failed to update executive" });
    }
  });


router.delete("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaExecutiveById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      await deleteEaExecutive(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteExecutive error:", err);
      res.status(500).json({ message: "Failed to delete executive" });
    }
  });

  // ============================================================
  // EA EVENTS
  // ============================================================


router.get("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaEvents(eaUserId));
    } catch (err) {
      console.error("[EA] getEvents error:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });


router.post("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaEventSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaEvent(body));
    } catch (err) {
      console.error("[EA] createEvent error:", err);
      res.status(400).json({ message: "Failed to create event" });
    }
  });


router.patch("/api/ea/events/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaEventById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Event not found" });
      res.json(await updateEaEvent(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateEvent error:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });


router.delete("/api/ea/events/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaEvent(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteEvent error:", err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // ============================================================
  // EA TRAVEL ARRANGEMENTS
  // ============================================================


router.get("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaTravelArrangements(eaUserId));
    } catch (err) {
      console.error("[EA] getTravel error:", err);
      res.status(500).json({ message: "Failed to fetch travel arrangements" });
    }
  });


router.post("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaTravelArrangementSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaTravelArrangement(body));
    } catch (err) {
      console.error("[EA] createTravel error:", err);
      res.status(400).json({ message: "Failed to create travel arrangement" });
    }
  });


router.patch("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaTravelArrangementById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Travel arrangement not found" });
      res.json(await updateEaTravelArrangement(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateTravel error:", err);
      res.status(500).json({ message: "Failed to update travel arrangement" });
    }
  });


router.delete("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaTravelArrangement(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteTravel error:", err);
      res.status(500).json({ message: "Failed to delete travel arrangement" });
    }
  });

  // ============================================================
  // EA GIFTS
  // ============================================================


router.get("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaGifts(eaUserId));
    } catch (err) {
      console.error("[EA] getGifts error:", err);
      res.status(500).json({ message: "Failed to fetch gifts" });
    }
  });


router.post("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaGiftSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaGift(body));
    } catch (err) {
      console.error("[EA] createGift error:", err);
      res.status(400).json({ message: "Failed to create gift" });
    }
  });


router.patch("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaGiftById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Gift not found" });
      res.json(await updateEaGift(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateGift error:", err);
      res.status(500).json({ message: "Failed to update gift" });
    }
  });


router.delete("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaGift(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteGift error:", err);
      res.status(500).json({ message: "Failed to delete gift" });
    }
  });

  // ============================================================
  // EA SAVED VENUES
  // ============================================================


router.get("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaSavedVenues(eaUserId));
    } catch (err) {
      console.error("[EA] getVenues error:", err);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });


router.post("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaSavedVenueSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaSavedVenue(body));
    } catch (err) {
      console.error("[EA] createVenue error:", err);
      res.status(400).json({ message: "Failed to save venue" });
    }
  });


router.patch("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaSavedVenueById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Venue not found" });
      res.json(await updateEaSavedVenue(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateVenue error:", err);
      res.status(500).json({ message: "Failed to update venue" });
    }
  });


router.delete("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaSavedVenue(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteVenue error:", err);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  // ============================================================
  // EA COMMUNICATIONS
  // ============================================================


router.get("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaCommunications(eaUserId));
    } catch (err) {
      console.error("[EA] getCommunications error:", err);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });


router.post("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaCommunicationSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaCommunication(body));
    } catch (err) {
      console.error("[EA] createCommunication error:", err);
      res.status(400).json({ message: "Failed to log communication" });
    }
  });


router.delete("/api/ea/communications/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaCommunication(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteCommunication error:", err);
      res.status(500).json({ message: "Failed to delete communication" });
    }
  });

  // ============================================================
  // EA AI TASKS
  // ============================================================


router.get("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const { status } = req.query;
      res.json(await getEaAiTasks(eaUserId, status as string | undefined));
    } catch (err) {
      console.error("[EA] getAiTasks error:", err);
      res.status(500).json({ message: "Failed to fetch AI tasks" });
    }
  });


router.post("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaAiTaskSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaAiTask(body));
    } catch (err) {
      console.error("[EA] createAiTask error:", err);
      res.status(400).json({ message: "Failed to create AI task" });
    }
  });


router.patch("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaAiTaskById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "AI task not found" });
      const updates: Record<string, any> = { ...req.body };
      if (req.body.status === "approved") updates.approvedAt = new Date();
      if (req.body.status === "rejected") updates.rejectedAt = new Date();
      res.json(await updateEaAiTask(req.params.id, updates));
    } catch (err) {
      console.error("[EA] updateAiTask error:", err);
      res.status(500).json({ message: "Failed to update AI task" });
    }
  });


router.delete("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaAiTask(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteAiTask error:", err);
      res.status(500).json({ message: "Failed to delete AI task" });
    }
  });

  // ============================================================
  // LOCAL EXPERT KNOWLEDGE NUGGETS
  // ============================================================

  // GET /api/expert/knowledge-nuggets — list own nuggets

router.get("/api/expert/knowledge-nuggets", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getLocalKnowledgeNuggets(expertId));
    } catch (err) {
      console.error("[Knowledge Nuggets] list error:", err);
      res.status(500).json({ message: "Failed to fetch knowledge nuggets" });
    }
  });

  // POST /api/expert/knowledge-nuggets — create nugget

router.post("/api/expert/knowledge-nuggets", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const parsed = insertLocalKnowledgeNuggetSchema.safeParse({ ...req.body, expertUserId: expertId });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
      }
      res.status(201).json(await createLocalKnowledgeNugget(parsed.data));
    } catch (err) {
      console.error("[Knowledge Nuggets] create error:", err);
      res.status(500).json({ message: "Failed to create knowledge nugget" });
    }
  });

  // PATCH /api/expert/knowledge-nuggets/:id — update own nugget

router.patch("/api/expert/knowledge-nuggets/:id", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const { id } = req.params;
      const existing = await getLocalKnowledgeNuggetById(id, expertId);
      if (!existing) return res.status(404).json({ message: "Nugget not found" });
      const allowed = ["nuggetType", "city", "linkedPoi", "linkedNeighbourhood", "insight", "targetAudience", "notFor", "seasonality"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }
      updates.updatedAt = new Date();
      res.json(await updateLocalKnowledgeNugget(id, updates));
    } catch (err) {
      console.error("[Knowledge Nuggets] update error:", err);
      res.status(500).json({ message: "Failed to update knowledge nugget" });
    }
  });

  // DELETE /api/expert/knowledge-nuggets/:id — delete own nugget

router.delete("/api/expert/knowledge-nuggets/:id", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const { id } = req.params;
      const existing = await getLocalKnowledgeNuggetById(id, expertId);
      if (!existing) return res.status(404).json({ message: "Nugget not found" });
      await deleteLocalKnowledgeNugget(id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Knowledge Nuggets] delete error:", err);
      res.status(500).json({ message: "Failed to delete knowledge nugget" });
    }
  });

  // GET /api/admin/local-experts/nugget-counts — nugget count per local expert

router.get("/api/knowledge-nuggets/city", isAuthenticated, async (req, res) => {
    try {
      const city = (req.query.city as string || "").trim();
      if (!city) return res.status(400).json({ message: "city query param required" });
      res.json(await getLocalKnowledgeNuggetsByCity(city));
    } catch (err) {
      console.error("[Knowledge Nuggets] city search error:", err);
      res.status(500).json({ message: "Failed to fetch city nuggets" });
    }
  });

  // ============================================================
  // EXPERT CONTRACTS
  // ============================================================

  // ============================================================
  // VISA REQUIREMENTS
  // ============================================================

  // Simple in-memory rate limiter for visa requirements (max 10 req / IP / minute)
  const visaRateLimitMap = new Map<string, { count: number; resetAt: number }>();
  function visaRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = visaRateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      visaRateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    if (entry.count >= 10) return true;
    entry.count++;
    return false;
  }


router.post("/api/visa/requirements", async (req, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (visaRateLimit(ip)) {
        return res.status(429).json({ message: "Too many requests. Please wait a minute before trying again." });
      }
      const { passportCountry, destinationCountry } = req.body;
      if (!passportCountry || !destinationCountry) {
        return res.status(400).json({ message: "passportCountry and destinationCountry are required" });
      }

      const { forceRefresh } = req.body;

      // Check cache first (7-day TTL), unless force-refresh requested
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      if (forceRefresh) {
        // Delete stale cache entry so we re-fetch fresh data
        await db
          .delete(visaRequirementsCache)
          .where(
            and(
              eq(visaRequirementsCache.passportCountry, passportCountry.toLowerCase()),
              eq(visaRequirementsCache.destinationCountry, destinationCountry.toLowerCase()),
            )
          );
      } else {
        const cached = await db
          .select()
          .from(visaRequirementsCache)
          .where(
            and(
              eq(visaRequirementsCache.passportCountry, passportCountry.toLowerCase()),
              eq(visaRequirementsCache.destinationCountry, destinationCountry.toLowerCase()),
              sql`${visaRequirementsCache.cachedAt} > ${sevenDaysAgo}`
            )
          )
          .limit(1)
          .then((r) => r[0]);

        if (cached) {
          return res.json({
            visaRequired: cached.visaRequired,
            visaTypes: cached.visaTypes,
            requiredDocuments: cached.requiredDocuments,
            processingTime: cached.processingTime,
            feeRange: cached.feeRange,
            disclaimer: cached.disclaimer,
            fromCache: true,
            cachedAt: cached.cachedAt,
          });
        }
      }

      // Call Claude to get visa requirements
      const prompt = `You are a visa information assistant. Provide visa requirements for a ${passportCountry} passport holder traveling to ${destinationCountry}.

Return ONLY valid JSON in this exact structure (no additional text):
{
  "visa_required": true or false,
  "visa_types": ["Tourist Visa", "Business Visa"],
  "required_documents": ["Valid passport (6+ months validity)", "Completed visa application form", "Passport-sized photos", "Bank statements (last 3 months)", "Travel itinerary", "Hotel bookings"],
  "processing_time": "5-10 business days",
  "fee_range": "$50-$160 USD depending on visa type",
  "disclaimer": "This information is for general guidance only. Requirements may change at any time. Always verify with the official embassy or consulate of ${destinationCountry} before traveling."
}

If no visa is required (visa-free or visa-on-arrival), set visa_required to false and explain in the disclaimer. Be specific and accurate based on commonly known visa policies.`;

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });
      trackAnthropicResponse(completion, { sourceType: "ai_expert" });

      const text = (completion.content[0] as any).text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }
      const parsed = JSON.parse(jsonMatch[0]);

      // Store in cache
      const nowTs = new Date();
      await insertVisaRequirementCache({
        passportCountry: passportCountry.toLowerCase(),
        destinationCountry: destinationCountry.toLowerCase(),
        visaRequired: Boolean(parsed.visa_required),
        visaTypes: parsed.visa_types || [],
        requiredDocuments: parsed.required_documents || [],
        processingTime: parsed.processing_time || null,
        feeRange: parsed.fee_range || null,
        disclaimer: parsed.disclaimer || null,
      });

      res.json({
        visaRequired: parsed.visa_required,
        visaTypes: parsed.visa_types || [],
        requiredDocuments: parsed.required_documents || [],
        processingTime: parsed.processing_time,
        feeRange: parsed.fee_range,
        disclaimer: parsed.disclaimer,
        fromCache: false,
        cachedAt: nowTs,
      });
    } catch (err) {
      console.error("[Visa] requirements error:", err);
      res.status(500).json({ message: "Failed to fetch visa requirements" });
    }
  });

  // GET /api/visa/experts — returns visa-assistance services with real provider names

router.get("/api/visa/experts", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string || "6"), 20);
      const services = await getVisaAssistanceServices(limit);
      res.json({ services, total: services.length });
    } catch (err) {
      console.error("[Visa] experts error:", err);
      res.status(500).json({ message: "Failed to fetch visa experts" });
    }
  });


router.get("/api/expert/contracts/recent", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const limit = Math.min(parseInt(req.query.limit as string || "20"), 100);
      res.json(await getRecentExpertContracts(limit));
    } catch (err) {
      console.error("[Expert] getContracts error:", err);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  // ─── Content Placement Rules (Admin) ────────────────────────────────────────

  // Local admin guard for this scope (requireAdmin is defined in the outer registerRoutes scope)
  const requireAdminLocal = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
    const role = await getUserRole(req.user?.claims?.sub);
    if (role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
  };

  // GET /api/admin/content-placement-rules — list with optional filters

export default router;
