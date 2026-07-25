import { Router } from "express";
import { storage } from "../storage";
import {
  insertActivityCommentSchema,
  insertItineraryChangeSchema,
} from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getTripRole, canMutateTrip } from "../utils/trip-role";
import { isTripAuthor } from "../utils/trip-authorship";
import { geocodeAddress } from "../utils/geocode";

const router = Router();

// Resolve-on-write: populate latitude/longitude for itinerary items that lack
// them, once, via the single server geocode path, and persist back to the row so
// subsequent reads use the stored value. Bounded per request so a cold trip
// can't stall the response; safe to fail (the map simply omits a pin without
// coordinates). The PlanCard client never geocodes — pins read these columns.
async function resolveMissingItemCoordinates(
  items: Array<{ id: string; latitude: any; longitude: any; locationName: any; locationAddress: any }>,
  destination: string | null | undefined,
): Promise<void> {
  const MAX_PER_REQUEST = 12;
  let resolved = 0;
  for (const item of items) {
    if (resolved >= MAX_PER_REQUEST) break;
    if (item.latitude != null && item.longitude != null) continue;
    const address = [item.locationName, item.locationAddress, destination]
      .filter((p) => p && String(p).trim().length > 0)
      .join(", ");
    if (!address) continue;
    try {
      const geo = await geocodeAddress(address);
      if (!geo) continue;
      const lat = geo.lat.toString();
      const lng = geo.lng.toString();
      await storage.updateItineraryItemCoordinates(item.id, lat, lng);
      // Reflect in the in-memory row so this same response carries the pin.
      item.latitude = lat;
      item.longitude = lng;
      resolved++;
    } catch {
      // best-effort; leave this item un-pinned
    }
  }
}

function logChange(tripId: string, who: string, action: string, changeType: string, role: string, activityId?: string, metadata?: any) {
  return storage.createItineraryChange({
    tripId,
    activityId: activityId || null,
    who,
    action,
    changeType,
    role,
    metadata: metadata || {},
  });
}

// ── G7: Apply top AI variant to the trip's itinerary items ──────────────────
router.post("/api/itinerary-comparisons/:id/apply-to-trip", isAuthenticated, async (req, res) => {
  try {
    const { id: comparisonId } = req.params;
    const userId = (req.user as any)?.claims?.sub;

    const comparison = await storage.getItineraryComparison(comparisonId);
    if (!comparison || comparison.userId !== userId) {
      return res.status(404).json({ error: "Comparison not found" });
    }
    if (!comparison.tripId) {
      return res.status(400).json({ error: "Comparison has no associated trip" });
    }

    // Find best variant: prefer selectedVariantId, else top AI variant by optimizationScore
    let variant: any = null;
    if (comparison.selectedVariantId) {
      variant = await storage.getItineraryVariantById(comparison.selectedVariantId);
    }
    if (!variant) {
      variant = await storage.getTopAiVariantByComparison(comparisonId);
    }
    if (!variant) {
      return res.status(400).json({ error: "No AI variant available to apply" });
    }

    const variantItems = await storage.getOrderedVariantItemsByVariantId(variant.id);

    // Replace itinerary items for this trip
    await storage.deleteItineraryItemsByTrip(comparison.tripId);

    await storage.bulkInsertItineraryItems(variantItems.map((item: any) => ({
      tripId: comparison.tripId,
      title: item.name,
      description: item.description || "",
      itemType: item.serviceType || "activity",
      status: "planned",
      dayNumber: item.dayNumber,
      startTime: item.startTime || "",
      durationMinutes: item.duration || 60,
      locationName: item.location || "",
      estimatedCost: item.price ? String(item.price) : null,
      currency: "USD",
      sortOrder: item.sortOrder ?? 0,
      suggestedBy: "AI Optimizer",
      latitude: item.latitude ? String(item.latitude) : null,
      longitude: item.longitude ? String(item.longitude) : null,
    })));

    // Read metrics for delta computation
    const metrics = await storage.getVariantMetricsAllByVariantId(variant.id);

    const rawMetrics: Record<string, number> = {};
    for (const m of metrics) {
      const v = parseFloat(m.value?.toString() ?? "0");
      if (!isNaN(v)) rawMetrics[m.metricKey] = v;
    }

    const delta = {
      savings: rawMetrics["savings"] ?? null,
      savingsPercent: rawMetrics["savings_percent"] ?? rawMetrics["savingsPercent"] ?? null,
      starRatingDelta: rawMetrics["star_rating_delta"] ?? rawMetrics["starRatingDelta"] ?? null,
      travelDistanceMinutes: rawMetrics["travel_distance_minutes"] ?? rawMetrics["travelDistanceMinutes"] ?? null,
      optimizationScore: variant.optimizationScore ?? null,
    };

    // Insert AI changelog entry
    await storage.createItineraryChange({
      tripId: comparison.tripId,
      activityId: null,
      who: "AI Optimizer",
      action: `Applied optimized itinerary${delta.savings != null ? ` — saved $${Math.round(delta.savings)}` : ""}${delta.savingsPercent != null ? `, ${Math.round(delta.savingsPercent)}% tighter schedule` : ""}`,
      changeType: "optimize",
      role: "ai",
      metadata: { comparisonId, variantId: variant.id, delta },
    });

    // Mark comparison with optimizedAt timestamp
    await storage.updateComparisonOptimizedAt(comparisonId, variant.id);

    res.json({ tripId: comparison.tripId, delta });
  } catch (error) {
    console.error("Error applying variant to trip:", error);
    res.status(500).json({ error: "Failed to apply variant to trip" });
  }
});

router.get("/api/trips/:tripId/plancard", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = (req.user as any)?.claims?.sub;

    const trip = await storage.getTrip(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const tripRole = await getTripRole(tripId, userId);

    if (!tripRole) {
      // Legacy fallback: check trip_expert_advisors for assigned experts
      const assignment = await storage.getTripExpertAdvisoryAssignment(tripId, userId);
      const isAssignedExpert = assignment && ['pending', 'accepted'].includes(assignment.status);
      // Authoring mode (ready-made brief §2/§4): the trip's AUTHOR may render their own build.
      // A PARALLEL named branch beside getTripRole — the helper itself is deliberately untouched
      // (known pre-launch bypass, separate fix). getTripRole returns null for an author (no
      // collaborator/advisor row), so without this branch authoring mode 403s its own itinerary.
      const isAuthor = isAssignedExpert ? false : await isTripAuthor(tripId, userId);
      if (!isAssignedExpert && !isAuthor) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const items = await storage.getItineraryItems(tripId);

    // Resolve-on-write: fill + persist any missing pin coordinates via the single
    // server geocode path, so the client never geocodes.
    await resolveMissingItemCoordinates(items as any, trip.destination);

    const comparison = await storage.getItineraryComparisonByTripId(tripId);

    let variantLegs: any[] = [];
    let variantMetrics: any[] = [];

    if (comparison) {
      const variantId = comparison.selectedVariantId;
      let variant;
      if (variantId) {
        variant = await storage.getItineraryVariantById(variantId);
      }
      if (!variant) {
        variant = await storage.getFirstVariantByComparisonId(comparison.id);
      }
      if (variant) {
        variantLegs = await storage.getOrderedTransportLegsByVariantId(variant.id);
        variantMetrics = await storage.getVariantMetricsAllByVariantId(variant.id);
      }
    }

    // Build a map from transportLegId → primary booking option for badge display
    const legBookingMap: Record<string, { bookingSource: "platform" | "affiliate"; partnerName: string | null }> = {};
    if (variantLegs.length > 0) {
      const legIds = variantLegs.map((l: any) => l.id).filter(Boolean);
      if (legIds.length > 0) {
        const bookingOpts = await storage.getBookingOptionsByLegIds(legIds);
        for (const opt of bookingOpts) {
          if (!opt.transportLegId) continue;
          if (legBookingMap[opt.transportLegId]) continue;
          legBookingMap[opt.transportLegId] = {
            bookingSource: opt.bookingType === "platform" ? "platform" : "affiliate",
            partnerName: opt.source !== "traveloure" ? opt.source : null,
          };
        }
      }
    }

    const changes = await storage.getItineraryChanges(tripId, 20);
    const commentCounts = await storage.getActivityCommentCounts(tripId);

    const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
    const startDate = trip.startDate ? new Date(trip.startDate) : new Date();

    let days = dayNumbers.map(dayNum => {
      const dayItems = items.filter(i => i.dayNumber === dayNum);
      const dayLegs = variantLegs.filter(l => l.dayNumber === dayNum && l.userSelectedMode !== "dismissed");

      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + dayNum - 1);
      const dateLabel = dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

      const types = dayItems.map(i => i.itemType || "activity");
      const label = generateDayLabel(types, dayItems);

      return {
        dayNum,
        date: dateLabel,
        label,
        activities: dayItems.map(item => ({
          id: item.id,
          time: item.startTime || "",
          name: item.title,
          location: item.locationName || item.locationAddress || "",
          type: mapItemType(item.itemType),
          status: mapItemStatus(item.status),
          cost: parseFloat(item.estimatedCost?.toString() || "0"),
          // Emitted as lat/lng to match the PlanCardActivity client contract so
          // pins read coordinates directly (no client-side geocoding).
          lat: item.latitude ? parseFloat(item.latitude.toString()) : null,
          lng: item.longitude ? parseFloat(item.longitude.toString()) : null,
          expertNote: (item as any).notes || null,
          comments: commentCounts[item.id] || 0,
          suggestedBy: item.suggestedBy || null,
          changes: changes
            .filter(c => c.activityId === item.id)
            .slice(0, 1)
            .map(c => ({ who: c.who, what: c.action, when: formatTimeAgo(c.createdAt) })),
        })),
        transports: dayLegs.map(leg => ({
          id: leg.id,
          from: leg.fromActivityId || "",
          to: leg.toActivityId || "",
          fromName: leg.fromName,
          toName: leg.toName,
          mode: leg.userSelectedMode || leg.recommendedMode || "walk",
          duration: leg.estimatedDurationMinutes || 0,
          cost: leg.estimatedCostUsd || 0,
          line: null,
          status: leg.userSelectedMode ? "confirmed" : "suggested",
          suggestedBy: leg.userSelectedMode ? null : "ai",
          bookingSource: legBookingMap[leg.id]?.bookingSource ?? null,
          partnerName: legBookingMap[leg.id]?.partnerName ?? null,
          // Per-leg mode-selection fields for the activities-view picker
          legOrder: leg.legOrder,
          recommendedMode: leg.recommendedMode,
          userSelectedMode: leg.userSelectedMode ?? null,
          alternativeModes: leg.alternativeModes ?? [],
          fromLat: leg.fromLat,
          fromLng: leg.fromLng,
          toLat: leg.toLat,
          toLng: leg.toLng,
          distanceDisplay: leg.distanceDisplay,
          estimatedDurationMinutes: leg.estimatedDurationMinutes,
          estimatedCostUsd: leg.estimatedCostUsd ?? null,
        })),
      };
    });

    function toNum(raw: Record<string, string>, ...keys: string[]): number | undefined {
      for (const k of keys) {
        const v = raw[k];
        if (v != null) {
          const n = parseFloat(v);
          if (!isNaN(n)) return n;
        }
      }
      return undefined;
    }

    const rawMetrics: Record<string, string> = {};
    for (const m of variantMetrics) {
      rawMetrics[m.metricKey] = m.metricValue;
    }

    const metricsMap = {
      traveloureScore: toNum(rawMetrics, "traveloureScore", "traveloure_score"),
      optimizationScore: toNum(rawMetrics, "optimizationScore", "optimization_score"),
      totalCost: toNum(rawMetrics, "totalCost", "total_cost"),
      perPersonCost: toNum(rawMetrics, "perPersonCost", "per_person_cost"),
      savings: toNum(rawMetrics, "savings"),
      savingsPercent: toNum(rawMetrics, "savingsPercent", "savings_percent"),
      wellnessMinutes: toNum(rawMetrics, "wellnessMinutes", "wellness_minutes"),
      travelDistanceMinutes: toNum(rawMetrics, "travelDistanceMinutes", "travel_distance_minutes"),
      starRatingDelta: toNum(rawMetrics, "starRatingDelta", "star_rating_delta"),
    };

    // If no structured itinerary items, fall back to generated_itineraries full day objects
    let fallbackActivityCount = items.length;
    let fallbackDays = days.length;
    if (items.length === 0) {
      const genItinerary = await storage.getGeneratedItineraryByTripId(tripId);
      if (genItinerary?.itineraryData) {
        const data = genItinerary.itineraryData as { days?: Array<any> };
        const genDays = data.days ?? [];
        fallbackDays = genDays.length || fallbackDays;
        fallbackActivityCount = genDays.reduce((s: number, d: any) => s + (d.activities?.length ?? 0), 0);
        // Build full day objects from the generated itinerary so PlanCard renders correctly
        days = genDays.map((d: any, idx: number) => {
          const dayNum: number = d.day || idx + 1;
          const dayDate = new Date(startDate);
          dayDate.setDate(dayDate.getDate() + dayNum - 1);
          const dateLabel = dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const acts: any[] = d.activities || [];
          const types: string[] = acts.map((a: any) => a.category || a.type || "activity");
          return {
            dayNum,
            date: dateLabel,
            label: generateDayLabel(types, []),
            activities: acts.map((a: any, ai: number) => ({
              id: a.id || `gen-${dayNum}-${ai}`,
              time: a.time || "",
              name: a.name || a.title || "",
              location: a.location || a.venue || "",
              type: a.category || a.type || "activity",
              status: a.status || "planned",
              cost: parseFloat(a.estimatedCost?.toString() || a.cost?.toString() || "0"),
              lat: a.lat ?? a.latitude ?? null,
              lng: a.lng ?? a.longitude ?? null,
              expertNote: null,
              comments: 0,
              suggestedBy: null,
              changes: [],
            })),
            transports: (d.transportLegs || []).map((l: any, li: number) => ({
              id: l.id || `tleg-${dayNum}-${li}`,
              from: l.fromName || l.from || "",
              to: l.toName || l.to || "",
              fromName: l.fromName || l.from || "",
              toName: l.toName || l.to || "",
              mode: l.userSelectedMode || l.recommendedMode || l.mode || "walk",
              duration: l.estimatedDurationMinutes || l.duration || 0,
              cost: l.estimatedCostUsd || l.cost || 0,
              line: null,
              status: "suggested",
              suggestedBy: "ai",
              bookingSource: "platform",
              partnerName: null,
              // Per-leg mode-selection fields for the activities-view picker
              legOrder: l.legOrder ?? li,
              recommendedMode: l.recommendedMode || l.mode || "walk",
              userSelectedMode: l.userSelectedMode ?? null,
              alternativeModes: l.alternativeModes ?? [],
              fromLat: l.fromLat ?? null,
              fromLng: l.fromLng ?? null,
              toLat: l.toLat ?? null,
              toLng: l.toLng ?? null,
              distanceDisplay: l.distanceDisplay ?? "",
              estimatedDurationMinutes: l.estimatedDurationMinutes ?? l.duration ?? 0,
              estimatedCostUsd: l.estimatedCostUsd ?? l.cost ?? null,
            })),
          };
        });
      }
    }

    // Build optimizationDelta from AI optimize changelog entry (set by apply-to-trip)
    const optimizeEntry = changes.find(c => c.role === "ai" && c.changeType === "optimize");
    const optimizationDelta = optimizeEntry?.metadata
      ? (optimizeEntry.metadata as any).delta ?? null
      : null;
    const lastOptimizedAt = comparison?.optimizedAt ?? null;

    res.json({
      tripRole: tripRole ?? (trip.userId === userId ? "owner" : "expert"),
      trip: {
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        status: trip.status,
        eventType: trip.eventType,
        startDate: trip.startDate,
        endDate: trip.endDate,
        travelers: trip.numberOfTravelers || 1,
        budget: trip.budget ? `$${parseFloat(trip.budget.toString()).toLocaleString()}` : null,
      },
      days,
      changeLog: changes.slice(0, 10).map(c => ({
        id: c.id,
        who: c.who,
        action: c.action,
        when: formatTimeAgo(c.createdAt),
        type: c.changeType,
        role: c.role,
      })),
      metrics: metricsMap,
      optimizationDelta,
      lastOptimizedAt,
      stats: {
        totalDays: fallbackDays || days.length,
        totalActivities: fallbackActivityCount,
        totalLegs: variantLegs.filter(l => l.userSelectedMode !== "dismissed").length,
        totalTransitMinutes: variantLegs.filter(l => l.userSelectedMode !== "dismissed").reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0),
        confirmedActivities: items.filter(i => i.status === "confirmed" || i.status === "planned").length,
        pendingExpertChanges: changes.filter(c => c.role === "expert" && c.changeType === "suggest").length,
      },
    });
  } catch (error) {
    console.error("Error fetching plancard data:", error);
    res.status(500).json({ error: "Failed to fetch plancard data" });
  }
});

router.get("/api/activities/:activityId/comments", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.query;
    if (!tripId) {
      return res.status(400).json({ error: "tripId query parameter required" });
    }
    const userId = (req.user as any)?.claims?.sub;
    const trip = await storage.getTrip(tripId as string);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    const comments = await storage.getActivityComments(req.params.activityId);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

router.post("/api/activities/:activityId/comments", isAuthenticated, async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = (req.user as any)?.claims?.sub;
    const userName = (req.user as any)?.claims?.name || "User";
    const { tripId, text, role } = req.body;

    if (!tripId || !text || !role) {
      return res.status(400).json({ error: "Missing required fields: tripId, text, role" });
    }

    const trip = await storage.getTrip(tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const parsed = insertActivityCommentSchema.safeParse({
      activityId,
      tripId,
      authorId: userId,
      authorName: userName,
      text,
      role,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const comment = await storage.createActivityComment(parsed.data);

    await logChange(tripId, userName, `Commented on activity`, "edit", role, activityId);

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: "Failed to create comment" });
  }
});

router.delete("/api/comments/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    const comment = await storage.getActivityComment(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }
    if (comment.authorId !== userId) {
      const trip = await storage.getTrip(comment.tripId);
      if (!trip || trip.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    await storage.deleteActivityComment(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

router.get("/api/trips/:tripId/changes", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    const trip = await storage.getTrip(req.params.tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const changes = await storage.getItineraryChanges(req.params.tripId, limit);
    res.json(changes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch changes" });
  }
});

router.post("/api/trips/:tripId/changes", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = (req.user as any)?.claims?.sub;
    const userName = (req.user as any)?.claims?.name || "User";

    const trip = await storage.getTrip(tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const parsed = insertItineraryChangeSchema.safeParse({
      ...req.body,
      tripId,
      who: userName,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const change = await logChange(
      tripId,
      userName,
      parsed.data.action,
      parsed.data.changeType,
      parsed.data.role,
      parsed.data.activityId || undefined,
      parsed.data.metadata || undefined,
    );
    res.status(201).json(change);
  } catch (error) {
    res.status(500).json({ error: "Failed to create change record" });
  }
});

router.patch("/api/transport-legs/:legId/status", isAuthenticated, async (req, res) => {
  try {
    const { legId } = req.params;
    const userId = (req.user as any)?.claims?.sub;
    const userName = (req.user as any)?.claims?.name || "User";
    const { status, tripId } = req.body;

    if (!status || !tripId) {
      return res.status(400).json({ error: "status and tripId are required" });
    }

    const allowed = ["confirmed", "dismissed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    }

    // Verify trip role (owner or expert can confirm/dismiss transport legs; friends cannot)
    const tripRole = await getTripRole(tripId, userId);
    if (!canMutateTrip(tripRole)) {
      return res.status(403).json({ error: tripRole === "friend" ? "Friends cannot confirm or dismiss transport legs" : "Access denied" });
    }

    // Verify that the leg belongs to a variant linked to this trip (prevent cross-trip mutations)
    const leg = await storage.getTransportLegById(legId);
    if (!leg) {
      return res.status(404).json({ error: "Transport leg not found" });
    }

    const variant = await storage.getItineraryVariantById(leg.variantId);
    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const comparison = await storage.getItineraryComparison(variant.comparisonId);
    if (!comparison || comparison.tripId !== tripId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Use "dismissed" as a sentinel value in userSelectedMode so the plancard GET
    // can filter it out. This avoids a schema migration while making dismissal durable.
    // On confirm: store the leg's current mode (userSelectedMode if already set and not dismissed,
    // else recommendedMode, else mode) so the GET's `userSelectedMode ? "confirmed" : "suggested"`
    // derivation returns "confirmed" rather than falling back to "suggested".
    const confirmedMode = leg.userSelectedMode && leg.userSelectedMode !== "dismissed"
      ? leg.userSelectedMode
      : (leg.recommendedMode || leg.mode || "walk");
    await storage.updateTransportLegUserSelectedMode(
      legId,
      status === "dismissed" ? "dismissed" : confirmedMode
    );

    await logChange(
      tripId,
      userName,
      status === "dismissed" ? "Declined suggested transport leg" : `Confirmed transport leg`,
      status === "dismissed" ? "decline" : "edit",
      tripRole!,
    );

    res.json({ success: true, legId, status });
  } catch (error) {
    console.error("Error updating transport leg status:", error);
    res.status(500).json({ error: "Failed to update transport leg status" });
  }
});

router.delete("/api/trips/:tripId/changes/:changeId", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    const trip = await storage.getTrip(req.params.tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    await storage.deleteItineraryChange(req.params.changeId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete change record" });
  }
});

function mapItemType(itemType: string | null): string {
  const map: Record<string, string> = {
    activity: "attraction",
    dining: "dining",
    attraction: "attraction",
    shopping: "shopping",
    transport: "transport",
    accommodation: "accommodation",
    meal: "dining",
    sightseeing: "attraction",
    entertainment: "attraction",
    spa: "attraction",
    tour: "attraction",
  };
  return map[itemType || "activity"] || "attraction";
}

function mapItemStatus(status: string | null): string {
  const map: Record<string, string> = {
    planned: "confirmed",
    confirmed: "confirmed",
    pending: "pending",
    suggested: "suggested",
    cancelled: "pending",
  };
  return map[status || "planned"] || "pending";
}

function generateDayLabel(types: string[], items: any[]): string {
  const uniqueTypes = [...new Set(types)];
  if (items.length === 0) return "Free Day";
  const firstItem = items[0]?.title || "";
  const lastItem = items[items.length - 1]?.title || "";
  if (items.length <= 2) return firstItem;
  return `${firstItem} & more`;
}

function formatTimeAgo(date: Date | null): string {
  if (!date) return "recently";
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default router;
