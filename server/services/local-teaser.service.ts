/**
 * FD-1 — THE COUNT-ONLY TEASER, server half (ledger `2026-10-09-fd1-free-draft-cap`; content-tiers ruling §4;
 * FD-1 ruling 2). For a FREE plan only (not `planGetsRoutedLegs`): per day, `{ localPicks, localNotes }` from
 * `localTeasersByDay` (shared/free-draft-cap.ts). It reads only DRAFT-ELIGIBLE local rows (tagged, unexpired —
 * FD-2 rulings 3/8) and returns COUNTS: no title, place, id or text ever leaves this module. Any failure, or a
 * paid plan, returns an EMPTY map — no teaser, never a fabricated zero (§13). FD-5's coverage targets will hide
 * an under-target day; until then every computed, non-zero day is shown.
 */
import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import { cityNeighborhoods, itineraryItems, localKnowledgeNuggets, travelPulseHiddenGems, trips } from "@shared/schema";
import { localTeasersByDay, type LocalTeaser } from "@shared/free-draft-cap";

const LIVE_LOCAL = (t: { sourceClass: any; expiresAt: any }) =>
  sql`${t.sourceClass} = 'local' AND (${t.expiresAt} IS NULL OR ${t.expiresAt} > NOW())`;

export async function localTeasersForTrip(tripId: string): Promise<Map<number, LocalTeaser>> {
  try {
    const { tripGetsRoutedLegs } = await import("./routing/plan-routed-legs.service");
    if (await tripGetsRoutedLegs(tripId)) return new Map();
    const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
    const city = (trip?.destination ?? "").split(",")[0].trim();
    if (!city) return new Map();
    const [items, hoods] = await Promise.all([
      db.select({ dayNumber: itineraryItems.dayNumber, lat: itineraryItems.latitude, lng: itineraryItems.longitude, gemId: itineraryItems.gemId })
        .from(itineraryItems).where(eq(itineraryItems.tripId, tripId)),
      db.select({ id: cityNeighborhoods.id, slug: cityNeighborhoods.slug, name: cityNeighborhoods.name, lat: cityNeighborhoods.centroidLat, lng: cityNeighborhoods.centroidLng })
        .from(cityNeighborhoods).where(ilike(cityNeighborhoods.city, city)),
    ]);
    if (!hoods.length) return new Map();
    const [gems, notes] = await Promise.all([
      db.select({ id: travelPulseHiddenGems.id, slug: travelPulseHiddenGems.neighborhood })
        .from(travelPulseHiddenGems)
        .where(and(ilike(travelPulseHiddenGems.city, city), LIVE_LOCAL(travelPulseHiddenGems))),
      db.select({ neighbourhoodId: localKnowledgeNuggets.neighborhoodId, neighbourhoodName: localKnowledgeNuggets.linkedNeighbourhood })
        .from(localKnowledgeNuggets)
        .where(and(ilike(localKnowledgeNuggets.city, city), LIVE_LOCAL(localKnowledgeNuggets))),
    ]);
    const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
    return localTeasersByDay({
      items: items.map((i) => ({ dayNumber: i.dayNumber, lat: num(i.lat), lng: num(i.lng), gemId: i.gemId ?? null })),
      neighbourhoods: hoods.map((h) => ({ id: h.id, slug: h.slug, name: h.name, lat: num(h.lat), lng: num(h.lng) })),
      gems: gems.map((g) => ({ id: g.id, neighbourhoodSlug: g.slug ?? null })),
      notes: notes.map((n) => ({ neighbourhoodId: n.neighbourhoodId ?? null, neighbourhoodName: n.neighbourhoodName ?? null })),
    });
  } catch (err: any) {
    console.warn(`[local-teaser] ${tripId}: not computed: ${String(err?.message ?? err).slice(0, 200)}`);
    return new Map();
  }
}
