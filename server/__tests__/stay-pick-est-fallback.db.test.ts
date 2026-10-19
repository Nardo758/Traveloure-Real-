/**
 * Decision-maker, Oct 18, 2026 (ledger `2026-10-18-stay-pick-est-fallback`): a PAID plan with no pick it may show
 * shows the free straight-line top 3 marked "est.", never an empty card; a stored Google-ranked pick (no `router` —
 * every pick written before #1536) is never shown or linked, and its row stays until a later "delete approved".
 *
 *   EF1 a paid plan with no stored pick ⇒ the straight-line top 3, `estimated: true`
 *   EF2 a paid plan with a Google-ranked pick ⇒ the same estimate; the stored row is untouched
 *   EF3 a paid plan with an OSRM-ranked pick ⇒ the routed pick, as before
 *   EF4 a free plan ⇒ the straight-line top 3 with no `estimated` mark
 *   EF5 the writer: a Google-ranked pick with the SAME stops is no "unchanged" — the next OSRM score replaces it,
 *       as a first pick (not "changed"), with `router: "osrm"`
 *   EF6 counts only: the read makes no Maps call and stores nothing
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards. The router is a fake.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { computeStayPick, type StayRouteRow } from "../services/stay-pick.service";
import { loadWhereToStay } from "../services/where-to-stay.service";
import { pickedStayLink } from "../services/stay-link.service";
import { readStayPick, stayPickIsShown } from "@shared/stay-pick";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `sef-${RUN}-${k}`;
const CITY = `Estville${RUN}`;
const ids = { owner: id("owner"), free: id("free"), none: id("none"), google: id("google"), osrm: id("osrm") };
const CENTRE = { lat: 35.0, lng: 135.78 };
const STOPS = [
  { day: 1, lat: 35.001, lng: 135.781 },
  { day: 2, lat: 34.999, lng: 135.779 },
  { day: 3, lat: 35.002, lng: 135.782 },
];
const hotel = (i: number) => ({ id: id(`h${i}`), lat: 35.0 + i * 0.0005, lng: 135.78 + i * 0.0005 });
const HOTELS = 5;
const pid = (t: string, n: number) => `${t}-p${n}`;
const OPEN_HOTELS = (c: { lat: number; lng: number }) => ({ lat: c.lat, lng: c.lng, coordOrigin: "admin" as const });
const fakeRouter: StayRouteRow = async (origin, destinations) => destinations.map((d) => 5 + Math.round(Math.hypot(origin.lat - d.lat, origin.lng - d.lng) * 10000));

const googlePick = (hotelId: string) => ({
  hotelId,
  hotelKind: "hotel_cache",
  scoredCount: 3,
  candidateCount: 5,
  stopsHash: "3-google",
  computedAt: "2026-10-01T00:00:00.000Z",
  tier: "routed",
  changed: false,
});

async function rawPick(tripId: string): Promise<unknown> {
  const r: any = await db.execute(sql`SELECT stay_pick FROM trips WHERE id = ${tripId}`);
  return (r.rows ?? r)[0]?.stay_pick ?? null;
}
const usage = async () => Number(((await db.execute(sql`SELECT count(*)::int AS n FROM api_usage_logs WHERE endpoint = 'route_matrix'`)) as any).rows[0].n);

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ids.owner}, ${`${ids.owner}@t.test`}, 'EF', 'Fixture', 'user')`);
  await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
    VALUES (${id("n")}, ${CITY}, 'Japan', 'Centre', ${id("centre")}, ${CENTRE.lat}, ${CENTRE.lng})`);
  const expires = new Date(Date.now() + 30 * 86_400_000);
  for (let i = 0; i < HOTELS; i++) {
    const h = hotel(i);
    await db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, name, latitude, longitude, city, expires_at)
      VALUES (${h.id}, ${h.id}, 'EFT', ${`Est Hotel ${i}`}, ${h.lat}, ${h.lng}, ${CITY}, ${expires})`);
  }
  for (const t of Object.values(ids).filter((x) => x !== ids.owner)) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
      VALUES (${t}, ${ids.owner}, 'EF plan', ${`${CITY}, Japan`}, '2027-05-01', '2027-05-03', 'planning')`);
    let n = 0;
    for (const s of STOPS) {
      await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, item_type, latitude, longitude, origin, google_place_id)
        VALUES (${`${t}-i${n}`}, ${t}, 'Stop', ${s.day}, 'activity', ${s.lat}, ${s.lng}, 'traveler', ${pid(t, n)})`);
      await db.execute(sql`INSERT INTO open_place_coords (id, source, google_place_id, lat, lng, osm_type, osm_id, name, matched_by, attribution)
        VALUES ('osm:node/' || ${pid(t, n)}, 'osm', ${pid(t, n)}, ${s.lat}, ${s.lng}, 'node', ${2000 + n}, 'Stop', 'nominatim_batch', '© OpenStreetMap contributors')`);
      n++;
    }
    if (t !== ids.free) {
      await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${t}-pass`}, ${t}, 'trip_pass', 'active', 'manual')`);
    }
  }
  await db.execute(sql`UPDATE trips SET stay_pick = ${JSON.stringify(googlePick(hotel(0).id))}::jsonb WHERE id = ${ids.google}`);
  await db.execute(sql`UPDATE trips SET stay_pick = ${JSON.stringify({ ...googlePick(hotel(1).id), router: "osrm" })}::jsonb WHERE id = ${ids.osrm}`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`sef-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${`sef-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE id LIKE ${`sef-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM open_place_coords WHERE google_place_id LIKE ${`sef-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`sef-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

test("EF1 a paid plan with no stored pick ⇒ the straight-line top 3, marked estimated", async () => {
  const view = await loadWhereToStay(ids.none, ids.owner);
  assert.ok(view.stay && view.stay.tier === "straight_line", "never an empty routed card");
  assert.equal(view.stay.estimated, true);
  assert.ok(view.stay.hotels.length > 0 && view.stay.hotels.length <= 3);
});

test("EF2 a paid plan with a Google-ranked pick ⇒ the estimate; the stored row is untouched", async () => {
  const before = await rawPick(ids.google);
  const view = await loadWhereToStay(ids.google, ids.owner);
  assert.ok(view.stay && view.stay.tier === "straight_line");
  assert.equal(view.stay.estimated, true);
  assert.deepEqual(await rawPick(ids.google), before, "the row stays until a later delete approved");
  assert.equal(stayPickIsShown(readStayPick(before)), false);
  assert.deepEqual(await pickedStayLink(ids.google, ids.owner, { routed: async () => true }), { stayLink: null }, "never linked either");
});

test("EF3 a paid plan with an OSRM-ranked pick ⇒ the routed pick", async () => {
  const view = await loadWhereToStay(ids.osrm, ids.owner);
  assert.ok(view.stay && view.stay.tier === "routed");
  assert.equal(view.stay.pick?.id, hotel(1).id);
});

test("EF4 a free plan ⇒ the straight-line top 3 with no estimated mark", async () => {
  const view = await loadWhereToStay(ids.free, ids.owner);
  assert.ok(view.stay && view.stay.tier === "straight_line");
  assert.equal((view.stay as any).estimated, undefined);
});

test("EF5 the writer replaces a Google-ranked pick with the same stops, as a first pick, router osrm", async () => {
  const first = await computeStayPick(ids.google, { routeRow: fakeRouter, openPointOf: OPEN_HOTELS });
  assert.ok("written" in first);
  // Make the stored pick Google-ranked again with the SAME stops hash: it is still no basis for "unchanged".
  await db.execute(sql`UPDATE trips SET stay_pick = stay_pick - 'router' WHERE id = ${ids.google}`);
  const again = await computeStayPick(ids.google, { routeRow: fakeRouter, openPointOf: OPEN_HOTELS });
  assert.ok("written" in again, "a Google-ranked pick never makes the plan unchanged");
  assert.equal(again.written.router, "osrm");
  assert.equal(again.written.changed, false, "replacing a hidden pick is a first pick, not a change");
  const view = await loadWhereToStay(ids.google, ids.owner);
  assert.ok(view.stay && view.stay.tier === "routed");
});

test("EF6 counts only: the fallback read makes no Maps call and stores nothing", async () => {
  const n0 = await usage();
  const before = await rawPick(ids.none);
  await loadWhereToStay(ids.none, ids.owner);
  assert.equal(await usage(), n0);
  assert.deepEqual(await rawPick(ids.none), before);
});
