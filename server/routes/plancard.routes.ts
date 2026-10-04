import { Router } from "express";
import { factsForTrip, pendingFactLookups } from "../services/content-facts/place-facts.service";
import { applyGooglePins } from "@shared/ai-place-text";
import { savedItemQuestions } from "../services/expert-door.service";
import { getUserId } from "../utils/auth";
import { storage } from "../storage";
import {
  insertItineraryChangeSchema,
  itineraryItems,
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
} from "@shared/schema";
import { db } from "../db";
import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getTripRole } from "../utils/trip-role";
import { itineraryItemNotMachineProtected } from "../services/itinerary-rebuild-guard";
import { isTripAuthor } from "../utils/trip-authorship";
import { authorizeTripLogistics } from "../utils/trip-logistics-auth";
import { verifyTripOwnership } from "../utils/trip-ownership";
import { logItemTransition } from "../services/item-transition-log.service";
import { assembleTripPlan, TripPlanNotFoundError } from "../services/trip-plan.service";
import { reFinalizeIfCurrentlyFinal } from "../services/trip-finalize.service";
import { recordGapFills, type GapFillInput } from "../services/optimizer-gap-ledger.service";
import { attachRolesNeeded } from "../services/occasion-roles.service";
import { getTripDestinations } from "../services/trip-destinations.service";
import { planComparisonRef } from "@shared/trip-plan";
import { countTripItineraryItems, isUntouchedAiDraft } from "../services/ai-draft-eligibility";
import { isManagingEaForTrip } from "../services/ea-plan-delegate.service";
import { isTripPayer } from "../services/balance-payer.service";
import { tripHasWriteAccessAdvisor } from "../utils/trip-advisor";
import { planRole } from "../services/plan-option-sets.service";
import { choosePickInTx, openSetHeldItemIds, recordVersionAdopted, type PickOutcome } from "../services/version-adopt.service";
import { optionPickOf } from "@shared/version-options";
import { versionPerOptionEnabled } from "../config/version-options.config";
import { listRunsForTrip, recordRunOutcome } from "../services/optimizer-runs.service";
import { optimizerRunRecordsEnabled } from "../config/optimizer-runs.config";

// OPTIMIZER_SOURCING_BUILD_SPEC WP-B: an applied item with no providerServiceId matched no
// platform (provider_services) listing — the optimizer's EXTERNAL FILL case. serviceType values
// mirror the COMMODITY_TYPES transport vocabulary in itinerary-optimizer.ts.
const GAP_TRANSPORT_TYPES = new Set(["flight", "flights", "transport", "transportation", "transfer"]);
function gapItemKind(serviceType: string | undefined): "transport" | "service" {
  return GAP_TRANSPORT_TYPES.has((serviceType || "").toLowerCase()) ? "transport" : "service";
}

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
    const userId = getUserId(req)!;

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
    // hold: the comparison-ownership check above AND the trip authorization here, performed BEFORE
    // the delete.
    // D17 (LD 42, Sep 5 2026): apply-to-trip IS the optimizer's write — it deletes and re-inserts
    // the plan's items — so it is authorized by THE item-mutation predicate, §12-narrowed.
    // ONE TRIP-WRITE RESOLVER (punchlist V-29 = option B, decision-maker ruled 2026-09-15; ledger
    // `2026-09-15-v29-one-trip-write-resolver`): that predicate is
    // `authorizeTripLogistics(…, { requireWriteAccess: true })`, not the collaborator-only
    // `getTripWriteRole`/`canMutateTrip` this gate used to call with a hand-rolled author branch
    // beside it. BEHAVIOUR DELTA, by name: (a) an OWNER WITH NO `trip_collaborators` ROW is no
    // longer 403'd on their own plan — ownership is read from `trips.user_id`; (b) the trip AUTHOR
    // and an AUDIT-LOGGED ADMIN gain write here, as they already have on reorder /
    // expert-traveler-note / the D-19 proposal rails. §12 is unweakened: `requireWriteAccess: true`
    // keeps the advisor branch at accepted/assigned and NEVER pending.
    // Local convention in this router: `{ error }` bodies, 403 for an authorized-user-wrong-trip.
    {
      const denial = await authorizeTripLogistics(
        comparison.tripId,
        userId,
        "POST /api/itinerary-comparisons/:id/apply-to-trip",
        { requireWriteAccess: true },
      );
      if (denial) return res.status(denial.status).json({ error: "Access denied" });
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

    // A7 (§F2 (3), ledger `2026-09-30-a7-version-per-option`): behind the flag, the version's pick
    // is not inserted as a stop — it CHOOSES its set in this same transaction, and an item a still-
    // open set holds is not deleted by the replace. Flag off: exactly the apply below, unchanged.
    const perOption = versionPerOptionEnabled();
    const chooseRole = perOption ? await planRole(tripId, userId, "choose") : null;
    const picks = perOption
      ? variantItems.map((it: any) => optionPickOf(it.metadata)).filter((p): p is NonNullable<typeof p> => !!p)
      : [];

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
      // D3 (LD 42, Sep 5 2026): in_planning-only is NO LONGER sufficient — an in_planning row
      // carrying `expert_note` or `origin='expert'` is paid human work and survives the replace,
      // so the delete ANDs in the ONE expert-work clause (`itineraryItemNotMachineProtected` — expert work and, since R-ah, a lock), the same
      // class `itineraryItemRebuildDeletable()` now carries — never a second predicate. This
      // transaction logs a trip-scoped `variant_applied` event below (its own same-transaction
      // diary row); a plan rebuild is not a removal, so no per-row `item_removed` (§13, R15).
      // rebuild-guard-exempt: in_planning-only AND not-expert-work — ready_for_checkout/purchased/booked rows preserved by construction (D-1); expert work by the D3 clause ANDed into the WHERE.
      // item-removed:replace — apply-to-trip replaces the in_planning set with the chosen variant.
      const heldBySets = perOption ? await openSetHeldItemIds(tx, tripId) : [];
      const deleted = await tx
        .delete(itineraryItems)
        .where(and(
          eq(itineraryItems.tripId, tripId),
          eq(itineraryItems.routingStatus, "in_planning"),
          itineraryItemNotMachineProtected(),
          ...(heldBySets.length > 0 ? [notInArray(itineraryItems.id, heldBySets)] : []),
        ))
        .returning({ id: itineraryItems.id });
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
        if (perOption && optionPickOf(item.metadata)) return false; // the pick chooses its set below
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
          durationMinutes: item.duration ?? null,
          locationName: item.location || "",
          estimatedCost: item.price ? String(item.price) : null,
          currency: "USD",
          sortOrder: item.sortOrder ?? 0,
          suggestedBy: "AI Optimizer",
          origin: "ai",
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
      const pickOutcomes = [];
      for (const pick of picks) {
        pickOutcomes.push(await choosePickInTx(tx, { tripId, userId, role: chooseRole, pick, via: "version_whole" }));
      }

      // A9 (§N2): what happened to the run, at the moment it happened — the whole-version adopt and
      // each set it decided. A version with no run (flag off when it was made) records nothing.
      if (optimizerRunRecordsEnabled()) {
        await recordRunOutcome(tx, { variantId: variant.id, kind: "adopted_whole", actorId: userId });
        for (const o of pickOutcomes) {
          if (o.decided) await recordRunOutcome(tx, { variantId: variant.id, kind: "option_chosen", actorId: userId, setId: o.setId, optionId: o.optionId });
        }
      }

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

      // ── Adopt = merge; proposals stay REVISITABLE (adopt-finalize-conform D-4, supersedes
      // ruling 14's R3 losing-variant discard) ──────────────────────────────────────────────
      // The mock's board promise — "your plan is the landing spot… pick stops from any
      // proposal" — is incompatible with destroying the losing variants on first adopt, so the
      // R3 discard that used to run here is REMOVED: all variants (winners, losers, baseline)
      // survive the apply and the review board can be revisited until Finalize Plan. The
      // comparison stamp above (optimizedAt + selectedVariantId) is kept — bookkeeping, not
      // destruction. Nothing else changed in this transaction.

      // WP-B: items actually inserted with no providerServiceId are the optimizer's EXTERNAL FILL
      // case (no platform match) — captured here, ledgered after the transaction commits (§15b:
      // a ledger write must never be able to roll back a real apply, nor fail one).
      const unmatchedItems = applicableVariantItems.filter((item: any) => !item.providerServiceId);

      return {
        preservedRoutedItems,
        dedupedAgainstRoutedItems,
        unmatchedItems,
        insertedCount: applicableVariantItems.length,
        deletedCount: deleted.length,
        pickOutcomes,
      };
    });

    // Auto-v+1 (adopt-finalize-conform D-1a, same posture as adopt-stop below): adopting a whole
    // proposal is accepting the optimizer's plan. Adopt never LOCKS — this call no-ops unless the
    // trip is CURRENTLY finalized — but on an already-final trip it captures a new final version so
    // the snapshot-rendered Trip Card shows the adopted plan immediately (ratified
    // 2026-08-31-trip-card-snapshot-render; this handler previously lacked the call adopt-stop
    // already had — the inconsistency was the bug). Best-effort: the apply has committed; a
    // re-final failure must not turn a successful apply into a 500.
    try {
      await reFinalizeIfCurrentlyFinal(tripId, userId);
    } catch (err) {
      console.error("[apply-to-trip] auto re-finalize failed (non-fatal):", (err as any)?.message);
    }

    // ADDITIVE fields (§13 honest reporting): how many already-routed items the apply left in
    // place, how many proposed items were dropped because the plan already held them, and how
    // many losing variants were discarded. Existing consumers read `tripId`/`delta` and are
    // unaffected; no UI is built on these yet.
    const { unmatchedItems, insertedCount, deletedCount, pickOutcomes, ...appliedSummary } = applied;

    if (perOption) {
      await recordVersionAdopted({
        userId,
        tripId,
        comparisonId,
        variantId: variant.id,
        adoptMode: "whole",
        itemsAdded: insertedCount,
        itemsReplaced: deletedCount,
        protectedKept: appliedSummary.preservedRoutedItems,
        setsDecided: pickOutcomes.filter((o) => o.decided).length,
      });
    }

    // ── WP-B gap-fill ledger hook (single try/catch'd call — §15b: best-effort, NEVER fails Apply) ──
    try {
      const gapFillInputs: GapFillInput[] = (unmatchedItems as any[]).map((item) => ({
        city: comparison.destination || "Unknown",
        category: item.serviceType || "activity",
        itemKind: gapItemKind(item.serviceType),
        source: "unfilled", // no tracked pipeline (Tavily/Google/Grok) attributable per-item at Apply time
        tripId,
        details: { name: item.name ?? null, dayNumber: item.dayNumber ?? null },
      }));
      await recordGapFills(gapFillInputs);
    } catch (ledgerErr: any) {
      console.warn("[plancard] gap-fill ledger hook failed (non-fatal):", ledgerErr?.message || ledgerErr);
    }

    res.json({ tripId, delta, ...appliedSummary, ...(perOption ? { sets: pickOutcomes } : {}) });
  } catch (error) {
    console.error("Error applying variant to trip:", error);
    res.status(500).json({ error: "Failed to apply variant to trip" });
  }
});

// Per-stop adopt (ratified mock "Adopt the Optimization": the "+" ticks pull a SINGLE stop
// into the plan). Distinct from apply-to-trip's whole-variant REPLACE: this APPENDS exactly
// one item and never touches the rest of the plan. Same auth spine as apply-to-trip.
router.post("/api/itinerary-comparisons/:id/adopt-stop", isAuthenticated, async (req, res) => {
  try {
    const { id: comparisonId } = req.params;
    const userId = getUserId(req)!;

    const parsed = z.object({ variantItemId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "variantItemId is required" });
    const { variantItemId } = parsed.data;

    const comparison = await storage.getItineraryComparison(comparisonId);
    if (!comparison || comparison.userId !== userId) {
      return res.status(404).json({ error: "Comparison not found" });
    }
    if (!comparison.tripId) {
      return res.status(400).json({ error: "Comparison has no associated trip" });
    }
    // Same destructive-IDOR guard as apply-to-trip: owning the comparison ≠ being allowed to
    // mutate the trip it points at. Both checks hold before any write.
    // WRITE access (ledger `2026-09-26-adopt-stop-write-access`, R130): adopt APPENDS an item, so
    // it takes the ONE D17/V-29 "may this person rewrite the plan?" form — owner, a §12
    // WRITE-status advisor (accepted/assigned, NEVER pending), the author, an audit-logged admin.
    // The read-shaped call it carried before let a PENDING advisor who owned a comparison write.
    const denied = await authorizeTripLogistics(
      comparison.tripId,
      userId,
      "POST /api/itinerary-comparisons/:id/adopt-stop",
      { requireWriteAccess: true },
    );
    if (denied) return res.status(denied.status).json({ error: denied.message });

    // The stop must belong to a variant UNDER THIS comparison — a caller can't pull a stop out
    // of someone else's variant by id.
    const variantItem = await storage.getVariantItemById(variantItemId);
    if (!variantItem) return res.status(404).json({ error: "Stop not found" });
    const variant = await storage.getItineraryVariantById(variantItem.variantId);
    if (!variant || variant.comparisonId !== comparisonId) {
      return res.status(404).json({ error: "Stop not found" });
    }

    const tripId = comparison.tripId;

    // A7 (§F2 (3)): behind the flag, a stop that carries a version's pick CHOOSES its set instead
    // of appending — through the same helper adopt-stops uses. Flag off: the append below, unchanged.
    const perOption = versionPerOptionEnabled();
    const chooseRole = perOption ? await planRole(tripId, userId, "choose") : null;
    const outcome = await db.transaction((tx) =>
      adoptVariantItemsInTx(tx, { tripId, userId, role: chooseRole, perOption, items: [variantItem] }),
    );
    const pickOutcome = outcome.sets[0];
    const result = pickOutcome
      ? pickOutcome.decided
        ? { adopted: true as const, chose: { setId: pickOutcome.setId, optionId: pickOutcome.optionId }, itemId: pickOutcome.itemId }
        : { adopted: false as const, reason: pickOutcome.reason }
      : outcome.added.length > 0
        ? { adopted: true as const, item: outcome.added[0] }
        : { adopted: false as const, reason: "already-in-plan" as const };
    if (perOption && result.adopted) {
      await recordVersionAdopted({
        userId, tripId, comparisonId, variantId: variantItem.variantId, adoptMode: "stop",
        itemsAdded: outcome.added.length, itemsReplaced: 0, protectedKept: 0,
        setsDecided: outcome.sets.filter((o) => o.decided).length,
      });
    }

    // Phase 2 auto-v+1 (ledger 2026-08-31-two-surfaces-one-handoff): adopting a stop is accepting an
    // optimizer suggestion. If the trip is CURRENTLY finalized, capture it as a new final version so
    // the snapshot-rendered Trip Card shows the adopted stop immediately. Best-effort — the adopt
    // already committed; a re-final failure must not turn a successful adopt into a 500.
    if (result.adopted) {
      try {
        await reFinalizeIfCurrentlyFinal(tripId, userId);
      } catch (err) {
        console.error("[adopt-stop] auto re-finalize failed (non-fatal):", (err as any)?.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Error adopting stop into trip:", error);
    res.status(500).json({ error: "Failed to add stop to plan" });
  }
});

/**
 * Adopt variant stops into the plan, inside the caller's transaction — the ONE body adopt-stop and
 * adopt-stops share (§18 rule 1). A stop already on the plan (providerServiceId first, then exact
 * case-insensitive title — the apply-to-trip predicate) or already added earlier in the same batch
 * is skipped, so a re-press is a no-op. Behind the A7 flag a stop carrying a version's pick chooses
 * its set (version_stop) rather than appending. Every field is read from the server-side variant
 * row — NEVER req.body (§14); providerServiceId is preserved (§H5); origin is server-stamped 'ai'.
 */
async function adoptVariantItemsInTx(
  tx: any,
  input: { tripId: string; userId: string; role: Awaited<ReturnType<typeof planRole>>; perOption: boolean; items: any[] },
): Promise<{ added: any[]; alreadyInPlan: string[]; sets: PickOutcome[] }> {
  const { tripId } = input;
  const existing = await tx.select().from(itineraryItems).where(eq(itineraryItems.tripId, tripId));
  const svcIds = new Set<string>(existing.map((s: any) => s.providerServiceId).filter((v: any): v is string => !!v));
  const titles = new Set<string>(existing.map((s: any) => String(s.title ?? "").trim().toLowerCase()).filter(Boolean));
  const added: any[] = [];
  const alreadyInPlan: string[] = [];
  const sets: PickOutcome[] = [];
  const decidedSets = new Set<string>();
  const addedByVariant = new Map<string, string[]>();
  for (const variantItem of input.items) {
    const pick = input.perOption ? optionPickOf(variantItem.metadata) : null;
    if (pick) {
      if (decidedSets.has(pick.setId)) continue;
      decidedSets.add(pick.setId);
      const outcome = await choosePickInTx(tx, { tripId, userId: input.userId, role: input.role, pick, via: "version_stop" });
      sets.push(outcome);
      if (outcome.decided && optimizerRunRecordsEnabled()) {
        await recordRunOutcome(tx, { variantId: variantItem.variantId, kind: "option_chosen", actorId: input.userId, setId: outcome.setId, optionId: outcome.optionId });
      }
      continue;
    }
    const name = String(variantItem.name ?? "").trim().toLowerCase();
    if ((variantItem.providerServiceId && svcIds.has(variantItem.providerServiceId)) || (name && titles.has(name))) {
      alreadyInPlan.push(variantItem.id);
      continue;
    }
    // routingStatus takes the migration-159 default ('in_planning') — not written here.
    const [row] = await tx.insert(itineraryItems).values({
      tripId,
      providerServiceId: variantItem.providerServiceId ?? null,
      title: variantItem.name,
      description: variantItem.description || "",
      itemType: variantItem.serviceType || "activity",
      status: "planned",
      dayNumber: variantItem.dayNumber,
      startTime: variantItem.startTime || "",
      durationMinutes: variantItem.duration ?? null,
      locationName: variantItem.location || "",
      estimatedCost: variantItem.price ? String(variantItem.price) : null,
      currency: "USD",
      sortOrder: variantItem.sortOrder ?? 0,
      suggestedBy: "AI Optimizer",
      origin: "ai",
      latitude: variantItem.latitude ? String(variantItem.latitude) : null,
      longitude: variantItem.longitude ? String(variantItem.longitude) : null,
    }).returning();
    added.push(row);
    addedByVariant.set(variantItem.variantId, [...(addedByVariant.get(variantItem.variantId) ?? []), variantItem.id]);
    if (variantItem.providerServiceId) svcIds.add(variantItem.providerServiceId);
    if (name) titles.add(name);
  }
  // A9 (§N2): the stops adopted from each version, as one `adopted_part` row per version.
  if (optimizerRunRecordsEnabled()) {
    for (const [variantId, variantItemIds] of Array.from(addedByVariant.entries())) {
      await recordRunOutcome(tx, { variantId, kind: "adopted_part", actorId: input.userId, variantItemIds });
    }
  }
  return { added, alreadyInPlan, sets };
}

// A7 (§F2 (3), ledger `2026-09-30-a7-version-per-option`): adopt SEVERAL stops in one press — one
// transaction, the adopt-stop dedupe, the §12 WRITE gate, a re-press a no-op; stops carrying a
// version's pick choose their sets. Behind OPTIMIZER_VERSION_PER_OPTION_ENABLED (404 when off).
router.post("/api/itinerary-comparisons/:id/adopt-stops", isAuthenticated, async (req, res) => {
  try {
    if (!versionPerOptionEnabled()) return res.status(404).json({ error: "Not found" });
    const { id: comparisonId } = req.params;
    const userId = getUserId(req)!;
    const parsed = z.object({ variantItemIds: z.array(z.string().min(1).max(64)).min(1).max(50) }).strict().safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "variantItemIds is required (1–50 ids)" });
    const ids = Array.from(new Set(parsed.data.variantItemIds));

    // The comparison's owner only (as adopt-stop), AND the trip's §12 WRITE gate — both before any write.
    const comparison = await storage.getItineraryComparison(comparisonId);
    if (!comparison || comparison.userId !== userId) return res.status(404).json({ error: "Comparison not found" });
    if (!comparison.tripId) return res.status(400).json({ error: "Comparison has no associated trip" });
    const denied = await authorizeTripLogistics(comparison.tripId, userId, "POST /api/itinerary-comparisons/:id/adopt-stops", { requireWriteAccess: true });
    if (denied) return res.status(denied.status).json({ error: denied.message });

    // Every stop must belong to a variant UNDER THIS comparison; one that does not is the same 404.
    const rows = await db
      .select({ item: itineraryVariantItems, comparisonId: itineraryVariants.comparisonId })
      .from(itineraryVariantItems)
      .innerJoin(itineraryVariants, eq(itineraryVariants.id, itineraryVariantItems.variantId))
      .where(inArray(itineraryVariantItems.id, ids));
    if (rows.length !== ids.length || rows.some((r) => r.comparisonId !== comparisonId)) {
      return res.status(404).json({ error: "Stop not found" });
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    const items = rows.map((r) => r.item).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const tripId = comparison.tripId;
    const chooseRole = await planRole(tripId, userId, "choose");
    const outcome = await db.transaction((tx) => adoptVariantItemsInTx(tx, { tripId, userId, role: chooseRole, perOption: true, items }));
    const setsDecided = outcome.sets.filter((o) => o.decided).length;
    if (outcome.added.length > 0 || setsDecided > 0) {
      try {
        await reFinalizeIfCurrentlyFinal(tripId, userId);
      } catch (err) {
        console.error("[adopt-stops] auto re-finalize failed (non-fatal):", (err as any)?.message);
      }
    }
    const variantIds = Array.from(new Set(items.map((i) => i.variantId)));
    await recordVersionAdopted({
      userId, tripId, comparisonId, variantId: variantIds.length === 1 ? variantIds[0] : null, adoptMode: "stops",
      itemsAdded: outcome.added.length, itemsReplaced: 0, protectedKept: 0, setsDecided,
    });
    res.json({ added: outcome.added.length, items: outcome.added, alreadyInPlan: outcome.alreadyInPlan, sets: outcome.sets });
  } catch (error) {
    console.error("Error adopting stops into trip:", error);
    res.status(500).json({ error: "Failed to add stops to plan" });
  }
});

// A9 (§N3, ledger `2026-09-30-a9-run-records`): "Your optimized plans" — this plan's runs, newest
// first: date, what paid for it (the basis, never an amount), its versions and what was adopted. READ
// ONLY, through the plan's READ gate (owner, delegate, §12 read-status advisor, author, audited admin);
// runs are never shown on another traveler's plan. Behind OPTIMIZER_RUN_RECORDS_ENABLED (404 when off).
router.get("/api/trips/:tripId/optimizer-runs", isAuthenticated, async (req, res) => {
  try {
    if (!optimizerRunRecordsEnabled()) return res.status(404).json({ error: "Not found" });
    const { tripId } = req.params;
    const userId = getUserId(req)!;
    const denied = await authorizeTripLogistics(tripId, userId, "GET /api/trips/:tripId/optimizer-runs");
    if (denied) return res.status(denied.status).json({ error: denied.message });
    res.json({ runs: await listRunsForTrip(tripId) });
  } catch (error) {
    console.error("Error listing optimizer runs:", error);
    res.status(500).json({ error: "Failed to list optimized plans" });
  }
});

router.get("/api/trips/:tripId/plancard", isAuthenticated, async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = getUserId(req)!;

    const trip = await storage.getTrip(tripId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    let tripRole: string | null = await getTripRole(tripId, userId);

    if (!tripRole) {
      // Legacy fallback: check trip_expert_advisors for assigned experts
      const assignment = await storage.getTripExpertAdvisoryAssignment(tripId, userId);
      const isAssignedExpert = assignment && ['pending', 'accepted'].includes(assignment.status);
      // Authoring mode (ready-made brief §2/§4): the trip's AUTHOR may render their own build.
      // A PARALLEL named branch beside getTripRole — the helper itself is deliberately untouched
      // (known pre-launch bypass, separate fix). getTripRole returns null for an author (no
      // collaborator/advisor row), so without this branch authoring mode 403s its own itinerary.
      const isAuthor = isAssignedExpert ? false : await isTripAuthor(tripId, userId);
      // LD 52 (C): the executive assistant managing this plan under a LIVE accepted link. Rendered
      // as "delegate" — it edits for the owner but is never shown as "your expert" and never gets
      // the owner's pay/finalize controls (the slip decides that from this role).
      const isManagingEa = isAssignedExpert || isAuthor ? false : await isManagingEaForTrip(tripId, userId);
      // LD 42 D9 (ledger `2026-09-27-payer-reads-plancard`): a `payer`-role `trip_participants` row
      // on THIS trip is half of the bookings section's audience (owner + payer), so it READS the
      // plan the balance belongs to. The role test is the ONE `balance-payer.service.ts` comparison
      // `canPayBalance` also uses (§18 rule 1). READ-ONLY: this arm lives on this read gate alone —
      // no write rail, owner-tier read (guest roster / PII), trip pass or proposal rail admits it,
      // and `authorizeTripLogistics` is untouched. Rendered as "payer" so the slip draws no tools.
      const isPayer =
        isAssignedExpert || isAuthor || isManagingEa ? false : await isTripPayer(tripId, userId);
      if (!isAssignedExpert && !isAuthor && !isManagingEa && !isPayer) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (isManagingEa) tripRole = "delegate";
      else if (isPayer) tripRole = "payer";
    }

    // ── Thin caller (L3a): the assembly lives in the ONE TripPlan assembler ────────────────
    // The gate above is authoritative — the assembler does NOT authorize; the redaction level is
    // the channel contract. This surface renders the full body for an authorized viewer, so it
    // asks for 'full'. A `payer` viewer (LD 42 D9) takes 'full' too, deliberately: it is the LEAST
    // level that carries `bookings` — `teaser`/`preview` return before bookings are read — and the
    // bookings section is the whole reason a payer reads this plan. 'full' carries the traveler-
    // facing Expert Notes (§21), never the private `trips.expert_notes`, and no guest roster.
    // LIVE BY DEFAULT (ledger `2026-09-26-slip-renders-live`): a reader passing no parameter gets
    // the live plan. The Trip Card — the one read-out of a finished plan — asks for its frozen final
    // explicitly with `?surface=card`. It widens nothing: the gate above already decided who reads.
    const render = req.query.surface === "card" ? "final" : "live";
    const plan = await assembleTripPlan(tripId, "full", { viewerId: userId, tripRole, render });

    // ── The plan's EVENTS (migration 277, ledger `2026-09-03-item-event-link`) ─────────────────
    // A plan is one `trips` row; each event inside it is one `user_experiences` row bound by the
    // pre-existing nullable `trip_id`. Each activity now carries `userExperienceId` (present only
    // when really linked), and THIS is the list a consumer resolves those ids against — without it
    // the id on the item would be an opaque key the client could only guess a label for (§13).
    //
    // READ HERE, NOT IN THE ASSEMBLER, ON PURPOSE: `assembleTripPlan` serves three redaction
    // levels including the public share/teaser channels, and an event carries a guest count, a
    // budget and a venue. Resolving it in THIS handler means it is gated by exactly the
    // owner/assigned-advisor/author check above and can never leak into a channel that never
    // asked for it. A plan with no `user_experiences` row returns `[]` — the honest "this plan has
    // only its ONE implicit unnamed event" state, never a fabricated placeholder event.
    //
    // The projection is deliberately narrow: id, title, eventDate, startTime, location, guestCount,
    // budget, experienceTypeId, rolesNeeded. `preferences` / `stepData` / `mapData` are the
    // wizard's own working state and are not part of this contract.
    //
    // `rolesNeeded` (ledger `2026-09-04-which-event-hint`; migration 280, Locked Decision 31) is
    // the occasion's own `experience_types.roles_needed` — the disciplines it typically hires,
    // as `service_categories.category_key` values. It rides here so a consumer can mark the event
    // an added service is wanted by, by READING this list rather than restating a role→occasion
    // table of its own (§18 rule 1). `null` means NOT SET (or no resolvable occasion) and every
    // reader must then say nothing at all — never "this event needs nobody" (§13). Resolved by the
    // ONE shared reader `GET /api/user-experiences` also uses, so the two payloads cannot disagree
    // about the same event. It names no provider and makes no supply claim: whether anyone is
    // actually listed in a role is a separate question this array does not answer.
    const events = await attachRolesNeeded(
      (await storage.getUserExperiencesByTrip(tripId)).map((e) => ({
        id: e.id,
        title: e.title ?? null,
        eventDate: e.eventDate ?? null,
        // Migration 282 (ledger `2026-09-04-stops-and-event-time`): the EVENT'S OWN wall-clock
        // "HH:MM", carried as-is and read in the plan's `trips.timezone` (ruling 30). `null` means
        // NOT SET and every reader must then show the day and NO time — never midnight, never
        // "all day" (§13). It is not the plan's main moment, which stays a temporal anchor.
        startTime: e.startTime ?? null,
        location: e.location ?? null,
        guestCount: e.guestCount ?? null,
        // Ledger `2026-09-04-event-budget`: the EVENT'S OWN stated budget — the traveler's
        // planning number, carried as the DB's own decimal string and never re-scaled here. The
        // plan's total is DERIVED from these by the client's one pure helper and is never a
        // stored field (§18 rule 1). `null` = NOT STATED, and a reader must then show nothing
        // rather than 0 (§13). It rides this gate — owner / assigned advisor / author — and no
        // wider one; it is on no public or teaser channel. It is read by NOTHING on the money
        // path and must never be (§14).
        budget: e.budget ?? null,
        experienceTypeId: e.experienceTypeId,
      })),
    );

    // Migration 281 (ledger `2026-09-04-stops-and-event-time`, Locked Decision 34) — the plan's
    // ORDERED STOPS. READ HERE, NOT IN THE ASSEMBLER, for the same reason `events` is: the
    // assembler serves three redaction levels including the public share/teaser channels, and a
    // stop list with coordinates is owner-side capture. Resolving it in THIS handler keeps it
    // behind exactly the owner/assigned-advisor/author gate above.
    //
    // §13 — `[]` MEANS NOT CAPTURED, NOT "no destination". Legacy plans have no child rows (no
    // backfill, deliberately) and `trip.destination` — already on the unchanged `trip` passthrough
    // below — remains the plan's headline destination and the position-0 mirror of this list where
    // the list exists. A consumer that meets `[]` FALLS BACK TO `trip.destination` and says so.
    // A stop with null lat/lng is UNLOCATED and stays visibly flagged; it is never placed on a map.
    const destinations = await getTripDestinations(tripId);

    // LD 41 (c) / ledger `2026-09-05-draft-only-on-empty` — IS THIS PLAN STILL JUST THE FREE
    // SKETCH? Server-derived from the rows (`origin='ai'` AND `routing_status='in_planning'` for
    // EVERY item, and at least one item), through the ONE predicate that also answers the
    // eligibility question about the same table (§18 rule 1). It rides HERE rather than being
    // recomputed client-side, and it STAYS here now that the activity DTO does carry `origin`
    // (ledger `2026-09-06-item-origin-chip`): this is a WHOLE-PLAN predicate shared with the
    // eligibility check, and a client re-deriving it from the item list would be a second author
    // of the same answer, free to disagree with the one the eligibility gate uses (§18 rule 1).
    // The per-item chip reads `origin`; this boolean is not that. §13: `false` for an empty plan — a blank slip
    // is not an AI sketch — and the client renders NOTHING when it is false, never the inverse
    // claim ("this plan is yours"). Additive; existing consumers ignore the key.
    const aiSketch = await isUntouchedAiDraft(tripId);
    // Smoke 9 S9-1: the free-draft gate's OWN count (non-anchor items — a plan holding only its stay
    // is still empty to draft), so "Draft it with AI" reads the server's answer and never re-counts.
    const draftItemCount = await countTripItineraryItems(tripId);

    // A5 (ledger `2026-09-29-a5-draft-open-set`; content sourcing brief §2/§3): each item's facts
    // (hours, dining basics, coordinates), first of each type in the engine's order, each with its
    // provenance line. READ HERE, behind this handler's gate, and never in the assembler that also
    // serves the public share channels: a Places fact is display-inside-a-plan only. Keyed by item
    // id; an item with no facts is absent (§13). Additive — existing consumers ignore the key.
    const placeFacts = await factsForTrip(tripId);
    // Smoke 5 item 8 (ledger `2026-10-03-smoke5-fixes`): the items the latest draft's place-facts run
    // is still checking (migration 340). Present only when non-empty; the slip shows "checking
    // hours…" on those rows and re-reads until the key is gone. A stale or finished run ⇒ absent.
    const factsPendingItemIds = await pendingFactLookups(tripId);

    // IS AN EXPERT ASSIGNED? (ledger `2026-09-26-send-to-expert-needs-expert`; audit G2.) An
    // advisor in a §12 WRITE status (accepted/assigned) — the SAME predicate the routing rail refuses
    // "Send to expert" on, so a surface never offers an edge the server will refuse and never labels
    // an item "with your expert" when nobody is. `false` is an answer (no expert), not an unknown.
    const expertAssigned = await tripHasWriteAccessAdvisor(tripId);
    // Smoke 7 item 4 (ledger `2026-10-03-no-ward-pins`): the questions THIS viewer saved through "Ask
    // a local about this" — their own rows only, present only when there is one.
    const savedQuestions = await savedItemQuestions(tripId, userId);

    res.json({
      // Pre-existing plancard response contract — key names and shapes unchanged.
      tripRole: plan.plancard.tripRole,
      trip: plan.plancard.trip,
      // Ledger `2026-10-03-no-ward-pins` (smoke 7): untrusted AI rows take Google's located point.
      days: applyGooglePins(plan.days as any[], placeFacts as any),
      changeLog: plan.plancard.changeLog,
      metrics: plan.plancard.metrics,
      optimizationDelta: plan.plancard.optimizationDelta,
      lastOptimizedAt: plan.plancard.lastOptimizedAt,
      // LD 41 (ledger 2026-09-05-comparison-map-baseline-compare): the review board this plan's
      // optimization came from, so the slip's optimized state can link back to it. SPREAD, not
      // assigned — the key stays ABSENT when the trip has no comparison, rather than becoming a
      // null the reader has to interpret (§13). Additive: every existing consumer ignores it.
      ...planComparisonRef({ id: plan.plancard.lastComparisonId ?? null }),
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
      // Slip dispatch §4 (Spec A) — the slip's diary (last 20 item_transition_log rows, newest
      // first). Additive; this surface is gated above, and the share/teaser channels never
      // receive the field (owner diary, not public).
      recentTransitions: plan.recentTransitions,
      // Migration 277 — the plan's events; see the assembly note above. ADDITIVE: every existing
      // consumer ignores the key, and `days[].activities[].userExperienceId` (also additive, and
      // present only when the item really carries a link) is what points into this list.
      events,
      // Migration 281 — the plan's ordered stops; see the assembly note above. ADDITIVE: every
      // existing consumer ignores the key.
      destinations,
      // LD 41 (c) — see the note above. `true` ⇒ every item on this plan is still an untouched
      // free-draft row, which is the only state the slip's "starting sketch" line renders in.
      aiSketch,
      draftItemCount,
      // See the note above. ADDITIVE: existing consumers ignore the key.
      expertAssigned,
      // A5 — see the note above.
      placeFacts,
      // Smoke 5 item 5 (ledger `2026-10-03-smoke5-fixes`) — present only when TRUE: the read's
      // coordinate backfill hit its per-request cap with items left untried, so the slip re-reads
      // until it is absent. Without it, items past the cap drew no "Build my days around this".
      ...((plan as any).coordinatesPending === true ? { coordinatesPending: true } : {}),
      ...(factsPendingItemIds.length ? { factsPendingItemIds } : {}),
      ...(Object.keys(savedQuestions.items).length ? { savedQuestions } : {}),
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
    const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
    const userName = (req.user as any)?.claims?.name || "User";
    const { status, tripId } = req.body;

    if (!status || !tripId) {
      return res.status(400).json({ error: "status and tripId are required" });
    }

    const allowed = ["confirmed", "dismissed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    }

    // ONE TRIP-WRITE RESOLVER (V-29 = option B; ledger `2026-09-15-v29-one-trip-write-resolver`).
    // Confirming or dismissing a leg WRITES the plan, but this rail resolved the caller through
    // `getTripRole` — the READ resolver — so it granted a `pending` advisor a write. Moving it onto
    // THE predicate carries the usual delta — (a) an owner with no `trip_collaborators` row is no
    // longer refused, (b) the trip author and an audit-logged admin gain write here — AND A
    // NARROWING that is §12 applied where it was missing: a PENDING advisor can no longer confirm
    // or dismiss a leg. Status and body shape unchanged; the "friend" sentence is unreachable (no
    // writer in this repository mints a friend `trip_collaborators` row — L20 Part C).
    const denial = await authorizeTripLogistics(
      tripId,
      userId,
      "PATCH /api/transport-legs/:legId/status",
      { requireWriteAccess: true },
    );
    if (denial) return res.status(denial.status).json({ error: "Access denied" });
    // Change-log role, derived honestly (§13 applies to logs). The one predicate returns null for
    // EVERY passing branch (owner ‖ WRITE-status advisor ‖ author ‖ admin) and does not report
    // which one, so ownership is the only branch we can state as fact; every other authorized
    // party gets the neutral "editor" label rather than a guess — the same derivation the reorder
    // rail in server/routes.ts already uses for exactly this reason.
    const changeRole = (await verifyTripOwnership(tripId, userId)) ? "owner" : "editor";

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
      changeRole,
    );

    res.json({ success: true, legId, status });
  } catch (error) {
    console.error("Error updating transport leg status:", error);
    res.status(500).json({ error: "Failed to update transport leg status" });
  }
});

router.delete("/api/trips/:tripId/changes/:changeId", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
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
