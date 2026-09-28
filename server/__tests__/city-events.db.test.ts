/**
 * city_events writer and reader against a disposable database (ledger `2026-09-28-city-events`,
 * migration 330).
 *
 * C1 refusals are named and nothing is inserted: a ticket link on a partner's domain, no venue,
 *    unknown city, bad start, empty source id. The seeder's partner hosts are the REGISTRY's — a
 *    fixture `affiliate_partners` row, read by the same `loadPartnerHosts` the blog uses (ledger
 *    `2026-09-28-landing-doors`).
 * C2 the seeder INSERTS ONLY: a second run with a changed entry inserts nothing and overwrites
 *    nothing (the row keeps its original title).
 * C3 nights and neighbourhood are DERIVED: nights from local dates; the neighbourhood is the
 *    nearest same-city row, and NULL when the venue has no coordinates.
 * C4 the reader returns only renderable events in the next 180 days, soonest first, never a
 *    withdrawn one, and reports `total` for the strip threshold.
 * C5 an empty seed is a no-op.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { buildCityEventRow, listUpcomingCityEvents, seedCityEvents } from "../services/city-events.service";

const RUN = crypto.randomUUID().slice(0, 8);
const sid = (s: string) => `test-${RUN}-${s}`;
const HOOD_NEAR = `hood-${RUN}-near`;
const HOOD_FAR = `hood-${RUN}-far`;
const CITY = "Kyoto";
const PARTNER_ID = `partner-${RUN}`;
const PARTNER_HOST = `tickets-${RUN}.example`;

function inDays(days: number, hourUtc = 10): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`
    INSERT INTO affiliate_partners (id, name, website_url, category)
    VALUES (${PARTNER_ID}, ${`Partner ${RUN}`}, ${`https://www.${PARTNER_HOST}/`}, 'tickets')
  `);
  await db.execute(sql`
    INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
    VALUES (${HOOD_NEAR}, ${CITY}, 'Japan', ${`Near ${RUN}`}, ${`near-${RUN}`}, 34.5000, 136.5000),
           (${HOOD_FAR},  ${CITY}, 'Japan', ${`Far ${RUN}`},  ${`far-${RUN}`},  34.6000, 136.6000)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM city_events WHERE source_id LIKE ${`test-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE id IN (${HOOD_NEAR}, ${HOOD_FAR})`);
  await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${PARTNER_ID}`);
});

test("C1 refusals are named and nothing is inserted", async () => {
  const base = { source: "manual" as const, title: "T", city: CITY, venue: "Hall", startsAt: inDays(10) };
  const hosts = ["viator.com"];
  assert.deepEqual(buildCityEventRow({ ...base, sourceId: sid("aff"), ticketUrl: "https://www.viator.com/x" }, [], hosts), { refused: "affiliate_ticket_url" });
  assert.deepEqual(buildCityEventRow({ ...base, sourceId: sid("novenue"), venue: " " }, [], hosts), { refused: "missing_venue" });
  assert.deepEqual(buildCityEventRow({ ...base, sourceId: sid("city"), city: "Atlantis" }, [], hosts), { refused: "unknown_city" });
  assert.deepEqual(buildCityEventRow({ ...base, sourceId: sid("start"), startsAt: "soon" }, [], hosts), { refused: "bad_start" });
  assert.deepEqual(buildCityEventRow({ ...base, sourceId: "  " }, [], hosts), { refused: "empty_source_id" });
  // The seeder reads the partner registry itself: a link on the fixture partner's domain (a
  // subdomain of it) is refused with no host passed in.
  const r = await seedCityEvents([{ ...base, sourceId: sid("aff2"), ticketUrl: `https://buy.${PARTNER_HOST}/r` }]);
  assert.equal(r.inserted, 0);
  assert.deepEqual(r.refused, [{ sourceId: sid("aff2"), reason: "affiliate_ticket_url" }]);
  const n = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE source_id = ${sid("aff2")}`);
  assert.equal((n.rows[0] as any).n, 0);
});

test("C2 the seeder inserts only — a second run overwrites nothing", async () => {
  const entry = { source: "manual" as const, sourceId: sid("once"), title: "Original", city: CITY, venue: "Hall", startsAt: inDays(20) };
  assert.equal((await seedCityEvents([entry])).inserted, 1);
  const again = await seedCityEvents([{ ...entry, title: "Changed" }]);
  assert.equal(again.inserted, 0);
  assert.equal(again.skipped, 1);
  const row = await db.execute(sql`SELECT title FROM city_events WHERE source_id = ${sid("once")}`);
  assert.equal((row.rows[0] as any).title, "Original");
});

test("C3 nights and the neighbourhood are derived, never typed", async () => {
  await seedCityEvents([
    {
      source: "manual",
      sourceId: sid("fest"),
      series: "Test Festival",
      title: "Test Festival 2026",
      city: CITY,
      venue: "Riverside",
      // Far from every real Kyoto centroid, so only this run's fixtures compete.
      venueLat: 34.5005,
      venueLng: 136.5005,
      startsAt: "2026-11-20T18:00:00+09:00",
      endsAt: "2026-11-22T22:00:00+09:00",
    },
    { source: "manual", sourceId: sid("nocoords"), title: "One evening", city: CITY, venue: "Somewhere", startsAt: "2026-11-21T19:00:00+09:00" },
  ]);
  const rows = await db.execute(sql`
    SELECT source_id, nights, neighbourhood_id FROM city_events WHERE source_id IN (${sid("fest")}, ${sid("nocoords")}) ORDER BY source_id
  `);
  const byId = Object.fromEntries((rows.rows as any[]).map((r) => [r.source_id, r]));
  assert.equal(byId[sid("fest")].nights, 3);
  assert.equal(byId[sid("fest")].neighbourhood_id, HOOD_NEAR);
  assert.equal(byId[sid("nocoords")].nights, 1);
  assert.equal(byId[sid("nocoords")].neighbourhood_id, null);
});

test("C4 the reader returns renderable events in the window, soonest first, never withdrawn", async () => {
  await seedCityEvents([
    { source: "manual", sourceId: sid("soon"), title: "Soon", city: CITY, venue: "A", startsAt: inDays(3) },
    { source: "manual", sourceId: sid("later"), title: "Later", city: CITY, venue: "B", startsAt: inDays(40) },
    { source: "manual", sourceId: sid("toofar"), title: "Too far", city: CITY, venue: "C", startsAt: inDays(200) },
    { source: "manual", sourceId: sid("past"), title: "Past", city: CITY, venue: "D", startsAt: inDays(-3) },
    { source: "manual", sourceId: sid("gone"), title: "Withdrawn", city: CITY, venue: "E", startsAt: inDays(5) },
  ]);
  await db.execute(sql`UPDATE city_events SET withdrawn_at = NOW() WHERE source_id = ${sid("gone")}`);
  const payload = await listUpcomingCityEvents(new Date());
  const titles = payload.events.map((e) => e.title);
  assert.ok(titles.includes("Soon") && titles.includes("Later"));
  assert.ok(!titles.includes("Too far"), "beyond 180 days is not shown");
  assert.ok(!titles.includes("Past"), "a started event is not upcoming");
  assert.ok(!titles.includes("Withdrawn"), "a withdrawn event is never shown");
  assert.ok(titles.indexOf("Soon") < titles.indexOf("Later"), "soonest first");
  assert.equal(payload.windowDays, 180);
  assert.ok(payload.total >= 2);
  const soon = payload.events.find((e) => e.title === "Soon")!;
  assert.equal(soon.city, "Kyoto");
  assert.equal(soon.marketKey, "kyoto");
  assert.ok(soon.daysUntil >= 2 && soon.daysUntil <= 4);
});

test("C5 an empty seed is a no-op", async () => {
  assert.deepEqual(await seedCityEvents([]), { inserted: 0, skipped: 0, refused: [] });
});
