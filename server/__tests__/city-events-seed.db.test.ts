/**
 * The nine-row event seed, the date-only start time and the OSM venue lookup (ledger
 * `2026-10-01-city-events-nine-seed`; migration 337).
 *
 *   E1  every manual entry builds with no refusal; sourceIds are unique; no coordinate is hand-typed;
 *       exactly the rows whose organiser prints a time state one (seed lane 2 widened the set)
 *   E2  a date-only row's card carries NO start time (never "00:00"); a known one carries its local time
 *   E3  the seeder looks a venue up ONCE, only for a row it is inserting: a match stores the point and
 *       is listed as located; no match leaves NULL and is listed as unlocated; a second run asks nothing;
 *       lookups are spaced by Nominatim's interval
 *   E4  the OSM lookup accepts only a result whose name and the venue's match BOTH ways, sends the app's
 *       user agent, never asks for a generic venue, and answers "unreachable" (never null) on a failure
 *   E5  an unreachable lookup DEFERS the row — nothing inserted, exactly ONE lookup that run (bounded,
 *       never a loop) — and the next run inserts it
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards. No network.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { buildCityEventRow, seedCityEvents, toCityEventCard } from "../services/city-events.service";
import { MANUAL_CITY_EVENTS } from "../seeds/city-events.manual";
import { NOMINATIM_MIN_INTERVAL_MS, resolveVenueFromOsm, venueIsLookupable } from "../services/venue-geocode.service";
import { RESALE_TICKET_HOSTS, ticketUrlRefusal } from "@shared/city-events";

const RUN = crypto.randomUUID().slice(0, 8);
const sid = (s: string) => `seedtest-${RUN}-${s}`;

before(() => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM city_events WHERE source_id LIKE ${`seedtest-${RUN}-%`}`);
  await pool.end();
});

test("E1: the manual list builds cleanly; only rows with a printed time state one", () => {
  assert.equal(MANUAL_CITY_EVENTS.length, 22);
  const ids = MANUAL_CITY_EVENTS.map((e) => e.sourceId);
  assert.equal(new Set(ids).size, ids.length, "sourceIds are unique");
  for (const e of MANUAL_CITY_EVENTS) {
    const built = buildCityEventRow(e, [], []);
    assert.ok("row" in built, `${e.sourceId} refused: ${(built as any).refused}`);
    assert.equal(e.venueLat, undefined, `${e.sourceId} hand-types no latitude`);
    assert.equal(e.venueLng, undefined, `${e.sourceId} hand-types no longitude`);
    if (e.ticketUrl) assert.notEqual(ticketUrlRefusal(e.ticketUrl, RESALE_TICKET_HOSTS), "resale_ticket_url");
  }
  const timed = MANUAL_CITY_EVENTS.filter((e) => e.startTimeKnown === true);
  assert.deepEqual(timed.map((e) => e.sourceId).sort(), [
    "aitana-cuarto-azul-bogota-2026",
    "edinburgh-hogmanay-2026-gardens",
    "edinburgh-hogmanay-2026-torchlight",
    "gulaab-shilpa-rao-2027",
    "max-richter-live-mumbai-2026",
    "mitsuko-uchida-kyoto-2026",
    "snarky-puppy-porto-2027",
    "starsailor-edinburgh-2026",
    "sunburn-festival-2026",
    "yoasobi-chowakusei-osaka-2026-10-24",
    "yoasobi-chowakusei-osaka-2026-10-25",
  ]);
  const away = MANUAL_CITY_EVENTS.filter((e) => e.venueLocality);
  assert.deepEqual(away.map((e) => [e.city, e.venueLocality]), [["Porto", "Portimão"], ["Kyoto", "Suzuka"], ["Kyoto", "Osaka"], ["Kyoto", "Osaka"]]);
});

test("E2: a date-only card carries no start time; a known time renders in the city's zone", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const card = (sourceId: string) => {
    const e = MANUAL_CITY_EVENTS.find((x) => x.sourceId === sourceId)!;
    const built = buildCityEventRow(e, [], []);
    assert.ok("row" in built);
    return toCityEventCard({ ...(built.row as any), id: "x", createdAt: now, withdrawnAt: null }, null, now);
  };
  const noh = card("imagine-noh-2026");
  assert.equal(noh.startTime, null, "never '00:00'");
  assert.equal(noh.firstDate, "2026-10-14");
  assert.equal(noh.lastDate, "2026-11-05");
  const lolla = card("lollapalooza-india-2027");
  assert.equal(lolla.startTime, null);
  assert.equal(lolla.nights, 2);
  assert.equal(card("edinburgh-hogmanay-2026-torchlight").startTime, "18:30");
  assert.equal(card("edinburgh-hogmanay-2026-gardens").startTime, "20:00");
});

test("E3: the seeder looks a venue up once, only on insert, spaced, and flags no match", async () => {
  const calls: any[] = [];
  const sleeps: number[] = [];
  const deps = {
    partnerHosts: async () => [],
    sleep: async (ms: number) => { sleeps.push(ms); },
    resolveVenue: async (q: any) => {
      calls.push(q);
      return q.venue === "Suzuka Circuit" ? { lat: 34.8431, lng: 136.5407, matchedName: "Suzuka Circuit", attribution: "© OpenStreetMap contributors" as const } : null;
    },
  };
  const entries = [
    { source: "manual" as const, sourceId: sid("race"), title: "Race", city: "Kyoto", venue: "Suzuka Circuit", venueLocality: "Suzuka", startsAt: "2027-04-09T00:00:00+09:00" },
    { source: "manual" as const, sourceId: sid("hall"), title: "Hall", city: "Kyoto", venue: "Nowhere Hall", startsAt: "2027-04-10T00:00:00+09:00" },
  ];
  const first = await seedCityEvents(entries, deps);
  assert.equal(first.nominatim, "ok");
  assert.equal(first.inserted, 2);
  assert.deepEqual(first.located, [{ sourceId: sid("race"), matchedName: "Suzuka Circuit" }]);
  assert.deepEqual(first.unlocated, [sid("hall")]);
  assert.deepEqual(calls[0], { venue: "Suzuka Circuit", locality: "Suzuka", country: calls[0].country });
  assert.equal(calls[1].locality, "Kyoto", "locality defaults to the operating city");
  assert.deepEqual(sleeps, [NOMINATIM_MIN_INTERVAL_MS], "the second lookup waits Nominatim's interval");
  const rows: any = await db.execute(sql`SELECT source_id, venue_lat, venue_lng, start_time_known FROM city_events WHERE source_id LIKE ${`seedtest-${RUN}-%`} ORDER BY source_id`);
  const byId = new Map((rows.rows ?? rows).map((r: any) => [r.source_id, r]));
  assert.equal(Number((byId.get(sid("race")) as any).venue_lat), 34.8431);
  assert.equal((byId.get(sid("hall")) as any).venue_lat, null, "no match ⇒ NULL, never a guess");
  assert.equal((byId.get(sid("race")) as any).start_time_known, null, "date only ⇒ NULL");
  const again = await seedCityEvents(entries, deps);
  assert.equal(again.inserted, 0);
  assert.equal(again.nominatim, "untested", "already seeded: no lookup this boot");
  assert.equal(calls.length, 2, "an existing row is never looked up again");
});

test("E4: the OSM lookup matches by name, identifies itself, skips generic venues, and fails to null", async () => {
  const seen: Array<{ url: string; ua: string }> = [];
  const fake = (body: unknown) => async (url: string, init: any) => {
    seen.push({ url, ua: init.headers["User-Agent"] });
    return { ok: true, json: async () => body };
  };
  const hit = await resolveVenueFromOsm(
    { venue: "Suzuka Circuit", locality: "Suzuka", country: "Japan" },
    fake([{ lat: "34.84", lon: "136.54", name: "鈴鹿サーキット", namedetails: { "name:en": "Suzuka Circuit" } }]),
  );
  assert.deepEqual(hit, { lat: 34.84, lng: 136.54, matchedName: "Suzuka Circuit", attribution: "© OpenStreetMap contributors" });
  assert.match(seen[0].ua, /^Traveloure-city-events\//);
  assert.match(seen[0].url, /q=Suzuka\+Circuit%2C\+Suzuka%2C\+Japan/);
  const wrong = await resolveVenueFromOsm({ venue: "Mahalaxmi Racecourse", locality: "Mumbai", country: "India" }, fake([{ lat: "1", lon: "2", name: "Mahalaxmi Temple" }]));
  assert.equal(wrong, null, "a different place is never accepted");
  assert.equal(venueIsLookupable("Old Town"), false);
  const before = seen.length;
  assert.equal(await resolveVenueFromOsm({ venue: "Old Town", locality: "Edinburgh", country: "United Kingdom" }, fake([])), null);
  assert.equal(seen.length, before, "a generic venue makes no request");
  assert.equal(await resolveVenueFromOsm({ venue: "Suzuka Circuit", locality: null, country: null }, async () => { throw new Error("down"); }), "unreachable");
  assert.equal(await resolveVenueFromOsm({ venue: "Suzuka Circuit", locality: null, country: null }, async () => ({ ok: false, json: async () => [] })), "unreachable");
});

test("E5: an unreachable lookup defers the row; the next run inserts it", async () => {
  const entry = { source: "manual" as const, sourceId: sid("later"), title: "Later", city: "Kyoto", venue: "Suzuka Circuit", startsAt: "2027-04-12T00:00:00+09:00" };
  let downCalls = 0;
  const down = await seedCityEvents([entry], {
    partnerHosts: async () => [],
    sleep: async () => {},
    resolveVenue: async () => { downCalls += 1; return "unreachable" as const; },
  });
  assert.equal(down.nominatim, "blocked");
  assert.deepEqual([down.inserted, down.deferred], [0, [sid("later")]]);
  assert.equal(downCalls, 1, "bounded: one lookup per entry per run — the retry is the next run, never a loop");
  const count: any = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE source_id = ${sid("later")}`);
  assert.equal((count.rows ?? count)[0].n, 0, "nothing inserted while OSM is unreachable");
  const up = await seedCityEvents([entry], {
    partnerHosts: async () => [],
    sleep: async () => {},
    resolveVenue: async () => ({ lat: 34.8431, lng: 136.5407, matchedName: "Suzuka Circuit", attribution: "© OpenStreetMap contributors" as const }),
  });
  assert.equal(up.nominatim, "ok");
  assert.deepEqual([up.inserted, up.located.length, up.deferred.length], [1, 1, 0]);
});
