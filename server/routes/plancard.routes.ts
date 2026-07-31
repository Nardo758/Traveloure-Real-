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
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { assembleTripPlan, TripPlanNotFoundError } from "../services/trip-plan.service";

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

    const comparison = await storage.getItineraryComparison(comparisonId);
    if (!comparison || comparison.userId !== userId) {
      return res.status(404).json({ error: "Comparison not found" });
    }
    if (!comparison.tripId) {
      return res.status(400).json({ error: "Comparison has no associated trip" });
    }

    // SECURITY (destructive cross-trip IDOR): owning the COMPARISON is not the same as being
    // allowed to mutate the TRIP it points at — `itinerary_comparisons.tripId` is caller-supplied,
    // so a comparison can name someone else's trip. This handler then wipes that trip
    // (`deleteItineraryItemsByTrip`) and re-inserts the variant, so without a trip-side check any
    // authenticated user could destroy and overwrite any other user's itinerary. BOTH checks must
    // hold: the comparison-ownership check above AND the canonical trip authorization here
    // (owner ‖ trip-assigned expert ‖ trip author ‖ audit-logged admin), performed BEFORE the delete.
    const denied = await authorizeTripLogistics(
      comparison.tripId,
      userId,
      "POST /api/itinerary-comparisons/:id/apply-to-trip",
    );
    // Local convention in this router: `{ error }` bodies, 403 for an authorized-user-wrong-trip.
    if (denied) return res.status(denied.status).json({ error: denied.message });

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

    // Replace itinerary items for this trip — ROUTING-STATUS-AWARE (Lane 5a Defect 2).
    // This was an unconditional `deleteItineraryItemsByTrip`, which also destroyed `with_expert`,
    // `ready_for_checkout` and `purchased` rows — the last of those carry `booking_id`
    // (migration 159), so applying an optimizer variant silently severed real bookings from the
    // plan. Only `in_planning` items are the optimizer's to replace; everything the traveler has
    // routed onward survives untouched. The inserted variant items take the migration-159 default
    // (`in_planning`), so a re-apply keeps replacing exactly the rows it created.
    const { preserved: preservedRoutedItems } = await storage.deleteInPlanningItineraryItemsByTrip(comparison.tripId);

    // ── Lane 5b: apply-time dedupe against the rows that SURVIVED the delete ──────────────────
    // The two halves of Lane 5a/5b meet here. Since the re-point, `ready_for_checkout` items are
    // optimizer INPUT (they are still plan), while the delete above deliberately spares them — so
    // a variant can legitimately propose an item that is already sitting on the trip, and a naive
    // insert would produce a second copy of it. (The sharpest case: the user selects the BASELINE
    // variant, whose items literally ARE the trip's own items, and applies it.)
    //
    // Deduped against ALL survivors, not just `ready_for_checkout`: the rule is "never create a
    // second copy of something already on this plan", and that is at its most important for a
    // `purchased` row — the traveler has paid for it, and a duplicate would read as an unbought
    // second booking.
    //
    // Predicate (ratified): `providerServiceId` first — the catalog identity, and the only
    // trustworthy key — then an exact case-insensitive title match, which is all an AI-authored
    // item offers. Same predicate the optimizer uses to refuse to emit a purchased item at all
    // (`stripFixedCommitmentEchoes`), so the two ends cannot disagree on what "the same item" is.
    const survivingItems = await storage.getItineraryItems(comparison.tripId);
    const survivingServiceIds = new Set(
      survivingItems.map((s: any) => s.providerServiceId).filter((v: any): v is string => !!v),
    );
    const survivingTitles = new Set(
      survivingItems.map((s: any) => String(s.title ?? "").trim().toLowerCase()).filter(Boolean),
    );
    const applicableVariantItems = variantItems.filter((item: any) => {
      if (item.providerServiceId && survivingServiceIds.has(item.providerServiceId)) return false;
      const name = String(item.name ?? "").trim().toLowerCase();
      if (name && survivingTitles.has(name)) return false;
      return true;
    });
    const dedupedAgainstRoutedItems = variantItems.length - applicableVariantItems.length;

    // W5 (H5): preserve the service link through the apply. `itinerary_variant_items` rows carry
    // `providerServiceId` (shared/schema.ts:1166) and the itinerary item has had the matching
    // column all along — the mapping simply omitted it, so every optimizer-applied plan arrived as
    // unbuyable text (docs/E2E_ITEM_LIFECYCLE.md §3, the H1 bug written a second time by a second
    // author because no invariant existed to stop it; the Lane G guard is that invariant now).
    // `?? null` is the honest value for an AI-invented item with no catalog row behind it — the
    // optimizer emits those alongside real ones, and NULL says "nothing to link", never a guess.
    await storage.bulkInsertItineraryItems(applicableVariantItems.map((item: any) => ({
      tripId: comparison.tripId,
      providerServiceId: item.providerServiceId ?? null,
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

    // ADDITIVE fields (§13 honest reporting): how many already-routed items the apply left in
    // place, and how many proposed items were dropped because the plan already held them.
    // Existing consumers read `tripId`/`delta` and are unaffected; no UI is built on these yet.
    res.json({ tripId: comparison.tripId, delta, preservedRoutedItems, dedupedAgainstRoutedItems });
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

    // ── Thin caller (L3a): the assembly lives in the ONE TripPlan assembler ────────────────
    // The gate above is authoritative — the assembler does NOT authorize; the redaction level is
    // the channel contract. This surface renders the full body for an authorized viewer, so it
    // asks for 'full'.
    const plan = await assembleTripPlan(tripId, "full", { viewerId: userId, tripRole });

    res.json({
      // Pre-existing plancard response contract — key names and shapes unchanged.
      tripRole: plan.plancard.tripRole,
      trip: plan.plancard.trip,
      days: plan.days,
      changeLog: plan.plancard.changeLog,
      metrics: plan.plancard.metrics,
      optimizationDelta: plan.plancard.optimizationDelta,
      lastOptimizedAt: plan.plancard.lastOptimizedAt,
      stats: plan.plancard.stats,
      // ADDITIVE TripPlan v1 envelope (docs/EXECUTION_MAP.md §3). New consumers read these;
      // existing consumers ignore them.
      meta: plan.meta,
      legs: plan.legs,
      tripNote: plan.tripNote,
      budget: plan.budget,
      changeLogRef: plan.changeLogRef,
      // Lane 1 W4 (H2): the trip's real bookings. Additive — `days[].activities[].booking` already
      // rides the unchanged `days` passthrough above; this is the list that also surfaces bookings
      // no plan item points at. This surface is owner/expert/author/admin-gated above.
      bookings: plan.bookings,
    });
  } catch (error) {
    if (error instanceof TripPlanNotFoundError) {
      return res.status(404).json({ error: "Trip not found" });
    }
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

// mapItemType / mapItemStatus / generateDayLabel / formatTimeAgo moved into the ONE TripPlan
// assembler (server/services/trip-plan.service.ts) with the assembly they belong to (L3a).

export default router;
