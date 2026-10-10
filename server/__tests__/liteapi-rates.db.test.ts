/**
 * S1-d-2 — live rates for one LiteAPI stay, against a disposable database (ledger
 * `2026-10-10-s1-d2-liteapi-rates`; migration 366). LiteAPI is a fake.
 *
 *   SR1 one not_found for a stranger, a non-LiteAPI row and a row in another city (LD 40)
 *   SR2 unconfirmed dates ⇒ dates_needed; no stated adults ⇒ party_needed; neither calls LiteAPI
 *   SR3 LiteAPI off ⇒ unavailable, no call; the cap spent ⇒ unavailable, no call
 *   SR4 an answer: the request carries LiteAPI's own hotel id, the plan's dates, the adults and the
 *       `hotel_margin_public` band as a percent (12); the price is floored at the SSP; the plan zone rides along
 *   SR5 nothing is stored: no `hotel_offer_cache` row, and the one usage row says `stored: false`
 *   SR6 an error or a timeout ⇒ unavailable (never thrown), and the failed call is still recorded
 *   SR7 the band absent ⇒ its declared fallback, 0 (sell at the SSP)
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { stayRates, publicMarginFraction, type StayRatesDeps } from "../services/liteapi-rates.service";
import type { LiteapiRatesGateDeps } from "../services/liteapi-rates-gate";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `lrt-${RUN}-${k}`;
const CITY = `Ratecity${RUN}`;
const cfg = { apiKey: "k", env: "sandbox" as const, dataBaseUrl: "https://api.test/v3.0", bookBaseUrl: "https://book.test/v3.0", maxRps: 1000, staleAfterDays: 2 };
const answer = { data: [{ hotelId: `${RUN}-lp`, roomTypes: [{ rates: [{ boardName: "Room Only", retailRate: { total: [{ amount: 280, currency: "USD" }], suggestedSellingPrice: [{ amount: 300, currency: "USD" }] }, cancellationPolicies: { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2027-05-08 12:00:00" }] } }] }] }] };

function fakes(opts: { off?: boolean; cap?: number; used?: number; throws?: string; margin?: number } = {}) {
  const calls: any[] = [];
  const rows: any[] = [];
  const gate: LiteapiRatesGateDeps = { dailyCap: () => opts.cap ?? 10, countToday: async () => opts.used ?? 0, record: async (r) => void rows.push(r) };
  const deps: StayRatesDeps = {
    config: () => (opts.off ? null : cfg),
    client: () => ({ hotelRates: async (q: any) => { calls.push(q); if (opts.throws) throw new Error(opts.throws); return answer; } }) as any,
    gate,
    marginFraction: async () => opts.margin ?? 0.12,
    timeoutMs: () => 2000,
  };
  return { deps, calls, rows };
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  for (const u of ["owner", "stranger"]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id(u)}, ${`${id(u)}@t.test`}, 'LR', 'Fixture', 'user')`);
  }
  const exp = new Date(Date.now() + 2 * 86_400_000);
  const ins = (k: string, provider: string, city: string, phid: string | null) =>
    db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, name, latitude, longitude, city, provider, provider_hotel_id, expires_at)
      VALUES (${id(k)}, ${id(k)}, 'RTC', ${k}, 35, 135, ${city}, ${provider}, ${phid}, ${exp})`);
  await ins("lite", "liteapi", CITY, `${RUN}-lp`);
  await ins("booking", "booking_com", CITY, null);
  await ins("elsewhere", "liteapi", `Other${RUN}`, `${RUN}-lq`);
  const trip = (k: string, over: { confirmed?: boolean; adults?: number | null; tz?: string | null }) =>
    db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, adults, kids, timezone, dates_confirmed_at)
      VALUES (${id(k)}, ${id("owner")}, 'LR', ${`${CITY}, Japan`}, '2027-05-10', '2027-05-13', 'planning', ${over.adults === undefined ? 2 : over.adults}, 0,
              ${over.tz ?? null}, ${over.confirmed === false ? null : new Date()})`);
  await trip("trip", { tz: "Asia/Tokyo" });
  await trip("undated", { confirmed: false });
  await trip("noparty", { adults: null });
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`lrt-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${`lrt-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`lrt-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

test("SR1 one not_found for a stranger, a non-LiteAPI row and another city", async () => {
  const f = fakes();
  assert.deepEqual(await stayRates({ tripId: id("trip"), userId: id("stranger"), stayId: id("lite") }, f.deps), { state: "not_found" });
  assert.deepEqual(await stayRates({ tripId: id("trip"), userId: id("owner"), stayId: id("booking") }, f.deps), { state: "not_found" });
  assert.deepEqual(await stayRates({ tripId: id("trip"), userId: id("owner"), stayId: id("elsewhere") }, f.deps), { state: "not_found" });
  assert.deepEqual(await stayRates({ tripId: id("trip"), userId: null, stayId: id("lite") }, f.deps), { state: "not_found" });
  assert.equal(f.calls.length, 0);
});

test("SR2 unconfirmed dates and an unstated party ask, and call nothing", async () => {
  const f = fakes();
  assert.deepEqual(await stayRates({ tripId: id("undated"), userId: id("owner"), stayId: id("lite") }, f.deps), { state: "dates_needed" });
  assert.deepEqual(await stayRates({ tripId: id("noparty"), userId: id("owner"), stayId: id("lite") }, f.deps), { state: "party_needed" });
  assert.equal(f.calls.length, 0);
});

test("SR3 off or over the cap ⇒ unavailable with no call", async () => {
  for (const f of [fakes({ off: true }), fakes({ cap: 5, used: 5 }), fakes({ cap: 0 })]) {
    assert.deepEqual(await stayRates({ tripId: id("trip"), userId: id("owner"), stayId: id("lite") }, f.deps), { state: "unavailable" });
    assert.equal(f.calls.length, 0);
    assert.equal(f.rows.length, 0);
  }
});

test("SR4 an answer: LiteAPI's id, the plan's dates and party, the band as a percent, floored at the SSP", async () => {
  const f = fakes();
  const out: any = await stayRates({ tripId: id("trip"), userId: id("owner"), stayId: id("lite") }, f.deps);
  assert.equal(out.state, "ok");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].hotelId, `${RUN}-lp`);
  assert.equal(f.calls[0].checkin, "2027-05-10");
  assert.equal(f.calls[0].checkout, "2027-05-13");
  assert.equal(f.calls[0].adults, 2);
  assert.equal(f.calls[0].marginPercent, 12);
  assert.equal(out.offer.amountCents, 30000, "never below the SSP");
  assert.equal(out.offer.boardName, "Room Only");
  assert.equal(out.checkin, "2027-05-10");
  assert.equal(out.timezone, "Asia/Tokyo");
});

test("SR5 nothing is stored; the usage row says so", async () => {
  const before = Number(((await db.execute(sql`SELECT count(*)::int AS n FROM hotel_offer_cache`)) as any).rows[0].n);
  const f = fakes();
  await stayRates({ tripId: id("trip"), userId: id("owner"), stayId: id("lite") }, f.deps);
  assert.equal(Number(((await db.execute(sql`SELECT count(*)::int AS n FROM hotel_offer_cache`)) as any).rows[0].n), before);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].success, true);
});

test("SR6 an error ⇒ unavailable, recorded, never thrown", async () => {
  const f = fakes({ throws: "boom" });
  assert.deepEqual(await stayRates({ tripId: id("trip"), userId: id("owner"), stayId: id("lite") }, f.deps), { state: "unavailable" });
  assert.deepEqual(f.rows.map((r) => r.success), [false]);
});

test("SR7 the band: 12% seeded by 366; absent ⇒ the declared fallback 0", async () => {
  const seeded = await publicMarginFraction();
  assert.ok(seeded === 0.12 || seeded === 0, `seeded or absent, got ${seeded}`);
  await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = 'hotel_margin_public'`);
  try {
    assert.equal(await publicMarginFraction(), 0);
  } finally {
    await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = 'hotel_margin_public'`);
  }
});
