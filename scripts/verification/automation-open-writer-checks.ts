// Test-only native legacy writer checks. Provider retrieval and email are
// explicitly simulated; no Stripe API write and no G10 claim.
import crypto from "node:crypto";
import fs from "node:fs";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "../../server/db";
import { bookings, emailOutbox } from "../../shared/schema";
import { stripePaymentService } from "../../server/services/stripe-payment.service";
import { _outboxTestHooks } from "../../server/services/email-outbox.service";

export async function checkLegacyWriters(loop: number, owner: any) {
  if (process.env.NODE_ENV !== "test" || process.env.MESSAGING_VERIFICATION_SCHEMA !== owner.schema ||
    !owner.preparedLoops.includes(loop)) throw new Error("Prepared isolated owner required");
  const actor = owner.accounts[loop].itinerary_ready, provider = owner.accounts[loop].wrong;
  const probe = new Stripe("sk_test_qa_network_forbidden");
  const prototype = Object.getPrototypeOf(probe.paymentIntents), previous = prototype.retrieve;
  const results: any[] = [];
  try {
    for (const ordering of ["webhook_then_page", "page_then_webhook", "two_webhooks_at_once", "three_sequential_webhooks"]) {
      const bookingId = crypto.randomUUID(), piId = `pi_test_${crypto.randomUUID().replaceAll("-", "")}`;
      const service = crypto.randomInt(3000, 10000) / 100, fee = service * 0.2;
      await db.insert(bookings).values({ id: bookingId, userId: actor.userId, providerId: provider.userId,
        status: "pending_payment", paymentStatus: "pending", title: "PRIVATE QA writer scenario",
        serviceAmount: service.toFixed(2), platformFee: fee.toFixed(2), totalAmount: (service + fee).toFixed(2),
        providerPayout: (service * 0.8).toFixed(2), travelers: 1 } as any);
      const pi = { id: piId, status: "succeeded", currency: "usd", amount: Math.round((service + fee) * 100),
        amount_received: Math.round((service + fee) * 100), metadata: { userId: actor.userId, bookingIds: bookingId } };
      prototype.retrieve = async () => pi;
      let sends = 0, allSends = 0;
      _outboxTestHooks.sendEmailFn = async params => {
        allSends++;
        const targets = Array.isArray(params.to) ? params.to : [params.to];
        if (targets.includes(actor.email)) sends++;
        return { ok: true, id: `qa_simulated_${bookingId}_${allSends}` };
      };
      const webhook = () => stripePaymentService.handlePaymentSucceeded(pi as any);
      const page = async () => {
        const response = await fetch(`http://127.0.0.1:${owner.port}/api/bookings/confirm-payment`, {
          method: "POST", headers: { "content-type": "application/json", cookie: actor.cookie },
          body: JSON.stringify({ bookingId, paymentIntentId: piId }) });
        return response.status;
      };
      let pageStatus: number | null = null;
      if (ordering === "webhook_then_page") { await webhook(); pageStatus = await page(); }
      else if (ordering === "page_then_webhook") { pageStatus = await page(); await webhook(); }
      else if (ordering === "two_webhooks_at_once") await Promise.all([webhook(), webhook()]);
      else { await webhook(); await webhook(); await webhook(); }
      await new Promise(r => setTimeout(r, 250));
      const matching = await db.select().from(emailOutbox).where(sql`${emailOutbox.metadata}->>'bookingId'=${bookingId}`);
      const rows = matching.filter(r => r.emailType === "booking_confirmation");
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      results.push({ scenarioId: crypto.randomUUID(), loop, ordering, bookingId,
        pageStatus, finalStatus: booking.status, confirmationRows: rows.length,
        simulatedTravelerSendCount: sends, allSimulatedSends: allSends, outboxIds: rows.map(r => r.id),
        onceOnlyPassed: rows.length === 1 && sends === 1,
        confirmationCodeMatchesEmail: rows.length === 1 &&
          (rows[0].metadata as any)?.confirmationCode === booking.confirmationCode,
        mode: "NATIVE_LEGACY_WRITERS_WITH_SIMULATED_PROVIDER", webhookSignatureBoundaryTested: false,
        stripeWrites: 0, realDeliveryClaimed: false, checkedAt: new Date().toISOString() });
    }
  } finally {
    prototype.retrieve = previous; delete _outboxTestHooks.sendEmailFn;
  }
  fs.writeFileSync(`reports/automation-part1-evidence/legacy-writers-loop-${loop}.json`, JSON.stringify(results, null, 2));
  return { loop, scenarios: results.length, onceOnlyPasses: results.filter(r => r.onceOnlyPassed).length,
    codeMatches: results.filter(r => r.confirmationCodeMatchesEmail).length };
}
