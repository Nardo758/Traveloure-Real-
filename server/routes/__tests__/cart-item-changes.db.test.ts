import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql, eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, pool } from "../../db";
import { users, trips, providerServices, itineraryItems, cartItems, vendorAvailabilitySlots } from "../../../shared/schema";
import { addedCartState, preserveCartState, CART_STATE_KEY } from "../../services/cart-email-state.service";
import {
  classifyCartItemChange, assessCartItemChanges, cartItemChangeVerification,
} from "../../services/cart-item-change.service";
import { buildCartItemChangeEmail } from "../../services/cart-item-change-email";
import { cartReminderVerification, assessCartReminder, readTravelerCommerceActivity } from "../../services/cart-reminder.service";
import { runCommerceEmailSweep } from "../../services/commerce-email-sweep.service";
import {
  enqueuePendingCartItemChange, enqueueEmail, deliverQueuedEmail, drainOutboxForAdminRetry, _outboxTestHooks,
} from "../../services/email-outbox.service";
import { lockMarketingTraveler, marketingDayReserved } from "../../services/marketing-delivery-policy.service";
import { runJob } from "../internal.routes";
import { recordCommerceSweepFailure } from "../../services/job-heartbeats.service";

const now = new Date("2030-05-05T12:00:00.000Z");
const baseAvailability = { schedule: [], status: "active", slot: null };
const current = (price: string, availability: unknown = baseAvailability) => ({ price, currency: "USD", availability });

test("Part 5: two randomized native loops, must-have selection only, zero provider transport", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name, process.env.MESSAGING_VERIFICATION_SCHEMA);
  await db.execute(sql.raw(readFileSync("server/migrations/360_job_heartbeats_nullable_success.sql", "utf8")));
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_commerce_key
    ON email_outbox ((metadata->>'commerceKey')) WHERE metadata ? 'commerceKey'`);
  cartReminderVerification.now = now;
  let providerCalls = 0;
  _outboxTestHooks.sendEmailFn = async () => { providerCalls++; return { ok: true, id: "synthetic-never-called" }; };

  const fixture = async (options: { slot?: boolean; idle?: number; marketing?: boolean; quantity?: number } = {}) => {
    const id = randomUUID(), scope = randomUUID().slice(0, 12), sequence = randomUUID();
    const [user] = await db.insert(users).values({ id, email: `${id}@traveloure-qa.test`,
      preferences: { itineraryMarketing: { enabled: options.marketing ?? false, timeZone: "UTC",
        quietStart: "00:00", quietEnd: "00:00" } } }).returning();
    const [trip] = await db.insert(trips).values({ userId: id, destination: "Kyoto",
      startDate: "2030-05-05", endDate: "2030-05-07" }).returning();
    const [service] = await db.insert(providerServices).values({ userId: id, serviceName: "<unsafe> & native",
      price: "10.00", priceType: "fixed", status: "active", availability: [] }).returning();
    const [item] = await db.insert(itineraryItems).values({ tripId: trip.id,
      providerServiceId: service.id, title: "Native", dayNumber: 1 }).returning();
    const slot = options.slot ? (await db.insert(vendorAvailabilitySlots).values({
      serviceId: service.id, providerId: id, date: "2030-05-05", startTime: "09:00",
      endTime: "10:00", capacity: 4, bookedCount: 0, status: "available",
    }).returning())[0] : null;
    const start = now.getTime() - (options.idle ?? 30_000);
    const [cart] = await db.insert(cartItems).values({ userId: id, experienceSlug: scope,
      tripId: trip.id, itineraryItemId: item.id, serviceId: service.id, slotId: slot?.id ?? null,
      quantity: options.quantity ?? 1,
      contentMeta: addedCartState({}, service.id, slot?.id ?? null, { at_ms: start, sequence_id: sequence }),
    }).returning();
    return { user, trip, service, item, slot, cart, scope, sequence, start };
  };
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const assess = (f: Fixture) => db.transaction(async tx => {
    await lockMarketingTraveler(tx, f.user.id);
    return assessCartItemChanges(tx, f.user.id, f.scope, now);
  });
  const queue = (f: Fixture) => db.transaction(async tx => {
    await lockMarketingTraveler(tx, f.user.id);
    const result = await assessCartItemChanges(tx, f.user.id, f.scope, now);
    let added = 0;
    for (const change of result.changes) if (await enqueuePendingCartItemChange(change, tx)) added++;
    return added;
  });
  const cartState = async (f: Fixture) => (await db.select().from(cartItems).where(eq(cartItems.id, f.cart.id)))[0].contentMeta as any;
  const rows = async (f: Fixture) => (await db.execute(sql`SELECT * FROM email_outbox
    WHERE metadata->>'travelerId'=${f.user.id} AND email_type='cart_item_changed' ORDER BY id`)).rows;
  const price = (f: Fixture, value: string) => db.update(providerServices).set({ price: value }).where(eq(providerServices.id, f.service.id));
  const evidence: object[] = [];
  try {
    for (let loop = 1; loop <= 2; loop++) {
      const scenario = randomUUID(), checks: string[] = [];
      const prove = (name: string) => { checks.push(name); };
      cartReminderVerification.recordedRailsOnly = false;
      const held = await fixture();
      await price(held, "11.00");
      assert.equal((await assess(held)).skipped.payment_rail_unknown, 1);
      assert.equal(await queue(held), 0);
      assert.equal((await cartState(held))[CART_STATE_KEY].notified, undefined);
      const paid = await readTravelerCommerceActivity(db, held.user.id, held.start, held.start);
      assert.equal(paid.allowed, false); assert.equal(paid.recordedClear, true);
      prove("default UNKNOWN blocks enqueue and notified marker");

      // READABLE-RECORD SUBSET ONLY. Never all-rail permission or release proof.
      cartReminderVerification.recordedRailsOnly = true;
      const up = await fixture();
      const original = structuredClone((await cartState(up))[CART_STATE_KEY]);
      assert.equal((await assess(up)).skipped.unchanged, 1);
      await price(up, "11.00");
      let result = await assess(up);
      assert.deepEqual(result.changes[0].reasons, ["price_up"]);
      assert.equal(await queue(up), 1); assert.equal(await queue(up), 0);
      let notices = await rows(up);
      assert.equal(notices.length, 1); assert.equal(notices[0].status, "pending");
      assert.equal((notices[0].metadata as any).marketing, false);
      let state = (await cartState(up))[CART_STATE_KEY];
      assert.deepEqual(state.snapshot, original.snapshot); assert.deepEqual(state.activity, original.activity);
      assert.equal(state.notified.price, "11.00");
      assert.equal(state.notified.outbox_id, Number(notices[0].id));
      const message = buildCartItemChangeEmail(result.changes[0]);
      assert.ok(message.html.includes("&lt;unsafe&gt; &amp; native")); assert.ok(!message.html.includes("<unsafe>"));
      assert.match(message.text, /not your checkout total/);
      assert.equal(new URL(message.html.match(/href="([^"]+)"/)![1].replaceAll("&amp;", "&")).pathname, "/cart");
      prove("price up; one queue; notified linked; snapshot/clock immutable; escaped rendered content");

      const down = await fixture();
      await price(down, "9.00");
      assert.deepEqual((await assess(down)).changes[0].reasons, ["price_down"]);
      assert.equal(await queue(down), 1);
      assert.equal((await cartState(down))[CART_STATE_KEY].notified.outbox_id, Number((await rows(down))[0].id));
      prove("price down");

      const loss = await fixture({ slot: true });
      await db.update(vendorAvailabilitySlots).set({ bookedCount: 1 }).where(eq(vendorAvailabilitySlots.id, loss.slot!.id));
      assert.equal((await assess(loss)).skipped.unchanged, 1);
      await db.update(vendorAvailabilitySlots).set({ bookedCount: 4 }).where(eq(vendorAvailabilitySlots.id, loss.slot!.id));
      assert.deepEqual((await assess(loss)).changes[0].reasons, ["availability_loss"]);
      assert.equal(await queue(loss), 1); assert.equal(await queue(loss), 0);
      prove("capacity reduction still available is harmless; sold-out loss once");

      const units = await fixture({ slot: true, quantity: 3 });
      await db.update(vendorAvailabilitySlots).set({ bookedCount: 1 }).where(eq(vendorAvailabilitySlots.id, units.slot!.id));
      assert.equal((await assess(units)).skipped.unchanged, 1, "exactly enough units");
      await db.update(vendorAvailabilitySlots).set({ bookedCount: 2 }).where(eq(vendorAvailabilitySlots.id, units.slot!.id));
      assert.deepEqual((await assess(units)).changes[0].reasons, ["availability_loss"]);
      assert.equal(await queue(units), 1);
      await db.update(vendorAvailabilitySlots).set({ bookedCount: 3 }).where(eq(vendorAvailabilitySlots.id, units.slot!.id));
      assert.equal(await queue(units), 0, "still unavailable is the same meaningful target");
      const quantityOnly = await fixture({ slot: true });
      await price(quantityOnly, "11.00"); assert.equal(await queue(quantityOnly), 1);
      await db.update(cartItems).set({ quantity: 3 }).where(eq(cartItems.id, quantityOnly.cart.id));
      assert.equal((await assess(quantityOnly)).changes.length, 0, "quantity change alone is not catalog activity");
      await db.update(vendorAvailabilitySlots).set({ bookedCount: 2 }).where(eq(vendorAvailabilitySlots.id, quantityOnly.slot!.id));
      assert.deepEqual((await assess(quantityOnly)).changes[0].reasons, ["availability_loss"]);
      assert.equal(await queue(quantityOnly), 1);
      prove("requested-unit stock boundary; quantity-only no false notice; raw notified facts preserved");
      for (const quantity of [null, 0, -1]) {
        const malformedQuantity = await fixture(); await price(malformedQuantity, "11.00");
        await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, malformedQuantity.cart.id));
        assert.equal((await assess(malformedQuantity)).skipped.cart_quantity_unknown, 1);
        assert.equal(await queue(malformedQuantity), 0);
      }
      prove("legacy null/zero/negative requested quantities fail closed");

      const combined = await fixture({ slot: true });
      await price(combined, "12.00");
      await db.update(vendorAvailabilitySlots).set({ status: "blocked" }).where(eq(vendorAvailabilitySlots.id, combined.slot!.id));
      assert.deepEqual((await assess(combined)).changes[0].reasons, ["price_up", "availability_loss"]);
      assert.equal(await queue(combined), 1);
      assert.equal((await cartState(combined))[CART_STATE_KEY].notified.outbox_id, Number((await rows(combined))[0].id));
      prove("combined change has one email");

      const unsubscribed = await fixture();
      await db.update(users).set({ preferences: { itineraryMarketing: { enabled: false } } }).where(eq(users.id, unsubscribed.user.id));
      await price(unsubscribed, "13.00");
      cartReminderVerification.now = new Date("2030-05-05T01:00:00.000Z");
      // Activity must be valid for the synthetic night clock; no idle delay needed.
      await db.execute(sql`UPDATE cart_items SET content_meta=jsonb_set(content_meta,
        '{_cart_automation,activity,at_ms}', ${String(Date.parse("2030-05-05T00:59:59Z"))}::jsonb)
        WHERE id=${unsubscribed.cart.id}`);
      assert.equal(await db.transaction(async tx => {
        await lockMarketingTraveler(tx, unsubscribed.user.id);
        const assessment = await assessCartItemChanges(tx, unsubscribed.user.id, unsubscribed.scope, cartReminderVerification.now!);
        assert.equal(assessment.changes.length, 1);
        return enqueuePendingCartItemChange(assessment.changes[0], tx);
      }), true);
      cartReminderVerification.now = now;
      prove("unsubscribed, unknown timezone, outside marketing hours still selected");

      const capped = await fixture();
      await db.execute(sql`INSERT INTO email_outbox(email_type,to_email,subject,html,status,metadata)
        VALUES ('itinerary_reminder',${capped.user.email},'synthetic','synthetic','sent',
          ${JSON.stringify({ travelerId: capped.user.id, marketing: true, deliveryCalendarDay: "2030-05-05" })}::jsonb)`);
      await price(capped, "14.00"); assert.equal(await queue(capped), 1);
      const noMarketingReservation = await db.transaction(tx => marketingDayReserved(tx, up.user.id, "2030-05-05"));
      assert.equal(noMarketingReservation, false);
      prove("marketing daily cap bypassed; item-change queue does not reserve marketing day");

      for (const field of ["isDeleted", "isSuspended"] as const) {
        const f = await fixture(); await price(f, "15.00");
        await db.update(users).set({ [field]: true }).where(eq(users.id, f.user.id));
        assert.equal((await assess(f)).changes.length, 0); assert.equal(await queue(f), 0);
      }
      prove("deleted/suspended refused");

      const paidCart = await fixture(); await price(paidCart, "15.00");
      await db.execute(sql`INSERT INTO payment_intents
        (stripe_payment_intent_id,user_id,amount,currency,status,created_at,updated_at)
        VALUES (${`pi_synthetic_${randomUUID().replaceAll("-", "")}`},${paidCart.user.id},
          1000,'usd','canceled',${new Date(paidCart.start)},${new Date(paidCart.start)})`);
      assert.equal((await assess(paidCart)).skipped.payment_or_booking_since_sequence_start, 1);
      assert.equal(await queue(paidCart), 0);
      const ambiguous = await fixture(); await price(ambiguous, "15.00");
      await db.update(cartItems).set({ serviceId: null }).where(eq(cartItems.id, ambiguous.cart.id));
      assert.equal((await assess(ambiguous)).skipped.payment_correlation_ambiguous, 1);
      prove("shared paid reader blocks canceled activity at inclusive boundary; partner-only ambiguity");

      const legacy = await fixture();
      await db.update(cartItems).set({ contentMeta: { _cart_automation: { activity: original.activity } } }).where(eq(cartItems.id, legacy.cart.id));
      assert.equal((await assess(legacy)).skipped.no_snapshot, 1);
      assert.equal(await queue(legacy), 0);
      const noClock = await fixture(); await price(noClock, "15.00");
      await db.execute(sql`UPDATE cart_items SET content_meta=content_meta #- '{_cart_automation,activity}'
        WHERE id=${noClock.cart.id}`);
      assert.equal((await assess(noClock)).skipped.no_activity_stamp, 1);
      prove("no_snapshot and no activity stamp; no backfill");

      const display = await fixture();
      const oldDisplay = await cartState(display);
      await db.update(cartItems).set({ contentMeta: preserveCartState(sql`content_meta`,
        { title: "display only", _cart_automation: { snapshot: "forged" } }) }).where(eq(cartItems.id, display.cart.id));
      assert.deepEqual((await cartState(display))[CART_STATE_KEY], oldDisplay[CART_STATE_KEY]);
      assert.equal((await assess(display)).skipped.unchanged, 1);
      prove("display/client metadata cannot overwrite snapshot");

      const parallel = await fixture(); await price(parallel, "16.00");
      assert.equal((await Promise.all([queue(parallel), queue(parallel)])).reduce((a,b) => a+b, 0), 1);
      assert.equal((await rows(parallel)).length, 1);
      prove("two concurrent queue passes once");

      const atomic = await fixture(); await price(atomic, "17.00");
      const beforeAtomic = await cartState(atomic);
      const [change] = (await assess(atomic)).changes;
      // Force a zero-row marker result AFTER the real INSERT. Stale/wrong item
      // inputs are now correctly rejected by the pre-queue verifier before INSERT.
      await assert.rejects(db.transaction(async tx => {
        await lockMarketingTraveler(tx, atomic.user.id);
        const fault = new Proxy(tx, { get(target, property) {
          if (property === "execute") return async (query: any) => {
            if (/^UPDATE cart_items/i.test(new PgDialect().sqlToQuery(query).sql.trim())) return { rows: [] };
            return target.execute(query);
          };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        } });
        return enqueuePendingCartItemChange(change, fault);
      }), /notified values were not committed/);
      assert.equal((await rows(atomic)).length, 0);
      assert.deepEqual(await cartState(atomic), beforeAtomic);
      assert.equal(await queue(atomic), 1);
      prove("marker failure rolls back enqueue; retry succeeds");

      const guest = await fixture(); await price(guest, "18.00");
      await db.update(cartItems).set({ userId: null, guestSessionId: randomUUID() }).where(eq(cartItems.id, guest.cart.id));
      assert.equal((await assess(guest)).changes.length, 0);
      await db.update(cartItems).set({ userId: guest.user.id, guestSessionId: null }).where(eq(cartItems.id, guest.cart.id));
      assert.equal(await queue(guest), 1);
      prove("guest cannot send; authenticated claim enables subset selection");

      // A->B->A observed: returning A can queue once, but another B is the same target key.
      await price(up, "10.00"); assert.equal(await queue(up), 1);
      await price(up, "11.00"); assert.equal(await queue(up), 0);
      assert.equal((await rows(up)).length, 2);
      const transient = await fixture(); await price(transient, "11.00"); await price(transient, "10.00");
      assert.equal((await assess(transient)).skipped.unchanged, 1);
      prove("documented observed target-repeat and unobserved A-B-A limits");

      // Five fresh hostile scenarios per loop, not reused fixture IDs.
      const attacks = [
        "slot orphan", "cross-owner plan", "custom quote", "currency/decimal/JSON semantics", "catalog query fault",
      ];
      const orphan = await fixture({ slot: true }); await price(orphan, "19.00");
      await db.delete(vendorAvailabilitySlots).where(eq(vendorAvailabilitySlots.id, orphan.slot!.id));
      assert.equal((await assess(orphan)).skipped.availability_context_changed, 1);
      const wrongOwner = await fixture(); const other = await fixture(); await price(wrongOwner, "19.00");
      await db.update(trips).set({ userId: other.user.id }).where(eq(trips.id, wrongOwner.trip.id));
      assert.equal((await assess(wrongOwner)).skipped.catalog_state_unknown, 1);
      const quote = await fixture(); await price(quote, "19.00");
      await db.update(providerServices).set({ priceType: "custom_quote" }).where(eq(providerServices.id, quote.service.id));
      assert.equal((await assess(quote)).skipped.catalog_state_unknown, 1);
      const meta = { [CART_STATE_KEY]: { snapshot: { ...current("10.00"), captured_at: now.toISOString() } } };
      assert.equal(classifyCartItemChange(meta, current("10.0", { slot: null, status: "active", schedule: ["display"] })).eligible, false);
      assert.equal(classifyCartItemChange(meta, { ...current("11.00"), currency: "EUR" }).eligible, false);
      for (const malformed of [null, {}, { [CART_STATE_KEY]: { snapshot: null } },
        { [CART_STATE_KEY]: { snapshot: { ...current("9".repeat(10000)), captured_at: "bad" } } }]) {
        assert.equal(classifyCartItemChange(malformed, current("11.00")).eligible, false);
      }
      cartItemChangeVerification.queryFault = true;
      await assert.rejects(runCommerceEmailSweep(), /candidate query failure/);
      // Existing recorder, not a second heartbeat/scheduler.
      const failed = await runJob("commerce-email-sweep", runCommerceEmailSweep, undefined,
        { useBackgroundJobRunner: false, onFailure: recordCommerceSweepFailure });
      assert.equal(failed.status, 500);
      const heartbeat = (await db.execute(sql`SELECT last_result FROM job_heartbeats WHERE job_name='commerce-email-sweep'`)).rows[0];
      assert.equal((heartbeat.last_result as any).status, "FAILED");
      cartItemChangeVerification.queryFault = false;
      const recovered = await runJob("commerce-email-sweep", runCommerceEmailSweep, undefined,
        { useBackgroundJobRunner: false, onFailure: recordCommerceSweepFailure });
      assert.equal(recovered.status, 200);
      assert.equal((await db.execute(sql`SELECT last_success_at IS NOT NULL AS succeeded
        FROM job_heartbeats WHERE job_name='commerce-email-sweep'`)).rows[0].succeeded, true);
      prove("five hostile scenarios; failed candidate heartbeat then genuine recovery");

      // Sweep integration: dedicated counts, no accidental marketing restriction.
      const integrated = await fixture(); await price(integrated, "20.00");
      const sweep = await runCommerceEmailSweep();
      assert.ok(sweep.itemChanges!.enqueued >= 1);
      assert.equal((await rows(integrated)).length, 1);
      await runCommerceEmailSweep(); assert.equal((await rows(integrated)).length, 1);
      prove("existing sweep integration; repeat sweep no duplicate");

      for (const row of await rows(up)) {
        await deliverQueuedEmail(Number(row.id));
        const blocked = (await db.execute(sql`SELECT status, metadata FROM email_outbox WHERE id=${row.id}`)).rows[0];
        if ((blocked.metadata as any).cartNotifiedValues.price === "11.00") {
          assert.equal(blocked.status, "pending");
          assert.equal((await db.execute(sql`SELECT last_error FROM email_outbox WHERE id=${row.id}`)).rows[0].last_error,
            "must_have_payment_ordering_unknown");
        } else {
          assert.equal(blocked.status, "cancelled");
          assert.equal((blocked.metadata as any).cancelReason, "item_changed");
        }
      }
      assert.equal(await enqueueEmail({ emailType: "cart_item_changed", to: up.user.email!, subject: "forged", html: "forged" }), null);
      await drainOutboxForAdminRetry(Number(notices[0].id));
      assert.equal(providerCalls, 0);
      const productionFixture = await fixture(); await price(productionFixture, "21.00");
      const productionChange = (await assess(productionFixture)).changes[0];
      const production = process.env.NODE_ENV; process.env.NODE_ENV = "production";
      try {
        assert.equal((await assess(productionFixture)).skipped.commerce_verification_disabled, 1);
        await assert.rejects(db.transaction(tx => enqueuePendingCartItemChange(productionChange, tx)), /restricted/);
        await assert.rejects(runCommerceEmailSweep(), /not released/);
      } finally { process.env.NODE_ENV = production; }
      assert.equal(providerCalls, 0);
      prove("generic/drain/admin paths verify current item facts without provider; production gate");
      evidence.push({ loop, scenario, status: "CLEAN_READABLE_SUBSET_ONLY", checks, attacks,
        actualProviderCalls: providerCalls, allRailCertified: false, realDelivery: "OPEN" });
    }
    console.log(JSON.stringify({ part: 5, loops: evidence, realEmails: 0, releaseBlocked: true }));
  } finally {
    cartReminderVerification.now = null; cartReminderVerification.recordedRailsOnly = false;
    cartItemChangeVerification.queryFault = false; _outboxTestHooks.sendEmailFn = null;
    await pool.end();
  }
});
