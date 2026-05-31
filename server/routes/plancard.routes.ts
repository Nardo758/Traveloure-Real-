import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  itineraryItems,
  itineraryChanges,
  activityComments,
  transportLegs,
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

router.get("/api/trips/:tripId/plancard", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = (req.user as any)?.claims?.sub;

    const trip = await storage.getTrip(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    if (trip.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
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

    const changes = await storage.getItineraryChanges(tripId, 20);
    const commentCounts = await storage.getActivityCommentCounts(tripId);

    const dayNumbers = [...new Set(items.map(i => i.dayNumber))].sort((a, b) => a - b);
    const startDate = trip.startDate ? new Date(trip.startDate) : new Date();

    const days = dayNumbers.map(dayNum => {
      const dayItems = items.filter(i => i.dayNumber === dayNum);
      const dayLegs = variantLegs.filter(l => l.dayNumber === dayNum);

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
        })),
      };
    });

    const metricsMap: Record<string, string> = {};
    for (const m of variantMetrics) {
      metricsMap[m.metricKey] = m.metricValue;
    }

    // If no structured itinerary items, fall back to generated_itineraries activity count
    let fallbackActivityCount = items.length;
    let fallbackDays = days.length;
    if (items.length === 0) {
      const genItinerary = await db.query.generatedItineraries.findFirst({
        where: eq(generatedItineraries.tripId, tripId),
      });
      if (genItinerary?.itineraryData) {
        const data = genItinerary.itineraryData as { days?: Array<{ activities?: unknown[] }> };
        const genDays = data.days ?? [];
        fallbackDays = genDays.length || fallbackDays;
        fallbackActivityCount = genDays.reduce((s, d) => s + (d.activities?.length ?? 0), 0);
      }
    }

    res.json({
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
      stats: {
        totalDays: fallbackDays || days.length,
        totalActivities: fallbackActivityCount,
        totalLegs: variantLegs.length,
        totalTransitMinutes: variantLegs.reduce((s, l) => s + (l.estimatedDurationMinutes || 0), 0),
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
