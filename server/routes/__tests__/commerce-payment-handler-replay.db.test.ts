import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, trips, providerServices, itineraryItems, cartItems, serviceBookings } from "../../../shared/schema";
import { addedCartState } from "../../services/cart-email-state.service";
import { cartReminderVerification } from "../../services/cart-reminder.service";
import { enqueuePendingCommerceReminder, deliverQueuedEmail, _outboxTestHooks } from "../../services/email-outbox.service";

const now = new Date("2030-05-05T12:00:00Z");
const preferences = { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } };

test("Part 6: actual signed webhook replays and actual success-handler concurrency, two isolated loops", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name, process.env.MESSAGING_VERIFICATION_SCHEMA);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_commerce_key
    ON email_outbox ((metadata->>'commerceKey')) WHERE metadata ? 'commerceKey'`);
  // In-memory test-process configuration only. No credential or deployed setting is read.
  const previous = process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST;
  const signingSecret = "whsec_synthetic_part6_handler_fixture";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST = signingSecret;
  const intents = new Map<string, any>();
  const retrieval = mock.method((Stripe as any).resources.PaymentIntents.prototype, "retrieve",
    async (id: string) => {
      assert.ok(intents.has(id), "Only the isolated synthetic intent may be retrieved");
      return intents.get(id);
    });
  const blockFetch = mock.method(globalThis, "fetch", async () => { throw new Error("External HTTP forbidden in handler proof"); });
  const { createConnectStripeWebhookHandler } = await import("../webhooks.routes");
  const { default: bookingRouter } = await import("../bookings");
  const route = (bookingRouter as any).stack.find((layer: any) => layer.route?.path === "/confirm-payment");
  assert.ok(route, "Existing success-page fallback route exists");
  const confirm = route.route.stack.at(-1).handle;
  const webhook = createConnectStripeWebhookHandler(); // DEFAULT real event processor, not a substituted writer.
  const verifier = new Stripe("sk_test_synthetic_part6_handler_only");
  const calls = new Map<string, number>(), reports: object[] = [];
  _outboxTestHooks.sendEmailFn = async params => {
    const key = params.idempotencyKey ?? "non-commerce";
    calls.set(key, (calls.get(key) ?? 0) + 1);
    return { ok: true, id: `synthetic_${randomUUID()}` };
  };
  cartReminderVerification.now = now;
  cartReminderVerification.recordedRailsOnly = true;
  const response = () => {
    const value = { code: 200, body: undefined as any, status(code: number) { this.code = code; return this; },
      json(body: any) { this.body = body; return this; } };
    return value;
  };
  const fixture = async () => {
    const id = randomUUID(), scope = randomUUID(), sequence = randomUUID(), start = now.getTime() - 3_600_000;
    const [user] = await db.insert(users).values({ id, email: `${id}@traveloure-qa.test`, preferences }).returning();
    const [trip] = await db.insert(trips).values({ userId: id, destination: "Kyoto",
      startDate: "2030-05-05", endDate: "2030-05-07" }).returning();
    const [service] = await db.insert(providerServices).values({ userId: id, serviceName: "Handler proof",
      price: "10.00", priceType: "fixed", status: "active", availability: [] }).returning();
    const [item] = await db.insert(itineraryItems).values({ tripId: trip.id, providerServiceId: service.id,
      title: "Handler", dayNumber: 1 }).returning();
    const [cart] = await db.insert(cartItems).values({ userId: id, experienceSlug: scope,
      tripId: trip.id, itineraryItemId: item.id, serviceId: service.id, quantity: 1,
      contentMeta: addedCartState({}, service.id, null, { at_ms: start, sequence_id: sequence }) }).returning();
    assert.equal(await db.transaction(tx => enqueuePendingCommerceReminder(user.email!,
      `cart-reminder-1h:${cart.id}:${sequence}`, sequence, scope,
      { travelerId: id, scope, kind: "cart_reminder_1h", sequenceStartMs: start }, tx)), true);
    const outboxId = Number((await db.execute(sql`SELECT id FROM email_outbox
      WHERE metadata->>'travelerId'=${id}`)).rows[0].id);
    const intentId = `pi_synthetic_${randomUUID().replaceAll("-", "")}`;
    const [booking] = await db.insert(serviceBookings).values({
      serviceId: service.id, travelerId: id, providerId: id, status: "payment_pending",
      totalAmount: "10.00", stripePaymentIntentId: intentId,
      bookingDetails: { itineraryItemId: item.id },
      createdAt: new Date(start - 1), updatedAt: new Date(start - 1),
    }).returning();
    await db.execute(sql`INSERT INTO payment_intents
      (stripe_payment_intent_id,user_id,amount,currency,status,created_at,updated_at)
      VALUES (${intentId},${id},1000,'usd','requires_payment_method',${new Date(start - 1)},${new Date(start - 1)})`);
    const intent = { id: intentId, object: "payment_intent", status: "succeeded", amount: 1000,
      amount_received: 1000, currency: "usd", metadata: { userId: id, bookingIds: booking.id },
    };
    intents.set(intentId, intent);
    const event = { id: `evt_synthetic_${randomUUID().replaceAll("-", "")}`, object: "event",
      type: "payment_intent.succeeded", data: { object: intent } };
    const invokeWebhook = async () => {
      const rawBody = Buffer.from(JSON.stringify(event));
      const res = response();
      await webhook({ headers: { "stripe-signature": verifier.webhooks.generateTestHeaderString({
        payload: rawBody.toString(), secret: signingSecret,
      }) }, rawBody }, res);
      assert.equal(res.code, 200);
      assert.deepEqual(res.body, { received: true });
    };
    const invokeSuccess = async () => {
      const res = response();
      // Exercise the actual route action with an authenticated owner identity.
      // Authentication middleware/browser UI is not claimed by this native proof.
      await confirm({ body: { bookingId: booking.id, paymentIntentId: intentId },
        user: { id }, isAuthenticated: () => true }, res);
      assert.equal(res.code, 200, JSON.stringify(res.body));
      assert.equal(res.body.success, true);
    };
    const check = async () => {
      const [state] = (await db.execute(sql`SELECT status, metadata FROM email_outbox WHERE id=${outboxId}`)).rows as any[];
      assert.equal(state.status, "cancelled");
      assert.ok(["paid", "cart_empty"].includes(state.metadata.cancelReason));
      assert.equal(calls.get(`cart-reminder-${outboxId}`) ?? 0, 0);
      assert.equal((await db.execute(sql`SELECT status FROM service_bookings WHERE id=${booking.id}`)).rows[0].status, "confirmed");
      const records = (await db.execute(sql`SELECT processed FROM webhook_events WHERE stripe_event_id=${event.id}`)).rows;
      assert.equal(records.length, 1); assert.equal(records[0].processed, true);
    };
    return { invokeWebhook, invokeSuccess, check, outboxId };
  };
  try {
    for (let loop = 1; loop <= 2; loop++) {
      const checks: string[] = [];
      const replay = await fixture();
      for (let n = 0; n < 3; n++) { await replay.invokeWebhook(); await deliverQueuedEmail(replay.outboxId); }
      await replay.check(); checks.push("same signed event three times: one processed event and zero stale cart emails");
      for (const order of ["webhook-first", "success-first", "concurrent"] as const) {
        const f = await fixture();
        if (order === "webhook-first") { await f.invokeWebhook(); await f.invokeSuccess(); }
        else if (order === "success-first") { await f.invokeSuccess(); await f.invokeWebhook(); }
        else await Promise.all([f.invokeWebhook(), f.invokeSuccess()]);
        await Promise.all([deliverQueuedEmail(f.outboxId), deliverQueuedEmail(f.outboxId)]);
        await f.check(); checks.push(`actual handler ordering:${order}; zero stale cart emails`);
      }
      reports.push({ loop, scenario: randomUUID(), status: "CLEAN_READABLE_SUBSET_ONLY", checks,
        authMiddlewareCoverage: false, realStripeCalls: 0, realEmails: 0 });
    }
    console.log(JSON.stringify({ part: "6-real-handlers", loops: reports, sdkLookups: retrieval.mock.callCount() }));
  } finally {
    retrieval.mock.restore(); blockFetch.mock.restore();
    if (previous === undefined) delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST;
    else process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST = previous;
    cartReminderVerification.now = null; cartReminderVerification.recordedRailsOnly = false;
    _outboxTestHooks.sendEmailFn = undefined;
    await pool.end();
  }
});
