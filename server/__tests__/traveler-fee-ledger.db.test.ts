/**
 * TRAVELER SERVICE FEE LEDGER — the two-row net-zero suppression contract
 * (ruling 2026-09-02-traveler-fee-applies-everywhere, BLOCKER 1).
 *
 * `recordTravelerServiceFeeLedger` reads each booking's `booking_details.travelerServiceFee`
 * snapshot (never re-resolves) and writes:
 *   - NOT covered → ONE `traveler_service_fee (+X)` row borne by the traveler.
 *   - covered     → that SAME `+X` row PLUS a `fee_waiver (−X)` row tagged `covered_by`, borne by
 *                   the platform. The pair nets to $0 while the migration-179 `amount <> 0` CHECK
 *                   stays intact — the suppressed total is queryable, never silence.
 *   - $0 fee      → nothing (a zero row is forbidden and meaningless).
 * Idempotent per booking id: a second call inserts nothing.
 *
 * The band values come from the real `resolveTravelerServiceFee` (so band_id satisfies the
 * fee_ledger FK, exactly as production stamps it). DISPOSABLE DB ONLY — every row is created and
 * deleted here.
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/traveler-fee-ledger.db.test.ts
 *
 * A HANG MUST FAIL, NEVER STALL (ledger `2026-09-05-fee-ledger-test-robustness`). This file imports
 * the shared `../db` pool, which is built with `allowExitOnIdle: false` — so a process that never
 * calls `pool.end()` stays alive after the last assertion until pg's own `idleTimeoutMillis` reaper
 * happens to close the last socket. That is why a green run of this step measured ~30 s (the
 * reaper's interval), not ~1 s (the assertions), and it is why a run where the reaper never fired —
 * or where an INSERT sat behind a row lock held by the production server this job also starts
 * against the same database — produced a silent multi-hour stall with every assertion already
 * passed. Three layers close that, and NONE of them touches what is asserted:
 *   1. `after()` ends the pool in a `finally`, so the process exits on its own the moment cleanup
 *      is done (the ~30 s idle tail disappears too).
 *   2. every `test()` and both hooks carry an explicit `{ timeout: CASE_TIMEOUT_MS }`, so a blocked
 *      query becomes a REPORTED FAILURE with the case name instead of silence.
 *   3. the workflow step carries `timeout-minutes`, so even a stall below the runner (a wedged
 *      child process) reads as a failed step named in the log rather than a hung job.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { resolveTravelerServiceFee } from "../services/fee-resolution.service";
import { recordTravelerServiceFeeLedger } from "../services/fee-ledger.service";

/** Per-case ceiling. Every case here is a handful of small statements against a disposable DB, so
 *  anything approaching a minute is a block (a lock, a dead socket), not slow work. Exceeding it is
 *  a FAILURE naming the case — never a silent stall. */
const CASE_TIMEOUT_MS = 60_000;

const RUN = crypto.randomUUID().slice(0, 8);
const userId = `tfee-${RUN}-user`;
const bookingIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(
      `[traveler-fee-ledger] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** Insert a payment_pending booking carrying a travelerServiceFee snapshot; return its id. */
async function makeBooking(snapshot: Record<string, unknown> | null): Promise<string> {
  const id = `tfee-${RUN}-bk-${bookingIds.length}`;
  const details = JSON.stringify(snapshot ? { travelerServiceFee: snapshot } : {});
  await db.execute(sql`
    INSERT INTO service_bookings (id, traveler_id, provider_id, status, total_amount, platform_fee, booking_details, created_at)
    VALUES (${id}, ${userId}, ${userId}, 'payment_pending', '100.00', '25.00', ${details}::jsonb, NOW())
  `);
  bookingIds.push(id);
  return id;
}

async function feeRows(bookingId: string): Promise<Array<{ fee_type: string; amount: string; borne_by: string; covered_by: string | null }>> {
  const r = await db.execute(sql`
    SELECT fee_type, amount, borne_by, metadata->>'covered_by' AS covered_by
    FROM fee_ledger WHERE booking_id = ${bookingId}
    ORDER BY fee_type
  `);
  return (r.rows ?? []) as any[];
}

let feeAmount = 0;
let bandId: string | null = null;

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${userId}, ${`tfee-${RUN}@t.test`}, 'Fee', 'Ledger', 'service_provider')`);
  const resolved = await resolveTravelerServiceFee(100);
  feeAmount = resolved.amount;
  bandId = resolved.bandId;
  assert.ok(feeAmount > 0, `the traveler_service_fee band must resolve a positive fee on $100, got ${feeAmount}`);
  assert.ok(bandId, "resolveTravelerServiceFee must return a band id (fee_ledger.band_id FK)");
}, { timeout: CASE_TIMEOUT_MS });

after(async () => {
  // Reverse dependency order: ledger rows → bookings → the fixture user. A failure here is still a
  // reported failure, but the pool is closed either way so the process can never outlive the run.
  try {
    if (bookingIds.length) {
      await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id IN (${sql.join(bookingIds.map((b) => sql`${b}`), sql`, `)})`);
      await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${sql.join(bookingIds.map((b) => sql`${b}`), sql`, `)})`);
    }
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  } finally {
    await pool.end();
  }
}, { timeout: CASE_TIMEOUT_MS });

function snap(over: Record<string, unknown>): Record<string, unknown> {
  return {
    charged: feeAmount,
    wouldHaveBeen: feeAmount,
    rate: 0.07,
    bandId,
    bandKey: "traveler_service_fee",
    capApplied: false,
    waived: false,
    waiverBasis: null,
    ...over,
  };
}

test("NOT covered → ONE traveler_service_fee (+X) row borne by the traveler", { timeout: CASE_TIMEOUT_MS }, async () => {
  const id = await makeBooking(snap({ charged: feeAmount, waived: false, waiverBasis: null }));
  const { inserted } = await recordTravelerServiceFeeLedger({ bookingIds: [id], actor: "test" });
  assert.equal(inserted, 1, "one row for a non-covered booking");
  const rows = await feeRows(id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fee_type, "traveler_service_fee");
  assert.equal(rows[0].borne_by, "traveler");
  assert.equal(Number(rows[0].amount), feeAmount, "the +X row is the resolved fee");
});

test("covered (trip_pass) → +X AND fee_waiver (−X) netting to $0, tagged covered_by", { timeout: CASE_TIMEOUT_MS }, async () => {
  const id = await makeBooking(snap({ charged: 0, waived: true, waiverBasis: "trip_pass" }));
  const { inserted } = await recordTravelerServiceFeeLedger({ bookingIds: [id], actor: "test" });
  assert.equal(inserted, 2, "two rows for a covered booking");
  const rows = await feeRows(id);
  assert.equal(rows.length, 2);
  const fee = rows.find((r) => r.fee_type === "traveler_service_fee")!;
  const waiver = rows.find((r) => r.fee_type === "fee_waiver")!;
  assert.ok(fee && waiver, "both legs present");
  assert.equal(Number(fee.amount), feeAmount, "+X leg");
  assert.equal(Number(waiver.amount), -feeAmount, "−X leg");
  assert.equal(waiver.borne_by, "platform", "the platform bears the waiver");
  assert.equal(waiver.covered_by, "trip_pass", "waiver is tagged covered_by:trip_pass");
  const net = Number(fee.amount) + Number(waiver.amount);
  assert.equal(net, 0, "the pair nets to $0");
});

test("$0 fee → no row (the amount<>0 CHECK is respected, not fired)", { timeout: CASE_TIMEOUT_MS }, async () => {
  const id = await makeBooking(snap({ charged: 0, wouldHaveBeen: 0, waived: false }));
  const { inserted, considered } = await recordTravelerServiceFeeLedger({ bookingIds: [id], actor: "test" });
  assert.equal(considered, 0, "a $0 fee is not considered");
  assert.equal(inserted, 0, "nothing written for a $0 fee");
  assert.equal((await feeRows(id)).length, 0);
});

test("no snapshot (pre-lane booking) → nothing written", { timeout: CASE_TIMEOUT_MS }, async () => {
  const id = await makeBooking(null);
  const { inserted } = await recordTravelerServiceFeeLedger({ bookingIds: [id], actor: "test" });
  assert.equal(inserted, 0, "a booking with no travelerServiceFee snapshot writes nothing");
  assert.equal((await feeRows(id)).length, 0);
});

test("idempotent — a second call inserts nothing", { timeout: CASE_TIMEOUT_MS }, async () => {
  const id = await makeBooking(snap({ charged: feeAmount }));
  const first = await recordTravelerServiceFeeLedger({ bookingIds: [id], actor: "test" });
  assert.equal(first.inserted, 1);
  const second = await recordTravelerServiceFeeLedger({ bookingIds: [id], actor: "test" });
  assert.equal(second.inserted, 0, "replay is a no-op (deterministic per-booking idempotency key)");
  assert.equal((await feeRows(id)).length, 1, "still exactly one row");
});
