/**
 * FU-S1-2 — the stay card's one link against a disposable database (ledger `2026-10-09-fu-s1-2-stay-link`).
 *
 *   LK1  a platform stay whose provider typed a website ⇒ `own`, on the list AND when opened, no Google call
 *   LK2  the list makes NO Google call: a partner stay gets a Google Maps URL from its name and city,
 *        pinned to a place ID only when one is already stored
 *   LK3  opened: `google` from ONE Details call through the `places_details` caller; its dollars on the
 *        gate's own usage row (purpose `stay_link`); NOTHING stored — no `place_facts` row
 *   LK4  opened, Google names no website ⇒ `maps` from the same answer's `googleMapsUri`
 *   LK5  WRONG-HOTEL SAFEGUARD: an answer naming another place ⇒ the list link, never that place's site
 *   LK6  the Places caller off ⇒ no call, the list link
 *   LK7  a slow answer ⇒ the list link after the timeout; the open is never held
 *   LK8  the in-request memo: two asks in one open ⇒ one Details call
 *   LK9  `pickedStayLink`: only the plan's routed pick; a free plan answers no link; a stranger gets the
 *        one 404 (null)
 *
 * DISPOSABLE DB ONLY. The network is a fake.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { listStayLinks, openedStayLink, pickedStayLink, type StayLinkDeps } from "../services/stay-link.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `slk-${RUN}-${k}`;
const CITY = `Linkville${RUN}`;
const ids = { provider: id("prov"), svc: id("svc"), owner: id("owner"), stranger: id("stranger"), trip: id("trip"), hotel: id("hotel") };

/** A fake Places adapter: the place ID it resolves, the answer it gives, and every call it took. */
function fakeAdapter(answer: { name: string | null; websiteUri: string | null; googleMapsUri: string | null }, opts: { delayMs?: number } = {}) {
  const calls: string[] = [];
  const adapter: NonNullable<StayLinkDeps["adapter"]> = {
    resolvePlaceId: async () => {
      calls.push("ids");
      return `place-${RUN}`;
    },
    fetchStayLinkByPlaceId: async () => {
      calls.push("details");
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return answer;
    },
  } as any;
  return { adapter, calls };
}

const ENV = ["PLACE_FACTS_PLACES_ENABLED", "GOOGLE_MAPS_API_KEY", "PLACES_DETAILS_COST_CENTS"] as const;
const saved: Record<string, string | undefined> = {};
function placesOn() {
  process.env.PLACE_FACTS_PLACES_ENABLED = "1";
  process.env.GOOGLE_MAPS_API_KEY = "lk-test-key";
  process.env.PLACES_DETAILS_COST_CENTS = "2";
}
const noKnown = async () => null;
const kamogawa = { kind: "hotel_cache" as const, id: id("h1"), name: "Hotel Kamogawa" };
const mapsSearch = (name: string) => `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${name}, ${CITY}` }).toString()}`;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  for (const k of ENV) saved[k] = process.env[k];
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ids.provider}, ${`${ids.provider}@t.test`}, 'LK', 'Fixture', 'service_provider')`);
  await db.execute(sql`
    INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, website)
    VALUES (${crypto.randomUUID()}, ${ids.provider}, 'Biz', 'Name', ${`${ids.provider}@test.local`}, '000', 'JP', 'Addr', 'accommodation', 'www.ryokan-linkville.example')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price) VALUES (${ids.svc}, ${ids.provider}, 'Ryokan Linkville', '100.00')`);
  for (const u of [ids.owner, ids.stranger]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${u}, ${`${u}@t.test`}, 'LK', 'Fixture', 'user')`);
  }
  const expires = new Date(Date.now() + 30 * 86_400_000);
  await db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, name, latitude, longitude, city, expires_at)
    VALUES (${ids.hotel}, ${ids.hotel}, 'LKV', 'Hotel Kamogawa', 35.0, 135.77, ${CITY}, ${expires})`);
  const pick = { hotelId: ids.hotel, hotelKind: "hotel_cache", scoredCount: 1, candidateCount: 1, stopsHash: "1-x", computedAt: new Date().toISOString(), tier: "routed", changed: false };
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, stay_pick)
    VALUES (${ids.trip}, ${ids.owner}, 'LK plan', ${`${CITY}, Japan`}, '2027-05-01', '2027-05-03', 'planning', ${JSON.stringify(pick)}::jsonb)`);
});

after(async () => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await db.execute(sql`DELETE FROM api_usage_logs WHERE metadata->>'ref' = ${`place-${RUN}`}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`slk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${`slk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${`slk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id LIKE ${`slk-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`slk-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

test("LK1 a platform stay's provider site ⇒ own, listed and opened, with no Google call", async () => {
  placesOn();
  const f = fakeAdapter({ name: "Ryokan Linkville", websiteUri: "https://google-says.example", googleMapsUri: null });
  const platform = { kind: "platform" as const, id: ids.svc, name: "Ryokan Linkville" };
  const [listed] = await listStayLinks([platform], CITY, { adapter: f.adapter, knownPlaceId: noKnown });
  assert.deepEqual(listed.stayLink, { kind: "own", url: "https://www.ryokan-linkville.example/" });
  assert.deepEqual(await openedStayLink(platform, CITY, { adapter: f.adapter, knownPlaceId: noKnown }), { kind: "own", url: "https://www.ryokan-linkville.example/" });
  assert.deepEqual(f.calls, []);
});

test("LK2 the list makes no Google call: a Maps URL from name and city, pinned to a stored place ID", async () => {
  placesOn();
  const f = fakeAdapter({ name: "Hotel Kamogawa", websiteUri: "https://kamogawa.example", googleMapsUri: null });
  const [plain] = await listStayLinks([kamogawa], CITY, { adapter: f.adapter, knownPlaceId: noKnown });
  assert.deepEqual(plain.stayLink, { kind: "maps", url: mapsSearch("Hotel Kamogawa") });
  const [pinned] = await listStayLinks([kamogawa], CITY, { adapter: f.adapter, knownPlaceId: async () => "ChIJ-known" });
  assert.match(pinned.stayLink!.url, /query_place_id=ChIJ-known/);
  assert.deepEqual(f.calls, [], "no ID lookup and no Details call on list render");
});

test("LK3 opened ⇒ google from ONE Details call, dollars on the gate row, nothing stored", async () => {
  placesOn();
  await db.execute(sql`DELETE FROM api_usage_logs WHERE metadata->>'ref' = ${`place-${RUN}`}`);
  const facts0 = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM place_facts`)) as any).rows[0].n);
  const f = fakeAdapter({ name: "Kamogawa Hotel", websiteUri: "https://kamogawa.example/en", googleMapsUri: "https://maps.google.com/?cid=7" });
  assert.deepEqual(await openedStayLink(kamogawa, CITY, { adapter: f.adapter, knownPlaceId: noKnown }), { kind: "google", url: "https://kamogawa.example/en" });
  assert.deepEqual(f.calls, ["ids", "details"]);
  const r: any = await db.execute(sql`
    SELECT request_count, estimated_cost_cents, metadata FROM api_usage_logs
    WHERE provider = 'google_maps' AND endpoint = 'places_details' AND metadata->>'ref' = ${`place-${RUN}`}`);
  const rows = r.rows ?? r;
  assert.equal(rows.length, 1, "one Details call, through the existing places_details caller");
  assert.equal(rows[0].estimated_cost_cents, 20, "2¢ = 20 tenths of a cent, on the gate's own row");
  assert.equal(rows[0].metadata.purpose, "stay_link");
  assert.equal(Number(((await db.execute(sql`SELECT count(*)::int AS n FROM place_facts`)) as any).rows[0].n), facts0, "no place_facts row written");
});

test("LK4 opened, Google names no website ⇒ maps from the same answer", async () => {
  placesOn();
  const f = fakeAdapter({ name: "Hotel Kamogawa", websiteUri: null, googleMapsUri: "https://maps.google.com/?cid=7" });
  assert.deepEqual(await openedStayLink(kamogawa, CITY, { adapter: f.adapter, knownPlaceId: noKnown }), { kind: "maps", url: "https://maps.google.com/?cid=7" });
});

test("LK5 wrong hotel ⇒ the list link, never that place's site", async () => {
  placesOn();
  const f = fakeAdapter({ name: "Grand Sakura Tower", websiteUri: "https://sakura.example", googleMapsUri: "https://maps.google.com/?cid=8" });
  assert.deepEqual(await openedStayLink(kamogawa, CITY, { adapter: f.adapter, knownPlaceId: noKnown }), { kind: "maps", url: mapsSearch("Hotel Kamogawa") });
});

test("LK6 the Places caller off ⇒ no call, the list link", async () => {
  delete process.env.PLACE_FACTS_PLACES_ENABLED;
  const f = fakeAdapter({ name: "Hotel Kamogawa", websiteUri: "https://kamogawa.example", googleMapsUri: null });
  assert.deepEqual(await openedStayLink(kamogawa, CITY, { adapter: f.adapter, knownPlaceId: noKnown }), { kind: "maps", url: mapsSearch("Hotel Kamogawa") });
  assert.deepEqual(f.calls, []);
});

test("LK7 a slow answer ⇒ the list link after the timeout", async () => {
  placesOn();
  const f = fakeAdapter({ name: "Hotel Kamogawa", websiteUri: "https://kamogawa.example", googleMapsUri: null }, { delayMs: 300 });
  const started = Date.now();
  const link = await openedStayLink(kamogawa, CITY, { adapter: f.adapter, knownPlaceId: noKnown, timeoutMs: 50 });
  assert.ok(Date.now() - started < 250, "the open did not wait for Google");
  assert.deepEqual(link, { kind: "maps", url: mapsSearch("Hotel Kamogawa") });
});

test("LK8 the in-request memo: two asks in one open ⇒ one Details call", async () => {
  placesOn();
  const f = fakeAdapter({ name: "Hotel Kamogawa", websiteUri: "https://kamogawa.example", googleMapsUri: null });
  const memo = new Map();
  const deps = { adapter: f.adapter, knownPlaceId: async () => `place-${RUN}` };
  await Promise.all([openedStayLink(kamogawa, CITY, deps, memo), openedStayLink(kamogawa, CITY, deps, memo)]);
  assert.equal(f.calls.filter((c) => c === "details").length, 1);
});

test("LK9 pickedStayLink: the routed pick only; free plan no link; stranger 404", async () => {
  placesOn();
  const f = fakeAdapter({ name: "Hotel Kamogawa", websiteUri: "https://kamogawa.example", googleMapsUri: null });
  const deps = { adapter: f.adapter, knownPlaceId: noKnown };
  assert.deepEqual(await pickedStayLink(ids.trip, ids.owner, { ...deps, routed: async () => true }), { stayLink: { kind: "google", url: "https://kamogawa.example/" } });
  assert.deepEqual(await pickedStayLink(ids.trip, ids.owner, { ...deps, routed: async () => false }), { stayLink: null }, "a free plan has no pick to open");
  assert.equal(await pickedStayLink(ids.trip, ids.stranger, { ...deps, routed: async () => true }), null, "one 404 for a stranger");
});
