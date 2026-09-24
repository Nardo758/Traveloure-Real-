/**
 * A LOST CHARGEBACK IS NEVER REFUNDED A SECOND TIME (decision-maker, Sep 24, 2026; PR #1066).
 *
 *   L1  The dispute handler records a LOST chargeback on each booking (redelivery idempotent); a WON
 *       one records nothing.
 *   L2  No lost chargeback on record ⇒ allowed with NO Stripe lookup at all.
 *   L3  A full lost chargeback ⇒ the refund is refused at the Stripe boundary: no Stripe refund call,
 *       the status claim is put back, earnings untouched; the pre-ledger check refuses too.
 *   L4  A PARTIAL chargeback ⇒ a refund that fits in what is left is allowed; one that reaches into
 *       the charged-back money is refused.
 *   L5  One payment, two bookings ⇒ the allowance is per payment: the first refund fits, the second
 *       would reach the charged-back money and is refused.
 *   L6  A retry of the SAME refund (same source, booking and amount already at Stripe) is allowed.
 *   L7  Stripe unreachable while a lost chargeback is on record ⇒ refused (fail closed).
 *   L8  An already-refunded booking passes the pre-ledger check (the refund path answers it as a no-op).
 *   L9  Ledger-only reconciliation, full chargeback: earnings and revenue reversed, recorded once; a
 *       retry reverses nothing twice.
 *   L10 Partial chargeback reconciliation: revenue reversed in proportion, earnings left on hold.
 *   L11 Reconciliation refuses a booking with no lost chargeback (not_found) and fails closed when
 *       Stripe cannot be reached.
 *   L12 Static pins: every ledger-first refund entry point checks BEFORE it reverses the ledger, and
 *       the reconcile route takes a `.strict()` note only.
 *   L13 An OPEN chargeback is reported for its bookings until Stripe closes it (won or lost).
 *   L14 The rejected-artifact refund refuses while a chargeback is open: no Stripe call, earnings and
 *       revenue untouched, status untouched. The uphold route checks it before the ledger (pinned).
 *
 * NO FEE LITERALS (§8): fixture amounts are arbitrary and asserted only as money in/out.
 * DISPOSABLE DB ONLY. The Stripe lookup is injected; `stripe.refunds.create` is replaced and counted.
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/lost-chargeback-guard.db.test.ts
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { stripe, stripePaymentService } from "../services/stripe-payment.service";
import { handleStripeDispute } from "../services/stripe-dispute.service";
import {
  _lostChargebackTestHooks,
  checkBookingRefundAgainstLostChargebacks,
  checkRefundAgainstLostChargebacks,
  checkServiceBookingRefundPreflight,
  openChargebacksOnBooking,
  reconcileLostChargeback,
  type PaymentIntentLedger,
} from "../services/lost-chargeback-guard.service";
import { refundRejectedArtifact } from "../services/artifact-rejection-refund.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { provider: `lcb-${RUN}-prov`, traveler: `lcb-${RUN}-trav`, service: `lcb-${RUN}-svc` };
const bookingIds: string[] = [];
const disputeIds: string[] = [];

let lookups = 0;
function ledger(l: Partial<PaymentIntentLedger>) {
  _lostChargebackTestHooks.lookup = async () => {
    lookups++;
    return { chargedCents: 0, refundedCents: 0, lostChargebackCents: 0, refunds: [], ...l };
  };
}

const refundCalls: any[] = [];
const realCreate = stripe.refunds.create.bind(stripe.refunds);

async function seedBooking(pi: string, status = "confirmed", total = "100.00"): Promise<string> {
  const id = `lcb-${RUN}-bk-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee,
                                  provider_earnings, stripe_payment_intent_id)
    VALUES (${id}, ${ids.service}, ${ids.traveler}, ${ids.provider}, ${status}, ${total}, '0.00', '75.00', ${pi})
  `);
  bookingIds.push(id);
  return id;
}

async function row(id: string): Promise<any> {
  return (await db.execute(sql`SELECT status, booking_details FROM service_bookings WHERE id = ${id}`)).rows[0];
}

/** Lose a chargeback on `pi` through the real handler (bookings → dispute_lost + recorded). */
async function loseChargeback(pi: string, amountCents: number, status = "lost") {
  const disputeId = `dp_lcb_${RUN}_${crypto.randomUUID().slice(0, 6)}`;
  disputeIds.push(disputeId);
  const charge = { id: `ch_lcb_${RUN}_${disputeId}`, payment_intent: pi, metadata: {} };
  const fake = { charges: { retrieve: async () => charge } } as any;
  const dispute = { id: disputeId, charge, status, reason: "fraudulent", amount: amountCents } as any;
  await handleStripeDispute(dispute, fake, { closed: true, eventId: `evt_lcb_${disputeId}` });
  return { disputeId, dispute, fake };
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`${ids.provider}@t.test`}, 'LCB', 'Provider', 'service_provider'),
           (${ids.traveler}, ${`${ids.traveler}@t.test`}, 'LCB', 'Traveler', 'user')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status)
    VALUES (${ids.service}, ${ids.provider}, ${`LCB service ${RUN}`}, 'fixture', '100.00', 'active', 'approved')
  `);
  (stripe.refunds as any).create = async (params: any, opts: any) => {
    refundCalls.push({ params, opts });
    return { id: `re_lcb_${RUN}_${refundCalls.length}`, amount: params.amount, status: "succeeded", metadata: params.metadata };
  };
});

afterEach(() => {
  delete _lostChargebackTestHooks.lookup;
});

after(async () => {
  (stripe.refunds as any).create = realCreate;
  for (const id of bookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM refunds WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM notifications WHERE data->>'bookingId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'bookingId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const d of disputeIds) {
    await db.execute(sql`DELETE FROM stripe_dispute_lifecycle WHERE dispute_id = ${d}`).catch(() => {});
    await db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'disputeId' = ${d}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

test("L1: a lost chargeback is recorded on its bookings (idempotent); a won one records nothing", async () => {
  const pi = `pi_lcb_${RUN}_l1`;
  const a = await seedBooking(pi);
  const b = await seedBooking(pi);
  const { disputeId, dispute, fake } = await loseChargeback(pi, 5000);
  for (const id of [a, b]) {
    const r = await row(id);
    assert.equal(r.status, "dispute_lost");
    assert.equal(r.booking_details.lostChargebacks[disputeId].amountCents, 5000);
    assert.equal(r.booking_details.lostChargebacks[disputeId].paymentIntentId, pi);
  }
  await handleStripeDispute(dispute, fake, { closed: true, eventId: `evt_lcb_${disputeId}_again` });
  assert.deepEqual(Object.keys((await row(a)).booking_details.lostChargebacks), [disputeId]);

  const piWon = `pi_lcb_${RUN}_l1won`;
  const c = await seedBooking(piWon);
  await loseChargeback(piWon, 5000, "won");
  const won = await row(c);
  assert.notEqual(won.status, "dispute_lost");
  assert.equal(won.booking_details?.lostChargebacks, undefined);
});

test("L2: no lost chargeback on record ⇒ allowed, and Stripe is not asked", async () => {
  const pi = `pi_lcb_${RUN}_l2`;
  const id = await seedBooking(pi);
  lookups = 0;
  ledger({ chargedCents: 10000 });
  const r = await checkBookingRefundAgainstLostChargebacks(id, 10000);
  assert.deepEqual(r, { allowed: true, checked: false });
  assert.equal(lookups, 0);
});

test("L3: a full lost chargeback refuses the refund at the Stripe boundary and before the ledger", async () => {
  const pi = `pi_lcb_${RUN}_l3`;
  const id = await seedBooking(pi);
  await loseChargeback(pi, 10000);
  ledger({ chargedCents: 10000, lostChargebackCents: 10000 });

  const pre = await checkServiceBookingRefundPreflight(id, { feeRefundPercent: 100 });
  assert.equal(pre.allowed, false);
  if (!pre.allowed) {
    assert.equal(pre.reason, "lost_chargeback");
    assert.equal(pre.refundableCents, 0);
    assert.match(pre.message, /already returned/);
  }

  const before = refundCalls.length;
  await assert.rejects(
    stripePaymentService.refundServiceBooking(id, "dispute_upheld", { feeRefundPercent: 100 }),
    (err: any) => err?.name === "LostChargebackRefundBlockedError",
  );
  assert.equal(refundCalls.length, before, "no Stripe refund call");
  assert.equal((await row(id)).status, "dispute_lost", "the status claim is put back");
});

test("L4: a partial chargeback blocks only the charged-back money", async () => {
  const pi = `pi_lcb_${RUN}_l4`;
  await seedBooking(pi, "confirmed", "200.00");
  await loseChargeback(pi, 5000);
  ledger({ chargedCents: 20000, lostChargebackCents: 5000 });
  assert.equal((await checkRefundAgainstLostChargebacks({ paymentIntentId: pi, requestedCents: 15000 })).allowed, true);
  const over = await checkRefundAgainstLostChargebacks({ paymentIntentId: pi, requestedCents: 15001 });
  assert.equal(over.allowed, false);
  if (!over.allowed) assert.equal(over.refundableCents, 15000);
});

test("L5: one payment for two bookings — the allowance is per payment", async () => {
  const pi = `pi_lcb_${RUN}_l5`;
  const a = await seedBooking(pi);
  const b = await seedBooking(pi);
  await loseChargeback(pi, 10000);
  ledger({ chargedCents: 20000, lostChargebackCents: 10000 });
  await db.execute(sql`UPDATE service_bookings SET status = 'confirmed' WHERE id = ${a}`);
  await stripePaymentService.refundServiceBooking(a, "requested_by_customer", { feeRefundPercent: 100 });
  assert.equal((await row(a)).status, "refunded", "the first booking's refund fits in what is left");
  // Stripe now reports that refund; the rest of the payment is the charged-back money.
  ledger({ chargedCents: 20000, lostChargebackCents: 10000, refundedCents: 10000 });
  const second = await checkServiceBookingRefundPreflight(b, { feeRefundPercent: 100 });
  assert.equal(second.allowed, false);
});

test("L6: re-driving the SAME refund under its key is allowed", async () => {
  const pi = `pi_lcb_${RUN}_l6`;
  const id = await seedBooking(pi);
  await loseChargeback(pi, 10000);
  ledger({
    chargedCents: 20000,
    lostChargebackCents: 10000,
    refundedCents: 10000,
    refunds: [{ id: "re_prior", amount: 10000, metadata: { source: "service_booking", bookingId: id } }],
  });
  const r = await checkRefundAgainstLostChargebacks({
    paymentIntentId: pi,
    requestedCents: 10000,
    replay: { source: "service_booking", bookingId: id },
  });
  assert.equal(r.allowed, true);
  const other = await checkRefundAgainstLostChargebacks({
    paymentIntentId: pi,
    requestedCents: 10000,
    replay: { source: "service_booking", bookingId: "someone-else" },
  });
  assert.equal(other.allowed, false, "a different booking's refund is not a replay");
});

test("L7: Stripe unreachable while a lost chargeback is on record ⇒ refused", async () => {
  const pi = `pi_lcb_${RUN}_l7`;
  await seedBooking(pi);
  await loseChargeback(pi, 10000);
  _lostChargebackTestHooks.lookup = async () => {
    throw new Error("network down");
  };
  const r = await checkRefundAgainstLostChargebacks({ paymentIntentId: pi, requestedCents: 100 });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "lost_chargeback_unverifiable");
});

test("L8: an already-refunded booking passes the pre-ledger check", async () => {
  const pi = `pi_lcb_${RUN}_l8`;
  const id = await seedBooking(pi, "refunded");
  await db.execute(sql`UPDATE service_bookings SET booking_details = '{"lostChargebacks":{"dp_x":{}}}'::jsonb WHERE id = ${id}`);
  assert.deepEqual(await checkBookingRefundAgainstLostChargebacks(id, 10000), { allowed: true, checked: false });
});

async function earningStates(id: string) {
  return (await db.execute(sql`SELECT status, dispute_state FROM provider_earnings WHERE source_id = ${id}`)).rows as any[];
}
async function revenueRows(id: string) {
  return (await db.execute(sql`SELECT platform_fee, status FROM platform_revenue WHERE source_id = ${id} ORDER BY created_at`)).rows as any[];
}

test("L9: ledger-only reconciliation of a full chargeback, recorded once", async () => {
  const pi = `pi_lcb_${RUN}_l9`;
  const id = await seedBooking(pi);
  await db.execute(sql`UPDATE service_bookings SET platform_fee = '25.00' WHERE id = ${id}`);
  await storage.updateServiceBookingStatus(id, "completed", undefined, ["confirmed"]);
  await loseChargeback(pi, 10000);
  assert.deepEqual((await earningStates(id)).map((e) => e.status), ["held"]);
  ledger({ chargedCents: 10000, lostChargebackCents: 10000 });

  const before = refundCalls.length;
  const out = await reconcileLostChargeback({ bookingId: id, actorId: "admin-lcb", note: "Chargeback lost; bank returned funds." });
  assert.equal(out.reconciled, true);
  if (!out.reconciled) return;
  assert.equal(out.alreadyReconciled, false);
  assert.equal(out.fraction, 1);
  assert.ok(out.reversedEarnings >= 1, "the in-escrow earnings are reversed");
  assert.equal(out.reversedRevenueRows, 1);
  assert.equal(refundCalls.length, before, "no money is sent");
  assert.deepEqual((await earningStates(id)).map((e) => e.status), ["reversed"]);
  const rev = await revenueRows(id);
  assert.equal(rev.length, 2);
  assert.equal(Number(rev[1].platform_fee), -25);
  const rec = (await row(id)).booking_details.chargebackReconciliation;
  assert.equal(rec.by, "admin-lcb");
  assert.equal(rec.ledgerOnly, true);

  const again = await reconcileLostChargeback({ bookingId: id, actorId: "admin-lcb", note: "Retry of the same close-out." });
  assert.equal(again.reconciled && again.alreadyReconciled, true);
  if (again.reconciled) {
    assert.equal(again.reversedEarnings, 0);
    assert.equal(again.reversedRevenueRows, 0);
  }
  assert.equal((await revenueRows(id)).length, 2, "nothing reversed twice");
});

test("L10: partial chargeback reconciliation reverses revenue in proportion and leaves earnings on hold", async () => {
  const pi = `pi_lcb_${RUN}_l10`;
  const id = await seedBooking(pi);
  await db.execute(sql`UPDATE service_bookings SET platform_fee = '20.00' WHERE id = ${id}`);
  await storage.updateServiceBookingStatus(id, "completed", undefined, ["confirmed"]);
  await loseChargeback(pi, 2500);
  ledger({ chargedCents: 10000, lostChargebackCents: 2500 });
  const out = await reconcileLostChargeback({ bookingId: id, actorId: "admin-lcb", note: "Partial chargeback lost." });
  assert.equal(out.reconciled, true);
  if (!out.reconciled) return;
  assert.equal(out.fraction, 0.25);
  assert.equal(out.earningsLeftOnHold, true);
  assert.equal(out.reversedEarnings, 0);
  assert.deepEqual((await earningStates(id)).map((e) => e.status), ["held"]);
  const rev = await revenueRows(id);
  assert.equal(Number(rev[1].platform_fee), -5);
});

test("L11: reconciliation refuses a booking with no lost chargeback, and fails closed", async () => {
  const plain = await seedBooking(`pi_lcb_${RUN}_l11a`);
  assert.deepEqual(await reconcileLostChargeback({ bookingId: plain, actorId: "a", note: "nothing to do here" }), {
    reconciled: false,
    reason: "not_found",
  });
  const pi = `pi_lcb_${RUN}_l11b`;
  const id = await seedBooking(pi);
  await loseChargeback(pi, 10000);
  _lostChargebackTestHooks.lookup = async () => {
    throw new Error("network down");
  };
  const out = await reconcileLostChargeback({ bookingId: id, actorId: "a", note: "stripe is unreachable now" });
  assert.equal(out.reconciled, false);
  if (!out.reconciled) assert.equal(out.reason, "lost_chargeback_unverifiable");
  assert.equal((await row(id)).booking_details.chargebackReconciliation, undefined, "nothing recorded");
});

test("L12: every ledger-first refund entry point checks before it reverses the ledger", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  const before = (src: string, first: string, then: string, from = 0) => {
    const a = src.indexOf(first, from);
    const b = src.indexOf(then, a);
    assert.ok(a >= 0 && b > a, `${first} must come before ${then}`);
  };
  const admin = read("server/routes/admin.routes.ts");
  const uphold = admin.indexOf('router.post("/api/admin/disputes/:bookingId/uphold"');
  before(admin, "checkServiceBookingRefundPreflight", "storage.reverseEarningsForBooking(bookingId)", uphold);
  assert.match(admin, /const lostChargebackReconcileBody = z\.object\(\{ note: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(2000\) \}\)\.strict\(\);/);
  const bookings = read("server/routes/bookings.ts");
  before(bookings, "checkServiceBookingRefundPreflight", "storage.reverseEarningsForBooking(bookingId)");
  const routes = read("server/routes.ts");
  before(routes, "checkServiceBookingRefundPreflight", "await storage.reverseEarningsForBooking(req.params.id);\n        }");
  const artifact = read("server/services/artifact-rejection-refund.service.ts");
  before(artifact, "checkRefundAgainstLostChargebacks({ paymentIntentId", "storage.reverseEarningsForBooking(bookingId)");
  const pay = read("server/services/stripe-payment.service.ts");
  before(pay, "if (!guard.allowed) throw new LostChargebackRefundBlockedError(guard);", "return stripe.refunds.create(");
});

async function openChargeback(pi: string) {
  const disputeId = `dp_lcb_${RUN}_${crypto.randomUUID().slice(0, 6)}`;
  disputeIds.push(disputeId);
  const charge = { id: `ch_lcb_${RUN}_${disputeId}`, payment_intent: pi, metadata: {} };
  const fake = { charges: { retrieve: async () => charge } } as any;
  const dispute = { id: disputeId, charge, status: "needs_response", reason: "fraudulent", amount: 10000 } as any;
  await handleStripeDispute(dispute, fake, { closed: false, eventId: `evt_lcb_open_${disputeId}` });
  return { disputeId, dispute, fake };
}

test("L13: an open chargeback is reported until Stripe closes it", async () => {
  const pi = `pi_lcb_${RUN}_l13`;
  const id = await seedBooking(pi);
  const other = await seedBooking(`pi_lcb_${RUN}_l13other`);
  const { disputeId, dispute, fake } = await openChargeback(pi);
  assert.deepEqual(await openChargebacksOnBooking(id), [disputeId]);
  assert.deepEqual(await openChargebacksOnBooking(other), [], "another payment's booking is not affected");
  await handleStripeDispute({ ...dispute, status: "won" }, fake, { closed: true, eventId: `evt_lcb_won_${disputeId}` });
  assert.deepEqual(await openChargebacksOnBooking(id), [], "closed ⇒ no longer open");
});

test("L14: the rejected-artifact refund refuses while a chargeback is open", async () => {
  const pi = `pi_lcb_${RUN}_l14`;
  const id = await seedBooking(pi);
  await db.execute(sql`UPDATE service_bookings SET platform_fee = '20.00' WHERE id = ${id}`);
  await storage.updateServiceBookingStatus(id, "completed", undefined, ["confirmed"]);
  await openChargeback(pi);
  assert.equal((await row(id)).status, "disputed");
  let issued = 0;
  const out = await refundRejectedArtifact({
    bookingId: id,
    actorUserId: "admin-lcb",
    refundIssuer: async () => {
      issued++;
      return { id: "re_should_not_exist", status: "succeeded" } as any;
    },
  });
  assert.equal(out.refunded, false);
  if (!out.refunded) {
    assert.equal(out.reason, "open_chargeback");
    assert.equal(out.openChargebacks?.length, 1);
  }
  assert.equal(issued, 0, "no Stripe call");
  assert.equal((await row(id)).status, "disputed", "status untouched");
  assert.ok((await earningStates(id)).every((e) => e.status === "held"), "earnings untouched");
  assert.equal((await revenueRows(id)).length, 1, "revenue untouched");

  const root = path.resolve(import.meta.dirname, "../..");
  const admin = fs.readFileSync(path.join(root, "server/routes/admin.routes.ts"), "utf8");
  const uphold = admin.indexOf('router.post("/api/admin/disputes/:bookingId/uphold"');
  const check = admin.indexOf("openChargebacksOnBooking(bookingId)", uphold);
  const reverse = admin.indexOf("storage.reverseEarningsForBooking(bookingId)", uphold);
  assert.ok(check > uphold && reverse > check, "the uphold route checks for an open chargeback before the ledger");
});
