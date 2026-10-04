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
import { itineraryItems, transportLegs } from "@shared/schema";
import { storage } from "../storage";
import { CHAUFFEURED_MODES } from "@shared/trip-plan";
import { TRANSPORT_PROFILES } from "../data/transport-profiles";
import {
  computeTransportLeg,
  formatDistance,
  type ActivityLocation,
  type TransportLegResult,
  type UserTransportPrefs,
} from "./transport-leg-calculator";
import { haversineMeters } from "@shared/geo";
import { defaultLegMode, LEG_MODE_STORED, normalizeLegMode } from "@shared/travel-speeds";
import type { ResolvedLeg } from "@shared/leg-resolution";
import { loadLegResolver, tripMarketSlug } from "./travel-time.service";
import { WITHIN_WALK_METERS } from "./anchor-scoring";
import { travelTimeServiceEnabled } from "../config/travel-time.config";
import { getTravelerProfile, effectiveProfileToTransportPrefs } from "./traveler-profile.service";
import { propagateActivitySchedule } from "./activity-schedule.service";

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
  /** Honest omission: geometry is missing, or the engine has no plausible mode for this pair. */
  reason: "missing_coordinates" | "route_unavailable";
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
  /** Schedule gaps that remain unresolved after routing; callers must surface these for review. */
  scheduleUnresolved: Array<{
    activityId: string;
    reason: "missing_departure" | "missing_duration" | "route_unavailable" | "day_boundary" | "schedule_conflict";
  }>;
}

/**
 * A leg resolved by the ONE travel-time service, in the engine's result shape. Its tier is recorded
 * on the ONE alternative entry for its own mode (`reason`: "routes" | "matrix" | "est."), so a
 * reader can label a straight-line leg "est." without a new column; cost is null — the service
 * prices nothing, and no figure is invented.
 */
function legFromResolved(
  from: ActivityLocation,
  to: ActivityLocation,
  dayNumber: number,
  legOrder: number,
  r: ResolvedLeg,
): TransportLegResult {
  return {
    fromActivityId: from.id,
    fromName: from.name,
    fromLat: from.lat,
    fromLng: from.lng,
    toActivityId: to.id,
    toName: to.name,
    toLat: to.lat,
    toLng: to.lng,
    dayNumber,
    legOrder,
    distanceMeters: r.distanceMeters,
    distanceDisplay: formatDistance(r.distanceMeters),
    recommendedMode: LEG_MODE_STORED[r.mode],
    estimatedDurationMinutes: r.minutes,
    estimatedCostUsd: null,
    alternativeModes: [resolvedAlternative(r)],
    energyCost: 0,
    routeProvider: r.basis === "routes" ? "google_routes" : r.basis === "matrix" ? "travel_time_matrix" : "straight_line_est",
    routeRetrievedAt: new Date().toISOString(),
  };
}

/** The ONE alternative entry a service-resolved leg carries — its own mode, its tier in `reason`. */
export function resolvedAlternative(r: ResolvedLeg) {
  return {
    mode: LEG_MODE_STORED[r.mode],
    durationMinutes: r.minutes,
    costUsd: null,
    energyCost: 0,
    reason: r.label ?? r.basis,
  };
}

/**
 * A8 (R228): Finalize's transport step. The plan's ITEMS (never the `generated_itineraries` JSON)
 * become trip-scoped `proposed` legs through the ONE travel-time service; the plan's times are not
 * rewritten. Flag-gated by the caller.
 */
export async function activateTripTransport(tripId: string): Promise<TripLegGenerationResult> {
  return generateTripTransportLegs(tripId, { via: "travel_time_service", propagateSchedule: false });
}

/**
 * A8 (R228): switching a leg's mode RECOMPUTES it through the ONE service (today the driving minutes
 * were kept because the engine's alternatives list is empty). Returns the updated figures, or null
 * when the flag is off or the mode is not one of the four — the caller then keeps its old path.
 */
export async function recomputeLegForMode(
  leg: { fromLat: number; fromLng: number; toLat: number; toLng: number; tripId?: string | null },
  rawMode: string,
  marketSlug?: string | null,
): Promise<{ estimatedDurationMinutes: number; distanceMeters: number; distanceDisplay: string; estimatedCostUsd: null; energyCost: 0; alternativeModes: ReturnType<typeof resolvedAlternative>[] } | null> {
  if (!travelTimeServiceEnabled()) return null;
  const mode = normalizeLegMode(rawMode);
  if (!mode) return null;
  const market = marketSlug !== undefined ? marketSlug : leg.tripId ? await tripMarketSlug(leg.tripId) : null;
  const resolve = await loadLegResolver(market, { exact: true });
  const r = await resolve({ lat: leg.fromLat, lng: leg.fromLng }, { lat: leg.toLat, lng: leg.toLng }, mode);
  return {
    estimatedDurationMinutes: r.minutes,
    distanceMeters: r.distanceMeters,
    distanceDisplay: formatDistance(r.distanceMeters),
    estimatedCostUsd: null,
    energyCost: 0,
    alternativeModes: [resolvedAlternative(r)],
  };
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

export interface StopPair<T> {
  dayNumber: number;
  /** 0-based position of `from` within its day. */
  index: number;
  from: T;
  to: T;
  /** NULL when the stop has no real coordinate (§13) — such a pair is never routed. */
  fromCoord: { lat: number; lng: number } | null;
  toCoord: { lat: number; lng: number } | null;
}

/**
 * The ONE rule for which stops a trip-scoped leg connects (§18 rule 1): consecutive items on the
 * same day, in the order given — callers pass `storage.getItineraryItems` order, (dayNumber,
 * sortOrder, startTime), which IS the traveler's sequence. Days ascend. Both the leg engine
 * (`generateTripTransportLegs`) and the ready-made publish gate (R-ax, `readyMadeLegLines`) read it,
 * so the gate can never demand a leg the engine would not propose. Pure.
 */
export function consecutiveStopPairs<T extends { dayNumber: number; latitude?: unknown; longitude?: unknown }>(
  items: readonly T[],
): StopPair<T>[] {
  const byDay = new Map<number, T[]>();
  for (const item of items) {
    const list = byDay.get(item.dayNumber) ?? [];
    list.push(item);
    byDay.set(item.dayNumber, list);
  }
  const out: StopPair<T>[] = [];
  for (const dayNumber of Array.from(byDay.keys()).sort((a, b) => a - b)) {
    const day = byDay.get(dayNumber)!;
    for (let i = 0; i < day.length - 1; i++) {
      out.push({
        dayNumber,
        index: i,
        from: day[i],
        to: day[i + 1],
        fromCoord: realCoord(day[i].latitude, day[i].longitude),
        toCoord: realCoord(day[i + 1].latitude, day[i + 1].longitude),
      });
    }
  }
  return out;
}

/** A leg "picked" under R-ax: confirmed, with the author's chosen mode. */
export function isPickedLeg(leg: { proposalStatus?: string | null; userSelectedMode?: string | null }): boolean {
  return leg.proposalStatus === "confirmed" && !!leg.userSelectedMode;
}

export type ReadyMadeLegLine = {
  requirement: "legs" | "leg_location";
  message: string;
  dayNumber: number;
  fromItemId: string;
  toItemId: string;
  legId?: string;
};

/**
 * R-ax (work plan L1-2), pure. For every consecutive pair of stops (`consecutiveStopPairs`):
 *   · both located and no PICKED leg (`isPickedLeg`) between them ⇒ a BLOCKING `legs` line, naming the
 *     leg when one exists (proposed, or confirmed without a mode);
 *   · either stop unlocated ⇒ an ADVISORY `leg_location` line ("Day N: {title} has no location"),
 *     never blocking — the engine skips that pair too (`missing_coordinates`), so no leg could satisfy
 *     it. Each unlocated stop is reported once.
 */
export function readyMadeLegLines(
  items: ReadonlyArray<{ id: string; title: string; dayNumber: number; latitude?: unknown; longitude?: unknown }>,
  legs: ReadonlyArray<{ id: string; dayNumber: number; fromActivityId: string | null; toActivityId: string | null; proposalStatus?: string | null; userSelectedMode?: string | null }>,
): { blocking: ReadyMadeLegLine[]; advisory: ReadyMadeLegLine[] } {
  const byPair = new Map<string, (typeof legs)[number][]>();
  for (const leg of legs) {
    const k = pairKey(leg.dayNumber, leg.fromActivityId, leg.toActivityId);
    byPair.set(k, [...(byPair.get(k) ?? []), leg]);
  }
  const blocking: ReadyMadeLegLine[] = [];
  const advisory: ReadyMadeLegLine[] = [];
  const reportedUnlocated = new Set<string>();
  for (const pair of consecutiveStopPairs(items)) {
    const base = { dayNumber: pair.dayNumber, fromItemId: pair.from.id, toItemId: pair.to.id };
    if (!pair.fromCoord || !pair.toCoord) {
      for (const [stop, coord] of [[pair.from, pair.fromCoord], [pair.to, pair.toCoord]] as const) {
        if (coord || reportedUnlocated.has(stop.id)) continue;
        reportedUnlocated.add(stop.id);
        advisory.push({ requirement: "leg_location", message: `Day ${pair.dayNumber}: ${stop.title} has no location`, ...base });
      }
      continue;
    }
    const candidates = byPair.get(pairKey(pair.dayNumber, pair.from.id, pair.to.id)) ?? [];
    if (candidates.some(isPickedLeg)) continue;
    blocking.push({
      requirement: "legs",
      message: `Day ${pair.dayNumber}: pick how to get from ${pair.from.title} to ${pair.to.title}`,
      ...base,
      ...(candidates[0] ? { legId: candidates[0].id } : {}),
    });
  }
  return { blocking, advisory };
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
export async function generateTripTransportLegs(
  tripId: string,
  opts: {
    /**
     * A8 (R228): "travel_time_service" resolves every leg through the ONE travel-time module
     * (Routes at this exact tier when configured, else the matrix, else the labelled estimate) in
     * the default mode `defaultLegMode` picks. Omitted = the existing driving engine, unchanged.
     */
    via?: "engine" | "travel_time_service";
    /** False = write the legs only; never re-time the plan's items (Finalize's call — the plan is frozen). */
    propagateSchedule?: boolean;
  } = {},
): Promise<TripLegGenerationResult> {
  const trip = await storage.getTrip(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  const destination = trip.destination || "";
  const viaService = opts.via === "travel_time_service";
  const resolver = viaService ? await loadLegResolver(trip.marketSlug ?? null, { exact: true }) : null;

  // WP-A (docs/briefs/OPTIMIZER_SOURCING_BUILD_SPEC.md): the trip owner's traveler profile
  // modulates MODE CHOICE only (prioritize/accessibility/budgetTier — the existing
  // UserTransportPrefs scoring knobs), never price. Best-effort: a lookup failure degrades to
  // the engine's own DEFAULT_PREFS, exactly today's behavior, never a thrown error.
  let transportPrefs: Partial<UserTransportPrefs> = {};
  if (trip.userId) {
    try {
      const profile = await getTravelerProfile(trip.userId);
      transportPrefs = effectiveProfileToTransportPrefs(profile.effective);
    } catch (err) {
      console.warn("[TripTransportLegs] traveler profile fetch failed (non-critical):", (err as Error).message);
    }
  }

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
  const skipped: TripLegSkip[] = [];
  const rows: Array<typeof transportLegs.$inferInsert> = [];
  const routedResults: Awaited<ReturnType<typeof computeTransportLeg>>[] = [];
  let keptConfirmed = 0;

  // The ONE pairing rule (`consecutiveStopPairs`), shared with the ready-made leg gate (R-ax).
  for (const pair of consecutiveStopPairs(items)) {
    const { dayNumber, index: i, fromCoord, toCoord } = pair;
    const from = pair.from as any;
    const to = pair.to as any;

    // Already the expert's own confirmed leg — leave it completely alone.
    if (confirmedPairs.has(pairKey(dayNumber, from.id, to.id))) {
      keptConfirmed++;
      continue;
    }

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

    const leg = resolver
      ? legFromResolved(
          fromPoint,
          toPoint,
          dayNumber,
          i + 1,
          await resolver(
            fromCoord,
            toCoord,
            defaultLegMode(haversineMeters(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng), WITHIN_WALK_METERS),
          ),
        )
      : await computeTransportLeg(fromPoint, toPoint, dayNumber, i + 1, destination, transportPrefs);
    if (!leg) {
      skipped.push({
        dayNumber,
        fromItemId: from.id,
        fromTitle: from.title,
        toItemId: to.id,
        toTitle: to.title,
        reason: "route_unavailable",
      });
      continue;
    }
    routedResults.push(leg);

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

  if (opts.propagateSchedule === false) {
    return { created: rows.length, keptConfirmed, replacedProposed: staleProposedIds.length, skipped, scheduleUnresolved: [] };
  }

  const scheduleLegs = [
    ...existing.filter((leg) => leg.proposalStatus === "confirmed"),
    ...routedResults.filter((leg): leg is NonNullable<typeof leg> => leg !== null),
  ];
  const { updates, unresolved: scheduleUnresolved } = propagateActivitySchedule(
    items.map((item, index) => ({
      id: item.id,
      dayNumber: item.dayNumber,
      order: item.sortOrder ?? index,
      startTime: item.startTime,
      endTime: item.endTime,
      durationMinutes: item.durationMinutes,
    })),
    scheduleLegs,
  );
  const itemById = new Map(items.map((item) => [item.id, item]));
  const routeByTarget = new Map(
    routedResults
      .filter((leg): leg is NonNullable<typeof leg> => leg !== null)
      .map((leg) => [leg.toActivityId, leg]),
  );
  await Promise.all(
    updates.map((update) => {
      const item = itemById.get(update.id);
      // Paid and in-checkout commitments are fixed points. Recalculation may route around them,
      // but it never rewrites their stored schedule.
      if (!item || item.routingStatus === "purchased" || item.routingStatus === "ready_for_checkout") {
        return Promise.resolve();
      }
      const routed = routeByTarget.get(update.id);
      const scheduleValues: Partial<typeof itineraryItems.$inferInsert> = {
        startTime: update.startTime,
        endTime: update.endTime,
        updatedAt: new Date(),
      };
      if (routed) {
        scheduleValues.travelFromPrevious = {
          mode: "driving",
          durationMinutes: routed.estimatedDurationMinutes,
          distanceMeters: routed.distanceMeters,
          provider: routed.routeProvider,
          retrievedAt: routed.routeRetrievedAt,
          status: "available",
        };
      }
      return db
        .update(itineraryItems)
        .set(scheduleValues)
        .where(eq(itineraryItems.id, update.id));
    }),
  );

  return {
    created: rows.length,
    keptConfirmed,
    replacedProposed: staleProposedIds.length,
    skipped,
    scheduleUnresolved,
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

  const recomputed =
    patch.userSelectedMode !== undefined ? await recomputeLegForMode(leg, patch.userSelectedMode) : null;
  if (recomputed) {
    updates.userSelectedMode = patch.userSelectedMode;
    Object.assign(updates, recomputed);
  } else if (patch.userSelectedMode !== undefined) {
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
