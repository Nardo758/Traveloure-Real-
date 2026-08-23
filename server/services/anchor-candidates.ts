/**
 * Phase 1 — DB loader for anchor candidates. Thin wrapper over the pure mappers in
 * `anchor-candidates-map.ts`: fetch the city's hotels / neighborhoods, map + rank them (and the
 * trip's own stops as activity anchors) with the Phase-0 scorer. Never throws on empty inventory —
 * a kind with no located candidates comes back `[]`.
 */

import { db } from "../db";
import { hotelCache, cityNeighborhoods } from "@shared/schema";
import { ilike, eq } from "drizzle-orm";
import { rankAnchors, scoreAnchor, type AnchorScore, type AnchorCandidate } from "./anchor-scoring";
import {
  hotelRowsToCandidates,
  neighborhoodRowsToCandidates,
  rankActivityAnchors,
  buildPinnedCandidateFromCoords,
  type NamedStop,
  type PinnedAnchorInput,
} from "./anchor-candidates-map";

export type { NamedStop, PinnedAnchorInput } from "./anchor-candidates-map";
export {
  hotelRowsToCandidates,
  neighborhoodRowsToCandidates,
  stopsToActivityCandidates,
  rankActivityAnchors,
  buildPinnedCandidateFromCoords,
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

/**
 * Phase 1c — resolve a traveler's "build around THIS" pin into a real, scored anchor. Hotel and
 * neighborhood ids are looked up in the catalog so the coordinates are SERVER-derived (the client's
 * coords are never trusted for a catalog id); an `activity` pin resolves to one of the trip's own
 * stops, and a custom placement is accepted as the traveler's own coordinates (§22). Returns null
 * when the pin cannot be resolved to a real location — the optimizer then falls back to auto anchors
 * rather than inventing one (§13).
 */
export async function resolvePinnedAnchor(
  input: PinnedAnchorInput,
  stops: NamedStop[],
): Promise<AnchorScore | null> {
  let candidate: AnchorCandidate | null = null;

  if (input.type === "hotel" && input.id) {
    const [row] = await db.select().from(hotelCache).where(eq(hotelCache.id, String(input.id))).limit(1);
    if (row) candidate = hotelRowsToCandidates([row as any])[0] ?? null;
  } else if (input.type === "neighborhood" && input.id) {
    const [row] = await db
      .select()
      .from(cityNeighborhoods)
      .where(eq(cityNeighborhoods.id, String(input.id)))
      .limit(1);
    if (row) candidate = neighborhoodRowsToCandidates([row as any])[0] ?? null;
  }

  // Activity pin or custom placement (and the fallback when a catalog id didn't resolve): the pure
  // half handles both without touching the DB.
  if (!candidate) candidate = buildPinnedCandidateFromCoords(input, stops);

  if (!candidate) return null; // §13 — unresolvable pin ⇒ no anchor, never fabricated
  return scoreAnchor(candidate, stops);
}
