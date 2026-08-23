/**
 * Phase 1 — DB loader for anchor candidates. Thin wrapper over the pure mappers in
 * `anchor-candidates-map.ts`: fetch the city's hotels / neighborhoods, map + rank them (and the
 * trip's own stops as activity anchors) with the Phase-0 scorer. Never throws on empty inventory —
 * a kind with no located candidates comes back `[]`.
 */

import { db } from "../db";
import { hotelCache, cityNeighborhoods } from "@shared/schema";
import { ilike } from "drizzle-orm";
import { rankAnchors, type AnchorScore } from "./anchor-scoring";
import {
  hotelRowsToCandidates,
  neighborhoodRowsToCandidates,
  rankActivityAnchors,
  type NamedStop,
} from "./anchor-candidates-map";

export type { NamedStop } from "./anchor-candidates-map";
export {
  hotelRowsToCandidates,
  neighborhoodRowsToCandidates,
  stopsToActivityCandidates,
  rankActivityAnchors,
} from "./anchor-candidates-map";

export interface RankedAnchors {
  hotel: AnchorScore[];
  neighborhood: AnchorScore[];
  activity: AnchorScore[];
}

/**
 * Load and rank real anchor candidates of all three kinds for a destination against the trip's
 * stops. Located stops drive the score; unlocated ones are ignored by the scorer (§13).
 */
export async function loadRankedAnchors(
  destination: string | null | undefined,
  stops: NamedStop[],
  opts: { limit?: number } = {},
): Promise<RankedAnchors> {
  const limit = opts.limit ?? 5;
  const city = (destination ?? "").split(",")[0]?.trim() ?? "";

  const [hotelRows, hoodRows] = await Promise.all([
    city
      ? db.select().from(hotelCache).where(ilike(hotelCache.city, `%${city}%`)).limit(60)
      : Promise.resolve([] as any[]),
    city
      ? db.select().from(cityNeighborhoods).where(ilike(cityNeighborhoods.city, `%${city}%`)).limit(60)
      : Promise.resolve([] as any[]),
  ]);

  return {
    hotel: rankAnchors(hotelRowsToCandidates(hotelRows as any), stops).slice(0, limit),
    neighborhood: rankAnchors(neighborhoodRowsToCandidates(hoodRows as any), stops).slice(0, limit),
    activity: rankActivityAnchors(stops, limit),
  };
}
