import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, trips, providerServices, itineraryItems, cartItems } from "../../../shared/schema";
import { addedCartState } from "../../services/cart-email-state.service";
import { cartReminderVerification } from "../../services/cart-reminder.service";
import { commerceSendVerification, verifyCommerceSend } from "../../services/commerce-send-verification.service";
import { assessCartItemChanges } from "../../services/cart-item-change.service";
import {
  enqueuePendingCommerceReminder, enqueuePendingCartItemChange, deliverQueuedEmail,
  drainOutbox, drainOutboxForAdminRetry, _outboxTestHooks,
} from "../../services/email-outbox.service";
import { lockMarketingTraveler, nextCartMarketingWindow } from "../../services/marketing-delivery-policy.service";

const anchor = new Date("2030-05-05T12:00:00Z");
const preferences = { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } };

test("Part 6 addendum: two fresh loops; errors, timeouts, holds, claims and item exemptions", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name, process.env.MESSAGING_VERIFICATION_SCHEMA);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_commerce_key
    ON email_outbox ((metadata->>'commerceKey')) WHERE metadata ? 'commerceKey'`);
  const calls = new Map<string, number>(), reports: object[] = [];
  cartReminderVerification.recordedRailsOnly = true;
  _outboxTestHooks.sendEmailFn = async params => {
    const key = params.idempotencyKey!;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    return { ok: true, id: `synthetic_${randomUUID()}` };
  };
  const fixture = async () => {
    cartReminderVerification.now = anchor;
    const id = randomUUID(), scope = randomUUID(), sequence = randomUUID(), start = anchor.getTime() - 3_600_000;
    const [user] = await db.insert(users).values({ id, email: `${id}@traveloure-qa.test`, preferences }).returning();
    const [trip] = await db.insert(trips).values({ userId: id, destination: "Kyoto",
      startDate: "2030-05-05", endDate: "2030-05-07" }).returning();
    const [service] = await db.insert(providerServices).values({ userId: id, serviceName: "Isolated addendum",
      price: "10.00", priceType: "fixed", status: "active", availability: [] }).returning();
    const [item] = await db.insert(itineraryItems).values({ tripId: trip.id, providerServiceId: service.id,
      title: "Isolated", dayNumber: 1 }).returning();
    const [cart] = await db.insert(cartItems).values({ userId: id, experienceSlug: scope,
      tripId: trip.id, itineraryItemId: item.id, serviceId: service.id, quantity: 1,
      contentMeta: addedCartState({}, service.id, null, { at_ms: start, sequence_id: sequence }) }).returning();
    return { user, trip, service, item, cart, scope, sequence, start };
  };
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const identity = (f: Fixture, marketing = true) => ({ travelerId: f.user.id, scope: f.scope,
    sequenceId: f.sequence, recipient: f.user.email!, marketing });
  const row = async (id: number) => (await db.execute(sql`SELECT *,
    to_char(retry_after,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS retry_iso
    FROM email_outbox WHERE id=${id}`)).rows[0] as any;
  const queue = async (f: Fixture, item = false) => {
    await db.transaction(async tx => {
      await lockMarketingTraveler(tx, f.user.id);
      if (item) {
        const assessment = await assessCartItemChanges(tx, f.user.id, f.scope, anchor);
        assert.equal(assessment.changes.length, 1);
        assert.equal(await enqueuePendingCartItemChange(assessment.changes[0], tx), true);
      } else assert.equal(await enqueuePendingCommerceReminder(f.user.email!,
        `cart-reminder-1h:${f.cart.id}:${f.sequence}`, f.sequence, f.scope,
        { travelerId: f.user.id, scope: f.scope, kind: "cart_reminder_1h", sequenceStartMs: f.start }, tx), true);
    });
    return Number((await db.execute(sql`SELECT id FROM email_outbox WHERE metadata->>'travelerId'=${f.user.id}`)).rows[0].id);
  };
  const unsent = (id: number) => assert.equal(calls.get(`cart-reminder-${id}`) ?? 0, 0);
  try {
    for (let loop = 1; loop <= 2; loop++) {
      const checks: string[] = [], scenario = randomUUID();
      for (const fault of ["initial", "final", "sql", "timeout"] as const) {
        const f = await fixture(), id = await queue(f);
        let release: (() => void) | undefined;
        if (fault === "initial") commerceSendVerification.beforeCheck = async () => { throw new Error("Synthetic check fault"); };
        if (fault === "final") commerceSendVerification.beforeFinalRead = async () => { throw new Error("Synthetic final fault"); };
        if (fault === "sql") commerceSendVerification.beforeCheck = async reader => {
          // Abort the actual isolated transaction; the reason must survive rollback.
          await reader.execute(sql`SELECT nonexistent_commerce_proof_column FROM email_outbox`);
        };
        if (fault === "timeout") {
          commerceSendVerification.checkTimeoutMs = 20;
          commerceSendVerification.beforeFinalRead = () => new Promise<void>(resolve => { release = resolve; });
        }
        await deliverQueuedEmail(id);
        commerceSendVerification.beforeCheck = null;
        commerceSendVerification.beforeFinalRead = null;
        commerceSendVerification.checkTimeoutMs = 5_000;
        assert.equal((await row(id)).status, "cancelled");
        assert.equal((await row(id)).metadata.cancelReason, "check_failed");
        if (fault === "timeout") assert.equal((await row(id)).metadata.cancelDetail, "check_timeout");
        unsent(id);
        release?.();
        await new Promise(resolve => setTimeout(resolve, 25));
        unsent(id);
        await deliverQueuedEmail(id); await drainOutboxForAdminRetry(id);
        assert.equal((await row(id)).status, "cancelled"); unsent(id);
        checks.push(`check_failed:${fault}; late completion and retries cannot send`);
      }
      const pre = await fixture();
      const badReader = { execute: async () => { throw new Error("Synthetic SELECT failure"); } };
      const preDecision = await verifyCommerceSend(badReader as any, identity(pre));
      assert.deepEqual(preDecision, { eligible: false, reason: "check_failed", detail: "check_exception" });
      const unknownReader = { execute: async () => ({ rows: [] }) };
      const unknownDecision = await verifyCommerceSend(unknownReader as any, identity(pre));
      assert.equal(unknownDecision.eligible, false);
      if (!unknownDecision.eligible) assert.equal(unknownDecision.reason, "check_failed");
      commerceSendVerification.beforeCheck = async () => { throw new Error("Synthetic prequeue failure"); };
      assert.equal(await db.transaction(tx => enqueuePendingCommerceReminder(pre.user.email!,
        `cart-reminder-1h:${pre.cart.id}:${pre.sequence}`, pre.sequence, pre.scope,
        { travelerId: pre.user.id, scope: pre.scope, kind: "cart_reminder_1h", sequenceStartMs: pre.start }, tx)), false);
      commerceSendVerification.beforeCheck = null;
      assert.equal(Number((await db.execute(sql`SELECT count(*) AS n FROM email_outbox
        WHERE metadata->>'travelerId'=${pre.user.id}`)).rows[0].n), 0);
      checks.push("pre-queue read errors and malformed/unknown read results refuse enqueue");

      for (const [time, status, retry] of [
        ["19:59:00", "sent", null], ["20:00:00", "pending", "2030-05-07T09:00:00.000Z"],
        ["08:59:00", "pending", "2030-05-06T09:00:00.000Z"],
      ] as const) {
        const f = await fixture(), id = await queue(f);
        cartReminderVerification.now = new Date(`2030-05-06T${time}Z`);
        await deliverQueuedEmail(id);
        const stored = await row(id);
        assert.equal(stored.status, status);
        if (retry) {
          assert.equal(stored.last_error, "outside_marketing_window");
          assert.equal(stored.metadata.cancelReason, undefined);
          assert.equal(stored.retry_iso, retry);
          unsent(id);
        } else assert.equal(calls.get(`cart-reminder-${id}`), 1);
        checks.push(`local:${time}:${status}`);
      }
      const crossing = await fixture(), crossingId = await queue(crossing);
      cartReminderVerification.now = new Date("2030-05-06T19:59:59Z");
      commerceSendVerification.afterFinalRead = async () => {
        cartReminderVerification.now = new Date("2030-05-06T20:00:00Z");
      };
      await deliverQueuedEmail(crossingId);
      commerceSendVerification.afterFinalRead = null;
      assert.equal((await row(crossingId)).status, "pending");
      assert.equal((await row(crossingId)).last_error, "outside_marketing_window"); unsent(crossingId);
      checks.push("crossing 20:00 after final read holds before handoff");
      assert.equal(nextCartMarketingWindow(new Date("2030-05-06T20:00:59Z"), {
        enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00",
      } as any).toISOString(), "2030-05-07T09:00:00.000Z");
      checks.push("deferral rounds to exact eligible minute");

      const race = await fixture(), raceId = await queue(race);
      await Promise.all([deliverQueuedEmail(raceId), deliverQueuedEmail(raceId), drainOutbox()]);
      assert.equal(calls.get(`cart-reminder-${raceId}`), 1);
      assert.equal((await row(raceId)).status, "sent");
      checks.push("two direct dispatchers and drain race: exactly one synthetic invocation");

      const ambiguous = await fixture(), ambiguousId = await queue(ambiguous);
      await db.update(cartItems).set({ tripId: null }).where(eq(cartItems.id, ambiguous.cart.id));
      await deliverQueuedEmail(ambiguousId);
      assert.equal((await row(ambiguousId)).metadata.cancelReason, "payment_correlation_ambiguous"); unsent(ambiguousId);
      checks.push("payment_correlation_ambiguous stored and terminal");
      const unknown = await fixture(), unknownId = await queue(unknown);
      cartReminderVerification.recordedRailsOnly = false;
      await deliverQueuedEmail(unknownId);
      assert.equal((await row(unknownId)).metadata.cancelReason, "payment_rail_unknown"); unsent(unknownId);
      cartReminderVerification.recordedRailsOnly = true;
      checks.push("default payment UNKNOWN cancels without transport");

      const changed = await fixture();
      await db.update(providerServices).set({ price: "12.00" }).where(eq(providerServices.id, changed.service.id));
      const changedId = await queue(changed, true);
      await db.update(users).set({ preferences: { itineraryMarketing: { enabled: false } } })
        .where(eq(users.id, changed.user.id));
      cartReminderVerification.now = new Date("2030-05-06T01:00:00Z");
      await deliverQueuedEmail(changedId);
      assert.equal((await row(changedId)).status, "pending");
      assert.equal((await row(changedId)).last_error, "must_have_payment_ordering_unknown");
      assert.equal((await verifyCommerceSend(db, identity(changed, false), (await row(changedId)).metadata.cartSendFacts)).eligible, true);
      await db.update(providerServices).set({ price: "13.00" }).where(eq(providerServices.id, changed.service.id));
      await db.execute(sql`UPDATE email_outbox SET retry_after=NULL WHERE id=${changedId}`);
      await deliverQueuedEmail(changedId);
      assert.equal((await row(changedId)).metadata.cancelReason, "item_changed"); unsent(changedId);
      checks.push("item notice exempt from consent/timezone/window; must-have hold retained; second price change cancels");
      reports.push({ loop, scenario, status: "CLEAN_READABLE_SUBSET_ONLY", checks,
        actualProviderCalls: 0, releaseBlocked: true });
    }
    console.log(JSON.stringify({ part: "6-addendum", loops: reports, realEmails: 0 }));
  } finally {
    commerceSendVerification.beforeCheck = null; commerceSendVerification.beforeFinalRead = null;
    commerceSendVerification.afterFinalRead = null; commerceSendVerification.checkTimeoutMs = 5_000;
    cartReminderVerification.now = null; cartReminderVerification.recordedRailsOnly = false;
    _outboxTestHooks.sendEmailFn = undefined;
    await pool.end();
  }
});
