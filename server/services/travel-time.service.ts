/**
 * THE ONE TRAVEL-TIME SERVICE — the I/O half (Track A step A8; ledger
 * `2026-09-30-a8-travel-time-service`, R228).
 *
 * The rule lives in `shared/leg-resolution.ts` (pure, three tiers, one "est." label). This module
 * wires its sources and is the ONLY place they are wired for a leg. Since 9b-b the exact source is the
 * routing engine's adapter (OSRM or the CI stub, never Google) and the matrix tier is retired (see
 * `loadLegResolver`). Callers: Finalize (through
 * `activateTripTransport`), activate-transport, a leg's mode switch, and plan-fit's scorer. All four
 * are gated on `travelTimeServiceEnabled()`; with the flag off none of them reach this module.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import type { LatLng, TravelMode, TravelTime } from "@shared/travel-time";
import type { LegMode } from "@shared/travel-speeds";
import { resolveLeg, unifiedPlanTravel, type LegSources, type ResolvedLeg } from "@shared/leg-resolution";
import { routingAdapter } from "./routing/index";

export type { ResolvedLeg } from "@shared/leg-resolution";

export async function tripMarketSlug(tripId: string): Promise<string | null> {
  const [row] = await db.select({ marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId)).limit(1);
  return row?.marketSlug ?? null;
}

/**
 * A leg resolver for one plan's market, loaded ONCE and reused for every leg. `exact: true` is the
 * Finalize answer; `exact: false` never asks a router.
 *
 * 9b-b (ledger `2026-10-16-9b-b-legs-off-google`; 9b spec T1/T2, Phase 0 rulings 1–2): the exact source
 * is the routing engine's adapter — self-hosted OSRM (drive, walk) or the CI stub — and NEVER Google
 * Routes, because every caller stores the minutes it is answered. The `travel_time_matrix` (Google Route
 * Matrix) is RETIRED as a source: no pair is read from it. With no adapter, or for a mode OSRM does not
 * serve, the answer is the labelled straight-line estimate (§13). `marketSlug` is kept for the callers'
 * signature; it no longer selects a matrix.
 */
export async function loadLegResolver(
  _marketSlug: string | null,
  opts: { exact: boolean },
): Promise<(from: LatLng, to: LatLng, mode: LegMode) => Promise<ResolvedLeg>> {
  const adapter = opts.exact ? routingAdapter() : null;
  const sources: LegSources = {
    matrix: null,
    routes: adapter
      ? async (from, to, mode) => {
          if (mode !== "drive" && mode !== "walk") return null;
          const out = await adapter.route({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, mode, null);
          return out.kind === "ok" ? { minutes: out.route.durationMin, distanceMeters: out.route.distanceM } : null;
        }
      : null,
  };
  return (from, to, mode) => resolveLeg({ from, to, mode, exact: opts.exact }, sources);
}

/** Plan-fit's `travel` function under the ONE rule (matrix, else the mode's straight-line speed). */
export function planTravelFrom(
  matrix: (from: LatLng, to: LatLng, mode: TravelMode) => TravelTime,
): (from: LatLng, to: LatLng, mode: TravelMode) => TravelTime {
  return unifiedPlanTravel(matrix);
}
