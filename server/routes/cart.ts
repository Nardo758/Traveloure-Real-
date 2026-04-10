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


export function registerCartRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
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

  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.removeFromCart(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

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

  app.post("/api/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId, notes, externalItems: rawExternalItems } = req.body;
      
      // Get platform cart items
      const cartData = await storage.getCartItems(userId);
      
      // Parse optional external items (Viator/Amadeus/Fever from sessionStorage)
      const externalItems: Array<{
        id: string; name: string; price: number; quantity: number;
        provider?: string; type?: string; metadata?: any;
      }> = Array.isArray(rawExternalItems) ? rawExternalItems : [];

      if (cartData.length === 0 && externalItems.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }
      
      // Calculate totals from platform items
      const platformSubtotal = cartData.reduce((sum, item) => {
        const price = parseFloat(item.service?.price || "0");
        return sum + (price * (item.quantity || 1));
      }, 0);

      // Calculate totals from external items
      const externalSubtotal = externalItems.reduce((sum, item) => {
        return sum + ((item.price || 0) * (item.quantity || 1));
      }, 0);

      const subtotal = platformSubtotal + externalSubtotal;
      const platformFee = subtotal * 0.20;
      const total = subtotal + platformFee;
      
      // Create bookings for each platform cart item
      const bookings = [];
      for (const item of cartData) {
        if (!item.service) continue;
        
        const price = parseFloat(item.service.price || "0") * (item.quantity || 1);
        const fee = price * 0.20;
        
        const contract = await storage.createContract({
          title: `Booking: ${item.service.serviceName}`,
          tripTo: item.service.location || "N/A",
          description: `Service booking for ${item.service.serviceName}. ${notes || ""}`,
          amount: price.toFixed(2),
        });
        
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
        
        await storage.incrementServiceBookings(item.serviceId, 1);
        
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

      // Create activityBookings records for external items
      const activityBookingIds: string[] = [];
      if (externalItems.length > 0) {
        const { sql: sqlTag } = await import("drizzle-orm");
        for (const ext of externalItems) {
          const actBookingId = crypto.randomUUID();
          const provider = ext.provider || ext.type || "external";
          const priceAmount = (ext.price || 0) * (ext.quantity || 1);
          await db.execute(sqlTag`
            INSERT INTO activity_bookings (id, user_id, provider, product_code, product_title, image_url, price_amount, price_currency, booking_url, status, created_at)
            VALUES (${actBookingId}, ${userId}, ${provider}, ${ext.id}, ${ext.name}, ${ext.metadata?.imageUrl || null}, ${priceAmount}, 'USD', ${ext.metadata?.bookingUrl || null}, 'pending', NOW())
          `);
          activityBookingIds.push(actBookingId);
        }
      }
      
      // Clear platform cart after successful checkout
      await storage.clearCart(userId);

      // Build combined booking list for payment intent metadata
      const allBookingObjects = [
        ...bookings.map((b: any) => b.booking),
        ...activityBookingIds.map(id => ({ id })),
      ];

      // Create Stripe payment intent for the combined total
      const { stripePaymentService } = await import("../services/stripe-payment.service");
      const paymentIntent = await stripePaymentService.createPaymentIntent(
        userId,
        allBookingObjects,
        total,
        false
      );

      // Link payment intent to activity bookings
      if (activityBookingIds.length > 0 && paymentIntent.paymentIntentId) {
        const { sql: sqlTag } = await import("drizzle-orm");
        for (const id of activityBookingIds) {
          await db.execute(sqlTag`
            UPDATE activity_bookings SET stripe_payment_intent_id = ${paymentIntent.paymentIntentId}
            WHERE id = ${id}
          `);
        }
      }
      
      res.status(201).json({
        success: true,
        bookings,
        activityBookingIds,
        total: total.toFixed(2),
        paymentIntent,
        message: "Booking created successfully. Complete payment.",
      });
    } catch (err) {
      console.error("Checkout error:", err);
      res.status(500).json({ message: "Checkout failed" });
    }
  });

  app.get("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const contract = await storage.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    res.json(contract);
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
}
