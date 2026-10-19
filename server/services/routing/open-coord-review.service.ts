/**
 * LG-2 Ask 1 (ledger `2026-10-18-lg2-open-coord-review`; migration 391): item → open place LINKS that cannot be trusted
 * are pulled out of routing into `itinerary_item_open_coords_review`. The open place (`open_place_coords`) is never moved
 * or changed; only the link leaves.
 *
 * A link is pulled when one holds (decision-maker's rulings; checked in this order, the first names the reason):
 *   · the open place names a ward/city, a neighbourhood or a street — pulled regardless of distance (`admin` |
 *     `neighbourhood` | `street`);
 *   · the open place's name and the item's name do not contain one another (`name_mismatch`, Ask 1's containment rule):
 *     folded to letters and digits, the place's name (or its part before a comma or bracket) must appear in the item's
 *     title or location name, or the item's name in the place's;
 *   · the open place sits more than `open_coord_max_drift_m` (platform_settings; admin-editable, Leon's value 500) from
 *     the item's own stored point (`drift`).
 *
 * The kinds are read from the place's NAME: `open_place_coords` stores no OSM class and public Nominatim is not
 * re-asked; the class is stored on the post-Oct-21 geocoder run. The rules lean towards pulling: a pulled link only
 * makes an item honestly unrouted until a person restores it, while a wrong point routes a traveller to the wrong place.
 *
 * A pulled item also stops reaching an OSM place through its Google place id (`pulledOpenItems` → `routingPointFor`'s
 * `itemPulled`), or the same place would come straight back; an admin point for its place id still wins.
 */
import crypto from "node:crypto";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import {
  cityNeighborhoods,
  itineraryItemOpenCoords,
  itineraryItemOpenCoordsReview,
  itineraryItems,
  openPlaceCoords,
  platformSettingsTable,
} from "@shared/schema";
import { metresBetween } from "../item-osm-regeocode.service";
import { foldName, kindFromName } from "@shared/osm-place-kind";

export const OPEN_COORD_MAX_DRIFT_SETTING = "open_coord_max_drift_m";
export const OPEN_COORD_REVIEW_REASONS = ["admin", "neighbourhood", "street", "name_mismatch", "drift"] as const;
export type OpenCoordReviewReason = (typeof OPEN_COORD_REVIEW_REASONS)[number];

// The name readings live in ONE pure module, shared with the matcher (LG-2 Ask 2; §18 rule 1).
export { foldName, kindFromName };

/**
 * Pure. Ask 1's containment rule: the place's name (whole, or its part before a comma or bracket) appears in the item's
 * title or location name, or one of those appears in the place's name. Empty names never match.
 */
export function namesContainEachOther(placeName: string | null | undefined, itemNames: ReadonlyArray<string | null | undefined>): boolean {
  const place = [foldName(placeName), foldName((placeName ?? "").split(/[,(（]/)[0])].filter((s) => s.length >= 2);
  const items = itemNames.map(foldName).filter((s) => s.length >= 2);
  return place.some((p) => items.some((i) => i.includes(p) || p.includes(i)));
}

export interface ReviewLinkInput {
  displayName: string | null;
  placeLat: number | null;
  placeLng: number | null;
  itemTitle: string | null;
  itemLocationName: string | null;
  itemLat: number | null;
  itemLng: number | null;
}

/** Pure. Why a link is pulled (first reason in order), and the distance in whole metres when both points exist. */
export function classifyOpenCoordLink(
  link: ReviewLinkInput,
  neighbourhoodNames: ReadonlySet<string>,
  maxDriftM: number,
): { reason: OpenCoordReviewReason | null; distanceM: number | null } {
  const distanceM =
    link.placeLat != null && link.placeLng != null && link.itemLat != null && link.itemLng != null
      ? Math.round(metresBetween(link.placeLat, link.placeLng, link.itemLat, link.itemLng))
      : null;
  const kind = kindFromName(link.displayName, neighbourhoodNames);
  if (kind) return { reason: kind, distanceM };
  if (!namesContainEachOther(link.displayName, [link.itemTitle, link.itemLocationName])) return { reason: "name_mismatch", distanceM };
  if (distanceM != null && distanceM > maxDriftM) return { reason: "drift", distanceM };
  return { reason: null, distanceM };
}

/** The admin setting, or null when absent or not a positive number (the pull then refuses: no code fallback). */
export async function loadMaxDriftM(): Promise<number | null> {
  const [row] = await db
    .select({ v: platformSettingsTable.settingValue })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.settingKey, OPEN_COORD_MAX_DRIFT_SETTING))
    .limit(1);
  const n = Number(row?.v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ReviewPlanLink {
  itemId: string;
  openCoordId: string;
  reason: OpenCoordReviewReason;
  distanceM: number | null;
}

/** Every live link, classified (a pair already restored after a check is skipped). Links not pulled are counted, not listed. */
export async function planOpenCoordReview(maxDriftM: number): Promise<{ checked: number; pull: ReviewPlanLink[] }> {
  const links = await db
    .select({
      itemId: itineraryItemOpenCoords.itemId,
      openCoordId: openPlaceCoords.id,
      displayName: openPlaceCoords.name,
      placeLat: openPlaceCoords.lat,
      placeLng: openPlaceCoords.lng,
      itemTitle: itineraryItems.title,
      itemLocationName: itineraryItems.locationName,
      itemLat: itineraryItems.latitude,
      itemLng: itineraryItems.longitude,
    })
    .from(itineraryItemOpenCoords)
    .innerJoin(openPlaceCoords, eq(openPlaceCoords.id, itineraryItemOpenCoords.openCoordId))
    .innerJoin(itineraryItems, eq(itineraryItems.id, itineraryItemOpenCoords.itemId));
  if (links.length === 0) return { checked: 0, pull: [] };
  const neighbourhoodNames = new Set(
    (await db.select({ name: cityNeighborhoods.name }).from(cityNeighborhoods)).map((n) => foldName(n.name)).filter(Boolean),
  );
  // A link a person checked and restored is not pulled again for the same place.
  const restored = new Set(
    (
      await db
        .select({ itemId: itineraryItemOpenCoordsReview.itemId, openCoordId: itineraryItemOpenCoordsReview.openCoordId })
        .from(itineraryItemOpenCoordsReview)
        .where(isNotNull(itineraryItemOpenCoordsReview.restoredAt))
    ).map((r) => `${r.itemId}|${r.openCoordId}`),
  );
  const pull: ReviewPlanLink[] = [];
  for (const l of links) {
    if (restored.has(`${l.itemId}|${l.openCoordId}`)) continue;
    const c = classifyOpenCoordLink(
      {
        displayName: l.displayName,
        placeLat: num(l.placeLat),
        placeLng: num(l.placeLng),
        itemTitle: l.itemTitle,
        itemLocationName: l.itemLocationName,
        itemLat: num(l.itemLat),
        itemLng: num(l.itemLng),
      },
      neighbourhoodNames,
      maxDriftM,
    );
    if (c.reason && l.openCoordId) pull.push({ itemId: l.itemId, openCoordId: l.openCoordId, reason: c.reason, distanceM: c.distanceM });
  }
  return { checked: links.length, pull };
}

/**
 * Pull one link: record it with what a person needs to check it, then remove it, in one transaction. A link that is
 * gone, or now names a different place, is skipped: `pulled` is false and nothing is written.
 */
export async function pullOpenCoordLink(plan: ReviewPlanLink, removedBy: string): Promise<{ pulled: boolean; reviewId: string | null }> {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(itineraryItemOpenCoords)
      .where(and(eq(itineraryItemOpenCoords.itemId, plan.itemId), eq(itineraryItemOpenCoords.openCoordId, plan.openCoordId)))
      .for("update");
    if (!link) return { pulled: false, reviewId: null };
    const [place] = await tx.select().from(openPlaceCoords).where(eq(openPlaceCoords.id, plan.openCoordId));
    const [item] = await tx.select({ lat: itineraryItems.latitude, lng: itineraryItems.longitude }).from(itineraryItems).where(eq(itineraryItems.id, plan.itemId));
    const reviewId = `rev_${crypto.randomUUID()}`;
    await tx.insert(itineraryItemOpenCoordsReview).values({
      id: reviewId,
      itemId: plan.itemId,
      openCoordId: plan.openCoordId,
      osmType: place?.osmType ?? null,
      osmId: place?.osmId ?? null,
      displayName: place?.name ?? null,
      itemLat: item?.lat ?? null,
      itemLng: item?.lng ?? null,
      distanceM: plan.distanceM,
      reason: plan.reason,
      linkSource: link.source ?? null,
      linkMatchedAt: link.matchedAt ?? null,
      removedAt: new Date(),
      removedBy,
    });
    await tx.delete(itineraryItemOpenCoords).where(eq(itineraryItemOpenCoords.itemId, plan.itemId));
    return { pulled: true, reviewId };
  });
}

/**
 * Put a checked link back, once. The link returns when its item and its open place still exist and the item has no
 * other link; the review row is stamped restored either way, so a second restore is refused.
 */
export async function restoreOpenCoordLink(
  reviewId: string,
  restoredBy: string,
): Promise<{ restored: boolean; linkRestored: boolean; reason?: "not_found" | "already_restored" }> {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(itineraryItemOpenCoordsReview)
      .set({ restoredAt: new Date(), restoredBy })
      .where(and(eq(itineraryItemOpenCoordsReview.id, reviewId), isNull(itineraryItemOpenCoordsReview.restoredAt)))
      .returning();
    if (!claimed) {
      const [exists] = await tx.select({ id: itineraryItemOpenCoordsReview.id }).from(itineraryItemOpenCoordsReview).where(eq(itineraryItemOpenCoordsReview.id, reviewId));
      return { restored: false, linkRestored: false, reason: exists ? "already_restored" : "not_found" };
    }
    const [item] = await tx.select({ id: itineraryItems.id }).from(itineraryItems).where(eq(itineraryItems.id, claimed.itemId ?? ""));
    const [place] = await tx.select({ id: openPlaceCoords.id }).from(openPlaceCoords).where(eq(openPlaceCoords.id, claimed.openCoordId ?? ""));
    if (!item || !place) return { restored: true, linkRestored: false };
    const inserted = await tx
      .insert(itineraryItemOpenCoords)
      .values({ itemId: item.id, openCoordId: place.id, source: claimed.linkSource, matchedAt: claimed.linkMatchedAt })
      .onConflictDoNothing()
      .returning({ itemId: itineraryItemOpenCoords.itemId });
    return { restored: true, linkRestored: inserted.length > 0 };
  });
}

/**
 * The items whose link is pulled and not yet restored. Such an item does not fall back to an OSM place through its Google
 * place id (`routingPointFor` `itemPulled`). Never throws: a failed read is "none pulled".
 */
export async function pulledOpenItems(itemIds: readonly string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(itemIds.filter((p) => typeof p === "string" && p.length > 0)));
  if (ids.length === 0) return new Set();
  try {
    const rows = await db
      .select({ itemId: itineraryItemOpenCoordsReview.itemId })
      .from(itineraryItemOpenCoordsReview)
      .where(and(inArray(itineraryItemOpenCoordsReview.itemId, ids), isNotNull(itineraryItemOpenCoordsReview.removedAt), isNull(itineraryItemOpenCoordsReview.restoredAt)));
    return new Set(rows.map((r) => r.itemId).filter((x): x is string => !!x));
  } catch (err: any) {
    console.error(`[open-coords] review read failed: ${String(err?.message ?? err).slice(0, 200)}`);
    return new Set();
  }
}
