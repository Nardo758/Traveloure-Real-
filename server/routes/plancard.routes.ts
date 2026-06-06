import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  itineraryItems,
  itineraryChanges,
  activityComments,
  transportLegs,
  transportBookingOptions,
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
  itineraryVariantMetrics,
  generatedItineraries,
  insertActivityCommentSchema,
  insertItineraryChangeSchema,
  trips,
} from "@shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getTripRole } from "../utils/trip-role";

const router = Router();

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

    const comparison = await db.query.itineraryComparisons.findFirst({
      where: eq(itineraryComparisons.id, comparisonId),
    });
    if (!comparison || comparison.userId !== userId) {
      return res.status(404).json({ error: "Comparison not found" });
    }
    if (!comparison.tripId) {
      return res.status(400).json({ error: "Comparison has no associated trip" });
    }

    // Find best variant: prefer selectedVariantId, else top AI variant by optimizationScore
    let variant: any = null;
    if (comparison.selectedVariantId) {
      variant = await db.query.itineraryVariants.findFirst({
        where: eq(itineraryVariants.id, comparison.selectedVariantId),
      });
    }
    if (!variant) {
      const aiVariants = await db.select().from(itineraryVariants)
        .where(and(eq(itineraryVariants.comparisonId, comparisonId), eq(itineraryVariants.source, "ai_optimized")))
        .orderBy(desc(itineraryVariants.optimizationScore))
        .limit(1);
      variant = aiVariants[0] ?? null;
    }
    if (!variant) {
      return res.status(400).json({ error: "No AI variant available to apply" });
    }

    const variantItems = await db.select().from(itineraryVariantItems)
      .where(eq(itineraryVariantItems.variantId, variant.id))
      .orderBy(itineraryVariantItems.dayNumber, itineraryVariantItems.sortOrder);

    // Replace itinerary items for this trip
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, comparison.tripId));

    for (const item of variantItems) {
      await db.insert(itineraryItems).values({
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
      });
    }

    // Read metrics for delta computation
    const metrics = await db.select().from(itineraryVariantMetrics)
      .where(eq(itineraryVariantMetrics.variantId, variant.id));

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
    await db.update(itineraryComparisons)
      .set({ optimizedAt: new Date(), selectedVariantId: variant.id } as any)
      .where(eq(itineraryComparisons.id, comparisonId));

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
      const expertCheck = await db.execute(sql`
        SELECT id FROM trip_expert_advisors
        WHERE trip_id = ${tripId}
          AND local_expert_id = ${userId}
          AND status IN ('pending', 'accepted')
        LIMIT 1
      `);
      const isAssignedExpert = expertCheck.rows && expertCheck.rows.length > 0;
      if (!isAssignedExpert) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const items = await db.select().from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(itineraryItems.dayNumber, itineraryItems.sortOrder);

    const comparison = await db.query.itineraryComparisons.findFirst({
      where: eq(itineraryComparisons.tripId, tripId),
    });

    let variantLegs: any[] = [];
    let variantMetrics: any[] = [];

    if (comparison) {
      const variantId = comparison.selectedVariantId;
      let variant;
      if (variantId) {
        variant = await db.query.itineraryVariants.findFirst({
          where: eq(itineraryVariants.id, variantId),
        });
      }
      if (!variant) {
        const variants = await db.query.itineraryVariants.findMany({
          where: eq(itineraryVariants.comparisonId, comparison.id),
          orderBy: (v, { asc }) => [asc(v.sortOrder)],
          limit: 1,
        });
        variant = variants[0];
      }
      if (variant) {
        variantLegs = await db.select().from(transportLegs)
          .where(eq(transportLegs.variantId, variant.id))
          .orderBy(transportLegs.dayNumber, transportLegs.legOrder);

        variantMetrics = await db.select().from(itineraryVariantMetrics)
          .where(eq(itineraryVariantMetrics.variantId, variant.id));
      }
    }

    // Build a map from transportLegId → primary booking option for badge display
    const legBookingMap: Record<string, { bookingSource: "platform" | "affiliate"; partnerName: string | null }> = {};
    if (variantLegs.length > 0) {
      const legIds = variantLegs.map((l: any) => l.id).filter(Boolean);
      if (legIds.length > 0) {
        const bookingOpts = await db.select().from(transportBookingOptions)
          .where(sql`${transportBookingOptions.transportLegId} = ANY(ARRAY[${sql.join(legIds.map(id => sql`${id}`), sql`, `)}]::text[])`);
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
          latitude: item.latitude ? parseFloat(item.latitude.toString()) : null,
          longitude: item.longitude ? parseFloat(item.longitude.toString()) : null,
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
      const genItinerary = await db.query.generatedItineraries.findFirst({
        where: eq(generatedItineraries.tripId, tripId),
      });
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
              latitude: a.latitude ?? null,
              longitude: a.longitude ?? null,
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

    // Verify trip ownership
    const trip = await storage.getTrip(tripId);
    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify that the leg belongs to a variant linked to this trip (prevent cross-trip mutations)
    const leg = await db.query.transportLegs.findFirst({
      where: eq(transportLegs.id, legId),
    });
    if (!leg) {
      return res.status(404).json({ error: "Transport leg not found" });
    }

    const variant = await db.query.itineraryVariants.findFirst({
      where: eq(itineraryVariants.id, leg.variantId),
    });
    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const comparison = await db.query.itineraryComparisons.findFirst({
      where: eq(itineraryComparisons.id, variant.comparisonId),
    });
    if (!comparison || comparison.tripId !== tripId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Use "dismissed" as a sentinel value in userSelectedMode so the plancard GET
    // can filter it out. This avoids a schema migration while making dismissal durable.
    await db.update(transportLegs)
      .set({ userSelectedMode: status === "dismissed" ? "dismissed" : null })
      .where(eq(transportLegs.id, legId));

    await logChange(
      tripId,
      userName,
      status === "dismissed" ? "Declined suggested transport leg" : `Confirmed transport leg`,
      status === "dismissed" ? "decline" : "edit",
      "owner",
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
