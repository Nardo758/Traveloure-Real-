/**
 * LG-2 Ask 1 (ledger `2026-10-18-lg2-open-coord-review`; migration 391): open coordinates that cannot be trusted are
 * moved out of routing into `open_coord_review`, never deleted.
 *
 *   RV1 names: a ward/city, a spine neighbourhood and a street are pulled whatever their distance; a temple is not
 *   RV2 drift: a row farther than open_coord_max_drift_m from an item it stands for is pulled; one within it is not;
 *       the setting is read from platform_settings, and its absence is a refusal (null), never a default
 *   RV3 the move: the row and its links leave the live tables in one transaction; the review row holds both verbatim;
 *       the item no longer resolves an open coordinate; a second move of the same row writes nothing
 *   RV4 restore: the row and its link come back once; a second restore is refused and changes nothing
 *   RV5 a row that is neither a kind nor too far stays where it is
 *
 * NEGATIVE SPACE (§18d): the kinds are read from the row's name — `open_place_coords` stores no OSM class — so a ward
 * named without its suffix is not caught by name; it is caught only by drift.
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_lg2_review";
const { db } = await import("../db");
const svc = await import("../services/routing/open-coord-review.service");
const { openCoordsForItemIds } = await import("../services/routing/open-place-coords.service");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `rv-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");
const NBHD = `Rvnbhd${RUN}`;
const SETTING = svc.OPEN_COORD_MAX_DRIFT_SETTING;
const OSM_BASE = 9_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
const ITEM = { lat: 35.0037, lng: 135.7788 };
let savedSetting: string | null = null;

const insertOpen = (n: number, name: string, lat: number, lng: number) =>
  db.execute(sql`INSERT INTO open_place_coords (id, source, osm_type, osm_id, lat, lng, name, matched_by, attribution, matched_at)
    VALUES (${`osm:node/${OSM_BASE + n}`}, 'osm', 'node', ${OSM_BASE + n}, ${String(lat)}, ${String(lng)}, ${name}, 'nominatim_batch', '© OpenStreetMap contributors', now())`);
const link = (item: string, n: number) =>
  db.execute(sql`INSERT INTO itinerary_item_open_coords (item_id, open_coord_id, source, matched_at) VALUES (${id(item)}, ${`osm:node/${OSM_BASE + n}`}, 'osm', now())`);
const openId = (n: number) => `osm:node/${OSM_BASE + n}`;
const liveRow = async (n: number) => ((await db.execute(sql`SELECT id FROM open_place_coords WHERE id = ${openId(n)}`)) as any).rows.length;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error(`refusing ${host}`);
  const prev: any = ((await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${SETTING}`)) as any).rows[0];
  savedSetting = prev?.setting_value ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${SETTING}, '500', now())
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = '500'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'RV', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status)
    VALUES (${TRIP}, ${owner}, 'RV', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-11', 'draft')`);
  for (const k of ["far", "near", "ward"]) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
      VALUES (${id(k)}, ${TRIP}, ${`Stop ${k}`}, 'activity', 1, 0, ${String(ITEM.lat)}, ${String(ITEM.lng)}, 'traveler')`);
  }
  await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
    VALUES (${id("nb")}, 'Kyoto', 'Japan', ${NBHD}, ${id("nb-slug")}, '35.0', '135.77')`);
  await insertOpen(1, "Higashiyama Ward", ITEM.lat, ITEM.lng); // admin, at the item
  await insertOpen(2, NBHD, ITEM.lat, ITEM.lng); // neighbourhood, at the item
  await insertOpen(3, "Hanamikoji-dori", ITEM.lat, ITEM.lng); // street, at the item
  await insertOpen(4, "Kiyomizu-dera", 35.0137, 135.7788); // ~1.1 km north of its item: drift
  await insertOpen(5, "Kennin-ji", 35.0047, 135.7788); // ~110 m from its item: stays
  await link("ward", 1);
  await link("far", 4);
  await link("near", 5);
});

after(async () => {
  await db.execute(sql`DELETE FROM open_coord_review WHERE open_coord_id IN (${openId(1)}, ${openId(2)}, ${openId(3)}, ${openId(4)}, ${openId(5)})`);
  await db.execute(sql`DELETE FROM open_place_coords WHERE osm_id BETWEEN ${OSM_BASE} AND ${OSM_BASE + 9}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE id = ${id("nb")}`);
  if (savedSetting == null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${SETTING}`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${savedSetting} WHERE setting_key = ${SETTING}`);
});

test("RV1 a ward, a spine neighbourhood and a street are pulled whatever the distance; a temple is not", () => {
  const spine = new Set([svc.foldName("Gion")]);
  assert.equal(svc.kindFromName("Higashiyama-ku", spine), "admin");
  assert.equal(svc.kindFromName("Kyoto City", spine), "admin");
  assert.equal(svc.kindFromName("東山区", spine), "admin");
  assert.equal(svc.kindFromName("Gion", spine), "neighbourhood");
  assert.equal(svc.kindFromName("Hanamikōji Dōri", spine), "street");
  assert.equal(svc.kindFromName("Shijo-dori", spine), "street");
  assert.equal(svc.kindFromName("Nishiki Market", spine), null);
  assert.equal(svc.kindFromName("Kiyomizu-dera", spine), null);
  const at = svc.classifyOpenCoordRow({ id: "x", name: "Higashiyama Ward", lat: 35, lng: 135, itemPoints: [{ lat: 35, lng: 135 }] }, spine, 500);
  assert.deepEqual(at, { reason: "admin", driftM: 0 }, "pulled at zero distance");
});

test("RV2 drift beyond the admin setting is pulled, within it is not; no setting is a refusal", async () => {
  assert.equal(await svc.loadMaxDriftM(), 500);
  const far = svc.classifyOpenCoordRow({ id: "a", name: "Kiyomizu-dera", lat: 35.0137, lng: 135.7788, itemPoints: [ITEM] }, new Set(), 500);
  assert.equal(far.reason, "drift");
  assert.ok(far.driftM! > 1000 && far.driftM! < 1200);
  const near = svc.classifyOpenCoordRow({ id: "b", name: "Kennin-ji", lat: 35.0047, lng: 135.7788, itemPoints: [ITEM] }, new Set(), 500);
  assert.deepEqual(near.reason, null);
  const none = svc.classifyOpenCoordRow({ id: "c", name: "Kennin-ji", lat: 36, lng: 136, itemPoints: [] }, new Set(), 500);
  assert.deepEqual(none, { reason: null, driftM: null }, "no item point: drift is unmeasurable, not zero");
  await db.execute(sql`UPDATE platform_settings SET setting_value = 'abc' WHERE setting_key = ${SETTING}`);
  assert.equal(await svc.loadMaxDriftM(), null);
  await db.execute(sql`UPDATE platform_settings SET setting_value = '500' WHERE setting_key = ${SETTING}`);

  const { pull } = await svc.planOpenCoordReview(500);
  const ours = new Set([1, 2, 3, 4, 5].map(openId));
  const mine = new Map(pull.filter((p) => ours.has(p.id)).map((p) => [p.id, p.reason]));
  assert.deepEqual(Object.fromEntries(mine), { [openId(1)]: "admin", [openId(2)]: "neighbourhood", [openId(3)]: "street", [openId(4)]: "drift" });
});

test("RV3 the move takes the row and its links out of routing in one go and keeps both verbatim", async () => {
  const r = await svc.moveOpenCoordToReview({ id: openId(4), reason: "drift", driftM: 1112 }, "rv-test");
  assert.equal(r.moved, true);
  assert.equal(r.links, 1);
  assert.equal(await liveRow(4), 0);
  assert.equal((await openCoordsForItemIds([id("far")])).size, 0, "the item no longer routes from it");
  const rev: any = ((await db.execute(sql`SELECT * FROM open_coord_review WHERE id = ${r.reviewId}`)) as any).rows[0];
  assert.deepEqual([rev.reason, rev.drift_m, rev.open_row.name, rev.item_links.length, rev.item_links[0].itemId], ["drift", 1112, "Kiyomizu-dera", 1, id("far")]);
  const again = await svc.moveOpenCoordToReview({ id: openId(4), reason: "drift", driftM: 1112 }, "rv-test");
  assert.deepEqual(again, { moved: false, links: 0, reviewId: null });
  (globalThis as any).__rvReview = r.reviewId;
});

test("RV4 restore puts the row and its link back once", async () => {
  const reviewId = (globalThis as any).__rvReview as string;
  const r = await svc.restoreOpenCoordReview(reviewId, "rv-test");
  assert.deepEqual(r, { restored: true, rowRestored: true, linksRestored: 1 });
  assert.equal(await liveRow(4), 1);
  assert.equal((await openCoordsForItemIds([id("far")])).get(id("far"))?.lat, 35.0137);
  assert.deepEqual(await svc.restoreOpenCoordReview(reviewId, "rv-test"), { restored: false, rowRestored: false, linksRestored: 0, reason: "already_restored" });
  assert.equal((await svc.restoreOpenCoordReview("rev_nope", "rv-test")).reason, "not_found");
});

test("RV5 a row that is neither a kind nor too far stays", async () => {
  const { pull } = await svc.planOpenCoordReview(500);
  assert.equal(pull.some((p) => p.id === openId(5)), false);
  assert.equal(await liveRow(5), 1);
  assert.equal((await openCoordsForItemIds([id("near")])).size, 1);
});
