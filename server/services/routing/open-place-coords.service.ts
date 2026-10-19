/**
 * LG-1 (decision-maker, Oct 17, 2026 — ledger `2026-10-17-lg1-osm-place-coords`; migration 389), RE-KEYED by migration 390
 * (ledger `2026-10-18-lg1-open-coords-rekey`): the ONE home of the open-coordinate tables.
 *
 *   open_place_coords          — an open place keyed by its OWN source's id ('osm:<type>/<id>'; later 'wikidata:<Qid>'),
 *                                the Google place id a nullable attribute. Written ONLY by `recordOpenCoordForItem`,
 *                                called by the one-off batch (`scripts/regeocode-items-osm.ts --v2 --apply`, 1 request/s).
 *                                Insert-once: a place already recorded is never overwritten. Never a runtime Nominatim call.
 *   itinerary_item_open_coords — which open place a plan item is (one per item), written by the same writer. An item
 *                                with no Google place id reaches its coordinate through this row — the reason for 390.
 *   admin_place_coords         — written ONLY by `setAdminPlaceCoord`, behind `/api/admin/place-coords` (the §2 guard).
 *   osm_place_coords (389)     — no longer written or read; its rows naming an OSM element were copied by 390.
 *
 * The engine asks two readers: `openCoordsForItemIds` (item → join → row) and `openCoordsForPlaceIds` (an admin row,
 * else an open row carrying the place id). `routingPointFor` orders them: admin row, the item's own row, place id.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { adminPlaceCoords, itineraryItemOpenCoords, openPlaceCoords } from "@shared/schema";
import { OSM_COORD_ATTRIBUTION, OSM_COORD_MATCHED_BY_NOMINATIM_BATCH } from "@shared/open-coords";
import { mergeOpenCoords, validCoord, type OpenPlaceCoord } from "./open-routing-points";

export type { OpenPlaceCoord };

/**
 * The open coordinate for each Google place id that has one: an admin row, else an open place recorded with that place
 * id (the earliest match). Never throws: a failed read is "none known".
 */
export async function openCoordsForPlaceIds(placeIds: readonly string[]): Promise<Map<string, OpenPlaceCoord>> {
  const ids = Array.from(new Set(placeIds.filter((p) => typeof p === "string" && p.trim().length > 0)));
  if (ids.length === 0) return new Map();
  try {
    const [openRows, adminRows] = await Promise.all([
      db
        .select({ placeId: openPlaceCoords.googlePlaceId, lat: openPlaceCoords.lat, lng: openPlaceCoords.lng, matchedAt: openPlaceCoords.matchedAt })
        .from(openPlaceCoords)
        .where(inArray(openPlaceCoords.googlePlaceId, ids)),
      db.select({ placeId: adminPlaceCoords.placeId, lat: adminPlaceCoords.lat, lng: adminPlaceCoords.lng }).from(adminPlaceCoords).where(inArray(adminPlaceCoords.placeId, ids)),
    ]);
    // Two open places can carry one place id (two items, one Google id); the earliest match is the place id's answer.
    const earliestFirst = openRows
      .filter((r): r is typeof r & { placeId: string } => !!r.placeId)
      .sort((a, b) => (a.matchedAt?.getTime() ?? 0) - (b.matchedAt?.getTime() ?? 0))
      .reverse();
    return mergeOpenCoords(earliestFirst, adminRows);
  } catch (err: any) {
    console.error(`[open-coords] read failed: ${String(err?.message ?? err).slice(0, 200)}`);
    return new Map();
  }
}

/** The open coordinate each plan item is linked to (item → join → row). Never throws: a failed read is "none known". */
export async function openCoordsForItemIds(itemIds: readonly string[]): Promise<Map<string, OpenPlaceCoord>> {
  const ids = Array.from(new Set(itemIds.filter((p) => typeof p === "string" && p.length > 0)));
  const out = new Map<string, OpenPlaceCoord>();
  if (ids.length === 0) return out;
  try {
    const rows = await db
      .select({ itemId: itineraryItemOpenCoords.itemId, lat: openPlaceCoords.lat, lng: openPlaceCoords.lng, source: itineraryItemOpenCoords.source })
      .from(itineraryItemOpenCoords)
      .innerJoin(openPlaceCoords, eq(openPlaceCoords.id, itineraryItemOpenCoords.openCoordId))
      .where(inArray(itineraryItemOpenCoords.itemId, ids));
    for (const r of rows) {
      const p = validCoord(r.lat, r.lng);
      if (p) out.set(r.itemId, { ...p, origin: "osm", linkSource: r.source ?? null });
    }
    return out;
  } catch (err: any) {
    console.error(`[open-coords] item read failed: ${String(err?.message ?? err).slice(0, 200)}`);
    return out;
  }
}

export interface OpenCoordForItemInput {
  itemId: string;
  /** The item's Google place id when it has one — an attribute of the row, never its key. */
  googlePlaceId: string | null;
  lat: number;
  lng: number;
  osmType: string | null;
  osmId: number | null;
  osmName: string | null;
  matchedAt: Date;
}

/** The open place's id, from its OWN source: 'osm:<type>/<id>'. Null when the match did not name its OSM element. Pure. */
export function osmOpenCoordId(osmType: string | null | undefined, osmId: number | null | undefined): string | null {
  const t = (osmType ?? "").trim().toLowerCase();
  return /^(node|way|relation)$/.test(t) && Number.isInteger(osmId) && (osmId as number) > 0 ? `osm:${t}/${osmId}` : null;
}

/**
 * The ONE writer of `open_place_coords` and `itinerary_item_open_coords`: the open place is inserted once (credited),
 * then the item is linked to it once. A match that does not name its OSM element is not written (no key — §13).
 */
export async function recordOpenCoordForItem(input: OpenCoordForItemInput): Promise<{ written: boolean; rowInserted: boolean; linked: boolean; reason?: "no_osm_id" | "invalid_coordinate" }> {
  const p = validCoord(input.lat, input.lng);
  if (!p) return { written: false, rowInserted: false, linked: false, reason: "invalid_coordinate" };
  const id = osmOpenCoordId(input.osmType, input.osmId);
  if (!id) return { written: false, rowInserted: false, linked: false, reason: "no_osm_id" };
  const inserted = await db
    .insert(openPlaceCoords)
    .values({
      id,
      source: "osm",
      osmType: input.osmType!.trim().toLowerCase(),
      osmId: input.osmId,
      lat: p.lat.toFixed(7),
      lng: p.lng.toFixed(7),
      name: input.osmName,
      googlePlaceId: input.googlePlaceId?.trim() || null,
      matchedBy: OSM_COORD_MATCHED_BY_NOMINATIM_BATCH,
      attribution: OSM_COORD_ATTRIBUTION,
      matchedAt: input.matchedAt,
    })
    .onConflictDoNothing({ target: openPlaceCoords.id })
    .returning({ id: openPlaceCoords.id });
  const linked = await db
    .insert(itineraryItemOpenCoords)
    .values({ itemId: input.itemId, openCoordId: id, source: "osm", matchedAt: input.matchedAt })
    .onConflictDoNothing({ target: itineraryItemOpenCoords.itemId })
    .returning({ itemId: itineraryItemOpenCoords.itemId });
  return { written: inserted.length > 0 || linked.length > 0, rowInserted: inserted.length > 0, linked: linked.length > 0 };
}

/** LG-2 Ask 7: which of the given hand-picked point ids ('admin:<type>/<id>') are already entered. Read-only. */
export async function enteredAdminPointIds(ids: readonly string[]): Promise<Set<string>> {
  const list = Array.from(new Set(ids.filter(Boolean)));
  if (list.length === 0) return new Set();
  const rows = await db.select({ id: openPlaceCoords.id }).from(openPlaceCoords).where(inArray(openPlaceCoords.id, list));
  return new Set(rows.map((r) => r.id));
}

/** The items (of those given) that already have an open coordinate link — the batch skips them, so a re-run resumes. */
export async function itemsWithOpenCoord(itemIds: readonly string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db.select({ itemId: itineraryItemOpenCoords.itemId }).from(itineraryItemOpenCoords).where(inArray(itineraryItemOpenCoords.itemId, ids.slice(i, i + 500)));
    rows.forEach((r) => out.add(r.itemId));
  }
  return out;
}

export interface AdminPlaceCoordInput {
  placeId: string;
  lat: number;
  lng: number;
  sourceUrl: string;
  note: string | null;
}

/** The ONE writer of `admin_place_coords`: an admin's coordinate from the official site. Upsert by place id. */
export async function setAdminPlaceCoord(input: AdminPlaceCoordInput, adminUserId: string, now: Date = new Date()) {
  const p = validCoord(input.lat, input.lng);
  if (!p) throw new Error("invalid_coordinate");
  const values = {
    placeId: input.placeId.trim(),
    lat: p.lat.toFixed(7),
    lng: p.lng.toFixed(7),
    sourceUrl: input.sourceUrl,
    enteredBy: adminUserId,
    enteredAt: now,
    note: input.note,
  };
  const [row] = await db
    .insert(adminPlaceCoords)
    .values(values)
    .onConflictDoUpdate({
      target: adminPlaceCoords.placeId,
      set: { lat: values.lat, lng: values.lng, sourceUrl: values.sourceUrl, enteredBy: values.enteredBy, enteredAt: values.enteredAt, note: values.note },
    })
    .returning();
  return row;
}

/** Admin read: the rows for the given place ids (open and admin, unmerged, so the admin sees what each says). */
export async function adminPlaceCoordRows(placeIds: readonly string[]) {
  const ids = Array.from(new Set(placeIds.filter(Boolean)));
  if (ids.length === 0) return { osm: [], admin: [] };
  const [osm, admin] = await Promise.all([
    db.select().from(openPlaceCoords).where(inArray(openPlaceCoords.googlePlaceId, ids)),
    db.select().from(adminPlaceCoords).where(inArray(adminPlaceCoords.placeId, ids)),
  ]);
  return { osm, admin };
}

/** Counts for the admin surface: open places, items linked to one, admin rows. */
export async function openPlaceCoordCounts(): Promise<{ osm: number; linkedItems: number; admin: number }> {
  const [o] = ((await db.execute(sql`SELECT count(*)::int AS n FROM open_place_coords`)) as any).rows ?? [];
  const [l] = ((await db.execute(sql`SELECT count(*)::int AS n FROM itinerary_item_open_coords`)) as any).rows ?? [];
  const [a] = ((await db.execute(sql`SELECT count(*)::int AS n FROM admin_place_coords`)) as any).rows ?? [];
  return { osm: Number(o?.n ?? 0), linkedItems: Number(l?.n ?? 0), admin: Number(a?.n ?? 0) };
}
