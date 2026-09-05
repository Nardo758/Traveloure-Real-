/**
 * THE BALANCE CLAIM IS STILL THE GUARD — the §15 half of ledger `2026-09-04-cost-split-phase-one`.
 *
 * ⚠️ NOT EXECUTED BY THE LANE THAT WROTE IT. This file needs a disposable database (a real
 * `DATABASE_URL`); the build environment that authored it had none, so these proofs are WRITTEN
 * AND UNRUN — the same honest posture `deposit-cancel.db.test.ts` and the bench-only HTTP suites
 * carry. No CI wiring is added by this lane. The lane's EXECUTED proofs are the two pure suites
 * (`balance-payer.test.ts`, `pay-balance-idempotency.test.ts`, 15/15).
 *
 * WHAT THIS GUARDS
 * ────────────────
 * Cost split phase one widened WHO may pay a balance. The thing it must NOT have widened is HOW a
 * balance payment is claimed. Two atomic conditionals carry that, in order, and the permission
 * check is neither of them — a permission check is not a claim, and a check-then-update is the bug
 * (§15):
 *
 *   C1  THE PAYER CLAIM WINS ONCE, AND IS IDEMPOTENT FOR ITS HOLDER. Taken BEFORE the Stripe
 *       call, because on the saved-card branch that call sends `off_session: true, confirm: true`
 *       — a REAL CHARGE at creation. Two payers now hold two DIFFERENT idempotency keys (they
 *       must: the intent is built from the actor), so without this claim two concurrent payers
 *       would take TWO REAL CHARGES for one balance, and no post-call stamp could undo it.
 *   C2  A DIFFERENT PAYER IS REFUSED WHILE A CLAIM STANDS — `heldBy` names the holder, and the
 *       route answers 409 without ever calling Stripe.
 *   C3  A ROW THAT IS NOT AN OPEN BALANCE IS NOT CLAIMABLE (`notClaimable`, never `heldBy`).
 *
 *   P1  A SINGLE STAMP WINS and records WHO paid — the payer id rides the SAME statement that
 *       stamps the PI, merged into `booking_details` so every other key survives.
 *   P2  THE SECOND PAYER LOSES AT THE STATEMENT. Two collaborators racing the same booking:
 *       exactly one stamp succeeds, the loser's PI is never stamped, and — the money-relevant
 *       part — the loser CANNOT REWRITE who is recorded as paying. One balance, one payer.
 *   P3  A ROW THAT IS NOT `deposit_paid` IS NEVER STAMPED (nothing to pay a balance on).
 *   P4  THE DIARY NAMES THE PAYER EVEN WHEN THE WEBHOOK PROMOTES — the webhook has no session,
 *       so before this ruling its `checkout_balance_paid` row carried `actor_id = NULL`. With
 *       two possible payers that is no longer an answer.
 *   P5  A DOUBLE SIGNAL IS EXACTLY ONE FLIP AND ONE DIARY ROW (unchanged by this lane, asserted
 *       because the lane touched the promotion).
 *   P6  A PI THAT IS NOT THE STAMPED ONE PROMOTES NOTHING — a caller cannot promote with a
 *       PaymentIntent of its own choosing.
 *   P7  OMITTING THE PAYER LEAVES `booking_details` BYTE-IDENTICAL — the pre-ruling behaviour of
 *       every other caller is preserved, and a missing payer is never written as a null that
 *       would read as "nobody paid it" (§13).
 *   P8  THE STAMP ITSELF REFUSES A NON-HOLDER — defence in depth behind the claim, not a second
 *       copy of it.
 *
 * Every assertion is a DATABASE FACT read back after the call. No Stripe network, no Stripe key:
 * both functions under test are pure DB logic.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run solo (with a disposable DATABASE_URL):
 *   npx tsx --test server/__tests__/balance-payer-atomicity.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  claimBalancePayer,
  stampBalanceAuthorization,
  promoteBalancePayment,
} from "../services/checkout-claim.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `balp-${RUN}-owner`,
  collaborator: `balp-${RUN}-collab`,
  rival: `balp-${RUN}-rival`,
  service: `balp-${RUN}-svc`,
  trip: `balp-${RUN}-trip`,
};
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (identical posture to checkout-payment-promotion.db.test.ts) ─────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[balance-payer-atomicity] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  for (const [id, first] of [
    [ids.owner, "Owner"],
    [ids.collaborator, "Collab"],
    [ids.rival, "Rival"],
  ] as const) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name)
      VALUES (${id}, ${`${id}@t.test`}, ${first}, 'Fixture')
    `);
  }
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.owner}, 'Balance payer fixture service', '500.00')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.owner}, 'Balance payer fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  for (const id of [ids.owner, ids.collaborator, ids.rival]) {
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
  }
});

/**
 * A deposit-partial booking exactly as the deposit checkout leaves it: `deposit_paid`, the deposit
 * PI stamped, a $350 balance outstanding and NO balance PI — the unauthorized balance claim.
 */
async function makeDepositPaidBooking(opts?: { status?: string }): Promise<string> {
  const id = `balp-${RUN}-bk-${createdBookingIds.length}`;
  const details = JSON.stringify({ itineraryItemId: null, keepMe: "untouched" });
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, trip_id, status,
      total_amount, platform_fee, stripe_payment_intent_id, stripe_deposit_intent_id,
      deposit_amount, deposit_paid, balance_amount, balance_paid, booking_details, created_at
    ) VALUES (
      ${id}, ${ids.service}, ${ids.owner}, ${ids.owner}, ${ids.trip}, ${opts?.status ?? "deposit_paid"},
      '400.00', '100.00', ${`pi-${RUN}-deposit`}, ${`pi-${RUN}-deposit`},
      '150.00', true, '350.00', false, ${details}::jsonb, NOW()
    )
  `);
  createdBookingIds.push(id);
  return id;
}

async function bookingRow(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, balance_paid, stripe_balance_intent_id,
           booking_details->>'balancePaidByUserId' AS balance_payer,
           booking_details->>'keepMe'              AS keep_me
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

async function balanceDiaryRows(bookingTripId: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT actor_type, actor_id, from_status, to_status
    FROM item_transition_log
    WHERE trip_id = ${bookingTripId} AND event_type = 'checkout_balance_paid'
    ORDER BY created_at ASC
  `);
  return r.rows as any[];
}

test("C1 — the payer claim wins once and is idempotent for its holder", async () => {
  const bookingId = await makeDepositPaidBooking();
  const first = await claimBalancePayer(bookingId, ids.collaborator);
  assert.equal(first.claimed, true);
  assert.equal(first.heldBy, null);

  // The SAME payer re-entering (a retry, a double-click) re-claims and proceeds — otherwise §15
  // layer a's "one payer retrying gets one charge" would be broken by the guard meant to protect it.
  const again = await claimBalancePayer(bookingId, ids.collaborator);
  assert.equal(again.claimed, true);

  const row = await bookingRow(bookingId);
  assert.equal(row.balance_payer, ids.collaborator);
  assert.equal(row.keep_me, "untouched", "the claim merges into booking_details, never assigns over it");
  assert.equal(row.stripe_balance_intent_id, null, "the claim precedes the Stripe call — nothing is stamped yet");
  assert.equal(row.status, "deposit_paid");
});

test("C2 — a DIFFERENT payer is refused while a claim stands, and is told who holds it", async () => {
  const bookingId = await makeDepositPaidBooking();
  assert.equal((await claimBalancePayer(bookingId, ids.collaborator)).claimed, true);

  const rival = await claimBalancePayer(bookingId, ids.rival);
  assert.equal(rival.claimed, false, "without this, two payers reach Stripe and the saved-card branch charges twice");
  assert.equal(rival.heldBy, ids.collaborator);
  assert.equal(rival.notClaimable, false);

  const row = await bookingRow(bookingId);
  assert.equal(row.balance_payer, ids.collaborator, "a refused claim rewrites nothing");
});

test("C3 — a row that is not an open balance is not claimable (and names no holder)", async () => {
  for (const status of ["confirmed", "payment_pending", "cancelled"]) {
    const bookingId = await makeDepositPaidBooking({ status });
    const claim = await claimBalancePayer(bookingId, ids.collaborator);
    assert.equal(claim.claimed, false, `status ${status} must not be claimable`);
    assert.equal(claim.heldBy, null, "no holder — the row simply has no open balance");
    assert.equal(claim.notClaimable, true);
    assert.equal((await bookingRow(bookingId)).balance_payer, null, "a refused claim writes nothing");
  }

  // An already-STAMPED balance is likewise not claimable: the leg is past claiming.
  const stampedBooking = await makeDepositPaidBooking();
  assert.equal(await stampBalanceAuthorization(stampedBooking, `pi-${RUN}-bal-c3`, ids.collaborator), true);
  const afterStamp = await claimBalancePayer(stampedBooking, ids.rival);
  assert.equal(afterStamp.claimed, false);
  assert.equal(afterStamp.notClaimable, true);
});

test("P1 — one stamp wins and records WHO paid, merging into booking_details", async () => {
  const bookingId = await makeDepositPaidBooking();
  const ok = await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-1`, ids.collaborator);
  assert.equal(ok, true);

  const row = await bookingRow(bookingId);
  assert.equal(row.stripe_balance_intent_id, `pi-${RUN}-bal-1`);
  assert.equal(row.balance_payer, ids.collaborator, "the payer is recorded by the statement that stamps");
  assert.equal(row.keep_me, "untouched", "the merge must not clobber other booking_details keys");
  assert.equal(row.status, "deposit_paid", "authorization is not promotion — the status has not moved");
});

test("P2 — the second payer loses AT THE STATEMENT and cannot rewrite who pays", async () => {
  const bookingId = await makeDepositPaidBooking();
  const first = await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-a`, ids.collaborator);
  const second = await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-b`, ids.rival);
  assert.equal(first, true);
  assert.equal(second, false, "the claim, not the permission check, is what decides the winner");

  const row = await bookingRow(bookingId);
  assert.equal(row.stripe_balance_intent_id, `pi-${RUN}-bal-a`, "the loser's PI is never stamped");
  assert.equal(row.balance_payer, ids.collaborator, "one balance, one recorded payer");
});

test("P3 — a row that is not `deposit_paid` is never stamped", async () => {
  for (const status of ["confirmed", "payment_pending", "cancelled", "completed"]) {
    const bookingId = await makeDepositPaidBooking({ status });
    const ok = await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-${status}`, ids.collaborator);
    assert.equal(ok, false, `status ${status} must not accept a balance authorization`);
    const row = await bookingRow(bookingId);
    assert.equal(row.stripe_balance_intent_id, null);
    assert.equal(row.balance_payer, null, "a refused stamp writes nothing at all");
  }
});

test("P4 — the WEBHOOK's diary row names the payer recorded at authorization", async () => {
  const bookingId = await makeDepositPaidBooking();
  const pi = `pi-${RUN}-bal-webhook`;
  assert.equal(await stampBalanceAuthorization(bookingId, pi, ids.collaborator), true);

  // The webhook has no session and passes no actorId — exactly the caller shape that used to
  // produce `actor_id = NULL`.
  const promo = await promoteBalancePayment({ bookingId, paymentIntentId: pi, actor: "webhook" });
  assert.equal(promo.promoted, true);
  assert.equal(promo.diaryRows, 1);

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "confirmed");
  assert.equal(row.balance_paid, true);

  const diary = await balanceDiaryRows(ids.trip);
  const mine = diary.filter((d) => d.actor_id === ids.collaborator && d.actor_type === "webhook");
  assert.equal(mine.length, 1, "the webhook's diary row must name the collaborator who paid");
  assert.equal(mine[0].from_status, "deposit_paid");
  assert.equal(mine[0].to_status, "confirmed");
});

test("P5 — a double signal is exactly one flip and one diary row", async () => {
  const bookingId = await makeDepositPaidBooking();
  const pi = `pi-${RUN}-bal-double`;
  assert.equal(await stampBalanceAuthorization(bookingId, pi, ids.collaborator), true);

  const before = (await balanceDiaryRows(ids.trip)).length;
  const first = await promoteBalancePayment({ bookingId, paymentIntentId: pi, actor: "checkout", actorId: ids.collaborator });
  const second = await promoteBalancePayment({ bookingId, paymentIntentId: pi, actor: "webhook" });
  assert.equal(first.promoted, true);
  assert.equal(second.promoted, false);
  assert.equal(second.alreadyConfirmed, true, "the loser is an idempotent no-op, never a second flip");

  const after = (await balanceDiaryRows(ids.trip)).length;
  assert.equal(after - before, 1, "one balance payment writes exactly one diary row");
});

test("P6 — a PaymentIntent that is not the stamped one promotes nothing", async () => {
  const bookingId = await makeDepositPaidBooking();
  assert.equal(await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-real`, ids.collaborator), true);

  const promo = await promoteBalancePayment({
    bookingId,
    paymentIntentId: `pi-${RUN}-bal-forged`,
    actor: "webhook",
  });
  assert.equal(promo.promoted, false);
  assert.equal(promo.alreadyConfirmed, false);
  assert.equal(promo.exception?.reason, "balance_payment_intent_mismatch");

  const row = await bookingRow(bookingId);
  assert.equal(row.status, "deposit_paid", "the row is untouched by a PI it did not stamp");
  assert.equal(row.balance_paid, false);
});

test("P8 — the stamp itself refuses a payer who does not hold the claim", async () => {
  const bookingId = await makeDepositPaidBooking();
  assert.equal((await claimBalancePayer(bookingId, ids.collaborator)).claimed, true);

  // Defence in depth behind claimBalancePayer: even reaching the stamp directly, a non-holder
  // cannot authorize a balance on someone else's claim.
  assert.equal(await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-p8-rival`, ids.rival), false);
  let row = await bookingRow(bookingId);
  assert.equal(row.stripe_balance_intent_id, null);
  assert.equal(row.balance_payer, ids.collaborator);

  // The holder still stamps normally.
  assert.equal(await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-p8-ok`, ids.collaborator), true);
  row = await bookingRow(bookingId);
  assert.equal(row.stripe_balance_intent_id, `pi-${RUN}-bal-p8-ok`);
});

test("P7 — omitting the payer leaves booking_details byte-identical (pre-ruling behaviour)", async () => {
  const bookingId = await makeDepositPaidBooking();
  const beforeRow = await db.execute(sql`SELECT booking_details FROM service_bookings WHERE id = ${bookingId}`);
  assert.equal(await stampBalanceAuthorization(bookingId, `pi-${RUN}-bal-nopayer`), true);
  const afterRow = await db.execute(sql`SELECT booking_details FROM service_bookings WHERE id = ${bookingId}`);
  assert.deepEqual(
    (afterRow.rows[0] as any).booking_details,
    (beforeRow.rows[0] as any).booking_details,
    "a caller that passes no payer must not change the jsonb at all",
  );

  const row = await bookingRow(bookingId);
  assert.equal(row.balance_payer, null, "an unknown payer is absent, never a null that reads as an answer");
});
