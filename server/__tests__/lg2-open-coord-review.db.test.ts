/**
 * LG-2 Ask 1 (ledger `2026-10-18-lg2-open-coord-review`; migration 391): item → open place links that cannot be trusted
 * are pulled out of routing into `itinerary_item_open_coords_review`. The open place is never moved.
 *
 *   RV1 the rules: a ward/city, a spine neighbourhood and a street are pulled at any distance; names that do not contain
 *       one another are pulled; a link beyond open_coord_max_drift_m is pulled; a good link is not; no item point gives
 *       no distance (never zero)
 *   RV2 the setting is read from platform_settings, and its absence is a refusal (null), never a default; the planner
 *       finds exactly the flagged links
 *   RV3 the pull: the link leaves routing in one transaction; the review row holds item, place, OSM type/id, display
 *       name, the item's stored point, distance, reason and removed_at; open_place_coords is untouched; the item does
 *       not fall back to the same place through its Google place id; a second pull writes nothing
 *   RV4 restore: the link comes back once; a second restore is refused; a restored pair is not pulled again
 *   RV5 a good link stays and keeps routing
 *
 * NEGATIVE SPACE (§18d): the kinds are read from the place's name — `open_place_coords` stores no OSM class — so a ward
 * named without its suffix is caught only by containment or distance.
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
const { openCoordsForItemIds, openCoordsForPlaceIds } = await import("../services/routing/open-place-coords.service");
const { openPointsForItems } = await import("../services/routing/plan-legs-engine.service");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `rv-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");
const NBHD = `Rvnbhd${RUN}`;
const SETTING = svc.OPEN_COORD_MAX_DRIFT_SETTING;
const OSM_BASE = 9_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
const ITEM = { lat: 35.0037, lng: 135.7788 };
const PID_FAR = `ChIJ-rv-${RUN}-far`;
let savedSetting: string | null = null;

const openId = (n: number) => `osm:node/${OSM_BASE + n}`;
const insertOpen = (n: number, name: string, lat: number, lng: number, placeId: string | null = null) =>
  db.execute(sql`INSERT INTO open_place_coords (id, source, osm_type, osm_id, lat, lng, name, google_place_id, matched_by, attribution, matched_at)
    VALUES (${openId(n)}, 'osm', 'node', ${OSM_BASE + n}, ${String(lat)}, ${String(lng)}, ${name}, ${placeId}, 'nominatim_batch', '© OpenStreetMap contributors', now())`);
const link = (item: string, n: number) =>
  db.execute(sql`INSERT INTO itinerary_item_open_coords (item_id, open_coord_id, source, matched_at) VALUES (${id(item)}, ${openId(n)}, 'osm', now())`);
const item = (k: string, title: string, placeId: string | null = null) =>
  db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin, google_place_id)
    VALUES (${id(k)}, ${TRIP}, ${title}, 'activity', 1, 0, ${String(ITEM.lat)}, ${String(ITEM.lng)}, 'traveler', ${placeId})`);

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
  await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
    VALUES (${id("nb")}, 'Kyoto', 'Japan', ${NBHD}, ${id("nb-slug")}, '35.0', '135.77')`);
  await item("ward", "Higashiyama Ward walk");
  await item("nbhd", `${NBHD} evening`);
  await item("street", "Hanamikoji-dori stroll");
  await item("mismatch", "Kinkaku-ji");
  await item("far", "Kiyomizu-dera", PID_FAR);
  await item("near", "Kennin-ji temple");
  await insertOpen(1, "Higashiyama Ward", ITEM.lat, ITEM.lng);
  await insertOpen(2, NBHD, ITEM.lat, ITEM.lng);
  await insertOpen(3, "Hanamikoji-dori", ITEM.lat, ITEM.lng);
  await insertOpen(4, "Ginkaku-ji", ITEM.lat, ITEM.lng);
  await insertOpen(5, "Kiyomizu-dera", 35.0137, 135.7788, PID_FAR); // ~1.1 km north, carries the item's place id
  await insertOpen(6, "Kennin-ji", 35.0047, 135.7788); // ~110 m
  await link("ward", 1);
  await link("nbhd", 2);
  await link("street", 3);
  await link("mismatch", 4);
  await link("far", 5);
  await link("near", 6);
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_item_open_coords_review WHERE item_id LIKE ${`rv-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM open_place_coords WHERE osm_id BETWEEN ${OSM_BASE} AND ${OSM_BASE + 9}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE id = ${id("nb")}`);
  if (savedSetting == null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${SETTING}`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${savedSetting} WHERE setting_key = ${SETTING}`);
});

test("RV1 the rules: kinds at any distance, name containment, drift, and a good link", () => {
  const spine = new Set([svc.foldName("Gion")]);
  assert.equal(svc.kindFromName("Higashiyama-ku", spine), "admin");
  assert.equal(svc.kindFromName("東山区", spine), "admin");
  assert.equal(svc.kindFromName("Gion", spine), "neighbourhood");
  assert.equal(svc.kindFromName("Hanamikōji Dōri", spine), "street");
  assert.equal(svc.kindFromName("Kiyomizu-dera", spine), null);
  assert.equal(svc.namesContainEachOther("Kinkaku-ji", ["Visit Kinkaku-ji", null]), true);
  assert.equal(svc.namesContainEachOther("Fushimi Inari Taisha, Kyoto", ["Fushimi Inari Taisha"]), true);
  assert.equal(svc.namesContainEachOther("Nishiki Market (錦市場)", ["Lunch", "Nishiki Market"]), true);
  assert.equal(svc.namesContainEachOther("Ginkaku-ji", ["Kinkaku-ji", null]), false);
  const base = { displayName: "Kennin-ji", placeLat: 35, placeLng: 135, itemTitle: "Kennin-ji temple", itemLocationName: null, itemLat: 35, itemLng: 135 };
  assert.deepEqual(svc.classifyOpenCoordLink({ ...base, displayName: "Higashiyama Ward", itemTitle: "Higashiyama Ward walk" }, spine, 500), { reason: "admin", distanceM: 0 });
  assert.equal(svc.classifyOpenCoordLink({ ...base, displayName: "Ginkaku-ji" }, spine, 500).reason, "name_mismatch");
  const far = svc.classifyOpenCoordLink({ ...base, placeLat: 35.01 }, spine, 500);
  assert.equal(far.reason, "drift");
  assert.ok(far.distanceM! > 1000 && far.distanceM! < 1200);
  assert.deepEqual(svc.classifyOpenCoordLink(base, spine, 500), { reason: null, distanceM: 0 });
  assert.deepEqual(svc.classifyOpenCoordLink({ ...base, itemLat: null, itemLng: null }, spine, 500), { reason: null, distanceM: null });
});

test("RV2 the setting has no fallback; the planner finds exactly the flagged links", async () => {
  assert.equal(await svc.loadMaxDriftM(), 500);
  await db.execute(sql`UPDATE platform_settings SET setting_value = 'abc' WHERE setting_key = ${SETTING}`);
  assert.equal(await svc.loadMaxDriftM(), null);
  await db.execute(sql`UPDATE platform_settings SET setting_value = '500' WHERE setting_key = ${SETTING}`);
  const { pull } = await svc.planOpenCoordReview(500);
  const mine = Object.fromEntries(pull.filter((p) => p.itemId.startsWith(`rv-${RUN}-`)).map((p) => [p.itemId, p.reason]));
  assert.deepEqual(mine, { [id("ward")]: "admin", [id("nbhd")]: "neighbourhood", [id("street")]: "street", [id("mismatch")]: "name_mismatch", [id("far")]: "drift" });
});

test("RV3 a pulled link leaves routing; the place stays; the item does not come back by its place id", async () => {
  // Before: the item routes from the far place, by its link and by its place id.
  assert.equal((await openCoordsForPlaceIds([PID_FAR])).get(PID_FAR)?.lat, 35.0137);
  const plan = (await svc.planOpenCoordReview(500)).pull.find((p) => p.itemId === id("far"))!;
  const r = await svc.pullOpenCoordLink(plan, "rv-test");
  assert.equal(r.pulled, true);
  assert.equal((await openCoordsForItemIds([id("far")])).size, 0, "the link is gone");
  const placeRows: any[] = ((await db.execute(sql`SELECT id FROM open_place_coords WHERE id = ${openId(5)}`)) as any).rows;
  assert.equal(placeRows.length, 1, "open_place_coords is never moved");
  const pts = await openPointsForItems(TRIP, [{ id: id("far"), googlePlaceId: PID_FAR, latitude: String(ITEM.lat), longitude: String(ITEM.lng), origin: "traveler" }]);
  assert.equal(pts.has(id("far")), false, "no fallback to the same place through the Google place id");
  const rev: any = ((await db.execute(sql`SELECT * FROM itinerary_item_open_coords_review WHERE id = ${r.reviewId}`)) as any).rows[0];
  assert.deepEqual(
    [rev.item_id, rev.open_coord_id, rev.osm_type, Number(rev.osm_id), rev.display_name, Number(rev.item_lat), Number(rev.item_lng), rev.reason, rev.link_source, !!rev.removed_at, rev.restored_at],
    [id("far"), openId(5), "node", OSM_BASE + 5, "Kiyomizu-dera", ITEM.lat, ITEM.lng, "drift", "osm", true, null],
  );
  assert.ok(rev.distance_m > 1000);
  assert.deepEqual(await svc.pullOpenCoordLink(plan, "rv-test"), { pulled: false, reviewId: null });
  (globalThis as any).__rvReview = r.reviewId;
});

test("RV4 a checked link is restored once and is not pulled again", async () => {
  const reviewId = (globalThis as any).__rvReview as string;
  assert.deepEqual(await svc.restoreOpenCoordLink(reviewId, "rv-test"), { restored: true, linkRestored: true });
  assert.equal((await openCoordsForItemIds([id("far")])).get(id("far"))?.lat, 35.0137);
  assert.deepEqual(await svc.restoreOpenCoordLink(reviewId, "rv-test"), { restored: false, linkRestored: false, reason: "already_restored" });
  assert.equal((await svc.restoreOpenCoordLink("rev_nope", "rv-test")).reason, "not_found");
  const again = (await svc.planOpenCoordReview(500)).pull.some((p) => p.itemId === id("far"));
  assert.equal(again, false, "a person checked it; the same pair is not pulled again");
});

test("RV5 a good link stays and keeps routing", async () => {
  const { pull } = await svc.planOpenCoordReview(500);
  assert.equal(pull.some((p) => p.itemId === id("near")), false);
  assert.equal((await openCoordsForItemIds([id("near")])).size, 1);
});
