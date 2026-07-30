/**
 * Trip-scoped transport legs — the data layer for CLAUDE.md §18's ratified "BOTH" model
 * (spec: docs/briefs/L4-transport-legs.md, migration 154):
 *
 *   the engine PROPOSES  →  the expert CONFIRMS/EDITS  →  only CONFIRMED legs reach travelers.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
 * `transport_legs` used to be variant-scoped only, so expert-built Workstation trips had no legs
 * at all. Migration 154 gave the SAME table a nullable `trip_id`, so trips get legs without a
 * parallel table (one-home rule). This service owns every trip-scoped read/write; the
 * variant-scoped pipeline (`transport-leg-calculator.calculateTransportLegs`, the optimizer, the
 * share/OG family) is untouched.
 *
 * ── INVARIANTS ────────────────────────────────────────────────────────────────────────────────
 * D1a-analog: a generated leg is born `'proposed'`, NEVER born `'confirmed'`. Only the expert's
 *   explicit PATCH promotes it — a machine-guessed mode never renders on an expert-branded plan.
 * §13 (never fabricate): a leg is computed ONLY between two itinerary items that BOTH carry real
 *   coordinates. A pair with a missing/zero coordinate is SKIPPED and reported — never bridged
 *   over (bridging A→C around a coordless B would invent a journey nobody takes) and never given
 *   placeholder geometry. `pickup_point`/`pickup_time` hold only what the expert typed.
 * §14: nothing here touches an amount, an earning, a payout or a booking record. `estimatedCostUsd`
 *   is the engine's informational estimate on the leg row, exactly as on the variant path.
 * Scope exactly-one-of: trip-scoped rows are written with `trip_id` set and `variant_id` left NULL
 *   (migration 154 deliberately has NO cross-column CHECK — that shape breaks Replit's
 *   publish-time drizzle-push). Every read here filters on `trip_id`, so the two homes never mix.
 */

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { transportLegs } from "@shared/schema";
import { storage } from "../storage";
import { CHAUFFEURED_MODES } from "@shared/trip-plan";
import { TRANSPORT_PROFILES } from "../data/transport-profiles";
import {
  computeTransportLeg,
  type ActivityLocation,
} from "./transport-leg-calculator";

/** The `proposal_status` vocabulary (mirrors the migration-154 DB CHECK). */
export const LEG_PROPOSAL_STATUSES = ["proposed", "confirmed"] as const;
export type LegProposalStatus = (typeof LEG_PROPOSAL_STATUSES)[number];

/**
 * Mode vocabulary an expert may select, DERIVED from the real engine config (every mode any
 * destination profile can recommend) plus the §18 chauffeured set. Never a hand-typed list, so it
 * cannot drift from what the engine actually computes.
 */
export const SELECTABLE_TRANSPORT_MODES: readonly string[] = Array.from(
  new Set<string>([
    ...Object.values(TRANSPORT_PROFILES).flatMap((p) => p.availableModes.map((m) => m.mode)),
    ...CHAUFFEURED_MODES,
  ]),
).sort();

export interface TripLegSkip {
  dayNumber: number;
  fromItemId: string;
  fromTitle: string;
  toItemId: string;
  toTitle: string;
  /** Only reason in v1 — one or both endpoints have no usable coordinates. */
  reason: "missing_coordinates";
}

export interface TripLegGenerationResult {
  /** Newly written `proposed` rows. */
  created: number;
  /** Existing `confirmed` legs left exactly as they were (never regenerated, never replaced). */
  keptConfirmed: number;
  /** Stale `proposed` rows removed before the rewrite. */
  replacedProposed: number;
  /** Item pairs that could not be routed honestly (§13) — the L4b editor's honest empty state. */
  skipped: TripLegSkip[];
}

/** A real coordinate, or null. Rejects null/NaN/out-of-range and the (0,0) "Null Island" sentinel. */
function realCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  const la = typeof lat === "number" ? lat : parseFloat(String(lat));
  const ln = typeof lng === "number" ? lng : parseFloat(String(lng));
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

/** `(dayNumber, fromActivityId, toActivityId)` — the identity of a leg between two plan stops. */
function pairKey(dayNumber: number, fromId: string | null, toId: string | null): string {
  return `${dayNumber}|${fromId ?? ""}|${toId ?? ""}`;
}

/**
 * ENGINE PROPOSAL PASS. Computes legs between consecutive same-day itinerary items using the
 * EXISTING variant leg engine (`computeTransportLeg` → `computeSingleLeg`, same distance / mode
 * scoring / duration / alternatives), and writes them as trip-scoped rows born `'proposed'`.
 *
 * Idempotent re-run: every existing `proposed` row for the trip is replaced; `confirmed` rows are
 * never touched, and a pair the expert has already confirmed is not re-proposed (so a re-run can
 * never shadow a confirmed leg with a duplicate machine proposal). Variant-scoped legs on the same
 * trip are invisible to this function.
 */
export async function generateTripTransportLegs(tripId: string): Promise<TripLegGenerationResult> {
  const trip = await storage.getTrip(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  const destination = trip.destination || "";

  const items = await storage.getItineraryItems(tripId);

  // Existing trip-scoped legs: confirmed ones are load-bearing (expert-owned), proposed ones are
  // disposable machine output.
  const existing = await db
    .select()
    .from(transportLegs)
    .where(and(eq(transportLegs.tripId, tripId), isNotNull(transportLegs.proposalStatus)));

  const confirmedPairs = new Set(
    existing
      .filter((l) => l.proposalStatus === "confirmed")
      .map((l) => pairKey(l.dayNumber, l.fromActivityId, l.toActivityId)),
  );
  const staleProposedIds = existing
    .filter((l) => l.proposalStatus === "proposed")
    .map((l) => l.id);

  // Plan order per day — storage.getItineraryItems already orders by
  // (dayNumber, sortOrder, startTime), which IS the traveler's sequence.
  const byDay = new Map<number, typeof items>();
  for (const item of items) {
    const list = byDay.get(item.dayNumber) ?? [];
    list.push(item);
    byDay.set(item.dayNumber, list as typeof items);
  }

  const skipped: TripLegSkip[] = [];
  const rows: Array<typeof transportLegs.$inferInsert> = [];
  let keptConfirmed = 0;

  for (const dayNumber of Array.from(byDay.keys()).sort((a, b) => a - b)) {
    const dayItems = byDay.get(dayNumber)!;
    for (let i = 0; i < dayItems.length - 1; i++) {
      const from = dayItems[i] as any;
      const to = dayItems[i + 1] as any;

      // Already the expert's own confirmed leg — leave it completely alone.
      if (confirmedPairs.has(pairKey(dayNumber, from.id, to.id))) {
        keptConfirmed++;
        continue;
      }

      const fromCoord = realCoord(from.latitude, from.longitude);
      const toCoord = realCoord(to.latitude, to.longitude);
      if (!fromCoord || !toCoord) {
        // §13: no geometry exists for this gap, so no leg is written. The caller surfaces this as
        // "add a location to route this leg" — never a fabricated leg.
        skipped.push({
          dayNumber,
          fromItemId: from.id,
          fromTitle: from.title,
          toItemId: to.id,
          toTitle: to.title,
          reason: "missing_coordinates",
        });
        continue;
      }

      const fromPoint: ActivityLocation = {
        id: from.id,
        name: from.title,
        lat: fromCoord.lat,
        lng: fromCoord.lng,
        scheduledTime: from.startTime || "",
        dayNumber,
        order: i,
      };
      const toPoint: ActivityLocation = {
        id: to.id,
        name: to.title,
        lat: toCoord.lat,
        lng: toCoord.lng,
        scheduledTime: to.startTime || "",
        dayNumber,
        order: i + 1,
      };

      const leg = computeTransportLeg(fromPoint, toPoint, dayNumber, i + 1, destination);

      rows.push({
        // Trip scope: variantId stays NULL (the app-level exactly-one-of rule).
        tripId,
        dayNumber: leg.dayNumber,
        legOrder: leg.legOrder,
        fromActivityId: leg.fromActivityId,
        fromName: leg.fromName,
        fromLat: leg.fromLat,
        fromLng: leg.fromLng,
        toActivityId: leg.toActivityId,
        toName: leg.toName,
        toLat: leg.toLat,
        toLng: leg.toLng,
        distanceMeters: leg.distanceMeters,
        distanceDisplay: leg.distanceDisplay,
        recommendedMode: leg.recommendedMode,
        estimatedDurationMinutes: leg.estimatedDurationMinutes,
        estimatedCostUsd: leg.estimatedCostUsd ?? null,
        alternativeModes: leg.alternativeModes,
        energyCost: leg.energyCost,
        destinationProfile: destination || null,
        // D1a-analog: born proposed. The engine cannot self-confirm.
        proposalStatus: "proposed",
      });
    }
  }

  // Atomic swap so a concurrent read never sees a trip with its proposals deleted and not yet
  // rewritten.
  await db.transaction(async (tx) => {
    if (staleProposedIds.length > 0) {
      await tx.delete(transportLegs).where(inArray(transportLegs.id, staleProposedIds));
    }
    if (rows.length > 0) {
      await tx.insert(transportLegs).values(rows);
    }
  });

  return {
    created: rows.length,
    keptConfirmed,
    replacedProposed: staleProposedIds.length,
    skipped,
  };
}

/**
 * Trip-scoped legs, ordered `(dayNumber, legOrder)`.
 * Default = CONFIRMED ONLY (what a traveler surface may see). `includeProposed` is the Workstation
 * editor's read and must never be passed by a traveler-facing caller.
 */
export async function getTripTransportLegs(
  tripId: string,
  opts: { includeProposed?: boolean } = {},
): Promise<any[]> {
  const scope = opts.includeProposed
    ? and(eq(transportLegs.tripId, tripId), isNotNull(transportLegs.proposalStatus))
    : and(eq(transportLegs.tripId, tripId), eq(transportLegs.proposalStatus, "confirmed"));

  return await db
    .select()
    .from(transportLegs)
    .where(scope)
    .orderBy(asc(transportLegs.dayNumber), asc(transportLegs.legOrder));
}

/** A single trip-scoped leg, or null. Trip scope is part of the lookup (IDOR: leg must be the trip's). */
export async function getTripTransportLeg(tripId: string, legId: string): Promise<any | null> {
  const [row] = await db
    .select()
    .from(transportLegs)
    .where(and(eq(transportLegs.id, legId), eq(transportLegs.tripId, tripId)))
    .limit(1);
  return row ?? null;
}

/**
 * The ONLY writable fields (mass-assignment posture — never a raw body spread). Everything else on
 * the row is engine-computed geometry or scope and is not expert-editable.
 */
export interface TripLegPatch {
  userSelectedMode?: string;
  pickupPoint?: string | null;
  pickupTime?: string | null;
  proposalStatus?: LegProposalStatus;
}

/**
 * Applies the expert's edit. When a mode is chosen, duration/cost/energy are re-read from the
 * engine's OWN alternative for that mode (the same derivation the variant `/mode` endpoint uses) —
 * never client-supplied figures, never invented ones when the engine has no alternative for the
 * mode (the existing values are then kept).
 */
export async function updateTripTransportLeg(
  tripId: string,
  legId: string,
  patch: TripLegPatch,
): Promise<any | null> {
  const leg = await getTripTransportLeg(tripId, legId);
  if (!leg) return null;

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (patch.userSelectedMode !== undefined) {
    updates.userSelectedMode = patch.userSelectedMode;
    const alt = ((leg.alternativeModes as any[]) || []).find(
      (a: any) => a?.mode === patch.userSelectedMode,
    );
    if (alt) {
      updates.estimatedDurationMinutes = alt.durationMinutes;
      updates.estimatedCostUsd = alt.costUsd ?? null;
      updates.energyCost = alt.energyCost ?? leg.energyCost ?? 0;
    }
  }
  // Empty string → NULL: an expert clearing the field means "no arrangement stated", not "".
  if (patch.pickupPoint !== undefined) {
    updates.pickupPoint = patch.pickupPoint && patch.pickupPoint.trim().length > 0 ? patch.pickupPoint.trim() : null;
  }
  if (patch.pickupTime !== undefined) {
    updates.pickupTime = patch.pickupTime && patch.pickupTime.trim().length > 0 ? patch.pickupTime.trim() : null;
  }
  if (patch.proposalStatus !== undefined) {
    updates.proposalStatus = patch.proposalStatus;
  }

  const [row] = await db
    .update(transportLegs)
    .set(updates)
    // Trip scope re-asserted in the WHERE so a mutation can never escape the trip.
    .where(and(eq(transportLegs.id, legId), eq(transportLegs.tripId, tripId)))
    .returning();
  return row ?? null;
}

/** Deletes one trip-scoped leg (the expert rejecting a proposal, or removing a confirmed one). */
export async function deleteTripTransportLeg(tripId: string, legId: string): Promise<boolean> {
  const deleted = await db
    .delete(transportLegs)
    .where(and(eq(transportLegs.id, legId), eq(transportLegs.tripId, tripId)))
    .returning({ id: transportLegs.id });
  return deleted.length > 0;
}

/**
 * True when the leg is trip-scoped (migration 154) rather than a legacy variant leg. Used by the
 * variant-era `/api/transport-legs/:legId/mode` handler, whose variant→comparison→owner
 * authorization cannot resolve for a trip-scoped row.
 */
export function isTripScopedLeg(leg: { variantId?: string | null; tripId?: string | null }): boolean {
  return !leg.variantId && !!leg.tripId;
}
