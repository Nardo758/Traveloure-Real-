/**
 * CN-1f: a concierge booking's earnings are held until the trip ends (ledger
 * `2026-11-02-cn1f-concierge-payout-hold`), against a real database.
 *
 *   T1 trip ends in +10 d (Asia/Tokyo), declared now, CONCIERGE_HOLD_DAYS unset → available_at ==
 *      conciergeAccessUntil(end, tz) + holdWindowDays('service_booking') days, on both earning rows
 *   T2 trip ended −3 d, declared now → anchor is the declaration
 *   T3 CONCIERGE_HOLD_DAYS=3 → T1's shape uses 3; a planning booking minted in the same test keeps
 *      holdWindowDays('service_booking')
 *   T4 CONCIERGE_HOLD_DAYS="" and "abc" → same as unset
 *   T5 no resolvable trip end → available_at == declaredAt + days (never NULL), exactly one log line.
 *      trips.end_date is a NOT NULL DATE column, so an unparseable value cannot be stored; the DB case is
 *      a concierge booking with no trip, and the unparseable string is proven on the pure functions.
 *   T6 a trip zone ≠ UTC: the trip end resolves to local midnight after the last day, not UTC midnight
 *   T7 expert row amount == traveler charge × (1 − the beta cohort band's platform rate), read from fee_bands
 *   T8 declaredCompletionWindowDays() is unchanged with CONCIERGE_HOLD_DAYS=3
 *   T9 releaseMaturedEarnings(now < available_at) leaves 'held'; at available_at it releases once
 *
 * All dates are relative to a captured `now`. No rate literals.
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cn1f-concierge-payout-hold.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { holdWindowDays, conciergeHoldDays, conciergeAvailableAt } from "../config/earnings-hold.config";
import { declaredCompletionWindowDays } from "../config/completion-windows.config";
import { conciergeAccessUntil } from "@shared/concierge-access";

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN = crypto.randomUUID().slice(0, 8);
const P = `cn1f-${RUN}`;
const traveler = `${P}-trav`;
const expert = `${P}-exp`;
const svcConcierge = `${P}-svc-c`;
const svcPlanning = `${P}-svc-p`;
const ZONE = "Asia/Tokyo";
const now = new Date();
const savedEnv = process.env.CONCIERGE_HOLD_DAYS;

function isoDay(offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

async function bandRate(key: string): Promise<number> {
  const r = await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS r FROM fee_bands WHERE band_key = ${key}`);
  return (r.rows[0] as any).r as number;
}

let seq = 0;
async function mintFor(opts: { serviceId: string; tripEndOffset?: number | null; total?: string; providerEarnings?: string; platformFee?: string }) {
  seq += 1;
  const tag = `${P}-${seq}`;
  let tripId: string | null = null;
  if (opts.tripEndOffset !== undefined && opts.tripEndOffset !== null) {
    tripId = `${tag}-trip`;
    await db.execute(sql`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone)
      VALUES (${tripId}, ${traveler}, 'CN-1f', 'Kyoto', ${isoDay(opts.tripEndOffset - 2)}, ${isoDay(opts.tripEndOffset)}, ${ZONE})
    `);
  }
  const bookingId = `${tag}-b`;
  const total = opts.total ?? "80.00";
  const details = { paidCharge: { status: "confirmed", amount: Number(total), at: now.toISOString() } };
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, booking_details, total_amount, platform_fee,
      insurance_fee, provider_earnings, status, completion_declared_at)
    VALUES (${bookingId}, ${opts.serviceId}, ${traveler}, ${expert}, ${tripId}, ${JSON.stringify(details)}::jsonb, ${total},
      ${opts.platformFee ?? "0.00"}, '0.00', ${opts.providerEarnings ?? total}, 'completed', ${now.toISOString()}::timestamptz)
  `);
  const booking = await storage.getServiceBooking(bookingId);
  assert.ok(booking);
  const minted = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(minted, true);
  const e = await db.execute(sql`SELECT amount, available_at, status FROM expert_earnings WHERE reference_id = ${bookingId} AND reference_type = 'service_booking'`);
  const p = await db.execute(sql`SELECT available_at FROM provider_earnings WHERE source_id = ${bookingId} AND source_type = 'booking'`);
  const expertRow = e.rows[0] as any;
  const providerRow = p.rows[0] as any;
  assert.ok(expertRow && providerRow, "both earning rows minted");
  return {
    bookingId,
    tripEnd: tripId ? conciergeAccessUntil(isoDay(opts.tripEndOffset as number), ZONE) : null,
    declaredAt: new Date(booking!.completionDeclaredAt as any),
    expertAmount: Number(expertRow.amount),
    expertStatus: String(expertRow.status),
    expertAvailable: new Date(expertRow.available_at),
    providerAvailable: new Date(providerRow.available_at),
  };
}

function withEnv(value: string | undefined) {
  if (value === undefined) delete process.env.CONCIERGE_HOLD_DAYS;
  else process.env.CONCIERGE_HOLD_DAYS = value;
}

before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname;
    assert.ok(["localhost", "127.0.0.1", "::1", ""].includes(host), "refusing to write fixtures to a non-disposable DB");
  }
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role) VALUES
      (${traveler}, ${`${traveler}@t.test`}, 'Cn', 'Traveler', 'traveler'),
      (${expert}, ${`${expert}@t.test`}, 'Cn', 'Expert', 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, service_type, status, approval_status, delivery_method) VALUES
      (${svcConcierge}, ${expert}, 'Local concierge', '80.00', 'concierge', 'active', 'approved', 'async_messaging'),
      (${svcPlanning}, ${expert}, 'Plan review', '80.00', 'planning', 'active', 'approved', 'async_messaging')
  `);
});

after(async () => {
  withEnv(savedEnv);
  await db.execute(sql`DELETE FROM expert_earnings WHERE expert_id = ${expert}`);
  await db.execute(sql`DELETE FROM provider_earnings WHERE provider_id = ${expert}`);
  await db.execute(sql`DELETE FROM platform_revenue WHERE provider_id = ${expert}`);
  await db.execute(sql`DELETE FROM service_bookings WHERE provider_id = ${expert}`);
  await db.execute(sql`DELETE FROM trips WHERE user_id = ${traveler}`);
  await db.execute(sql`DELETE FROM provider_services WHERE user_id = ${expert}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${traveler}, ${expert})`);
  await pool.end();
});

test("T1: trip ends in +10 d → available_at = trip end (trip zone) + the bookings default, on both rows", async () => {
  withEnv(undefined);
  const r = await mintFor({ serviceId: svcConcierge, tripEndOffset: 10 });
  assert.ok(r.tripEnd);
  const expected = r.tripEnd!.getTime() + holdWindowDays("service_booking") * DAY_MS;
  assert.equal(r.expertAvailable.getTime(), expected);
  assert.equal(r.providerAvailable.getTime(), expected);
});

test("T2: trip ended −3 d → the declaration is the anchor", async () => {
  withEnv(undefined);
  const r = await mintFor({ serviceId: svcConcierge, tripEndOffset: -3 });
  const expected = r.declaredAt.getTime() + holdWindowDays("service_booking") * DAY_MS;
  assert.equal(r.expertAvailable.getTime(), expected);
  assert.equal(r.providerAvailable.getTime(), expected);
});

test("T3: CONCIERGE_HOLD_DAYS=3 moves concierge only; a planning booking keeps the bookings default", async () => {
  withEnv("3");
  try {
    const c = await mintFor({ serviceId: svcConcierge, tripEndOffset: 10 });
    assert.equal(c.expertAvailable.getTime(), c.tripEnd!.getTime() + 3 * DAY_MS);
    const p = await mintFor({ serviceId: svcPlanning, tripEndOffset: 10 });
    assert.equal(p.expertAvailable.getTime(), p.declaredAt.getTime() + holdWindowDays("service_booking") * DAY_MS);
  } finally {
    withEnv(undefined);
  }
});

test("T4: an empty or non-numeric CONCIERGE_HOLD_DAYS reads as unset", async () => {
  for (const v of ["", "abc"]) {
    withEnv(v);
    try {
      assert.equal(conciergeHoldDays(), holdWindowDays("service_booking"));
      const r = await mintFor({ serviceId: svcConcierge, tripEndOffset: 10 });
      assert.equal(r.expertAvailable.getTime(), r.tripEnd!.getTime() + holdWindowDays("service_booking") * DAY_MS);
    } finally {
      withEnv(undefined);
    }
  }
});

test("T5: no resolvable trip end → declaration + days, never NULL, one log line", async (t) => {
  withEnv(undefined);
  // The pure path: an unparseable end date resolves to no trip end.
  assert.equal(conciergeAccessUntil("not-a-date", ZONE), null);
  const declared = new Date(now.getTime());
  assert.equal(conciergeAvailableAt(null, declared).getTime(), declared.getTime() + holdWindowDays("service_booking") * DAY_MS);
  // The DB path: a concierge booking with no trip.
  const warn = t.mock.method(logger, "warn");
  const r = await mintFor({ serviceId: svcConcierge, tripEndOffset: null });
  const cn1fLines = warn.mock.calls.filter((c) => String(c.arguments[1] ?? "").includes("concierge booking has no resolvable trip end"));
  assert.equal(cn1fLines.length, 1);
  assert.equal(r.expertAvailable.getTime(), r.declaredAt.getTime() + holdWindowDays("service_booking") * DAY_MS);
  assert.equal(r.providerAvailable.getTime(), r.declaredAt.getTime() + holdWindowDays("service_booking") * DAY_MS);
});

test("T6: a non-UTC trip zone ends at local midnight after the last day, not UTC midnight", async () => {
  withEnv(undefined);
  const r = await mintFor({ serviceId: svcConcierge, tripEndOffset: 10 });
  const lastDay = isoDay(10);
  const local = conciergeAccessUntil(lastDay, ZONE)!;
  const utc = conciergeAccessUntil(lastDay, "UTC")!;
  assert.notEqual(local.getTime(), utc.getTime());
  assert.equal(r.expertAvailable.getTime(), local.getTime() + holdWindowDays("service_booking") * DAY_MS);
});

test("T7: the expert row is the traveler charge × the beta expert share read from fee_bands", async () => {
  withEnv(undefined);
  const platformRate = await bandRate("expert_beta_2026");
  const total = 120;
  const providerEarnings = (total * (1 - platformRate)).toFixed(2);
  const platformFee = (total - Number(providerEarnings)).toFixed(2);
  const r = await mintFor({ serviceId: svcConcierge, tripEndOffset: 10, total: total.toFixed(2), providerEarnings, platformFee });
  assert.equal(r.expertAmount, Number(providerEarnings));
});

test("T8: the traveler's dispute window ignores CONCIERGE_HOLD_DAYS", () => {
  withEnv(undefined);
  const before = declaredCompletionWindowDays();
  withEnv("3");
  try {
    assert.equal(declaredCompletionWindowDays(), before);
    assert.equal(declaredCompletionWindowDays(), holdWindowDays("service_booking"));
  } finally {
    withEnv(undefined);
  }
});

test("T9: release waits for available_at, then releases once", async () => {
  withEnv(undefined);
  const r = await mintFor({ serviceId: svcConcierge, tripEndOffset: 10 });
  const statusOf = async () =>
    String(((await db.execute(sql`SELECT status FROM expert_earnings WHERE reference_id = ${r.bookingId} AND reference_type = 'service_booking'`)).rows[0] as any).status);
  await storage.releaseMaturedEarnings(new Date(r.expertAvailable.getTime() - 1000));
  assert.equal(await statusOf(), "held");
  await storage.releaseMaturedEarnings(r.expertAvailable);
  assert.equal(await statusOf(), "releasable");
  await storage.releaseMaturedEarnings(new Date(r.expertAvailable.getTime() + DAY_MS));
  assert.equal(await statusOf(), "releasable");
});
