/**
 * TC-2 Phase 1 (decision-maker, Oct 12, 2026; ledger `2026-10-12-tc2-affiliate-legs`) — the leg resolver on a
 * real database. City points are TEST FIXTURES passed as the config (production waits for the OSM node reads).
 *
 *   L1 the registry gate: a partner row missing licence, attribution or an https {url} template renders nothing
 *   L2 a ready 12Go row: Kyoto → Osaka is stored as the resolver's row — the redirect around the clean path with
 *      the plan's chosen date, the attribution as its description, no affiliate code
 *   L3 KIX → Kyoto: Kiwitaxi first with the class for the plan's party; an unknown party says "set your party size"
 *   L4 a re-sync replaces only the resolver's own not-booked rows; a booked row and an old stored row stay
 *   L5 GET /api/transport-legs/:legId/options hides an affiliate row stored before the resolver (never deletes it)
 *   L6 the click route records the partner's REAL affiliate_partners id
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/tc2-affiliate-legs.db.test.ts
 */
const MARKER = "405110";
process.env.TRAVELPAYOUTS_MARKER = MARKER;
process.env.STRIPE_SECRET_KEY ||= "sk_test_tc2";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[tc2] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const hubRoutes = (await import("../routes/transport-hub.routes")).default;
const { syncLegAffiliateOptions, affiliateOptionsForLeg, legAffiliateOptionId } = await import("../services/transport-affiliate.service");
const { TRANSPORT_AFFILIATE_CONFIG } = await import("../config/transport-affiliate.config");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `tc2-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");
const TRIP_NOPARTY = id("trip-np");
const LEG_OSAKA = id("leg-osaka");
const LEG_KIX = id("leg-kix");
const LEG_KIX_NP = id("leg-kix-np");
const OLD_OPT = id("old");
const P12 = id("p12go");
const PKW = id("pkiwi");
const TEMPLATE = "https://tp.media/r?marker={marker}&p=4482&u={url}";

const cfg = {
  ...TRANSPORT_AFFILIATE_CONFIG,
  cities: [
    { key: "kyoto", name: "Kyoto", twelveGoSlug: "kyoto", osmNodeId: 1, point: { lat: 35.0116, lng: 135.7681 }, radiusKm: 15 },
    { key: "osaka", name: "Osaka", twelveGoSlug: "osaka", osmNodeId: 2, point: { lat: 34.6937, lng: 135.5023 }, radiusKm: 15 },
  ],
  airports: TRANSPORT_AFFILIATE_CONFIG.airports.map((a) => (a.iata === "KIX" ? { ...a, twelveGoSlug: "kansai-fixture" } : a)),
};

function leg(legId: string, tripId: string, from: [number, number], to: [number, number]) {
  return sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_name, from_lat, from_lng, to_name, to_lat, to_lng,
      distance_meters, distance_display, recommended_mode, estimated_duration_minutes)
    VALUES (${legId}, ${tripId}, 2, 0, 'From', ${from[0]}, ${from[1]}, 'To', ${to[0]}, ${to[1]}, 50000, '50 km', 'transit', 60)`;
}

async function call(method: "GET" | "POST", path: string): Promise<{ status: number; text: string }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: owner } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(hubRoutes);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    return { status: res.status, text: await res.text() };
  } finally {
    server.close();
  }
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, adults, kids, dates_confirmed_at)
    VALUES (${TRIP}, ${owner}, 'TC-2', 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft', 2, NULL, now())`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${TRIP_NOPARTY}, ${owner}, 'TC-2 np', 'Kyoto, Japan', '2027-11-11', '2027-11-13', 'draft')`);
  await db.execute(leg(LEG_OSAKA, TRIP, [34.9858, 135.7588], [34.7025, 135.4959]));
  await db.execute(leg(LEG_KIX, TRIP, [34.4273, 135.244], [34.9858, 135.7588]));
  await db.execute(leg(LEG_KIX_NP, TRIP_NOPARTY, [34.4273, 135.244], [34.9858, 135.7588]));
  // Not ready yet: approved, active, but no licence or attribution and no template.
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category, approval_status, is_active)
    VALUES (${P12}, '12Go (fixture)', 'https://12go.asia', 'transportation', 'approved', true),
           (${PKW}, 'Kiwitaxi (fixture)', 'https://kiwitaxi.com', 'transportation', 'approved', true)`);
  // The old every-leg list, stored before the resolver.
  await db.execute(sql`INSERT INTO transport_booking_options (id, transport_leg_id, booking_type, source, title, mode_type, external_url)
    VALUES (${OLD_OPT}, ${LEG_OSAKA}, 'affiliate', 'omio', 'Kyoto → Osaka', 'train', 'https://www.omio.com/results/Kyoto/Osaka')`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM affiliate_clicks WHERE user_id = ${owner}`).catch(() => undefined);
    await db.execute(sql`DELETE FROM transport_booking_options WHERE transport_leg_id IN (${LEG_OSAKA}, ${LEG_KIX}, ${LEG_KIX_NP})`);
    await db.execute(sql`DELETE FROM transport_legs WHERE id IN (${LEG_OSAKA}, ${LEG_KIX}, ${LEG_KIX_NP})`);
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id IN (${P12}, ${PKW})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${TRIP}, ${TRIP_NOPARTY})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

const resolverRows = async (legId: string) =>
  (await db.execute(sql`SELECT id, source, title, description, external_url, affiliate_code, booking_status, sort_order
    FROM transport_booking_options WHERE transport_leg_id = ${legId} AND id LIKE ${`tc2-${legId}-%`} ORDER BY sort_order`)).rows as any[];

test("L1 a partner row missing licence, attribution or a template renders nothing", async () => {
  assert.deepEqual(await affiliateOptionsForLeg(LEG_OSAKA, cfg), []);
  await db.execute(sql`UPDATE affiliate_partners SET license = 'Travelpayouts affiliate terms', attribution = 'Booked on 12Go' WHERE id = ${P12}`);
  assert.deepEqual(await affiliateOptionsForLeg(LEG_OSAKA, cfg), [], "still no template");
  await db.execute(sql`UPDATE affiliate_partners SET affiliate_link_template = 'http://tp.media/r?u={url}' WHERE id = ${P12}`);
  assert.deepEqual(await affiliateOptionsForLeg(LEG_OSAKA, cfg), [], "an http template is not a template");
});

test("L2 a ready 12Go row: the redirect around the clean path with the plan's date", async () => {
  await db.execute(sql`UPDATE affiliate_partners SET affiliate_link_template = ${TEMPLATE} WHERE id = ${P12}`);
  await syncLegAffiliateOptions(LEG_OSAKA, cfg);
  const [r, ...rest] = await resolverRows(LEG_OSAKA);
  assert.equal(rest.length, 0);
  assert.equal(r.id, legAffiliateOptionId(LEG_OSAKA, "12go"));
  assert.equal(r.source, "12go");
  assert.equal(r.title, "Kyoto → Osaka");
  assert.equal(r.description, "Booked on 12Go");
  assert.equal(r.external_url, `https://tp.media/r?marker=${MARKER}&p=4482&u=${encodeURIComponent("https://12go.asia/en/travel/kyoto/osaka?date=2027-11-12")}`);
  assert.equal(r.affiliate_code, null);
});

test("L3 KIX → Kyoto: Kiwitaxi first with the party's class; an unknown party is asked", async () => {
  await db.execute(sql`UPDATE affiliate_partners SET license = 'Travelpayouts affiliate terms', attribution = 'Transfer by Kiwitaxi', affiliate_link_template = ${TEMPLATE} WHERE id = ${PKW}`);
  await syncLegAffiliateOptions(LEG_KIX, cfg);
  const rows = await resolverRows(LEG_KIX);
  assert.deepEqual(rows.map((r) => r.source), ["kiwitaxi", "12go"]);
  assert.equal(rows[0].description, "Comfort fits your party · up to 4 passengers, 3 bags (a bag is a standard piece up to 158 cm) · Transfer by Kiwitaxi");
  assert.equal(rows[0].external_url, `https://tp.media/r?marker=${MARKER}&p=4482&u=${encodeURIComponent("https://kiwitaxi.com/en/japan/kansai-airport-kyoto-train-station")}`);
  await syncLegAffiliateOptions(LEG_KIX_NP, cfg);
  const np = await resolverRows(LEG_KIX_NP);
  assert.equal(np[0].description, "Set your party size to see which car fits · Transfer by Kiwitaxi");
  assert.equal(np[1].external_url.includes(encodeURIComponent("?date=")), false, "no chosen dates ⇒ no date sent");
});

test("L4 a re-sync replaces only the resolver's own not-booked rows", async () => {
  await db.execute(sql`UPDATE transport_booking_options SET booking_status = 'booked' WHERE id = ${legAffiliateOptionId(LEG_KIX, "kiwitaxi")}`);
  await db.execute(sql`UPDATE affiliate_partners SET attribution = 'Booked on 12Go · checked 12 Oct' WHERE id = ${P12}`);
  await syncLegAffiliateOptions(LEG_KIX, cfg);
  const rows = await resolverRows(LEG_KIX);
  assert.equal(rows.find((r) => r.source === "kiwitaxi")?.booking_status, "booked", "the booked row stays");
  assert.equal(rows.filter((r) => r.source === "kiwitaxi").length, 1, "and is not offered twice");
  assert.equal(rows.find((r) => r.source === "12go")?.description, "Booked on 12Go · checked 12 Oct", "the not-booked row is the current answer");
  const old = (await db.execute(sql`SELECT id FROM transport_booking_options WHERE id = ${OLD_OPT}`)).rows;
  assert.equal(old.length, 1, "an old stored row is never deleted");
});

test("L5 the leg-options read hides an affiliate row stored before the resolver", async () => {
  const res = await call("GET", `/api/transport-legs/${LEG_OSAKA}/options`);
  assert.equal(res.status, 200);
  const ids = JSON.parse(res.text).options.map((o: any) => o.id);
  assert.ok(!ids.includes(OLD_OPT));
  const old = (await db.execute(sql`SELECT id FROM transport_booking_options WHERE id = ${OLD_OPT}`)).rows;
  assert.equal(old.length, 1);
});

test("L6 the click route records the partner's real affiliate_partners id", async () => {
  await syncLegAffiliateOptions(LEG_OSAKA, cfg);
  const optId = legAffiliateOptionId(LEG_OSAKA, "12go");
  const res = await call("POST", `/api/transport-booking-options/${optId}/click`);
  assert.equal(res.status, 200);
  assert.match(JSON.parse(res.text).redirectUrl, /^https:\/\/tp\.media\/r\?marker=405110/);
  const clicks = (await db.execute(sql`SELECT partner_id FROM affiliate_clicks WHERE user_id = ${owner}`)).rows as any[];
  assert.deepEqual(clicks.map((c) => c.partner_id), [P12]);
});
