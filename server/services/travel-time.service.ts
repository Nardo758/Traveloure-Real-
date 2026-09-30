/**
 * THE ONE TRAVEL-TIME SERVICE — the I/O half (Track A step A8; ledger
 * `2026-09-30-a8-travel-time-service`, R228).
 *
 * The rule lives in `shared/leg-resolution.ts` (pure, three tiers, one "est." label). This module
 * wires its two sources — the A2 matrix reader for the plan's market and the Routes call for an
 * exact leg — and is the ONLY place either is wired for a leg. Callers: Finalize (through
 * `activateTripTransport`), activate-transport, a leg's mode switch, and plan-fit's scorer. All four
 * are gated on `travelTimeServiceEnabled()`; with the flag off none of them reach this module.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import type { LatLng, TravelMode, TravelTime } from "@shared/travel-time";
import type { LegMode } from "@shared/travel-speeds";
import { resolveLeg, unifiedPlanTravel, type LegSources, type ResolvedLeg } from "@shared/leg-resolution";
import { loadMatrixReader } from "./travel-time-matrix.service";
import { getRouteForMode } from "./routes.service";
import { travelTimeRoutesAvailable } from "../config/travel-time.config";

export type { ResolvedLeg } from "@shared/leg-resolution";

export async function tripMarketSlug(tripId: string): Promise<string | null> {
  const [row] = await db.select({ marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId)).limit(1);
  return row?.marketSlug ?? null;
}

/**
 * A leg resolver for one plan's market, loaded ONCE and reused for every leg. `exact: true` is the
 * Finalize answer (Routes first, when configured); `exact: false` never calls Routes.
 */
export async function loadLegResolver(
  marketSlug: string | null,
  opts: { exact: boolean },
): Promise<(from: LatLng, to: LatLng, mode: LegMode) => Promise<ResolvedLeg>> {
  const matrix = marketSlug ? await loadMatrixReader(marketSlug) : null;
  const sources: LegSources = {
    matrix,
    routes: opts.exact && travelTimeRoutesAvailable() ? getRouteForMode : null,
  };
  return (from, to, mode) => resolveLeg({ from, to, mode, exact: opts.exact }, sources);
}

/** Plan-fit's `travel` function under the ONE rule (matrix, else the mode's straight-line speed). */
export function planTravelFrom(
  matrix: (from: LatLng, to: LatLng, mode: TravelMode) => TravelTime,
): (from: LatLng, to: LatLng, mode: TravelMode) => TravelTime {
  return unifiedPlanTravel(matrix);
}
