/**
 * TC-4 — the Trip Card's live tier per leg against a real database (LD 69; ledger `2026-10-11-tc4-live-directions`).
 *
 *   LD1 `buildGoogleNavUrl` keeps R321's no-mode link for every existing caller; only an explicit opt-in adds
 *       `travelmode=transit`
 *   LD2 a Kyoto leg (no transit in the routing API) gets the server-built link WITH transit; an Edinburgh leg's
 *       link has no mode; a leg with an unlocated end gets nothing
 *   LD3 on a confirmed date, the earliest official last departure within 1.2 km of the stop the leg LEAVES rides
 *       on the leg; a station near only the stop it reaches is not read; unconfirmed dates ⇒ no last departure
 *
 * NEGATIVE SPACE (§18d): the plancard route's merge of these facts onto `days[].transports` is a thin spread
 * behind the existing gate; the card's rendering is client/src/components/plancard/__tests__/trip-card-live-tier.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/live-directions.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[live-directions] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { recordFacts } = await import("../services/content-facts/place-facts.service");
const { liveLegFactsForTrip } = await import("../services/live-directions.service");
const { buildGoogleNavUrl } = await import("../services/maps-url-builder");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `ld-${RUN}-${s}`;
const owner = id("owner");
const KYOTO = id("kyoto");
const EDI = id("edi");
const UNDATED = id("undated");
const K = crypto.randomInt(0, 1000) / 1e4;
const FROM = { lat: 35.0 + K, lng: 135.78 };
const TO = { lat: 35.04 + K, lng: 135.78 };
const NOW = new Date();
const MONDAY = "2027-11-08";

const leg = (lid: string, from: { lat: number; lng: number } | null, to: { lat: number; lng: number }) => ({
  id: lid,
  fromLat: from ? String(from.lat) : null,
  fromLng: from ? String(from.lng) : null,
  toLat: String(to.lat),
  toLng: String(to.lng),
});
const day = (legs: any[], dateIso: string | null = MONDAY) => [{ dayNumber: 1, dateIso, transports: legs }];
const svc = (ref: string, at: { lat: number; lng: number }, lastDeparture: string, operator: string) =>
  ({
    placeRefKind: "free_text",
    placeRef: ref,
    placeLat: at.lat,
    placeLng: at.lng,
    market: "kyoto",
    need: "transport.local",
    factType: "last_service",
    value: { operator, line: "Main Line", station: null, lastDeparture, weekdays: [1], validFrom: "2027-01-01", validTo: "2028-01-01", quote: `last ${lastDeparture}` },
    // CS-1 item 3 (ledger `2026-10-19-cs1-fact-review`): reviewed by a person.
    verifiedBy: owner,
    origin: "crawled",
    sourceId: null,
    sourceUrl: "https://operator.example.jp/",
    license: "official",
    fetchedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
    costCents: 0,
  }) as any;

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const [t, market, dest, confirmed] of [
    [KYOTO, "kyoto", "Kyoto, Japan", true],
    [EDI, "edinburgh", "Edinburgh, UK", true],
    [UNDATED, "kyoto", "Kyoto, Japan", false],
  ] as const) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status, dates_confirmed_at)
      VALUES (${t}, ${owner}, 'LD', ${dest}, ${market}, ${MONDAY}, ${MONDAY}, 'draft', ${confirmed ? NOW : null})`);
  }
  await recordFacts(
    [
      svc(id("near-late"), { lat: FROM.lat + 0.003, lng: FROM.lng }, "23:40", "Keihan"),
      svc(id("near-early"), { lat: FROM.lat - 0.004, lng: FROM.lng }, "22:15", "Kyoto City Bus"),
      svc(id("at-arrival"), { lat: TO.lat, lng: TO.lng }, "21:00", "Arrival Line"),
    ],
    { planId: null, itemId: null },
  );
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM place_facts WHERE place_ref IN (${id("near-late")}, ${id("near-early")}, ${id("at-arrival")})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${KYOTO}, ${EDI}, ${UNDATED})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

test("LD1 the no-mode link stays the default; transit only on opt-in", () => {
  assert.equal(buildGoogleNavUrl(1, 2, 3, 4, "walk"), "https://www.google.com/maps/dir/?api=1&origin=1,2&destination=3,4");
  assert.equal(buildGoogleNavUrl(1, 2, 3, 4, "walk", { travelmode: "transit" }), "https://www.google.com/maps/dir/?api=1&origin=1,2&destination=3,4&travelmode=transit");
});

test("LD2 Kyoto's link asks for transit, Edinburgh's has no mode, an unlocated end gets nothing", async () => {
  const k = await liveLegFactsForTrip(KYOTO, day([leg("k1", FROM, TO), leg("k2", null, TO)]), NOW);
  assert.deepEqual(k.get("k1")?.liveDirections, { provider: "google_maps", url: buildGoogleNavUrl(FROM.lat, FROM.lng, TO.lat, TO.lng, "", { travelmode: "transit" }), transit: true });
  assert.equal(k.has("k2"), false, "no coordinates on both ends ⇒ no key");
  const e = await liveLegFactsForTrip(EDI, day([leg("e1", FROM, TO)]), NOW);
  assert.equal(e.get("e1")?.liveDirections?.transit, false);
  assert.ok(!e.get("e1")!.liveDirections!.url.includes("travelmode"), "a covered market keeps the no-mode link");
});

test("LD3 the earliest last departure near the stop LEFT, on a confirmed date only", async () => {
  const k = await liveLegFactsForTrip(KYOTO, day([leg("k1", FROM, TO)]), NOW);
  assert.deepEqual(k.get("k1")?.lastService, { operator: "Kyoto City Bus", line: "Main Line", station: null, lastDeparture: "22:15" });
  const back = await liveLegFactsForTrip(KYOTO, day([leg("k3", TO, { lat: TO.lat + 0.05, lng: TO.lng })]), NOW);
  assert.equal(back.get("k3")?.lastService?.operator, "Arrival Line", "the station at a stop counts when the leg leaves it");
  const u = await liveLegFactsForTrip(UNDATED, day([leg("u1", FROM, TO)]), NOW);
  assert.ok(u.get("u1")?.liveDirections, "the link does not need a confirmed date");
  assert.equal(u.get("u1")?.lastService, undefined, "unconfirmed dates ⇒ no last departure");
  const offDay = await liveLegFactsForTrip(KYOTO, day([leg("k4", FROM, TO)], "2027-11-09"), NOW);
  assert.equal(offDay.get("k4")?.lastService, undefined, "a Tuesday reads no Monday-only row");
});
