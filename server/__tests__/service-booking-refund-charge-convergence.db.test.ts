/**
 * App-issued service-booking refunds converge on the same Stripe Charge refund rule as the
 * charge.refunded webhook: a full charge refund is terminal, while a partial remains confirmed.
 * Stripe is entirely stubbed; fixtures require explicit opt-in to a disposable development DB.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";

const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const chargesProto = Object.getPrototypeOf(probe.charges);
const originalRefundCreate = refundsProto.create;
const originalChargeRetrieve = chargesProto.retrieve;

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { serviceBookings, users, refunds: refundsTable } = await import("../../shared/schema");

afterEach(() => {
  refundsProto.create = originalRefundCreate;
  chargesProto.retrieve = originalChargeRetrieve;
});

after(async () => {
  await pool.end().catch(() => {});
});

test("refundServiceBooking converges full and partial outcomes through the Charge rule", async (t) => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    t.skip("Requires explicit development database write opt-in");
    return;
  }
  assert.notEqual(process.env.NODE_ENV, "production", "refusing to write fixtures in production");
  assert.ok(process.env.DATABASE_URL);
  assert.notEqual(process.env.DATABASE_URL, process.env.PROD_DATABASE_URL);

  const travelerId = crypto.randomUUID();
  const providerId = crypto.randomUUID();
  const fullBookingId = crypto.randomUUID();
  const partialBookingId = crypto.randomUUID();
  const fullPaymentIntentId = `pi_refund_charge_full_${crypto.randomUUID().replaceAll("-", "")}`;
  const partialPaymentIntentId = `pi_refund_charge_partial_${crypto.randomUUID().replaceAll("-", "")}`;
  const fullChargeId = `ch_refund_charge_full_${crypto.randomUUID().replaceAll("-", "")}`;
  const partialChargeId = `ch_refund_charge_partial_${crypto.randomUUID().replaceAll("-", "")}`;
  const fullRefundId = `re_refund_charge_full_${crypto.randomUUID().replaceAll("-", "")}`;
  const partialRefundId = `re_refund_charge_partial_${crypto.randomUUID().replaceAll("-", "")}`;

  const chargeByBooking = new Map([
    [fullBookingId, { chargeId: fullChargeId, amount: 10000, amountRefunded: 10000, refundId: fullRefundId }],
    [partialBookingId, { chargeId: partialChargeId, amount: 10000, amountRefunded: 4000, refundId: partialRefundId }],
  ]);
  const chargeById = new Map([...chargeByBooking.values()].map((charge) => [charge.chargeId, charge]));
  const refundCalls: Array<{ params: any; options: any }> = [];
  const retrieveCalls: Array<{ chargeId: string; params: any }> = [];

  refundsProto.create = async (params: any, options: any) => {
    refundCalls.push({ params, options });
    const charge = chargeByBooking.get(params.metadata?.bookingId);
    assert.ok(charge, `refund call identifies one of the seeded booking fixtures`);
    return {
      id: charge.refundId,
      object: "refund",
      status: "succeeded",
      amount: params.amount,
      charge: charge.chargeId,
      payment_intent: params.payment_intent,
      metadata: params.metadata,
    };
  };
  chargesProto.retrieve = async (chargeId: string, params: any = {}) => {
    retrieveCalls.push({ chargeId, params });
    const charge = chargeById.get(chargeId);
    assert.ok(charge, `charge retrieve uses a charge returned by the mocked refund`);
    return {
      id: charge.chargeId,
      object: "charge",
      payment_intent: charge.chargeId === fullChargeId ? fullPaymentIntentId : partialPaymentIntentId,
      amount: charge.amount,
      amount_refunded: charge.amountRefunded,
      currency: "usd",
      refunds: {
        data: [{
          id: charge.refundId,
          object: "refund",
          amount: charge.amountRefunded,
          status: "succeeded",
          metadata: { bookingId: charge.chargeId === fullChargeId ? fullBookingId : partialBookingId, source: "service_booking" },
        }],
        has_more: false,
      },
    };
  };

  try {
    await db.insert(users).values([
      { id: travelerId, email: `${travelerId}@t.test`, role: "traveler" },
      { id: providerId, email: `${providerId}@t.test`, role: "service_provider" },
    ] as any);
    await db.insert(serviceBookings).values([
      {
        id: fullBookingId,
        travelerId,
        providerId,
        totalAmount: "100.00",
        status: "confirmed",
        stripePaymentIntentId: fullPaymentIntentId,
      },
      {
        id: partialBookingId,
        travelerId,
        providerId,
        totalAmount: "100.00",
        status: "confirmed",
        stripePaymentIntentId: partialPaymentIntentId,
      },
    ] as any);

    const { stripePaymentService } = await import("../services/stripe-payment.service");

    const fullResult = await stripePaymentService.refundServiceBooking(fullBookingId);
    assert.equal((fullResult as any).status, "succeeded");
    const full = await db.execute(sql`
      SELECT status FROM service_bookings WHERE id = ${fullBookingId}
    `);
    assert.equal((full.rows[0] as any).status, "refunded", "the full Stripe charge refund reaches the terminal booking state");

    const partialResult = await stripePaymentService.refundServiceBooking(partialBookingId, "requested_by_customer", {
      amountOverride: 40,
    });
    assert.equal((partialResult as any).status, "succeeded");
    const partial = await db.execute(sql`
      SELECT status, booking_details->'chargeRefund' AS charge_refund
        FROM service_bookings WHERE id = ${partialBookingId}
    `);
    assert.equal((partial.rows[0] as any).status, "confirmed", "a partial Stripe charge refund does not end the booking");
    assert.equal(Number((partial.rows[0] as any).charge_refund?.amountCents), 4000);

    assert.equal(refundCalls.length, 2, "each booking issues exactly one mocked Stripe refund");
    assert.equal(refundCalls[0].params.amount, 10000);
    assert.equal(refundCalls[1].params.amount, 4000);
    assert.equal(retrieveCalls.length, 2, "both app-issued refunds reconcile against their Stripe Charge");
    assert.deepEqual(
      new Set(retrieveCalls.map((call) => call.chargeId)),
      new Set([fullChargeId, partialChargeId]),
    );

    const fullAudit = await db.select().from(refundsTable).where(sql`${refundsTable.stripeRefundId} = ${fullRefundId}`);
    const partialAudit = await db.select().from(refundsTable).where(sql`${refundsTable.stripeRefundId} = ${partialRefundId}`);
    assert.equal(fullAudit.length, 1);
    assert.equal(partialAudit.length, 1);
  } finally {
    await db.execute(sql`DELETE FROM refunds WHERE stripe_refund_id IN (${fullRefundId}, ${partialRefundId})`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id IN (${fullBookingId}, ${partialBookingId})`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id IN (${fullBookingId}, ${partialBookingId})`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id IN (${fullBookingId}, ${partialBookingId})`).catch(() => {});
    await db.delete(serviceBookings).where(sql`${serviceBookings.id} IN (${fullBookingId}, ${partialBookingId})`).catch(() => {});
    await db.delete(users).where(sql`${users.id} IN (${travelerId}, ${providerId})`).catch(() => {});
  }
});