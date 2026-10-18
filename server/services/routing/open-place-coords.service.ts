/**
 * LG-1 (decision-maker, Oct 17, 2026 — ledger `2026-10-17-lg1-osm-place-coords`; migration 389): the ONE home of the
 * two open-coordinate tables, keyed by the Google place id.
 *
 *   osm_place_coords   — written ONLY by `recordOsmPlaceCoord`, called by the one-off Nominatim batch
 *                        (`scripts/regeocode-items-osm.ts --apply`, 1 request/s). Insert-once: a place already
 *                        matched is never overwritten by a later run. Never a runtime Nominatim call.
 *   admin_place_coords — written ONLY by `setAdminPlaceCoord`, behind `/api/admin/place-coords` (the §2 guard). An
 *                        admin may correct their own row; the session is the author (§14).
 *
 * `openCoordsForPlaceIds` is the ONE reader the routing engine asks; an admin row wins over an OSM match.
 */
import { inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { adminPlaceCoords, osmPlaceCoords } from "@shared/schema";
import { OSM_COORD_ATTRIBUTION, OSM_COORD_MATCHED_BY_NOMINATIM_BATCH } from "@shared/open-coords";
import { mergeOpenCoords, validCoord, type OpenPlaceCoord } from "./open-routing-points";

export type { OpenPlaceCoord };

/** The open coordinate for each place id that has one. Never throws: a failed read is "none known". */
export async function openCoordsForPlaceIds(placeIds: readonly string[]): Promise<Map<string, OpenPlaceCoord>> {
  const ids = Array.from(new Set(placeIds.filter((p) => typeof p === "string" && p.trim().length > 0)));
  if (ids.length === 0) return new Map();
  try {
    const [osmRows, adminRows] = await Promise.all([
      db.select({ placeId: osmPlaceCoords.placeId, lat: osmPlaceCoords.lat, lng: osmPlaceCoords.lng }).from(osmPlaceCoords).where(inArray(osmPlaceCoords.placeId, ids)),
      db.select({ placeId: adminPlaceCoords.placeId, lat: adminPlaceCoords.lat, lng: adminPlaceCoords.lng }).from(adminPlaceCoords).where(inArray(adminPlaceCoords.placeId, ids)),
    ]);
    return mergeOpenCoords(osmRows, adminRows);
  } catch (err: any) {
    console.error(`[open-coords] read failed: ${String(err?.message ?? err).slice(0, 200)}`);
    return new Map();
  }
}

export interface OsmPlaceCoordInput {
  placeId: string;
  lat: number;
  lng: number;
  osmType: string | null;
  osmId: number | null;
  osmName: string | null;
  matchedAt: Date;
}

/** The ONE writer of `osm_place_coords`: insert once, credited. True when this call inserted the row. */
export async function recordOsmPlaceCoord(input: OsmPlaceCoordInput): Promise<boolean> {
  const p = validCoord(input.lat, input.lng);
  if (!p || !input.placeId.trim()) return false;
  const rows = await db
    .insert(osmPlaceCoords)
    .values({
      placeId: input.placeId.trim(),
      lat: p.lat.toFixed(7),
      lng: p.lng.toFixed(7),
      osmType: input.osmType,
      osmId: input.osmId,
      osmName: input.osmName,
      matchedBy: OSM_COORD_MATCHED_BY_NOMINATIM_BATCH,
      attribution: OSM_COORD_ATTRIBUTION,
      matchedAt: input.matchedAt,
    })
    .onConflictDoNothing({ target: osmPlaceCoords.placeId })
    .returning({ placeId: osmPlaceCoords.placeId });
  return rows.length > 0;
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

/** Admin read: the rows for the given place ids (both tables, unmerged, so the admin sees what each says). */
export async function adminPlaceCoordRows(placeIds: readonly string[]) {
  const ids = Array.from(new Set(placeIds.filter(Boolean)));
  if (ids.length === 0) return { osm: [], admin: [] };
  const [osm, admin] = await Promise.all([
    db.select().from(osmPlaceCoords).where(inArray(osmPlaceCoords.placeId, ids)),
    db.select().from(adminPlaceCoords).where(inArray(adminPlaceCoords.placeId, ids)),
  ]);
  return { osm, admin };
}

/** Counts for the admin surface. */
export async function openPlaceCoordCounts(): Promise<{ osm: number; admin: number }> {
  const [o] = ((await db.execute(sql`SELECT count(*)::int AS n FROM osm_place_coords`)) as any).rows ?? [];
  const [a] = ((await db.execute(sql`SELECT count(*)::int AS n FROM admin_place_coords`)) as any).rows ?? [];
  return { osm: Number(o?.n ?? 0), admin: Number(a?.n ?? 0) };
}
