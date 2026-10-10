import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import {
  users, trips, providerServices, itineraryItems, cartItems, serviceBookings, contentRegistry,
  contentInvoices, bookingComponentStates, bundlePartialSettlements, feeLedger,
} from "../../../shared/schema";
import { addedCartState } from "../../services/cart-email-state.service";
import { cartReminderVerification, readTravelerCommerceActivity } from "../../services/cart-reminder.service";
import { assessCartItemChanges } from "../../services/cart-item-change.service";
import {
  verifyCommerceSend, commerceSendVerification,
} from "../../services/commerce-send-verification.service";
import {
  enqueuePendingCommerceReminder, enqueuePendingCartItemChange, deliverQueuedEmail,
  drainOutboxForAdminRetry, _outboxTestHooks,
} from "../../services/email-outbox.service";
import { lockMarketingTraveler } from "../../services/marketing-delivery-policy.service";
import { runCommerceEmailSweep, commerceSweepDependencies } from "../../services/commerce-email-sweep.service";
import { atEmailProviderHandoff, EmailSendCancelled } from "../../services/email.service";

const now = new Date("2030-05-05T12:00:00Z");
const preferences = { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } };

test("Part 6: two fresh native loops; live cancellation, recorded-signal orderings and measured synthetic boundary", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name, process.env.MESSAGING_VERIFICATION_SCHEMA);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_commerce_key
    ON email_outbox ((metadata->>'commerceKey')) WHERE metadata ? 'commerceKey'`);
  cartReminderVerification.now = now;
  cartReminderVerification.recordedRailsOnly = true;
  const calls = new Map<string, number>();
  _outboxTestHooks.sendEmailFn = async params => {
    const key = params.idempotencyKey!;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    return { ok: true, id: `synthetic_${randomUUID()}` };
  };
  const fixture = async () => {
    const id = randomUUID(), scope = randomUUID(), sequence = randomUUID(), start = now.getTime() - 3_600_000;
    const [user] = await db.insert(users).values({ id, email: `${id}@traveloure-qa.test`, preferences }).returning();
    const [trip] = await db.insert(trips).values({ userId: id, destination: "Kyoto",
      startDate: "2030-05-05", endDate: "2030-05-07" }).returning();
    const [service] = await db.insert(providerServices).values({ userId: id, serviceName: "Native cart proof",
      price: "10.00", priceType: "fixed", status: "active", availability: [] }).returning();
    const [item] = await db.insert(itineraryItems).values({ tripId: trip.id, providerServiceId: service.id,
      title: "Native", dayNumber: 1 }).returning();
    const [cart] = await db.insert(cartItems).values({ userId: id, experienceSlug: scope,
      tripId: trip.id, itineraryItemId: item.id, serviceId: service.id, quantity: 1,
      contentMeta: addedCartState({}, service.id, null, { at_ms: start, sequence_id: sequence }) }).returning();
    return { user, trip, service, item, cart, scope, sequence, start };
  };
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const identity = (f: Fixture, marketing = true) => ({ travelerId: f.user.id, scope: f.scope,
    sequenceId: f.sequence, recipient: f.user.email!, marketing });
  const row = async (id: number) => (await db.execute(sql`SELECT * FROM email_outbox WHERE id=${id}`)).rows[0] as any;
  const queue = async (f: Fixture) => {
    const added = await db.transaction(async tx => {
      await lockMarketingTraveler(tx, f.user.id);
      const preflight = await verifyCommerceSend(tx, identity(f));
      assert.equal(preflight.eligible, true, preflight.eligible ? "eligible" : preflight.reason);
      return enqueuePendingCommerceReminder(f.user.email!, `cart-reminder-1h:${f.cart.id}:${f.sequence}`,
        f.sequence, f.scope, { travelerId: f.user.id, scope: f.scope, kind: "cart_reminder_1h",
          sequenceStartMs: f.start }, tx);
    });
    assert.equal(added, true);
    return Number((await db.execute(sql`SELECT id FROM email_outbox WHERE metadata->>'travelerId'=${f.user.id}`)).rows[0].id);
  };
  const pi = async (f: Fixture) => {
    const id = `pi_synthetic_${randomUUID().replaceAll("-", "")}`;
    await db.execute(sql`INSERT INTO payment_intents
      (stripe_payment_intent_id,user_id,amount,currency,status,created_at,updated_at)
      VALUES (${id},${f.user.id},1000,'usd','requires_payment_method',
        ${new Date(f.start - 1)},${new Date(f.start - 1)})`);
    return id;
  };
  // Recorded signal fixtures, NOT real Stripe calls or claims of webhook-handler coverage.
  const signal = async (f: Fixture, id: string) => db.execute(sql`UPDATE payment_intents
    SET status='succeeded', updated_at=${new Date(f.start)} WHERE stripe_payment_intent_id=${id}`);
  const reports: object[] = [];
  try {
    for (let loop = 1; loop <= 2; loop++) {
      const scenario = randomUUID(), checks: string[] = [];
      const prove = (name: string) => checks.push(name);
      for (const source of ["content_invoice", "booking_component", "partial_settlement", "typed_fee_ledger"]) {
        const owner = await fixture(), other = await fixture(), before = new Date(owner.start - 1);
        const [booking] = await db.insert(serviceBookings).values({ travelerId: owner.user.id,
          serviceId: owner.service.id, totalAmount: "10.00", createdAt: before, updatedAt: before }).returning();
        let id: string, table: string;
        if (source === "content_invoice") {
          const [registry] = await db.insert(contentRegistry).values({ trackingNumber: randomUUID().slice(0, 20),
            contentType: "other", contentId: owner.service.id, ownerId: owner.user.id }).returning();
          const [record] = await db.insert(contentInvoices).values({ invoiceNumber: randomUUID().slice(0, 20),
            trackingNumber: registry.trackingNumber, customerId: owner.user.id,
            invoiceType: "booking", amount: 1000, totalAmount: 1000, createdAt: before, updatedAt: before }).returning();
          id = record.id; table = "content_invoices";
        } else if (source === "booking_component") {
          const [record] = await db.insert(bookingComponentStates).values({ bookingId: booking.id,
            componentServiceId: owner.service.id, status: "pending", createdAt: before, updatedAt: before }).returning();
          id = record.id; table = "booking_component_states";
        } else if (source === "partial_settlement") {
          const [record] = await db.insert(bundlePartialSettlements).values({ bookingId: booking.id,
            settledAmountCents: 1000, travelerRefundCents: 0, sellerEarningCents: 750,
            platformRevenueCents: 250, componentOutcomes: [], claimedAt: before,
            createdAt: before, updatedAt: before }).returning();
          id = record.id; table = "bundle_partial_settlements";
        } else {
          const [record] = await db.insert(feeLedger).values({ sourceType: "service_booking", sourceId: booking.id,
            bookingId: booking.id, feeType: "traveler_service_fee", amount: "1.00", borneBy: "traveler",
            rateSource: "code_fallback", idempotencyKey: randomUUID(), createdAt: before }).returning();
          id = record.id; table = "fee_ledger";
        }
        const birth = await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start);
        assert.equal(birth.activityRails.includes(source), false);
        assert.equal(birth.allowed, false);
        if (source !== "typed_fee_ledger") assert.ok(birth.unknownRails.includes(`${source}_lifecycle_unproven`));
        assert.equal((await readTravelerCommerceActivity(db, other.user.id, other.start, other.start)).recordedClear, true);
        for (const offset of [0, 1]) {
          await db.execute(sql`UPDATE ${sql.raw(table)} SET created_at=${new Date(owner.start + offset)}
            WHERE id=${id}`);
          assert.ok((await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start)).activityRails.includes(source));
        }
        if (source !== "typed_fee_ledger") {
          const lifecycleColumn = source === "content_invoice" ? "paid_at"
            : source === "booking_component" ? "delivered_at" : "settled_at";
          await db.execute(sql`UPDATE ${sql.raw(table)} SET created_at=${before}, updated_at=${before},
            ${sql.raw(lifecycleColumn)}=${new Date(owner.start)} WHERE id=${id}`);
          assert.ok((await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start)).activityRails.includes(source));
        }
        if (source === "typed_fee_ledger") {
          // Never infer a source table from an untyped ID, even if a booking with that ID exists.
          await db.execute(sql`UPDATE fee_ledger SET source_type='affiliate' WHERE id=${id}`);
          assert.ok((await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start)).unknownRails.includes(source));
          const [conflict] = await db.insert(serviceBookings).values({ travelerId: other.user.id,
            totalAmount: "10.00", createdAt: before, updatedAt: before }).returning();
          await db.execute(sql`UPDATE fee_ledger SET source_type='service_booking', booking_id=${conflict.id} WHERE id=${id}`);
          assert.ok((await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start)).unknownRails.includes(source));
          await db.execute(sql`UPDATE fee_ledger SET booking_id=NULL, source_id=${randomUUID()} WHERE id=${id}`);
          assert.ok((await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start)).unknownRails.includes(source));
        } else {
          await db.execute(sql`UPDATE ${sql.raw(table)} SET created_at=NULL WHERE id=${id}`);
          assert.ok((await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start)).unknownRails.includes(source));
          if (source === "content_invoice") {
            await db.execute(sql`UPDATE content_invoices SET customer_id=NULL WHERE id=${id}`);
          } else {
            await db.update(serviceBookings).set({ travelerId: null }).where(eq(serviceBookings.id, booking.id));
          }
          assert.ok((await readTravelerCommerceActivity(db, owner.user.id, owner.start, owner.start)).unknownRails.includes(source));
        }
        await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE id=${id}`);
        await db.update(serviceBookings).set({ travelerId: owner.user.id }).where(eq(serviceBookings.id, booking.id));
        prove(`read-only:${source}; owner/other-owner; birth vs lifecycle; before/at/after; missing or contradictory ownership`);
      }
      const cancelCases: [string, (f: Fixture) => Promise<unknown>][] = [
        ["paid", async f => signal(f, await pi(f))],
        ["cart_empty", f => db.delete(cartItems).where(eq(cartItems.id, f.cart.id))],
        ["unsubscribed", f => db.update(users).set({ preferences: { itineraryMarketing: { enabled: false, timeZone: "UTC" } } }).where(eq(users.id, f.user.id))],
        ["item_changed", f => db.update(providerServices).set({ price: "11.00" }).where(eq(providerServices.id, f.service.id))],
        ["superseded", f => db.execute(sql`UPDATE cart_items SET content_meta=jsonb_set(content_meta,
          '{_cart_automation,activity,sequence_id}', ${JSON.stringify(randomUUID())}::jsonb) WHERE id=${f.cart.id}`)],
        ["account_gone", f => db.update(users).set({ isDeleted: true }).where(eq(users.id, f.user.id))],
        ["no_email", f => db.update(users).set({ email: null }).where(eq(users.id, f.user.id))],
      ];
      for (const [reason, mutate] of cancelCases) {
        const f = await fixture(), id = await queue(f);
        await mutate(f);
        await deliverQueuedEmail(id);
        assert.equal((await row(id)).status, "cancelled", reason);
        assert.equal((await row(id)).metadata.cancelReason, reason);
        assert.equal((await row(id)).last_error, reason);
        await deliverQueuedEmail(id);
        await drainOutboxForAdminRetry(id);
        assert.equal(calls.get(`cart-reminder-${id}`) ?? 0, 0);
        prove(`cancel:${reason}; drain/direct/admin replay suppressed`);
      }
      const suspended = await fixture(), suspendedId = await queue(suspended);
      await db.update(users).set({ isSuspended: true }).where(eq(users.id, suspended.user.id));
      await deliverQueuedEmail(suspendedId);
      assert.equal((await row(suspendedId)).metadata.cancelReason, "account_gone");
      assert.equal((await row(suspendedId)).metadata.cancelDetail, "account_suspended");
      prove("suspension detail");
      const emailChanged = await fixture(), emailId = await queue(emailChanged);
      await db.update(users).set({ email: `${randomUUID()}@traveloure-qa.test` }).where(eq(users.id, emailChanged.user.id));
      await deliverQueuedEmail(emailId);
      assert.equal((await row(emailId)).metadata.cancelReason, "no_email");
      assert.equal((await row(emailId)).metadata.cancelDetail, "recipient_changed");
      prove("recipient changed after enqueue");
      const keyOrder = await fixture(), keyOrderId = await queue(keyOrder);
      const expected = (await row(keyOrderId)).metadata.cartSendFacts;
      expected.items = expected.items.map((item: any) => Object.fromEntries(Object.entries(item).reverse()));
      assert.equal((await verifyCommerceSend(db, identity(keyOrder), expected)).eligible, true);
      expected.items[0].title = "Changed quoted title";
      assert.equal((await verifyCommerceSend(db, identity(keyOrder), expected)).eligible, false);
      expected.items = null;
      assert.equal((await verifyCommerceSend(db, identity(keyOrder), expected)).eligible, false);
      await deliverQueuedEmail(keyOrderId);
      assert.equal((await row(keyOrderId)).status, "sent");
      prove("JSONB reordered keys accepted; changed value and malformed items fail closed");

      const early = await fixture(), earlyPi = await pi(early), earlyId = await queue(early);
      commerceSendVerification.beforeFinalRead = async () => { await signal(early, earlyPi); };
      await deliverQueuedEmail(earlyId);
      commerceSendVerification.beforeFinalRead = null;
      assert.equal((await row(earlyId)).metadata.cancelReason, "paid");
      assert.equal(calls.get(`cart-reminder-${earlyId}`) ?? 0, 0);
      prove("payment between preliminary check and FINAL check cancels");

      const late = await fixture(), latePi = await pi(late), lateId = await queue(late);
      commerceSendVerification.afterFinalRead = async () => {
        await signal(late, latePi);
        await new Promise(resolve => setTimeout(resolve, 15));
      };
      await deliverQueuedEmail(lateId);
      commerceSendVerification.afterFinalRead = null;
      assert.equal((await row(lateId)).status, "sent");
      assert.equal(calls.get(`cart-reminder-${lateId}`), 1);
      const measured = commerceSendVerification.timings.at(-1)!;
      assert.ok(measured.postReadToInvokeMs >= 15);
      assert.ok(measured.queryAndVerificationMs >= measured.postReadToInvokeMs);
      assert.ok(measured.paymentInstant);
      prove("marketing-only accepted residual window measured with controlled 15ms delay");

      for (let repeat = 0; repeat < 3; repeat++) {
        await signal(late, latePi); await deliverQueuedEmail(lateId);
      }
      await Promise.all([signal(late, latePi), signal(late, latePi), deliverQueuedEmail(lateId), deliverQueuedEmail(lateId)]);
      assert.equal(calls.get(`cart-reminder-${lateId}`), 1);
      prove("three recorded Stripe-like replays; concurrent recorded success signals; one synthetic email");
      const concurrent = await fixture(), concurrentId = await queue(concurrent);
      await Promise.all([deliverQueuedEmail(concurrentId), deliverQueuedEmail(concurrentId)]);
      assert.equal(calls.get(`cart-reminder-${concurrentId}`), 1);
      prove("two competing delivery claims send once");

      const skipped = await fixture(), skippedId = await queue(skipped);
      await db.update(providerServices).set({ status: "paused" }).where(eq(providerServices.id, skipped.service.id));
      const selectCandidates = commerceSweepDependencies.selectCandidates;
      commerceSweepDependencies.selectCandidates = async () => [];
      try { assert.equal((await runCommerceEmailSweep()).enqueued, 0); }
      finally { commerceSweepDependencies.selectCandidates = selectCandidates; }
      await deliverQueuedEmail(skippedId);
      assert.equal((await row(skippedId)).metadata.cancelReason, "item_changed");
      prove("FAULT: sweep omits candidate; dispatcher catches availability mismatch independently");

      const changed = await fixture();
      await db.update(providerServices).set({ price: "12.00" }).where(eq(providerServices.id, changed.service.id));
      const itemId = await db.transaction(async tx => {
        await lockMarketingTraveler(tx, changed.user.id);
        const assessment = await assessCartItemChanges(tx, changed.user.id, changed.scope, now);
        assert.equal(await enqueuePendingCartItemChange(assessment.changes[0], tx), true);
        return Number((await tx.execute(sql`SELECT id FROM email_outbox WHERE metadata->>'travelerId'=${changed.user.id}`)).rows[0].id);
      });
      await db.update(users).set({ preferences: { itineraryMarketing: { enabled: false } } }).where(eq(users.id, changed.user.id));
      await deliverQueuedEmail(itemId);
      assert.equal((await row(itemId)).status, "pending");
      assert.equal((await row(itemId)).last_error, "must_have_payment_ordering_unknown");
      assert.equal(calls.get(`cart-reminder-${itemId}`) ?? 0, 0);
      // Send verification must not reclassify the already-marked target as "already_notified".
      assert.equal((await verifyCommerceSend(db, identity(changed, false), (await row(itemId)).metadata.cartSendFacts)).eligible, true);
      await db.update(providerServices).set({ price: "13.00" }).where(eq(providerServices.id, changed.service.id));
      await db.execute(sql`UPDATE email_outbox SET retry_after=NULL WHERE id=${itemId}`);
      await deliverQueuedEmail(itemId);
      assert.equal((await row(itemId)).metadata.cancelReason, "item_changed");
      prove("item-change consent exemption; queued target comparison; must-have timing hold; changed target cancels");
      for (const corrupt of ["cartNotifiedValues", "html"] as const) {
        const envelope = await fixture();
        await db.update(providerServices).set({ price: "12.00" }).where(eq(providerServices.id, envelope.service.id));
        const envelopeId = await db.transaction(async tx => {
          await lockMarketingTraveler(tx, envelope.user.id);
          const assessed = await assessCartItemChanges(tx, envelope.user.id, envelope.scope, now);
          assert.equal(await enqueuePendingCartItemChange(assessed.changes[0], tx), true);
          return Number((await tx.execute(sql`SELECT id FROM email_outbox
            WHERE metadata->>'travelerId'=${envelope.user.id}`)).rows[0].id);
        });
        if (corrupt === "html") await db.execute(sql`UPDATE email_outbox SET html='wrong quoted payload' WHERE id=${envelopeId}`);
        else await db.execute(sql`UPDATE email_outbox SET metadata=jsonb_set(metadata,
          '{cartNotifiedValues,price}', '"999.00"'::jsonb) WHERE id=${envelopeId}`);
        await deliverQueuedEmail(envelopeId);
        assert.equal((await row(envelopeId)).metadata.cancelDetail, "quoted_item_payload_mismatch");
      }
      prove("item target values and quoted HTML independently verified, not just cart digest");

      const stale = await fixture();
      await db.update(providerServices).set({ price: "12.00" }).where(eq(providerServices.id, stale.service.id));
      await db.transaction(async tx => {
        await lockMarketingTraveler(tx, stale.user.id);
        const assessment = await assessCartItemChanges(tx, stale.user.id, stale.scope, now);
        await tx.update(providerServices).set({ price: "13.00" }).where(eq(providerServices.id, stale.service.id));
        assert.equal(await enqueuePendingCartItemChange(assessment.changes[0], tx), false);
      });
      assert.equal(Number((await db.execute(sql`SELECT count(*) AS n FROM email_outbox WHERE metadata->>'travelerId'=${stale.user.id}`)).rows[0].n), 0);
      prove("pre-queue stale item facts rejected; no outbox or notified-marker commit");
      const staleReminder = await fixture();
      await db.update(users).set({ preferences: { itineraryMarketing: { enabled: false } } })
        .where(eq(users.id, staleReminder.user.id));
      assert.equal(await db.transaction(async tx => {
        await lockMarketingTraveler(tx, staleReminder.user.id);
        return enqueuePendingCommerceReminder(staleReminder.user.email!,
          `cart-reminder-1h:${staleReminder.cart.id}:${staleReminder.sequence}`, staleReminder.sequence,
          staleReminder.scope, { travelerId: staleReminder.user.id, scope: staleReminder.scope,
            sequenceStartMs: staleReminder.start, kind: "cart_reminder_1h" }, tx);
      }), false);
      assert.equal(Number((await db.execute(sql`SELECT count(*) AS n FROM email_outbox
        WHERE metadata->>'travelerId'=${staleReminder.user.id}`)).rows[0].n), 0);
      prove("pre-queue reminder independently rejects withdrawn consent");

      // Five hostile cases, fresh fixtures each loop.
      const attacks: string[] = [];
      const forged = await fixture(), forgedId = await queue(forged);
      await db.execute(sql`UPDATE email_outbox SET metadata=metadata-'cartSendFacts' WHERE id=${forgedId}`);
      await deliverQueuedEmail(forgedId);
      assert.equal((await row(forgedId)).metadata.cancelDetail, "missing_queued_facts");
      attacks.push("legacy/forged row without server queue facts");
      const tampered = await fixture(), tamperedId = await queue(tampered);
      await db.execute(sql`UPDATE email_outbox SET metadata=jsonb_set(metadata,
        '{cartSendFacts,digest}', '"forged"'::jsonb) WHERE id=${tamperedId}`);
      await deliverQueuedEmail(tamperedId);
      assert.equal((await row(tamperedId)).metadata.cancelReason, "item_changed");
      attacks.push("tampered queued digest");
      await db.execute(sql`UPDATE email_outbox SET status='failed', retry_after=NULL WHERE id=${forgedId}`);
      await deliverQueuedEmail(forgedId);
      assert.equal((await row(forgedId)).status, "cancelled");
      assert.equal(calls.get(`cart-reminder-${forgedId}`) ?? 0, 0);
      attacks.push("forced retry of cancelled row retains cancellation");
      const fault = await fixture(), faultId = await queue(fault);
      commerceSendVerification.beforeFinalRead = async () => { throw new Error("Injected final read failure"); };
      await deliverQueuedEmail(faultId);
      commerceSendVerification.beforeFinalRead = null;
      assert.equal((await row(faultId)).status, "cancelled");
      assert.equal((await row(faultId)).metadata.cancelReason, "check_failed");
      assert.equal(calls.get(`cart-reminder-${faultId}`) ?? 0, 0);
      await db.execute(sql`UPDATE email_outbox SET status='cancelled', retry_after=NULL WHERE id=${faultId}`);
      attacks.push("final verifier failure never invokes provider");
      const held = await fixture();
      cartReminderVerification.recordedRailsOnly = false;
      const defaultCheck = await verifyCommerceSend(db, identity(held));
      assert.equal(defaultCheck.eligible, false);
      if (!defaultCheck.eligible) assert.equal(defaultCheck.reason, "payment_rail_unknown");
      const production = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        assert.equal((await verifyCommerceSend(db, identity(held))).eligible, false);
      } finally { process.env.NODE_ENV = production; cartReminderVerification.recordedRailsOnly = true; }
      attacks.push("default UNKNOWN and production boundary never bypassed by test seam");
      const before = calls.size;
      await assert.rejects(atEmailProviderHandoff(async () => ({ eligible: false, reason: "paid" }),
        async () => { throw new Error("Must not invoke"); }), EmailSendCancelled);
      for (const invalid of [null, {}, { eligible: 1 }]) {
        await assert.rejects(atEmailProviderHandoff(async () => invalid as any,
          async () => { throw new Error("Malformed guard must not invoke"); }), EmailSendCancelled);
      }
      assert.equal(calls.size, before);
      prove("shared SDK/synthetic boundary rejects before invoke");
      reports.push({ loop, scenario, checks, attacks, measured,
        actualStripeHandlerCoverage: "OPEN: recorded signal fixtures only",
        allRailCertified: false, realEmails: 0, releaseBlocked: true });
    }
    console.log(JSON.stringify({ part: 6, loops: reports, timings: commerceSendVerification.timings }));
  } finally {
    commerceSendVerification.beforeFinalRead = null; commerceSendVerification.afterFinalRead = null;
    commerceSendVerification.beforeCheck = null; commerceSendVerification.checkTimeoutMs = 5_000;
    cartReminderVerification.now = null; cartReminderVerification.recordedRailsOnly = false;
    _outboxTestHooks.sendEmailFn = undefined;
    await pool.end();
  }
});
