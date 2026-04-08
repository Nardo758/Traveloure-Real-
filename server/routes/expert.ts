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
import { registerExpertBookingRoutes } from "./expert-bookings";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export function registerExpertRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.post("/api/expert-booking-requests", isAuthenticated, async (req, res) => {
  registerExpertBookingRoutes(app, resolveSlug);
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

  app.get("/api/expert-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const form = await storage.getLocalExpertForm(userId);
    res.json(form || null);
  });

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

  app.get("/api/expert-service-categories", async (_req, res) => {
    const categories = await storage.getExpertServiceCategories();
    const categoriesWithOfferings = await Promise.all(categories.map(async (cat) => {
      const offerings = await storage.getExpertServiceOfferings(cat.id);
      return { ...cat, offerings };
    }));
    res.json(categoriesWithOfferings);
  });

  app.get("/api/expert-service-categories/:categoryId/offerings", async (req, res) => {
    const offerings = await storage.getExpertServiceOfferings(req.params.categoryId);
    res.json(offerings);
  });

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

  app.get("/api/experts/:id", async (req, res) => {
    const experts = await storage.getExpertsWithProfiles();
    const expert = experts.find(e => e.id === req.params.id);
    if (!expert) {
      return res.status(404).json({ message: "Expert not found" });
    }
    res.json(expert);
  });

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

  app.get("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getExpertSelectedServices(userId);
    res.json(services);
  });

  app.post("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { serviceOfferingId, customPrice } = req.body;
    const service = await storage.addExpertSelectedService(userId, serviceOfferingId, customPrice);
    res.json(service);
  });

  app.delete("/api/expert/selected-services/:serviceOfferingId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.removeExpertSelectedService(userId, req.params.serviceOfferingId);
    res.json({ success: true });
  });

  app.get("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const specializations = await storage.getExpertSpecializations(userId);
    res.json(specializations);
  });

  app.post("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { specialization } = req.body;
    const spec = await storage.addExpertSpecialization(userId, specialization);
    res.json(spec);
  });

  app.delete("/api/expert/specializations/:specialization", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.removeExpertSpecialization(userId, req.params.specialization);
    res.json({ success: true });
  });

  app.get("/api/expert/custom-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const services = await storage.getExpertCustomServices(userId);
    res.json(services);
  });

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

  app.get("/api/expert-templates/:id/reviews", async (req, res) => {
    try {
      const reviews = await storage.getTemplateReviews(req.params.id);
      res.json(reviews);
    } catch (err) {
      console.error("Error fetching reviews:", err);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

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

  app.get("/api/expert/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const services = await storage.getProviderServicesByStatus(userId, status);
    res.json(services);
  });

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

  app.get("/api/expert/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const details = await revenueTrackingService.getExpertRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Expert earnings details error:", error);
      res.status(500).json({ message: "Failed to get expert earnings details", error: error.message });
    }
  });

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
      const { db } = await import('../db');

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
}
