/**
 * TC-3 ride seed (migration 369; ledger `2026-10-11-tc3-ride-seed`; decision-maker rulings Oct 11, 2026).
 *
 *   RS1  the five seeded rides exist under Traveloure Transport: approved, active, booking_mode 'hidden',
 *        no price (no currency column — fares live in notes.fare as JPY), official_source set
 *   RS2  no entry, no value: every non-NULL fact column and every notes key has its fact_sources entry
 *        with an https url and a quote; NOT ON SITE facts stay NULL
 *   RS3  route points are located from the six OSM nodes, each with its node id and a fact_sources entry
 *        naming the node URL; osm_attribution TRUE
 *   RS4  departures: Sagano suspended days and the winter closure offer none; a running day offers the
 *        regular timetable only; Hozugawa weekday hourly, weekend one window, Dec 14–28 nothing; Eizan none
 *   RS5  hidden rides never reach browse: an ACTIVE approved ride fixture is absent from unifiedSearch,
 *        getAllActiveServices, the city view and the provider-services list, while an ordinary listing
 *        in the same city is present
 *   RS6  hidden rides never reach the cart: every seeded ride is refused as `listing_not_bookable`
 *   RS7  a seeded ride goes on a plan: Hozugawa at 10:00 on a weekday, boarding and exit pins from its OSM nodes
 *
 * DISPOSABLE DB ONLY. Reads the rows migration 369 seeded (CI applies every registered migration);
 * fixtures are keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import { locationViewService } from "../services/location-view.service";
import { withoutRideListings } from "../services/ride-listings";
import { rideDepartures, insertRide } from "../services/ride-item.service";
import { requestOnlyListingRefusals } from "../services/buy-action-payload";

const OPERATOR = "00000000-0000-4000-a000-00007472616e";
const SAGANO_DOWN = "00000000-0000-4000-c369-000000000001";
const SAGANO_UP = "00000000-0000-4000-c369-000000000002";
const HOZUGAWA = "00000000-0000-4000-c369-000000000003";
const EIZAN_DOWN = "00000000-0000-4000-c369-000000000004";
const EIZAN_UP = "00000000-0000-4000-c369-000000000005";
const RIDES = [SAGANO_DOWN, SAGANO_UP, HOZUGAWA, EIZAN_DOWN, EIZAN_UP];

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `rideseed-${RUN}-${k}`;
const CITY = `Ridetown${RUN}`;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, role) VALUES (${id("prov")}, ${`${id("prov")}@ride.invalid`}, 'RS', 'service_provider')`);
  for (const [k, name] of [["ride", `Gorge ride ${RUN}`], ["walk", `Harbour walk ${RUN}`]] as const) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, city, booking_mode)
      VALUES (${id(k)}, ${id("prov")}, ${name}, 'fixture', '35.00', 'active', 'approved', 'in_person', ${CITY}, ${k === "ride" ? "hidden" : "instant"})
    `);
  }
  await db.execute(sql`INSERT INTO service_transport_facts (service_id, official_source) VALUES (${id("ride")}, 'https://example.invalid/')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${id("plan")}, ${id("prov")}, 'RS7', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-10-15', '2026-10-15', 'draft', now())`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`rideseed-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${`rideseed-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`rideseed-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as any[];

test("RS1 the five rides are seeded under Traveloure Transport, approved, active and hidden", async () => {
  const [op] = await rows(sql`SELECT first_name, password, handle FROM users WHERE id = ${OPERATOR}`);
  assert.equal(op.first_name, "Traveloure Transport");
  assert.equal(op.password, null, "never a login");
  assert.equal(op.handle, null, "no handle, so no storefront");
  const svcs = await rows(sql`
    SELECT ps.id, ps.user_id, ps.status, ps.approval_status, ps.booking_mode, ps.price, ps.earliest_start_time, f.official_source
      FROM provider_services ps JOIN service_transport_facts f ON f.service_id = ps.id
     WHERE ps.id IN ${RIDES}`);
  assert.equal(svcs.length, 5);
  for (const s of svcs) {
    assert.equal(s.user_id, OPERATOR);
    assert.equal(s.approval_status, "approved");
    assert.equal(s.status, "active", "located, so live as a ride (never in browse — RS5)");
    assert.equal(s.booking_mode, "hidden");
    assert.equal(s.price, null, "no yen in a currency-less price column");
    assert.equal(s.earliest_start_time, null, "a date with no slots offers nothing");
    assert.match(s.official_source, /^https:\/\//);
  }
});

const FACT_COLUMNS = ["weather_rule", "weather_fallback_mode", "luggage_rule", "pass_validity", "payment_constraints", "official_link", "booking_window_days", "osm_attribution"] as const;

test("RS2 no entry, no value — every seeded fact names its source; NOT ON SITE stays NULL", async () => {
  const facts = await rows(sql`SELECT * FROM service_transport_facts WHERE service_id IN ${RIDES}`);
  for (const f of facts) {
    const src = f.fact_sources as Record<string, { url: string; quote: string }>;
    const keys = [...FACT_COLUMNS.filter((c) => f[c] !== null), ...Object.keys(f.notes ?? {}).map((k) => `notes.${k}`)];
    for (const k of keys) {
      assert.ok(src[k], `${f.service_id}: ${k} has a value but no fact_sources entry`);
      assert.match(src[k].url, /^https:\/\//, `${k} url`);
      assert.ok(src[k].quote && src[k].quote.length > 0, `${k} quote`);
    }
    for (const c of ["service_name", "duration_minutes"]) assert.ok(src[c], `${f.service_id}: ${c} source`);
    for (const k of Object.keys(src)) {
      if (k.startsWith("notes.")) assert.ok(k.slice(6) in (f.notes ?? {}), `${f.service_id}: source ${k} names no value`);
      else if ((FACT_COLUMNS as readonly string[]).includes(k)) assert.notEqual(f[k], null, `${f.service_id}: source ${k} names a NULL column`);
    }
    assert.equal(f.booking_window_days, null, "a calendar month is not a day count; it lives in notes");
  }
  const byId = Object.fromEntries(facts.map((f) => [f.service_id, f]));
  assert.equal(byId[HOZUGAWA].luggage_rule, null, "Hozugawa luggage: NOT ON SITE");
  assert.equal(byId[HOZUGAWA].weather_fallback_mode, "routed");
  assert.equal(byId[SAGANO_DOWN].weather_rule, null, "Sagano general weather rule: NOT ON SITE");
  assert.deepEqual(byId[SAGANO_DOWN].notes.fare, { currency: "JPY", adult: 880, child: 440, basis: "one-way regular fare, the same for any section", renderedAt: "2026-10-10T20:10-04:00" });
  assert.deepEqual(byId[HOZUGAWA].notes.duration.rangeMinutes, [60, 110]);
  assert.equal(byId[HOZUGAWA].notes.childMinHeightCm, 80);
  assert.equal(byId[HOZUGAWA].notes.pairing.bookMinutesAfterTrain, 60);
  assert.equal(byId[EIZAN_DOWN].official_link, null, "Eizan: no booking link");
  assert.equal(byId[SAGANO_DOWN].notes.extraTrains.trainNumberToTime, null);
  assert.deepEqual(byId[SAGANO_DOWN].notes.extraTrains.unconfirmed, ["2026-10-17", "2026-11-07", "2026-12-12", "2026-12-13", "2026-12-19", "2026-12-20"]);
});

const OSM: Record<string, [number, number, number]> = {
  "Torokko Saga Station": [12997335828, 35.0185888, 135.6807067],
  "Torokko Kameoka Station": [538973298, 35.0131065, 135.606831],
  "Hozugawa boat boarding (Kameoka)": [4174041189, 35.0175747, 135.5873099],
  "Arashiyama landing": [4539039690, 35.0135421, 135.6714667],
  "Demachiyanagi Station (Eizan)": [335671845, 35.0304955, 135.7732355],
  "Kurama Station": [7886699754, 35.112896, 135.772269],
};

test("RS3 every route point is located from its OSM node, and the node is cited", async () => {
  const pts = await rows(sql`SELECT service_id, position, name, latitude, longitude, osm_node_id FROM service_route_points WHERE service_id IN ${RIDES} ORDER BY service_id, position`);
  assert.equal(pts.length, 10);
  for (const p of pts) {
    const want = OSM[p.name];
    assert.ok(want, `${p.name} is one of the six read points`);
    assert.equal(Number(p.osm_node_id), want[0]);
    assert.equal(Number(p.latitude), want[1]);
    assert.equal(Number(p.longitude), want[2]);
  }
  const facts = await rows(sql`SELECT service_id, osm_attribution, fact_sources FROM service_transport_facts WHERE service_id IN ${RIDES}`);
  for (const f of facts) {
    assert.equal(f.osm_attribution, true);
    const nodeUrls = Object.entries(f.fact_sources as Record<string, any>).filter(([k]) => k.startsWith("route_point.")).map(([, v]) => v.url);
    const mine = pts.filter((p) => p.service_id === f.service_id);
    for (const p of mine) assert.ok(nodeUrls.includes(`https://www.openstreetmap.org/node/${Number(p.osm_node_id)}`), `${f.service_id}: ${p.name} node cited`);
  }
});

test("RS4 departures follow the calendar the read states, and nothing else", async () => {
  assert.deepEqual(await rideDepartures(SAGANO_DOWN, "2026-10-14"), [], "Oct 14 all trains suspended");
  assert.deepEqual(await rideDepartures(SAGANO_UP, "2026-12-30"), [], "winter closure");
  assert.deepEqual((await rideDepartures(SAGANO_DOWN, "2026-10-15")).sort(), ["09:02", "10:02", "11:02", "12:02", "13:02", "14:02", "15:02", "16:02"]);
  assert.deepEqual((await rideDepartures(SAGANO_UP, "2026-10-17")).sort(), ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30", "16:30"], "unconfirmed extra-train day: regular trains only");
  assert.deepEqual(await rideDepartures(SAGANO_DOWN, "2027-03-20"), [], "beyond the 2026 calendar: nothing");
  assert.deepEqual((await rideDepartures(HOZUGAWA, "2026-10-15")).sort(), ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
  assert.deepEqual(await rideDepartures(HOZUGAWA, "2026-10-17"), ["09:00"], "weekend: one window slot");
  const [win] = await rows(sql`SELECT end_time, capacity, special_requirements FROM vendor_availability_slots WHERE service_id = ${HOZUGAWA} AND date = '2026-10-17'`);
  assert.equal(win.end_time, "15:00");
  assert.equal(win.capacity, null);
  assert.match(JSON.stringify(win.special_requirements), /leave whenever they fill/);
  assert.deepEqual(await rideDepartures(HOZUGAWA, "2026-12-20"), [], "December winter times not stated");
  assert.deepEqual(await rideDepartures(HOZUGAWA, "2026-12-29"), [], "New Year closure");
  assert.deepEqual(await rideDepartures(EIZAN_DOWN, "2026-10-15"), [], "Eizan departures not seeded");
  const [{ n }] = await rows(sql`SELECT count(*)::int AS n FROM vendor_availability_slots WHERE service_id IN ${RIDES} AND minimum_notice IS NOT NULL`);
  assert.equal(n, 0, "no invented notice period");
});

test("RS5 a hidden ride never appears in browse; an ordinary listing beside it does", async () => {
  const search = await storage.unifiedSearch({ location: CITY, limit: 50 });
  assert.deepEqual(search.services.map((s) => s.id), [id("walk")]);
  const byName = await storage.unifiedSearch({ query: `Gorge ride ${RUN}`, limit: 50 });
  assert.equal(byName.services.some((s) => s.id === id("ride")), false, "not even by its own name");
  assert.notEqual(byName.suggestion, `Gorge ride ${RUN}`);
  assert.deepEqual((await storage.getAllActiveServices(undefined, CITY)).map((s) => s.id), [id("walk")]);
  const view = await locationViewService.getLocationView(CITY, null);
  assert.deepEqual((view.services.data ?? []).map((s: any) => s.id), [id("walk")]);
  assert.deepEqual((await withoutRideListings([{ id: id("ride") }, { id: id("walk") }], (r) => r.id)).map((r) => r.id), [id("walk")]);
});

test("RS6 a hidden ride never reaches the cart", async () => {
  const svcs = await rows(sql`SELECT id, user_id AS "userId", price_type AS "priceType", booking_mode AS "bookingMode" FROM provider_services WHERE id IN ${[...RIDES, id("ride")]}`);
  const refusals = await requestOnlyListingRefusals(svcs);
  for (const s of svcs) assert.equal(refusals.get(s.id)?.reason, "listing_not_bookable", `${s.id} refused`);
});

test("RS7 a seeded ride goes on a plan, pinned from its OSM nodes", async () => {
  const r = await insertRide({ tripId: id("plan"), userId: id("prov"), serviceId: HOZUGAWA, dayNumber: 1, afterItemId: null, departureTime: "10:00" });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  const [it] = await rows(sql`SELECT latitude, longitude, exit_latitude, exit_longitude, locked_at, start_time FROM itinerary_items WHERE id = ${r.itemId}`);
  assert.deepEqual([Number(it.latitude), Number(it.longitude)], [35.0175747, 135.5873099], "boarding = 乗船場 node");
  assert.deepEqual([Number(it.exit_latitude), Number(it.exit_longitude)], [35.0135421, 135.6714667], "exit = 下船場 node");
  assert.ok(it.locked_at, "born locked");
  assert.equal(String(it.start_time).slice(0, 5), "10:00");
});
