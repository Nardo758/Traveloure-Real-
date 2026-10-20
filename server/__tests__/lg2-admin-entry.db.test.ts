/**
 * LG-2 Ask 7 (ledger `2026-10-19-lg2-admin-osm-points`; migration 396): a hand-picked OSM point a person entered, and
 * the name attach that links plan items to it. Synthetic fixture (obviously fake names and coordinates).
 *
 *   AE1 enter: the point is written once under 'admin:<type>/<id>' with who entered it, when it was checked, its basis
 *       and the reviewer's note, credited; a second enter writes nothing; the batch's own 'osm:…' row is never touched
 *   AE2 attach: an item with an OSM link takes the admin point; the old link is written to the review table
 *       (`replaced_by_admin`, restorable) first; the item now routes through the admin point (origin 'admin')
 *   AE3 a second attach is refused (`already_admin`); a point that is not entered is refused (`no_point`)
 *   AE4 the review planner never pulls a link a person attached
 *   AE5 Ask 7b's interim rule: an item attached to a path's START routes the leg arriving at it, and the leg leaving it
 *       is not routed (reported as not checked)
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_lg2_admin_entry";
const { db } = await import("../db");
const review = await import("../services/routing/open-coord-review.service");
const { enterAdminOsmPoint, enteredAdminPointIds, openCoordsForItemIds } = await import("../services/routing/open-place-coords.service");
const { loadPlanLegContext } = await import("../services/routing/plan-legs-engine.service");
const { storage } = await import("../storage");
const { adminPointId } = await import("@shared/admin-osm-points");
import type { AdmittedPoint } from "@shared/admin-osm-points";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `ae-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");
const OSM_BASE = 8_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
const SETTING = review.OPEN_COORD_MAX_DRIFT_SETTING;
let savedSetting: string | null = null;

const point = (n: number, place: string, lat: number, lng: number, pointBasis = "entrance"): AdmittedPoint => ({
  place,
  osmType: "node",
  osmId: OSM_BASE + n,
  lat,
  lng,
  pointBasis,
  nameJa: null,
  note: "synthetic fixture",
  reviewedBy: "Reviewer",
  approved: "yes",
});
const P_ENTRANCE = point(1, "Stop A", 10.0, 10.0);
const P_PATH = point(2, "Stop B Path", 10.01, 10.01, "path_start");
const P_UNENTERED = point(3, "Stop Z", 10.05, 10.05);

const item = (k: string, title: string, order: number, lat: number | null, lng: number | null) =>
  db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
    VALUES (${id(k)}, ${TRIP}, ${title}, 'activity', 1, ${order}, ${lat == null ? null : String(lat)}, ${lng == null ? null : String(lng)}, 'traveler')`);

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error(`refusing ${host}`);
  const prev: any = ((await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${SETTING}`)) as any).rows[0];
  savedSetting = prev?.setting_value ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${SETTING}, '500', now())
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = '500'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'AE', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status)
    VALUES (${TRIP}, ${owner}, 'AE', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-11', 'draft')`);
  await item("a", "Stop A", 0, 10.0, 10.0);
  await item("b", "Stop B Path", 1, 10.01, 10.01);
  await item("c", "Stop C", 2, 10.02, 10.02);
  // Item A starts with a batch OSM link to a different (wrongly named) place.
  await db.execute(sql`INSERT INTO open_place_coords (id, source, osm_type, osm_id, lat, lng, name, matched_by, attribution, matched_at)
    VALUES (${`osm:node/${OSM_BASE + 9}`}, 'osm', 'node', ${OSM_BASE + 9}, '10.0', '10.0', 'Stop A Annex', 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  await db.execute(sql`INSERT INTO itinerary_item_open_coords (item_id, open_coord_id, source, matched_at) VALUES (${id("a")}, ${`osm:node/${OSM_BASE + 9}`}, 'osm', now())`);
  // Item C has its own batch link, so it is located for routing.
  await db.execute(sql`INSERT INTO open_place_coords (id, source, osm_type, osm_id, lat, lng, name, matched_by, attribution, matched_at)
    VALUES (${`osm:node/${OSM_BASE + 8}`}, 'osm', 'node', ${OSM_BASE + 8}, '10.02', '10.02', 'Stop C', 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  await db.execute(sql`INSERT INTO itinerary_item_open_coords (item_id, open_coord_id, source, matched_at) VALUES (${id("c")}, ${`osm:node/${OSM_BASE + 8}`}, 'osm', now())`);
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_item_open_coords_review WHERE item_id LIKE ${`ae-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM open_place_coords WHERE osm_id BETWEEN ${OSM_BASE} AND ${OSM_BASE + 9}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  if (savedSetting == null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${SETTING}`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${savedSetting} WHERE setting_key = ${SETTING}`);
});

test("AE1 a point is entered once under its admin id, with who, when, basis and note; the batch row is untouched", async () => {
  const checked = new Date("2026-10-18T00:00:00Z");
  const r = await enterAdminOsmPoint(P_ENTRANCE, "Operator", checked);
  assert.deepEqual(r, { entered: true, id: adminPointId(P_ENTRANCE) });
  assert.equal((await enterAdminOsmPoint(P_PATH, "Operator", checked)).entered, true);
  const again = await enterAdminOsmPoint(P_ENTRANCE, "Someone else", checked);
  assert.equal(again.entered, false, "insert-once — never overwritten");
  const row: any = ((await db.execute(sql`SELECT * FROM open_place_coords WHERE id = ${adminPointId(P_ENTRANCE)}`)) as any).rows[0];
  assert.equal(row.source, "admin");
  assert.equal(row.entered_by, "Operator");
  assert.equal(new Date(row.checked_at).toISOString().slice(0, 10), "2026-10-18");
  assert.equal(row.point_basis, "entrance");
  assert.match(row.note, /synthetic fixture — reviewed by Reviewer; approved yes/);
  assert.equal(row.attribution, "© OpenStreetMap contributors");
  const batch: any = ((await db.execute(sql`SELECT source, entered_by, point_basis FROM open_place_coords WHERE id = ${`osm:node/${OSM_BASE + 9}`}`)) as any).rows[0];
  assert.deepEqual({ ...batch }, { source: "osm", entered_by: null, point_basis: null });
  assert.deepEqual(Array.from(await enteredAdminPointIds([adminPointId(P_ENTRANCE), adminPointId(P_UNENTERED)])), [adminPointId(P_ENTRANCE)]);
});

test("AE2 attach replaces an OSM link only after writing it to the review table; the item routes via the admin point", async () => {
  const r = await review.attachAdminPointToItem(id("a"), adminPointId(P_ENTRANCE), "Operator");
  assert.deepEqual(r, { attached: true, replaced: `osm:node/${OSM_BASE + 9}` });
  const rev: any[] = ((await db.execute(sql`SELECT reason, open_coord_id, link_source, removed_by, restored_at FROM itinerary_item_open_coords_review WHERE item_id = ${id("a")}`)) as any).rows;
  assert.equal(rev.length, 1);
  assert.deepEqual({ ...rev[0] }, { reason: "replaced_by_admin", open_coord_id: `osm:node/${OSM_BASE + 9}`, link_source: "osm", removed_by: "Operator", restored_at: null });
  const open = await openCoordsForItemIds([id("a")]);
  assert.equal(open.get(id("a"))?.origin, "admin");
  assert.equal(open.get(id("a"))?.linkSource, "admin");
  assert.equal(open.get(id("a"))?.pointBasis, "entrance");
  const kept: any = ((await db.execute(sql`SELECT count(*)::int AS n FROM open_place_coords WHERE id = ${`osm:node/${OSM_BASE + 9}`}`)) as any).rows[0];
  assert.equal(kept.n, 1, "the replaced open place is never deleted");
});

test("AE3 a second attach is refused; an unentered point is refused", async () => {
  assert.deepEqual(await review.attachAdminPointToItem(id("a"), adminPointId(P_ENTRANCE), "Operator"), { attached: false, replaced: null, reason: "already_admin" });
  assert.deepEqual(await review.attachAdminPointToItem(id("c"), adminPointId(P_UNENTERED), "Operator"), { attached: false, replaced: null, reason: "no_point" });
  assert.deepEqual(await review.attachAdminPointToItem(id("c"), `osm:node/${OSM_BASE + 8}`, "Operator"), { attached: false, replaced: null, reason: "no_point" }, "only an admin row may be attached this way");
});

test("AE4 the review planner never pulls a link a person attached", async () => {
  // Item A's title ("Stop A") and the admin point's name agree, so give it a second item whose name does not.
  await db.execute(sql`UPDATE itinerary_items SET title = 'Unrelated title' WHERE id = ${id("a")}`);
  const plan = await review.planOpenCoordReview(500);
  assert.equal(plan.pull.some((p) => p.itemId === id("a")), false);
  await db.execute(sql`UPDATE itinerary_items SET title = 'Stop A' WHERE id = ${id("a")}`);
});

test("AE5 a path entered at its start: the leg arriving routes, the leg leaving is not routed", async () => {
  assert.equal((await review.attachAdminPointToItem(id("b"), adminPointId(P_PATH), "Operator")).attached, true);
  const trip = await storage.getTrip(TRIP);
  const ctx = await loadPlanLegContext(TRIP, trip!, { acceptsPoint: () => true });
  const pairs = ctx.desired.map((l: any) => `${l.from.id}>${l.to.id}`);
  assert.ok(pairs.includes(`${id("a")}>${id("b")}`), "the leg arriving at the path's start is routed");
  assert.equal(pairs.includes(`${id("b")}>${id("c")}`), false, "the leg leaving the path is not routed");
  assert.equal(pairs.includes(`${id("a")}>${id("c")}`), false, "never bridged");
  assert.ok(ctx.skipped.some((s: any) => s.fromItemId === id("b") && s.toItemId === id("c")), "reported, so it reads as not checked");
});
