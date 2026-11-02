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
  parsePinnedAnchorInput,
  nonCustomCatalogId,
  baselineItemsToAnchorStops,
  type NamedStop,
  type PinnedAnchorInput,
} from "./anchor-candidates-map";
import { dayAnchorId, eventAnchorId } from "./plan-anchors.service";

export type { NamedStop, PinnedAnchorInput } from "./anchor-candidates-map";
export {
  hotelRowsToCandidates,
  neighborhoodRowsToCandidates,
  stopsToActivityCandidates,
  rankActivityAnchors,
  buildPinnedCandidateFromCoords,
  parsePinnedAnchorInput,
  nonCustomCatalogId,
  baselineItemsToAnchorStops,
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
 * when the pin cannot be resolved to a real location. A caller that already took payment must
 * fail that run (`paidPinFellBack`) rather than treat the null as auto-anchor mode.
 */
/**
 * The located catalog candidate for a non-custom id, or null when that id is
 * missing or has no coordinates. Does not read client lat/lng. Activity ids
 * match a located trip stop; hotel and neighborhood ids match the catalog row.
 */
export async function locateCatalogPinnedAnchor(
  input: PinnedAnchorInput,
  stops: NamedStop[],
): Promise<AnchorCandidate | null> {
  const catalogId = nonCustomCatalogId(input);
  if (!catalogId) return null;
  if (input.type === "hotel") {
    const [row] = await db.select().from(hotelCache).where(eq(hotelCache.id, catalogId)).limit(1);
    if (!row) return null;
    return hotelRowsToCandidates([row as any])[0] ?? null;
  }
  if (input.type === "neighborhood") {
    const [row] = await db
      .select()
      .from(cityNeighborhoods)
      .where(eq(cityNeighborhoods.id, catalogId))
      .limit(1);
    if (!row) return null;
    return neighborhoodRowsToCandidates([row as any])[0] ?? null;
  }
  return buildPinnedCandidateFromCoords(input, stops);
}

export async function resolvePinnedAnchor(
  input: PinnedAnchorInput,
  stops: NamedStop[],
): Promise<AnchorScore | null> {
  // OPT-A: an event or day pin was resolved from the plan's own items by `placeCustomPinBeforeCharge`,
  // which wrote the point and the name onto the request (and cleared them on a miss). Never the
  // catalog, never a geocode.
  if (input.type === "event" || input.type === "day") {
    const id = typeof input.id === "string" ? input.id.trim() : "";
    const lat = typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null;
    const lng = typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : null;
    if (!id || lat == null || lng == null) return null;
    const anchorId = input.type === "event" ? eventAnchorId(id) : dayAnchorId(id);
    const name =
      input.type === "day"
        ? `Day ${parseInt(id, 10)}`
        : typeof input.name === "string" && input.name.trim()
          ? input.name.trim()
          : (stops.find((s) => s.id === id)?.name ?? "Event");
    return scoreAnchor({ id: anchorId, type: input.type, name, lat, lng }, stops);
  }
  // A catalog id is server-derived or it is nothing. Client lat/lng is not a fallback.
  if (nonCustomCatalogId(input)) {
    const candidate = await locateCatalogPinnedAnchor(input, stops);
    if (!candidate) return null;
    return scoreAnchor(candidate, stops);
  }

  const candidate = buildPinnedCandidateFromCoords(input, stops);
  if (!candidate) return null; // §13 — unresolvable pin ⇒ no anchor, never fabricated
  return scoreAnchor(candidate, stops);
}

type ResolvePinnedAnchor = (
  input: PinnedAnchorInput,
  stops: NamedStop[],
) => Promise<AnchorScore | null>;

/**
 * Shared request-to-optimizer pin rail for both comparison creation and regeneration.
 * Missing or malformed input returns undefined so the optimizer keeps auto-anchor mode.
 * A parsed pin that does not resolve also returns undefined. That second undefined is
 * not auto-anchor: the paid run must fail (`paidPinFellBack` in paid-pin-resolution.ts).
 */
export async function resolveOptimizerPinnedAnchor(
  rawPinnedAnchor: unknown,
  baselineItems: Array<{
    id?: unknown;
    name?: unknown;
    title?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  }>,
  resolver: ResolvePinnedAnchor = resolvePinnedAnchor,
): Promise<AnchorScore | undefined> {
  const pinnedAnchorInput = parsePinnedAnchorInput(rawPinnedAnchor);
  if (!pinnedAnchorInput) return undefined;

  const anchorStops = baselineItemsToAnchorStops(baselineItems);

  return (await resolver(pinnedAnchorInput, anchorStops)) ?? undefined;
}
