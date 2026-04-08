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


export function registerItineraryShareRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/itinerary-share/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Shared itinerary not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "This share link has expired" });
      }

      await db
        .update(sharedItineraries)
        .set({ viewCount: (shared.viewCount || 0) + 1, lastViewedAt: new Date() })
        .where(eq(sharedItineraries.id, shared.id));

      const [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, shared.variantId));

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

      const [exportCache] = await db
        .select()
        .from(mapsExportCache)
        .where(eq(mapsExportCache.variantId, shared.variantId));

      const [sharer] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, shared.sharedByUserId));

      const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
      const days = dayNumbers.map(dayNum => {
        const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const dayLegs = legs.filter(l => l.dayNumber === dayNum).sort((a, b) => a.legOrder - b.legOrder);

        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;
        let dateStr = "";
        if (startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + dayNum - 1);
          dateStr = d.toISOString().split("T")[0];
        }

        return {
          dayNumber: dayNum,
          date: dateStr,
          activities: dayItems.map(item => ({
            id: item.id,
            name: item.name,
            startTime: item.startTime,
            endTime: item.endTime,
            lat: item.latitude ? parseFloat(item.latitude as any) : null,
            lng: item.longitude ? parseFloat(item.longitude as any) : null,
            category: item.serviceType,
            cost: item.price ? parseFloat(item.price as any) : 0,
            description: item.description,
            location: item.location,
            duration: item.duration,
          })),
          transportLegs: dayLegs.map(leg => ({
            id: leg.id,
            legOrder: leg.legOrder,
            fromLabel: leg.fromName,
            toLabel: leg.toName,
            fromName: leg.fromName,
            toName: leg.toName,
            recommendedMode: leg.recommendedMode,
            userSelectedMode: leg.userSelectedMode,
            distanceDisplay: leg.distanceDisplay,
            distanceMeters: leg.distanceMeters,
            distanceKm: leg.distanceMeters ? Math.round(leg.distanceMeters / 100) / 10 : null,
            estimatedDurationMinutes: leg.estimatedDurationMinutes,
            estimatedCostUsd: leg.estimatedCostUsd,
            energyCost: leg.energyCost,
            alternativeModes: leg.alternativeModes,
            linkedProductUrl: leg.linkedProductUrl,
            fromLat: leg.fromLat,
            fromLng: leg.fromLng,
            toLat: leg.toLat,
            toLng: leg.toLng,
            bookingTiming: leg.bookingTiming,
            providerSource: leg.providerSource,
          })),
        };
      });

      const totalTransportCost = legs.reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
      const totalTransportMinutes = legs.reduce((sum, l) => sum + (l.estimatedDurationMinutes || 0), 0);

      res.json({
        variant: {
          id: variant.id,
          name: variant.name,
          description: variant.description,
          destination: comparison?.destination,
          dateRange: {
            start: comparison?.startDate,
            end: comparison?.endDate,
          },
          totalCost: variant.totalCost,
          optimizationScore: variant.optimizationScore,
          budget: comparison?.budget ? parseFloat(comparison.budget as any) : null,
          travelers: comparison?.travelers ?? 1,
          days,
          transportSummary: {
            totalLegs: legs.length,
            totalMinutes: totalTransportMinutes,
            totalCostUsd: Math.round(totalTransportCost * 100) / 100,
          },
        },
        mapsLinks: {
          googleMapsPerDay: exportCache?.googleMapsUrls || {},
          appleMapsPerDay: exportCache?.appleMapsUrls || {},
          appleMapsWebPerDay: exportCache?.appleMapsWebUrls || {},
          kmlDownloadUrl: `/api/itinerary-share/${token}/export/kml`,
          gpxDownloadUrl: `/api/itinerary-share/${token}/export/gpx`,
        },
        sharedBy: sharer
          ? {
              name: [sharer.firstName, sharer.lastName].filter(Boolean).join(" ") || "A traveler",
              avatarUrl: sharer.profileImageUrl,
              userId: sharer.id,
            }
          : { name: "A traveler", avatarUrl: null, userId: null },
        permissions: shared.permissions,
        expertStatus: shared.expertStatus,
        expertNotes: shared.expertNotes || null,
        expertDiff: shared.expertDiff || null,
        transportPreferences: shared.transportPreferences,
        shareToken: token,
        isOwner: !!(shared.sharedByUserId && (req as any).user?.id === shared.sharedByUserId),
      });
    } catch (err: any) {
      console.error("Get shared itinerary error:", err);
      res.status(500).json({ error: "Failed to load shared itinerary" });
    }
  });

  app.patch("/api/itinerary-share/:token/transport-mode/bulk", async (req, res) => {
    const VALID_TIMING = ["in_advance", "real_time"];
    const VALID_SOURCE = ["traveloure", "external"];
    try {
      const { token } = req.params;
      const { selectedMode, bookingTiming, providerSource } = req.body;
      const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;

      if (!selectedMode) return res.status(400).json({ error: "selectedMode is required" });
      if (bookingTiming !== undefined && bookingTiming !== null && !VALID_TIMING.includes(bookingTiming)) {
        return res.status(400).json({ error: `bookingTiming must be one of: ${VALID_TIMING.join(", ")}` });
      }
      if (providerSource !== undefined && providerSource !== null && !VALID_SOURCE.includes(providerSource)) {
        return res.status(400).json({ error: `providerSource must be one of: ${VALID_SOURCE.join(", ")}` });
      }
      if (!userId && !token) return res.status(401).json({ error: "Authentication required" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Itinerary not found" });

      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }

      // Require owner or suggest-level permissions
      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (variant) {
        const [comparison] = await db
          .select({ userId: itineraryComparisons.userId })
          .from(itineraryComparisons)
          .where(eq(itineraryComparisons.id, variant.comparisonId));

        const isOwner = userId && comparison?.userId === userId;
        const canEdit = isOwner || shared.permissions === "suggest" || shared.permissions === "edit";
        if (!canEdit) return res.status(403).json({ error: "Not authorized to update this itinerary" });
      }

      const bulkSet: Record<string, any> = {
        userSelectedMode: selectedMode,
        updatedAt: new Date(),
      };
      if (bookingTiming !== undefined) bulkSet.bookingTiming = bookingTiming;
      if (providerSource !== undefined) bulkSet.providerSource = providerSource;

      await db
        .update(transportLegs)
        .set(bulkSet)
        .where(eq(transportLegs.variantId, shared.variantId));

      const updatedLegs = await db
        .select({ id: transportLegs.id, userSelectedMode: transportLegs.userSelectedMode })
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

      res.json({ updated: updatedLegs.length, selectedMode, bookingTiming, providerSource });
    } catch (err: any) {
      console.error("Bulk transport mode update error:", err);
      res.status(500).json({ error: "Failed to update transport modes" });
    }
  });

  app.get("/api/itinerary-share/:token/export/kml", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let kmlContent = cached?.kmlContent;

      if (!kmlContent) {
        const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        kmlContent = generateKml({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ kmlContent }).where(eq(mapsExportCache.variantId, shared.variantId));
      }

      res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.kml"`);
      res.send(kmlContent);
    } catch (err: any) {
      console.error("KML export error:", err);
      res.status(500).json({ error: "Failed to generate KML" });
    }
  });

  app.get("/api/itinerary-share/:token/export/gpx", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let gpxContent = cached?.gpxContent;

      if (!gpxContent) {
        const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        gpxContent = generateGpx({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ gpxContent }).where(eq(mapsExportCache.variantId, shared.variantId));
      }

      res.setHeader("Content-Type", "application/gpx+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.gpx"`);
      res.send(gpxContent);
    } catch (err: any) {
      console.error("GPX export error:", err);
      res.status(500).json({ error: "Failed to generate GPX" });
    }
  });

  app.get("/api/itinerary-share/:token/navigate/:dayNumber/:legOrder", async (req, res) => {
    try {
      const { token, dayNumber, legOrder } = req.params;
      const { platform = "google", currentLat, currentLng } = req.query as Record<string, string>;

      const [shared] = await db
        .select({ variantId: sharedItineraries.variantId })
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [leg] = await db
        .select()
        .from(transportLegs)
        .where(
          and(
            eq(transportLegs.variantId, shared.variantId),
            eq(transportLegs.dayNumber, parseInt(dayNumber)),
            eq(transportLegs.legOrder, parseInt(legOrder))
          )
        );

      if (!leg) return res.status(404).json({ error: "Leg not found" });

      const mode = leg.userSelectedMode || leg.recommendedMode;
      const fromLat = currentLat ? parseFloat(currentLat) : leg.fromLat;
      const fromLng = currentLng ? parseFloat(currentLng) : leg.fromLng;

      let url: string;
      if (platform === "apple") {
        url = buildAppleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      } else {
        url = buildGoogleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      }

      res.redirect(302, url);
    } catch (err: any) {
      console.error("Navigate error:", err);
      res.status(500).json({ error: "Failed to build navigation URL" });
    }
  });

  app.post("/api/itinerary-share/:token/suggest", async (req, res) => {
    try {
      const { token } = req.params;
      const { notes, activityDiffs, transportDiffs } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) return res.status(401).json({ error: "Authentication required to submit suggestions" });
      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow suggestions" });
      }

      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId, name: itineraryVariants.name })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      // Build diff payload
      const expertDiff = {
        activityDiffs: activityDiffs || {},
        transportDiffs: transportDiffs || {},
        submittedAt: new Date().toISOString(),
      };

      // Save diff + notes + update status on shared_itineraries
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = 'review_sent', expert_notes = ${notes}, expert_diff = ${JSON.stringify(expertDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
      );

      // Send notification to the owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await db.insert(notifications).values({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert has reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
        });
      }

      res.json({ success: true, message: "Edits sent to traveler" });
    } catch (err: any) {
      console.error("Expert suggest error:", err);
      res.status(500).json({ error: "Failed to send suggestions" });
    }
  });

  app.patch("/api/itinerary-share/:token/acknowledge", async (req, res) => {
    try {
      const { token } = req.params;
      const { action } = req.body;
      const userId = (req as any).user?.id;

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });

      // Only the original sharer (owner) can acknowledge
      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
      );

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("Acknowledge expert edits error:", err);
      res.status(500).json({ error: "Failed to acknowledge edits" });
    }
  });
}
