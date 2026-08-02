/**
 * OPTIMIZER BASELINE — the Trip is the optimizer's input, not the cart.
 *
 * Trip-Canon Lane 5b (the re-point), decision-maker RATIFIED Jul 31, 2026.
 * Governing docs: docs/briefs/L5-optimizer-repoint-brief.md,
 * docs/briefs/ROUTING_STATE_CONTRACT.md (§2 "Optimizer" row — amended by this lane),
 * docs/planning/TRIP_CANON_MASTER_BRIEF.md §3 (the L5b registry row).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RATIFIED READ-SET (contract §2 "Optimizer (Lane 5b)")
 * ─────────────────────────────────────────────────────────────────────────────
 *   in_planning         → OPTIMIZABLE   (baseline item; the AI may move/replace it)
 *   ready_for_checkout  → OPTIMIZABLE   (the traveler routed it to checkout but has not paid;
 *                                        it is still plan, so it is still the optimizer's to plan)
 *   purchased           → CONSTRAINT ONLY. A paid 2pm tour is a fixed point in the day. An
 *                         optimizer that cannot SEE it proposes plans that collide with booked
 *                         reality — a paid product contradicting a paid booking. So it rides the
 *                         SAME primitive the logistics family uses for temporal anchors: injected
 *                         into the prompt as an immovable commitment, never emitted as a variant
 *                         item, never re-planned, never deleted at apply.
 *   with_expert         → NEVER read. Expert-owned and still fluid: not a constraint, not an input.
 *
 * This module is the SINGLE place that read-set is expressed. Both optimizer entry points
 * (`POST /api/itinerary-comparisons` and `POST …/:id/generate`) call it, so the two can never
 * drift apart the way the pay gate did (§9 twin lesson, Lane 5a).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS STRICTLY RICHER THAN THE CART READ IT REPLACES
 * ─────────────────────────────────────────────────────────────────────────────
 * The cart read (`cart_items ⋈ provider_services`) FABRICATED `dayNumber`
 * (`floor(index/3)+1`), FABRICATED `timeSlot` (a 3-way rotation) and hardcoded every duration to
 * 120 minutes — and it SILENTLY DROPPED every free-text/external item, because a cart row with no
 * `serviceId` joined to nothing and had no columns of its own to read. The trip row carries all
 * four as real columns. Including free-text items is a deliberate improvement, not a side effect:
 * they are part of the plan, so an optimizer that never saw them was optimizing a subset.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, providerServices } from "@shared/schema";
import type { FixedCommitment, ItineraryItem as OptimizerBaselineItem } from "../itinerary-optimizer";

export type { OptimizerBaselineItem };

/** The two states the optimizer may re-plan. */
const OPTIMIZABLE_STATUSES = ["in_planning", "ready_for_checkout"] as const;
/** Read, but only ever as an immovable constraint. */
const CONSTRAINT_STATUS = "purchased";

export interface TripOptimizerInputs {
  /** `in_planning` + `ready_for_checkout`, in plan order (day, then sortOrder). */
  baselineItems: OptimizerBaselineItem[];
  /** `purchased` — prompt constraints only; never emitted, never re-planned. */
  fixedCommitments: FixedCommitment[];
  /** Honest counts for logging/diagnostics (§13 — reported, never inferred). */
  counts: { optimizable: number; purchased: number };
}

/**
 * itinerary_items.itemType → optimizer serviceType.
 *
 * These are TWO DIFFERENT VOCABULARIES and this is a deliberate map, not a rename. The target
 * vocabulary is load-bearing in three places, each checked per row below:
 *   (1) `COMMODITY_TYPES` in itinerary-optimizer.ts — an EXACT-match set that makes an item
 *       ineligible for marquee "protected item" status (a hotel must always be replaceable).
 *   (2) `mapServiceTypeToCategory` in smart-sequencing.service.ts — SUBSTRING matching that drives
 *       the metrics buckets (active / relaxation / travel / dining minutes, diversity, intensity).
 *   (3) the apply-to-trip ROUND TRIP: `plancard.routes.ts` writes `itemType: item.serviceType`
 *       back onto the trip item, so whatever we emit here can come back as an itemType later.
 *
 * | itemType        | → serviceType   | (1) commodity? | (2) metrics category      | (3) round-trips |
 * |-----------------|-----------------|----------------|---------------------------|-----------------|
 * | activity        | `activity`      | no (marquee-eligible: a $500 private activity SHOULD be protected) | `sightseeing` (the mapper's documented default) | ✓ |
 * | meal            | `meal`          | no             | `dining_light` (via `includes('meal')`) | ✓ |
 * | transport       | `transport`     | YES            | `transport`               | ✓ |
 * | accommodation   | `accommodation` | YES            | `accommodation`² (relaxation-bucket, own cost category) | ✓ |
 * | free_time       | `free_time`     | no             | `free_time`² (excluded from every time bucket — widens the derived free-time gap instead of being miscounted as active) | ✓ |
 * | meeting         | `meeting`       | no             | `sightseeing`¹            | ✓ |
 * | checkpoint      | `checkpoint`    | no             | `sightseeing`¹            | ✓ |
 *
 * ¹ `mapServiceTypeToCategory` still has no `meeting` bucket — that string matches no rule and
 *   falls to its `sightseeing` default. That is PRE-EXISTING behaviour of the metrics mapper (the
 *   cart read fed it raw `provider_services.serviceType`, which has the same hole), and inventing a
 *   category here to paper over it would be a fabrication. Recorded, not silently "fixed".
 * ² FIX 4b (W1c polish) closed the `accommodation`/`free_time` half of this hole — the mapper now
 *   recognizes both (mapping honestly from the same existing `itineraryItemTypeEnum` vocabulary,
 *   no new item type), so they no longer silently inherit `sightseeing`'s active-time miscount.
 *   `meeting` is unchanged/still open.
 *
 * The map lands on identity for all seven values — but only AFTER checking each one against those
 * three consumers, and the two that matter (`transport`, `accommodation`) are exactly the members
 * of `COMMODITY_TYPES` they need to be. Choosing a different string for `activity` (e.g. the
 * mapper's `sightseeing` default) would have produced identical metrics but CORRUPTED the round
 * trip, writing a non-enum `itemType` back onto the trip.
 */
const ITEM_TYPE_TO_SERVICE_TYPE: Record<string, string> = {
  activity: "activity",
  meal: "meal",
  transport: "transport",
  accommodation: "accommodation",
  free_time: "free_time",
  meeting: "meeting",
  checkpoint: "checkpoint",
};

/**
 * `itemType` is NOT guaranteed to hold an `itineraryItemTypeEnum` value: apply-to-trip writes the
 * optimizer's own `serviceType` into it, so a previously-optimized trip carries round-trip residue
 * like `sightseeing` / `transportation` / `photography`. An unmapped value is therefore already in
 * the TARGET vocabulary — passing it through preserves fidelity; forcing it to `activity` would
 * throw away a real signal (e.g. it would un-commodity a `transportation` item and make it
 * marquee-protectable).
 */
function mapItemTypeToServiceType(itemType: string | null | undefined): string {
  const raw = (itemType ?? "").trim();
  if (!raw) return "activity"; // the column's own default; never `undefined`-by-accident
  return ITEM_TYPE_TO_SERVICE_TYPE[raw] ?? raw;
}

/**
 * Real `startTime` → time slot. The cart read had no start time at all and rotated
 * morning/afternoon/evening by array index; here the rotation is only the FALLBACK, used when the
 * item genuinely has no start time (§13 — a derived value where one exists, an honest placeholder
 * where none does).
 */
const TIME_SLOT_ROTATION = ["morning", "afternoon", "evening"] as const;

function deriveTimeSlot(startTime: string | null | undefined, index: number): string {
  const match = /^(\d{1,2}):(\d{2})/.exec((startTime ?? "").trim());
  if (match) {
    const hour = Number(match[1]);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      if (hour < 12) return "morning";
      if (hour < 17) return "afternoon";
      return "evening";
    }
  }
  return TIME_SLOT_ROTATION[index % TIME_SLOT_ROTATION.length];
}

/** decimal columns arrive as strings; a non-numeric/absent value is honestly `undefined`. */
function toNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

/** The cart read's hardcoded duration, kept ONLY as the fallback for an item with no real one. */
const DEFAULT_DURATION_MINUTES = 120;

/**
 * Load the optimizer's inputs from a trip. The caller is responsible for authorizing the trip
 * FIRST (`authorizeTripLogistics`) — this function performs no authorization and must never be
 * called with an unauthorized tripId.
 */
export async function loadTripOptimizerInputs(tripId: string): Promise<TripOptimizerInputs> {
  const rows = await db
    .select({ item: itineraryItems, service: providerServices })
    .from(itineraryItems)
    // The join exists for two fields only: the REAL catalog `serviceType` and the REAL
    // `averageRating`. Both are honest-or-absent — there is no `?? 4.5` anywhere in this file.
    .leftJoin(providerServices, eq(itineraryItems.providerServiceId, providerServices.id))
    .where(
      and(
        eq(itineraryItems.tripId, tripId),
        // `with_expert` is absent from this list BY CONTRACT, not by accident.
        inArray(itineraryItems.routingStatus, [...OPTIMIZABLE_STATUSES, CONSTRAINT_STATUS]),
      ),
    )
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder), asc(itineraryItems.createdAt));

  const baselineItems: OptimizerBaselineItem[] = [];
  const fixedCommitments: FixedCommitment[] = [];

  for (const { item, service } of rows) {
    if (item.routingStatus === CONSTRAINT_STATUS) {
      fixedCommitments.push({
        id: item.id,
        name: item.title,
        dayNumber: item.dayNumber,
        startTime: item.startTime ?? undefined,
        location: item.locationName ?? undefined,
        providerServiceId: item.providerServiceId ?? undefined,
      });
      continue;
    }

    const index = baselineItems.length;
    baselineItems.push({
      id: item.id,
      // The catalog link the whole Lane 5a thread exists to preserve — carried straight through to
      // the baseline variant insert. NULL/undefined for a free-text item, never a guess (§13).
      providerServiceId: item.providerServiceId ?? undefined,
      name: item.title,
      description: item.description ?? undefined,
      // A catalog-linked item keeps the catalog's own richer serviceType — byte-identical to the
      // value the cart read produced for the same service. Only free-text items (which the cart
      // read dropped entirely) fall back to the itemType map above.
      serviceType: service?.serviceType ?? mapItemTypeToServiceType(item.itemType),
      price: toNumber(item.estimatedCost),
      // §13: the service's REAL aggregate or nothing. A free-text item has no rating source.
      rating: service?.averageRating ? toNumber(service.averageRating) : undefined,
      location: item.locationName ?? undefined,
      duration: item.durationMinutes ?? DEFAULT_DURATION_MINUTES,
      // REAL day number — a NOT NULL column. The cart read invented this.
      dayNumber: item.dayNumber,
      timeSlot: deriveTimeSlot(item.startTime, index),
      // Drop policy a (Lane 6 residue): an in-checkout item is schedule-movable but never
      // droppable — the generator rejects any variant that omits it (fail-closed, ruling 15).
      mustRetain: item.routingStatus === "ready_for_checkout",
    });
  }

  return {
    baselineItems,
    fixedCommitments,
    counts: { optimizable: baselineItems.length, purchased: fixedCommitments.length },
  };
}
