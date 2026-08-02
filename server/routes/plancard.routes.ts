import { Router } from "express";
import { storage } from "../storage";
import {
  insertItineraryChangeSchema,
  itineraryItems,
  itineraryComparisons,
  itineraryVariants,
  sharedItineraries,
} from "@shared/schema";
import { db } from "../db";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getTripRole, canMutateTrip } from "../utils/trip-role";
import { isTripAuthor } from "../utils/trip-authorship";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { logItemTransition } from "../services/item-transition-log.service";
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

    // Read metrics for delta computation — a read, deliberately BEFORE the transaction below.
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

    const tripId = comparison.tripId;

    // ── Lane 6 residue R2: apply is ONE atomic action ─────────────────────────────────────────
    // Before this transaction the four writes below ran as independent autocommit statements, and
    // the insert was a per-row loop — a mid-loop failure left the trip with its `in_planning` rows
    // already deleted and only PART of the variant applied (the sharpest data-loss window in the
    // whole flow). Now the delete, the batch insert, the changelog entry, the comparison stamp,
    // and the R3 variant discard commit together or not at all.
    const applied = await db.transaction(async (tx) => {
      // Replace itinerary items for this trip — ROUTING-STATUS-AWARE (Lane 5a Defect 2).
      // Only `in_planning` items are the optimizer's to replace; `with_expert` /
      // `ready_for_checkout` / `purchased` rows survive untouched (a `purchased` row carries
      // `booking_id`, migration 159). Inserted variant items take the migration-159 default
      // (`in_planning`), so a re-apply keeps replacing exactly the rows it created.
      await tx
        .delete(itineraryItems)
        .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.routingStatus, "in_planning")));
      const [remaining] = await tx
        .select({ n: count() })
        .from(itineraryItems)
        .where(eq(itineraryItems.tripId, tripId));
      const preservedRoutedItems = Number(remaining?.n ?? 0);

      // ── Lane 5b: apply-time dedupe against the rows that SURVIVED the delete ──────────────
      // `ready_for_checkout` items are optimizer INPUT (still plan) while the delete spares
      // them — so a variant can propose an item already sitting on the trip, and a naive insert
      // would duplicate it. Deduped against ALL survivors ("never create a second copy of
      // something already on this plan" — most important for a `purchased` row). Predicate
      // (ratified): `providerServiceId` first, then exact case-insensitive title — the same
      // predicate `stripFixedCommitmentEchoes` uses, so the two ends cannot disagree.
      const survivingItems = await tx
        .select()
        .from(itineraryItems)
        .where(eq(itineraryItems.tripId, tripId));
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

      // W5 (H5): preserve the service link through the apply — `?? null` is the honest value for
      // an AI-invented item with no catalog row behind it. ONE batch insert (was a per-row loop).
      if (applicableVariantItems.length > 0) {
        await tx.insert(itineraryItems).values(applicableVariantItems.map((item: any) => ({
          tripId,
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
      }

      // Diary entry — Lane S rulings 11/16: the apply event now lives in the append-only
      // `item_transition_log` as a TRIP-SCOPED row (itemId NULL; the eventType design working as
      // intended), written in the SAME transaction as the apply so the diary can't record an
      // apply that rolled back. `itinerary_changes` STOPS writing this event in the same change —
      // one truth per event type; it keeps content-change display semantics only. (Deriving the
      // traveler-facing feed from this log is the named follow-up, not this lane.)
      await logItemTransition(tx, {
        tripId,
        itemId: null,
        eventType: "variant_applied",
        actorType: "optimizer",
        actorId: userId,
      });

      // Mark comparison with optimizedAt timestamp + the applied variant.
      await tx
        .update(itineraryComparisons)
        .set({ optimizedAt: new Date(), selectedVariantId: variant.id } as any)
        .where(eq(itineraryComparisons.id, comparisonId));

      // ── Lane 6 residue R3 (ruling 14): discard UNSHARED LOSING variants ────────────────────
      // The applied/selected variant + its metrics are KEPT — the plancard, dashboard
      // trip-scores, and Spec B's move-rationale all read them after apply (it is the sanctioned
      // §0 copy: it equals the slip by construction while this transaction stays atomic). A
      // losing variant referenced by `shared_itineraries` is also kept (a share is
      // correspondence; `variantId` is ON DELETE CASCADE, so deleting it would destroy the live
      // share link — the "outdated proposal" treatment for those is a named follow-up). Everything
      // else — losing AI variants and the baseline copy — is discarded; `itinerary_variant_items`,
      // `itinerary_variant_metrics`, and variant-scoped `transport_legs` follow by CASCADE.
      const comparisonVariants = await tx
        .select({ id: itineraryVariants.id })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.comparisonId, comparisonId));
      const losingIds = comparisonVariants.map((v) => v.id).filter((vid) => vid !== variant.id);
      let discardedVariants = 0;
      if (losingIds.length > 0) {
        const sharedRows = await tx
          .select({ id: sharedItineraries.variantId })
          .from(sharedItineraries)
          .where(inArray(sharedItineraries.variantId, losingIds));
        const sharedSet = new Set(sharedRows.map((r) => r.id));
        const deletable = losingIds.filter((vid) => !sharedSet.has(vid));
        if (deletable.length > 0) {
          const deleted = await tx
            .delete(itineraryVariants)
            .where(inArray(itineraryVariants.id, deletable))
            .returning({ id: itineraryVariants.id });
          discardedVariants = deleted.length;
        }
      }

      return { preservedRoutedItems, dedupedAgainstRoutedItems, discardedVariants };
    });

    // ADDITIVE fields (§13 honest reporting): how many already-routed items the apply left in
    // place, how many proposed items were dropped because the plan already held them, and how
    // many losing variants were discarded. Existing consumers read `tripId`/`delta` and are
    // unaffected; no UI is built on these yet.
    res.json({ tripId, delta, ...applied });
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

// NOTE (W5-D cleanup, Aug 1, 2026): GET/POST /api/activities/:activityId/comments and
// DELETE /api/comments/:id were retired here — zero client callers ever existed. The live
// per-item comment system is GET/POST /api/trips/:tripId/items/:itemId/comments
// (server/routes/booking-actions.ts, backed by `trip_item_comments`, migration 165).

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
