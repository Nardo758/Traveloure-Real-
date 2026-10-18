/**
 * LG-2 Ask 1 (ledger `2026-10-18-lg2-open-coord-review`; migration 391): open coordinates that cannot be trusted are
 * MOVED out of routing into `open_coord_review`, never deleted.
 *
 * A row is pulled when either holds (decision-maker's rulings):
 *   · it names a ward/city, a neighbourhood or a street — pulled regardless of distance (`admin` | `neighbourhood` |
 *     `street`), or
 *   · it sits more than `open_coord_max_drift_m` (platform_settings; admin-editable, Leon's value 500) from the point of
 *     a plan item it stands for (`drift`) — the item's own stored point, for each item linked to it or carrying its
 *     Google place id.
 *
 * The kinds are read from the row's NAME: `open_place_coords` stores no OSM class, and re-asking OSM is out (batch runs
 * against public Nominatim are over). The name rules lean towards pulling: a pulled row only makes an item honestly
 * unrouted until a person restores it, while a wrong point routes a traveller to the wrong place (§13).
 *
 * The move is one transaction per row: the row and all its item links are copied verbatim into ONE review row, then
 * the row is deleted (its links go with it, ON DELETE CASCADE). `restoreOpenCoordReview` puts both back, once.
 * Admin rows (`admin_place_coords`) are a person's own placement and are never touched here.
 */
import crypto from "node:crypto";
import { eq, inArray, isNull, and, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  cityNeighborhoods,
  itineraryItemOpenCoords,
  itineraryItems,
  openCoordReview,
  openPlaceCoords,
  platformSettingsTable,
} from "@shared/schema";
import { metresBetween } from "../item-osm-regeocode.service";

export const OPEN_COORD_MAX_DRIFT_SETTING = "open_coord_max_drift_m";
export const OPEN_COORD_REVIEW_REASONS = ["admin", "neighbourhood", "street", "drift"] as const;
export type OpenCoordReviewReason = (typeof OPEN_COORD_REVIEW_REASONS)[number];

/** Pure. Lower-case letters and digits only (macrons folded), so "Higashiyama-ku" and "higashiyama ku" compare equal. */
export function foldName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, "");
}

// A ward, city, prefecture or smaller administrative unit, in English or Japanese.
const ADMIN_NAME = /(^|[\s-])(ward|city|prefecture|town|village|district|ku|shi|fu|cho|machi|mura)$|[区市府町村]$/i;
// A street, road or lane, in English or Japanese (dōri / dori / kōji / koji / 通 / 小路).
const STREET_NAME = /(^|[\s-])(street|st\.?|road|rd\.?|avenue|ave\.?|lane|alley|dori|doori|koji|kouji)$|(dori|koji|kouji)$|通り?$|小路$/i;

/** Pure. The kind a row's name says it is, or null. A neighbourhood is a name the spine (`city_neighborhoods`) carries. */
export function kindFromName(
  name: string | null | undefined,
  neighbourhoodNames: ReadonlySet<string>,
): Exclude<OpenCoordReviewReason, "drift"> | null {
  const raw = (name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
  if (!raw) return null;
  if (neighbourhoodNames.has(foldName(raw))) return "neighbourhood";
  if (ADMIN_NAME.test(raw)) return "admin";
  if (STREET_NAME.test(raw)) return "street";
  return null;
}

export interface ReviewCandidateInput {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  /** The stored points of the plan items this row stands for. */
  itemPoints: Array<{ lat: number; lng: number }>;
}

/** Pure. Why a row is pulled (kind first, then drift), and its largest drift in whole metres when one is measurable. */
export function classifyOpenCoordRow(
  row: ReviewCandidateInput,
  neighbourhoodNames: ReadonlySet<string>,
  maxDriftM: number,
): { reason: OpenCoordReviewReason | null; driftM: number | null } {
  let driftM: number | null = null;
  if (row.lat != null && row.lng != null) {
    for (const p of row.itemPoints) {
      const d = Math.round(metresBetween(row.lat, row.lng, p.lat, p.lng));
      if (driftM == null || d > driftM) driftM = d;
    }
  }
  const kind = kindFromName(row.name, neighbourhoodNames);
  if (kind) return { reason: kind, driftM };
  if (driftM != null && driftM > maxDriftM) return { reason: "drift", driftM };
  return { reason: null, driftM };
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

export interface ReviewPlanRow {
  id: string;
  reason: OpenCoordReviewReason;
  driftM: number | null;
}

/** Every live open row, classified. Rows not pulled are counted, not listed. */
export async function planOpenCoordReview(maxDriftM: number): Promise<{ checked: number; pull: ReviewPlanRow[] }> {
  const rows = await db
    .select({ id: openPlaceCoords.id, name: openPlaceCoords.name, lat: openPlaceCoords.lat, lng: openPlaceCoords.lng, googlePlaceId: openPlaceCoords.googlePlaceId })
    .from(openPlaceCoords);
  if (rows.length === 0) return { checked: 0, pull: [] };

  const neighbourhoodNames = new Set(
    (await db.select({ name: cityNeighborhoods.name }).from(cityNeighborhoods)).map((n) => foldName(n.name)).filter(Boolean),
  );

  // Item points, by link and by Google place id.
  const linked = await db
    .select({ openCoordId: itineraryItemOpenCoords.openCoordId, lat: itineraryItems.latitude, lng: itineraryItems.longitude })
    .from(itineraryItemOpenCoords)
    .innerJoin(itineraryItems, eq(itineraryItems.id, itineraryItemOpenCoords.itemId));
  const placeIds = rows.map((r) => r.googlePlaceId).filter((p): p is string => !!p);
  const byPlace = placeIds.length
    ? await db
        .select({ placeId: itineraryItems.googlePlaceId, lat: itineraryItems.latitude, lng: itineraryItems.longitude })
        .from(itineraryItems)
        .where(inArray(itineraryItems.googlePlaceId, placeIds))
    : [];
  const pointsFor = new Map<string, Array<{ lat: number; lng: number }>>();
  const add = (key: string | null, lat: unknown, lng: unknown) => {
    const a = num(lat);
    const b = num(lng);
    if (!key || a == null || b == null) return;
    pointsFor.set(key, [...(pointsFor.get(key) ?? []), { lat: a, lng: b }]);
  };
  for (const l of linked) add(l.openCoordId, l.lat, l.lng);
  const rowIdsByPlace = new Map<string, string[]>();
  for (const r of rows) if (r.googlePlaceId) rowIdsByPlace.set(r.googlePlaceId, [...(rowIdsByPlace.get(r.googlePlaceId) ?? []), r.id]);
  for (const p of byPlace) for (const id of rowIdsByPlace.get(p.placeId ?? "") ?? []) add(id, p.lat, p.lng);

  const pull: ReviewPlanRow[] = [];
  for (const r of rows) {
    const c = classifyOpenCoordRow(
      { id: r.id, name: r.name, lat: num(r.lat), lng: num(r.lng), itemPoints: pointsFor.get(r.id) ?? [] },
      neighbourhoodNames,
      maxDriftM,
    );
    if (c.reason) pull.push({ id: r.id, reason: c.reason, driftM: c.driftM });
  }
  return { checked: rows.length, pull };
}

/**
 * Move one row and its item links into review, in one transaction. A row already gone (moved by a concurrent run) is
 * skipped: `moved` is false and nothing is written.
 */
export async function moveOpenCoordToReview(plan: ReviewPlanRow, movedBy: string): Promise<{ moved: boolean; links: number; reviewId: string | null }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(openPlaceCoords).where(eq(openPlaceCoords.id, plan.id)).for("update");
    if (!row) return { moved: false, links: 0, reviewId: null };
    const links = await tx.select().from(itineraryItemOpenCoords).where(eq(itineraryItemOpenCoords.openCoordId, plan.id));
    const reviewId = `rev_${crypto.randomUUID()}`;
    await tx.insert(openCoordReview).values({
      id: reviewId,
      openCoordId: row.id,
      reason: plan.reason,
      driftM: plan.driftM,
      openRow: { ...row, matchedAt: row.matchedAt ? row.matchedAt.toISOString() : null },
      itemLinks: links.map((l) => ({ ...l, matchedAt: l.matchedAt ? l.matchedAt.toISOString() : null })),
      movedAt: new Date(),
      movedBy,
    });
    // The row's delete removes its links (ON DELETE CASCADE); they are already in the snapshot.
    await tx.delete(openPlaceCoords).where(eq(openPlaceCoords.id, plan.id));
    return { moved: true, links: links.length, reviewId };
  });
}

/**
 * Put a reviewed row back, once. The row comes back unless an open place with its id exists again (then that one is
 * kept); each link comes back when its item still exists and has no link of its own. The review row keeps its record
 * and is stamped restored.
 */
export async function restoreOpenCoordReview(
  reviewId: string,
  restoredBy: string,
): Promise<{ restored: boolean; rowRestored: boolean; linksRestored: number; reason?: "not_found" | "already_restored" }> {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(openCoordReview)
      .set({ restoredAt: new Date(), restoredBy })
      .where(and(eq(openCoordReview.id, reviewId), isNull(openCoordReview.restoredAt)))
      .returning();
    if (!claimed) {
      const [exists] = await tx.select({ id: openCoordReview.id }).from(openCoordReview).where(eq(openCoordReview.id, reviewId));
      return { restored: false, rowRestored: false, linksRestored: 0, reason: exists ? "already_restored" : "not_found" };
    }
    const r = claimed.openRow as Record<string, any>;
    const inserted = await tx
      .insert(openPlaceCoords)
      .values({
        id: r.id,
        source: r.source ?? null,
        osmType: r.osmType ?? null,
        osmId: r.osmId ?? null,
        wikidataQid: r.wikidataQid ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        name: r.name ?? null,
        googlePlaceId: r.googlePlaceId ?? null,
        matchedBy: r.matchedBy ?? null,
        attribution: r.attribution ?? null,
        matchedAt: r.matchedAt ? new Date(r.matchedAt) : null,
      })
      .onConflictDoNothing()
      .returning({ id: openPlaceCoords.id });
    let linksRestored = 0;
    for (const l of (claimed.itemLinks as Array<Record<string, any>>) ?? []) {
      const res = await tx.execute(sql`
        INSERT INTO itinerary_item_open_coords (item_id, open_coord_id, source, matched_at)
        SELECT ${l.itemId}, ${r.id}, ${l.source ?? null}, ${l.matchedAt ? new Date(l.matchedAt) : null}
        WHERE EXISTS (SELECT 1 FROM itinerary_items WHERE id = ${l.itemId})
        ON CONFLICT (item_id) DO NOTHING`);
      linksRestored += (res as any).rowCount ?? 0;
    }
    return { restored: true, rowRestored: inserted.length > 0, linksRestored };
  });
}
