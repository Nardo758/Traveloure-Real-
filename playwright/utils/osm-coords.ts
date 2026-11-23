/**
 * TEST-ONLY (Leon, Nov 23 2026): the R3 capture needs the OpenStreetMap canvas to draw, and that canvas admits only
 * points whose `coord_source` is non-Google (`shared/item-coord-source.ts:29`). The item create rail deliberately lets a
 * request claim only a Google source, so this helper writes `coord_source = 'osm'` on a plan's seeded items DIRECTLY in
 * the CI database - never through the app, never on a production path, and never in a build that is not the test job.
 *
 * It refuses to run unless BOTH hold:
 *   - `CI === "true"` (the test job sets it), and
 *   - DATABASE_URL points at a local test database (host localhost/127.0.0.1).
 * Anything else throws before a single row is written.
 */
import { Client } from "pg";

export function assertTestDatabase(databaseUrl = process.env.DATABASE_URL, ci = process.env.CI): void {
  if (ci !== "true") throw new Error("osm-coords: refusing to run outside CI (CI !== 'true')");
  if (!databaseUrl) throw new Error("osm-coords: refusing to run with no DATABASE_URL");
  let host = "";
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("osm-coords: DATABASE_URL is not a URL");
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`osm-coords: refusing to touch ${host} - the test database is local only`);
  }
}

/**
 * Marks every item on `tripId` as an OSM-sourced point, and - when `stayTitle` is given - sets that one row's
 * `item_type` to `lodging`, because the create rail does not accept a lodging type. Returns how many rows changed.
 */
export async function markSeededItemsAsOsm(tripId: string, stayTitle?: string): Promise<number> {
  assertTestDatabase();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query("UPDATE itinerary_items SET coord_source = 'osm' WHERE trip_id = $1", [tripId]);
    if (stayTitle) {
      await client.query("UPDATE itinerary_items SET item_type = 'lodging' WHERE trip_id = $1 AND title = $2", [tripId, stayTitle]);
    }
    return res.rowCount ?? 0;
  } finally {
    await client.end();
  }
}
