/**
 * Process-kill proof worker. Only launched inside the existing empty,
 * constraint-preserving fixture schema with simulated provider transports.
 */
import assert from "node:assert/strict";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

async function main() {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("options"),
    `-c search_path=${process.env.MESSAGING_VERIFICATION_SCHEMA}`);
  const [writer, crashPoint, fixtureJson] = process.argv.slice(2);
  assert.ok(writer === "webhook" || writer === "page");
  assert.ok(crashPoint === "before_commit" || crashPoint === "after_commit");
  const fixture = JSON.parse(fixtureJson) as {
    bookingId: string; travelerId: string; pi: Stripe.PaymentIntent;
  };
  const probe = new Stripe("sk_test_fixture_only");
  Object.getPrototypeOf(probe.paymentIntents).retrieve = async (id: string) => ({ id, status: "succeeded" });
  const { default: http } = await import("node:http");
  const { default: https } = await import("node:https");
  const forbidNetwork = () => { throw new Error("Real provider network forbidden in crash fixture"); };
  http.request = forbidNetwork as typeof http.request;
  https.request = forbidNetwork as typeof https.request;
  globalThis.fetch = forbidNetwork as typeof fetch;

  const { db } = await import("../../db");
  const { _outboxTestHooks } = await import("../../services/email-outbox.service");
  _outboxTestHooks.sendEmailFn = async () => {
    throw new Error("Crash worker must not send mail");
  };
  const { stripePaymentService } = await import("../../services/stripe-payment.service");
  const { bookingService } = await import("../../services/booking.service");
  const holdForKill = async () => {
    // Ref'ed timer ensures an unresolved promise cannot count as a completed proof.
    setInterval(() => {}, 1000);
    console.log(`CRASH_POINT_READY=${crashPoint}`);
    await new Promise<never>(() => {});
  };
  if (crashPoint === "before_commit") {
    const transaction = db.transaction.bind(db);
    db.transaction = ((action, config) => transaction(async (tx) => {
      const result = await action(tx);
      // The real authoritative action, including email and any earnings, ran.
      // This connection sees them but cannot commit before its process is killed.
      const persisted = await tx.execute(sql`
        SELECT id FROM email_outbox
        WHERE email_type = 'booking_confirmation'
          AND metadata->>'bookingId' = ${fixture.bookingId}
      `);
      assert.equal(persisted.rows.length, 1);
      await holdForKill();
      return result;
    }, config)) as typeof db.transaction;
  }
  if (writer === "webhook") {
    await stripePaymentService.handlePaymentSucceeded(fixture.pi);
  } else {
    await bookingService.confirmBookingPayment(fixture.bookingId, fixture.pi.id, fixture.travelerId);
  }
  await holdForKill();
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
