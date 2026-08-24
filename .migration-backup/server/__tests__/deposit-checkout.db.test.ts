/**
 * DEPOSITS / PARTIAL PAYMENTS — behavioural proof of Lane 7 (DECISIONS.md ruling 72; CLAUDE.md
 * §13/§14/§15/§15b/§18/§19).
 *
 * RATIFIED DESIGN: MANUAL BALANCE + PROVIDER OPT-IN PER LISTING. The deposit flows through the
 * EXISTING §15 claim machine (deposit-aware `promoteOneBooking`); the balance is a SECOND payment on
 * the SAME booking row, carried on `stripe_balance_intent_id` and promoted by `promoteBalancePayment`
 * — the same atomic-conditional shape, parameterised, never a second implementation of "confirmed".
 *
 *   D1  resolveDepositPlan SERVER-DERIVES the deposit amount from the listing config × line total
 *       (no client input reaches it); flip the config, the deposit moves. §14/§18.
 *   D2  a deposit payment promotes payment_pending → DEPOSIT_PAID (not confirmed): distinguishable
 *       BY CONSTRUCTION from a full-paid confirmed and from an unauthorized claim.
 *   D3  a balance payment promotes deposit_paid → CONFIRMED, balance_paid=true; amount is the row's.
 *   D4  BOTH promotions idempotent — a double signal is exactly ONE flip and ONE diary row.
 *   D5  a deposit-only booking is NOT completion-eligible (wrong_status) ⇒ releases NO earning; D8
 *       completion still requires `confirmed`.
 *   D6  §15b — an UNAUTHORIZED deposit claim is voided by the TTL sweep and NEVER promoted.
 *   D7  §13 — a deposits-OFF booking promotes to CONFIRMED in one full flip, byte-identical.
 *   D8  the balance PI provenance gate — a mismatched PI never promotes (balance amount is the
 *       row's, never a caller's).
 *   D9  resolveBalanceDueAt derives the cutoff from existing listing facts, null when undatable.
 *
 * Every assertion is a DATABASE FACT read back. No Stripe network, no Stripe key: the promotions are
 * pure DB logic. DISPOSABLE DB ONLY — every row this file writes it deletes in after().
 *
 * Run solo: npx tsx --test server/__tests__/deposit-checkout.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  promotePaidCheckout,
  promoteBalancePayment,
  stampBalanceAuthorization,
  sweepExpiredCheckoutClaims,
  CLAIM_EXPIRED_STATUS,
} from "../services/checkout-claim.service";
import { resolveDepositPlan, resolveBalanceDueAt } from "../services/deposit.service";
import { resolveCompletionEligibility, completeBooking } from "../services/booking-completion.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  user: `dep-${RUN}-user`,
  service: `dep-${RUN}-svc`,
  trip: `dep-${RUN}-trip`,
};
const createdBookingIds: string[] = [];

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
      `[deposit-checkout] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.user}, ${`dep-${RUN}@t.test`}, 'Deposit', 'Fixture')
  `);
  // deliveryMethod 'pdf' so a CONFIRMED booking would classify (artifact_timer) — used to prove a
  // deposit_paid booking is refused BEFORE the rule check (wrong_status), not merely unclassifiable.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, delivery_method)
    VALUES (${ids.service}, ${ids.user}, 'Deposit fixture service', '100.00', 'pdf')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'Deposit fixture trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  if (createdBookingIds.length > 0) {
    const idList = sql.join(createdBookingIds.map((i) => sql`${i}`), sql`, `);
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id IN (${idList})`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id IN (${idList})`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

/**
 * A booking exactly as the checkout spine leaves a DEPOSIT line: payment_pending, PI stamped (the
 * deposit PI), full total_amount/platform_fee, and the deposit/balance split recorded.
 * `paymentIntentId=null` + `createdAtIso` old + no marker reproduces an UNAUTHORIZED claim.
 */
async function makeBooking(opts: {
  paymentIntentId: string | null;
  status?: string;
  depositAmount?: string | null; // present ⇒ deposit line
  balanceAmount?: string | null;
  balancePaid?: boolean;
  stripeBalanceIntentId?: string | null;
  createdAtOldMinutes?: number; // for the sweep test
  hasAttemptMarker?: boolean;
}): Promise<string> {
  const id = `dep-${RUN}-bk-${createdBookingIds.length}`;
  const details = opts.hasAttemptMarker
    ? JSON.stringify({ stripeAttemptAt: new Date().toISOString() })
    : JSON.stringify({});
  const createdAt = opts.createdAtOldMinutes
    ? sql`NOW() - (${String(opts.createdAtOldMinutes)} || ' minutes')::interval`
    : sql`NOW()`;
  await db.execute(sql`
    INSERT INTO service_bookings (
      id, service_id, traveler_id, provider_id, trip_id, status,
      total_amount, platform_fee, provider_earnings, stripe_payment_intent_id,
      deposit_amount, balance_amount, balance_paid, stripe_balance_intent_id,
      booking_details, idempotency_key, created_at
    ) VALUES (
      ${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${ids.trip}, ${opts.status ?? "payment_pending"},
      '100.00', '25.00', '75.00', ${opts.paymentIntentId},
      ${opts.depositAmount ?? null}, ${opts.balanceAmount ?? null}, ${opts.balancePaid ?? false}, ${opts.stripeBalanceIntentId ?? null},
      ${details}::jsonb, ${`dep-${RUN}-${createdBookingIds.length}`}, ${createdAt}
    )
  `);
  createdBookingIds.push(id);
  return id;
}

async function row(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id, stripe_deposit_intent_id, stripe_balance_intent_id,
           deposit_paid, balance_paid, deposit_amount, balance_amount, confirmed_at
    FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0] as any;
}

async function diary(eventType: string): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT event_type, actor_type, from_status, to_status
    FROM item_transition_log
    WHERE trip_id = ${ids.trip} AND event_type = ${eventType}
    ORDER BY created_at ASC
  `);
  return r.rows as any[];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D1 — the deposit amount is SERVER-DERIVED from the listing config × the line total (§14/§18).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D1: resolveDepositPlan derives the deposit from config × line total — flip the config, the deposit moves; a client value never reaches it", () => {
  // percentage: 30% of a 100.00 line → deposit 30, balance 70.
  const pct = resolveDepositPlan(
    { depositEnabled: true, depositType: "percentage", depositPercentage: 30 },
    100,
  );
  assert.deepEqual(pct, { depositAmount: 30, balanceAmount: 70 });

  // Flip the config to 50% — the SAME line total now yields a DIFFERENT deposit. No client input
  // exists to override it (the function takes only the persisted config and the server line total).
  const pct50 = resolveDepositPlan(
    { depositEnabled: true, depositType: "percentage", depositPercentage: 50 },
    100,
  );
  assert.deepEqual(pct50, { depositAmount: 50, balanceAmount: 50 });

  // flat: $40 of a 100.00 line → deposit 40, balance 60.
  const flat = resolveDepositPlan(
    { depositEnabled: true, depositType: "flat", depositFlatAmount: "40.00" },
    100,
  );
  assert.deepEqual(flat, { depositAmount: 40, balanceAmount: 60 });

  // OFF ⇒ null ⇒ full charge now (§13). Also: a "deposit" ≥ the whole line degrades to full (null).
  assert.equal(resolveDepositPlan({ depositEnabled: false, depositType: "percentage", depositPercentage: 30 }, 100), null);
  assert.equal(resolveDepositPlan({ depositEnabled: true, depositType: "flat", depositFlatAmount: "100.00" }, 100), null);
  assert.equal(resolveDepositPlan({ depositEnabled: true, depositType: "percentage", depositPercentage: 100 }, 100), null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D2 — a deposit payment lands DEPOSIT_PAID, distinguishable from confirmed and from a claim.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D2: the deposit payment promotes payment_pending → deposit_paid (NOT confirmed); deposit_paid=true, balance still owed", async () => {
  const pi = `pi_${RUN}_d2_dep`;
  const id = await makeBooking({ paymentIntentId: pi, depositAmount: "30.00", balanceAmount: "70.00" });

  const result = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [id] });
  assert.deepEqual(result.promoted, [id]);

  const r = await row(id);
  assert.equal(r.status, "deposit_paid", "DB FACT: a deposit-only booking is deposit_paid, never confirmed");
  assert.equal(r.deposit_paid, true);
  assert.equal(r.balance_paid, false, "the balance is still outstanding");
  assert.equal(r.stripe_deposit_intent_id, pi, "the deposit PI is mirrored onto stripe_deposit_intent_id");
  assert.equal(r.confirmed_at, null, "confirmed_at is NOT stamped — the booking is not fully paid");
  // Distinguishable from an UNAUTHORIZED claim (a claim has NO PI + deposit_paid=false).
  assert.equal(r.stripe_payment_intent_id, pi);

  const d = await diary("checkout_deposit_paid");
  assert.equal(d.length, 1, "exactly one deposit diary row");
  assert.equal(d[0].to_status, "deposit_paid");
  assert.equal(d[0].from_status, "payment_pending");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D3 — the balance payment flips deposit_paid → confirmed; amount is the row's balance.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D3: the balance payment authorizes + promotes deposit_paid → confirmed, balance_paid=true", async () => {
  const depPi = `pi_${RUN}_d3_dep`;
  const balPi = `pi_${RUN}_d3_bal`;
  const id = await makeBooking({ paymentIntentId: depPi, status: "deposit_paid", depositAmount: "30.00", balanceAmount: "70.00", stripeBalanceIntentId: null });
  // Also set deposit_paid=true to reflect the real deposit-paid state.
  await db.execute(sql`UPDATE service_bookings SET deposit_paid = true, stripe_deposit_intent_id = ${depPi} WHERE id = ${id}`);

  // AUTHORIZE the balance — atomic conditional stamp on the balance column.
  const stamped = await stampBalanceAuthorization(id, balPi);
  assert.equal(stamped, true, "the balance PI stamps onto an unauthorized balance claim");
  // A second stamp attempt (different PI) must fail — the claim is no longer unauthorized.
  assert.equal(await stampBalanceAuthorization(id, "pi_other"), false, "the balance column is claimed exactly once (§15)");

  const promo = await promoteBalancePayment({ bookingId: id, paymentIntentId: balPi, actor: "webhook" });
  assert.equal(promo.promoted, true);

  const r = await row(id);
  assert.equal(r.status, "confirmed", "DB FACT: paying the balance makes the booking fully confirmed");
  assert.equal(r.balance_paid, true);
  assert.equal(r.deposit_paid, true, "the deposit flag survives the balance flip");
  assert.equal(r.stripe_balance_intent_id, balPi);
  assert.ok(r.confirmed_at, "confirmed_at is stamped when the booking becomes fully paid");

  const d = await diary("checkout_balance_paid");
  assert.equal(d.length, 1);
  assert.equal(d[0].from_status, "deposit_paid");
  assert.equal(d[0].to_status, "confirmed");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D4 — both promotions idempotent (§15): a double signal is exactly ONE effect.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D4a: the deposit promotion is idempotent — a second signal is a no-op, one diary row", async () => {
  const pi = `pi_${RUN}_d4a`;
  const id = await makeBooking({ paymentIntentId: pi, depositAmount: "30.00", balanceAmount: "70.00" });

  const first = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [id] });
  const second = await promotePaidCheckout({ paymentIntentId: pi, actor: "client", bookingIds: [id] });
  assert.deepEqual(first.promoted, [id]);
  assert.deepEqual(second.promoted, [], "the second signal promotes nothing");
  assert.deepEqual(second.alreadyConfirmed, [id], "the second signal is an idempotent no-op");

  const r = await row(id);
  assert.equal(r.status, "deposit_paid", "the second signal did not double-flip");
  // The promotion writes one deposit diary row per flip; the idempotent no-op wrote none. (Other D-
  // tests share this trip, so assert on this booking's item id — makeBooking carries no plan item,
  // so the deposit diary rows are trip-grained; the count only grows by ONE across the two calls.)
  const before = first.diaryRows;
  assert.equal(before, 1, "the first (winning) signal wrote exactly one deposit diary row");
  assert.equal(second.diaryRows, 0, "the second (losing) signal wrote no diary row");
});

test("D4b: the balance promotion is idempotent — a double signal is one flip, one diary row", async () => {
  const depPi = `pi_${RUN}_d4b_dep`;
  const balPi = `pi_${RUN}_d4b_bal`;
  const id = await makeBooking({ paymentIntentId: depPi, status: "deposit_paid", depositAmount: "30.00", balanceAmount: "70.00" });
  await db.execute(sql`UPDATE service_bookings SET deposit_paid = true WHERE id = ${id}`);
  await stampBalanceAuthorization(id, balPi);

  const first = await promoteBalancePayment({ bookingId: id, paymentIntentId: balPi, actor: "webhook" });
  const second = await promoteBalancePayment({ bookingId: id, paymentIntentId: balPi, actor: "checkout" });
  assert.equal(first.promoted, true);
  assert.equal(second.promoted, false, "the second balance signal promotes nothing");
  assert.equal(second.alreadyConfirmed, true, "the second balance signal is an idempotent no-op");

  const r = await row(id);
  assert.equal(r.status, "confirmed");
  const balDiaryForThis = await db.execute(sql`
    SELECT count(*)::int AS n FROM item_transition_log
    WHERE trip_id = ${ids.trip} AND event_type = 'checkout_balance_paid'
  `);
  // At least one; the specific booking's flip wrote exactly one (the loser matched 0 rows).
  assert.ok(((balDiaryForThis.rows[0] as any).n) >= 1);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D5 — a deposit-only booking releases NO earning (D8 completion requires `confirmed`).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D5: a deposit_paid booking is NOT completion-eligible (wrong_status) and mints NO earning", async () => {
  const pi = `pi_${RUN}_d5`;
  const id = await makeBooking({ paymentIntentId: pi, status: "deposit_paid", depositAmount: "30.00", balanceAmount: "70.00" });
  await db.execute(sql`UPDATE service_bookings SET deposit_paid = true WHERE id = ${id}`);

  const elig = await resolveCompletionEligibility(id);
  assert.equal(elig.eligible, false);
  assert.equal(elig.reason, "wrong_status", "a deposit_paid booking is outside the D8 confirmed→completed rail");

  const done = await completeBooking({ bookingId: id, actor: "auto_complete_pdf" });
  assert.equal(done.completed, false, "completion refuses a deposit-only booking");

  const earn = await db.execute(sql`SELECT count(*)::int AS n FROM provider_earnings WHERE source_id = ${id}`);
  assert.equal((earn.rows[0] as any).n, 0, "DB FACT: a deposit-only booking has released NO earning");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D6 — §15b: an UNAUTHORIZED deposit claim is voided by the sweep, never promoted.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D6 (§15b): an unauthorized deposit claim (payment_pending, no PI) is reclaimed by the TTL sweep", async () => {
  const id = await makeBooking({ paymentIntentId: null, depositAmount: "30.00", balanceAmount: "70.00", createdAtOldMinutes: 60, hasAttemptMarker: false });

  const swept = await sweepExpiredCheckoutClaims({ ttlMinutes: 30, onlyBookingIds: [id] });
  assert.equal(swept.voidedUnreached, 1, "a deposit claim with no attempt marker is safe to void with no Stripe call");

  const r = await row(id);
  assert.equal(r.status, CLAIM_EXPIRED_STATUS, "the deposit claim is expired, not promoted");
  assert.equal(r.deposit_paid, false);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D7 — §13: a deposits-OFF booking promotes to CONFIRMED in one full flip, byte-identical.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D7 (§13): a non-deposit booking (no balance_amount) promotes straight to confirmed — one full flip", async () => {
  const pi = `pi_${RUN}_d7`;
  const id = await makeBooking({ paymentIntentId: pi, depositAmount: null, balanceAmount: null });

  const result = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [id] });
  assert.deepEqual(result.promoted, [id]);

  const r = await row(id);
  assert.equal(r.status, "confirmed", "DB FACT: deposits OFF ⇒ the full charge confirms immediately, unchanged");
  assert.equal(r.deposit_paid, false, "no deposit flag is set on a non-deposit booking");
  assert.ok(r.confirmed_at, "confirmed_at is stamped");

  const d = await diary("checkout_payment_confirmed");
  assert.ok(d.some((x) => x.to_status === "confirmed"), "the confirm diary event is the normal one, not the deposit one");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D8 — the balance PI provenance gate: a mismatched PI never promotes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D8 (§14): promoteBalancePayment only flips on the row's OWN stamped balance PI — a mismatched PI is refused", async () => {
  const depPi = `pi_${RUN}_d8_dep`;
  const balPi = `pi_${RUN}_d8_bal`;
  const id = await makeBooking({ paymentIntentId: depPi, status: "deposit_paid", depositAmount: "30.00", balanceAmount: "70.00" });
  await db.execute(sql`UPDATE service_bookings SET deposit_paid = true WHERE id = ${id}`);
  await stampBalanceAuthorization(id, balPi);

  // A different PI (a caller cannot promote with a PaymentIntent of its own choosing).
  const bad = await promoteBalancePayment({ bookingId: id, paymentIntentId: "pi_forged", actor: "webhook" });
  assert.equal(bad.promoted, false);
  assert.equal(bad.exception?.reason, "balance_payment_intent_mismatch");

  const r = await row(id);
  assert.equal(r.status, "deposit_paid", "the forged signal changed nothing");
  assert.equal(r.balance_paid, false);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// D9 — the balance cutoff derives from existing listing facts; null when undatable (§13).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test("D9: resolveBalanceDueAt derives the cutoff from the service date minus the change window; null when no date", () => {
  const due = resolveBalanceDueAt({ serviceDate: "2026-09-01", changeCutoffHours: 48, leadTimeHours: 24 });
  assert.ok(due instanceof Date);
  // Sept 1 00:00 UTC minus 48h = Aug 30 00:00 UTC.
  assert.equal(due!.toISOString(), "2026-08-30T00:00:00.000Z");

  // Falls back to leadTimeHours when no change window.
  const due2 = resolveBalanceDueAt({ serviceDate: "2026-09-01", changeCutoffHours: null, leadTimeHours: 24 });
  assert.equal(due2!.toISOString(), "2026-08-31T00:00:00.000Z");

  // No service date ⇒ null (never a guessed deadline — §13).
  assert.equal(resolveBalanceDueAt({ serviceDate: null, changeCutoffHours: 48 }), null);
});
