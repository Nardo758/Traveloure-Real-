import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import { cartItems, providerServices, users, emailOutbox, trips, itineraryItems } from "../../shared/schema";
import * as projection from "../services/cart-projection.service";
import {
  enqueueEmail, enqueuePendingCartItemChange, deliverQueuedEmail, _outboxTestHooks,
} from "../services/email-outbox.service";
import { assessCartItemChanges } from "../services/cart-item-change.service";
import { cartReminderVerification } from "../services/cart-reminder.service";
import { lockMarketingTraveler } from "../services/marketing-delivery-policy.service";
import {
  CART_STATE_KEY, cartStateDependencies, evaluateCartClock, evaluateCartItemChange,
  preserveCartState, recordQueuedCartValues, snapshotSkipReason,
  queryCartClock, withCartActivityOrigin,
} from "../services/cart-email-state.service";

test("two randomized isolated Part 2 loops, actual cart writers and before/after benchmark", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]+$/,
    "Run through the retained isolated-development harness; never public or production.");
  const [{ schema }] = (await db.execute(sql`SELECT current_schema() AS schema`)).rows as { schema: string }[];
  assert.equal(schema, process.env.MESSAGING_VERIFICATION_SCHEMA);
  const temp = mkdtempSync(path.join(tmpdir(), "cart-part2-baseline-"));
  symlinkSync(path.resolve("node_modules"), path.join(temp, "node_modules"), "dir");
  const output = path.join(temp, "storage.mjs");
  // Exact frozen storage source, not an approximation or a different database.
  const frozen = execFileSync("git", ["show", "2f9bcaba9752f9700b956ef1ff30c0e748a3ba99:server/storage.ts"], { encoding: "utf8", maxBuffer: 2_000_000 }) + '\nexport { pool } from "./db";\n';
  buildSync({ stdin: { contents: frozen, loader: "ts", resolveDir: path.resolve("server") },
    outfile: output, bundle: true, platform: "node", format: "esm", packages: "external",
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: "silent" });
  const baseline = await import(pathToFileURL(output).href);
  const fetch = async (id: string) => (await db.select().from(cartItems).where(eq(cartItems.id, id)))[0];
  const stamp = (row: any) => row.contentMeta[CART_STATE_KEY].activity;
  const snapshot = (row: any) => row.contentMeta[CART_STATE_KEY].snapshot;
  const results: object[] = [];
  try {
    for (let loop = 1; loop <= 2; loop++) {
      const userId = randomUUID(), providerId = randomUUID(), serviceId = randomUUID();
      const travelerEmail = `${randomUUID()}@traveloure-qa.test`;
      await db.insert(users).values([
        { id: userId, email: travelerEmail, role: "traveler" },
        { id: providerId, email: `${randomUUID()}@traveloure-qa.test`, role: "service_provider" },
      ]);
      await db.insert(providerServices).values({ id: serviceId, userId: providerId,
        serviceName: "Isolated Part 2 service", price: "12.34", priceType: "fixed",
        status: "active", bookingMode: "instant", availability: [] });
      const row = await storage.addToCart(userId, { serviceId, contentMeta: {
        [CART_STATE_KEY]: { activity: { at_ms: 99999999999999, sequence_id: "client" },
          snapshot: { price: "0", currency: "FAKE" } },
      } });
      assert.equal(snapshot(row).price, "12.34");
      assert.equal(snapshot(row).currency, "USD");
      assert.ok(snapshot(row).availability);
      assert.ok(Date.parse(snapshot(row).captured_at));
      assert.notEqual(stamp(row).sequence_id, "client");
      const original = snapshot(row);
      const initialClock = stamp(row);
      // Metadata, notes, dates, trip links, page reads and equal quantity do not move clock.
      await db.update(cartItems).set({ contentMeta: preserveCartState(sql`${cartItems.contentMeta}`,
        { imageUrl: "display-only", [CART_STATE_KEY]: { snapshot: { price: "0" } } }) }).where(eq(cartItems.id, row.id));
      await storage.updateCartItem(row.id, { notes: "display-only", quantity: 1 });
      const displayed = await fetch(row.id);
      assert.deepEqual(snapshot(displayed), original);
      assert.deepEqual(stamp(displayed), initialClock);
      // Re-add increments atomically, preserves add-time truth even if catalog changed.
      await db.update(providerServices).set({ price: "18.00" }).where(eq(providerServices.id, serviceId));
      await Promise.all([
        storage.addToCart(userId, { serviceId, quantity: 2 }),
        storage.addToCart(userId, { serviceId, quantity: 3 }),
      ]);
      const concurrent = await fetch(row.id);
      assert.equal(concurrent.quantity, 6);
      assert.deepEqual(snapshot(concurrent), original);
      // Resume resets the sequence; old sent-step keys cannot equal the new sequence key.
      const oldSequence = stamp(concurrent).sequence_id;
      await db.update(cartItems).set({ contentMeta: sql`jsonb_set(content_meta,
        '{_cart_automation,activity,at_ms}', to_jsonb((extract(epoch from clock_timestamp())*1000)::bigint - 7200000))` })
        .where(eq(cartItems.id, row.id));
      await storage.updateCartItem(row.id, { quantity: 7 });
      const resumed = await fetch(row.id);
      assert.notEqual(stamp(resumed).sequence_id, oldSequence);
      assert.deepEqual(evaluateCartClock([resumed], Date.now()), { eligible: false, reason: "not_idle" });
      assert.deepEqual(await queryCartClock(userId), { eligible: false, reason: "not_idle" });
      assert.deepEqual(evaluateCartClock([resumed], stamp(resumed).at_ms + 3_600_000 - 1),
        { eligible: false, reason: "not_idle" });
      assert.equal(evaluateCartClock([resumed], stamp(resumed).at_ms + 3_600_000).eligible, true);
      assert.equal(evaluateCartClock([resumed], stamp(resumed).at_ms + 3_600_000 + 1).eligible, true);
      // Actual fault injection at the shared preparation dependency, before a SQL mutation.
      const normalBuilder = cartStateDependencies.builder;
      try {
        cartStateDependencies.builder = () => { throw Error("injected"); };
        for (const operation of [
          () => storage.updateCartItem(row.id, { quantity: 8 }),
          () => storage.addToCart(userId, { serviceId }),
          () => storage.removeFromCart(row.id),
          () => storage.clearCart(userId),
          () => storage.replaceUserCartWithVariantItems(userId, [{ providerServiceId: serviceId, dayNumber: 1, timeSlot: "AM" }]),
        ]) {
          await assert.rejects(operation(), { message: "Cart change could not be saved. Please retry." });
          assert.deepEqual(await fetch(row.id), resumed);
        }
      } finally { cartStateDependencies.builder = normalBuilder; }
      // Malformed/legacy JSON never blocks a valid re-add; no snapshot is backfilled.
      for (const meta of [null, [], "legacy", 42, {}, { old: "cart" },
        { [CART_STATE_KEY]: { activity: { at_ms: 99999999999999, sequence_id: "fake" } } },
        { huge: Array.from({ length: 20_000 }, () => ({ legacy: true })) }]) {
        await db.update(cartItems).set({ contentMeta: meta as any }).where(eq(cartItems.id, row.id));
        await storage.addToCart(userId, { serviceId });
        assert.equal(snapshotSkipReason((await fetch(row.id)).contentMeta), "no_snapshot");
        assert.deepEqual(await queryCartClock(userId), { eligible: false, reason: "not_idle" });
      }
      // Guest migration creates user cart activity without guessing old snapshots.
      const guestId = randomUUID();
      const guest = await storage.addToCart(null, { contentType: "affiliate_product",
        contentId: randomUUID(), guestSessionId: guestId });
      const guestDuplicate = await storage.addToCart(null, { serviceId, guestSessionId: guestId });
      const orphanId = randomUUID();
      await db.insert(cartItems).values({ id: orphanId, guestSessionId: guestId });
      const normalGuestBuilder = cartStateDependencies.builder;
      try {
        cartStateDependencies.builder = () => { throw Error("injected"); };
        await assert.rejects(storage.migrateGuestCart(guestId, userId),
          { message: "Cart change could not be saved. Please retry." });
        assert.equal((await fetch(guest.id)).guestSessionId, guestId);
        assert.ok(await fetch(guestDuplicate.id));
        assert.ok(await fetch(orphanId));
      } finally { cartStateDependencies.builder = normalGuestBuilder; }
      assert.deepEqual(await storage.migrateGuestCart(guestId, userId), { migrated: 1, deduplicated: 1 });
      assert.equal((await fetch(guest.id)).userId, userId);
      assert.ok(stamp(await fetch(guest.id)).sequence_id);
      // Removing an item stamps survivors in the deletion statement. Final removal closes.
      const beforeRemoval = stamp(await fetch(guest.id)).sequence_id;
      await storage.removeFromCart(row.id);
      assert.equal(await fetch(row.id), undefined);
      assert.notEqual(stamp(await fetch(guest.id)).sequence_id, beforeRemoval);
      await storage.clearCart(userId);
      assert.deepEqual(await queryCartClock(userId), { eligible: false, reason: "empty_cart" });
      assert.equal(await fetch(guest.id), undefined);
      // Actual projection writers, including background preservation and conversion.
      const tripId = randomUUID(), itemId = randomUUID();
      await db.insert(trips).values({ id: tripId, userId, destination: "Kyoto",
        startDate: "2027-01-01", endDate: "2027-01-03" });
      await db.insert(itineraryItems).values({ id: itemId, tripId, dayNumber: 1,
        title: "Isolated projection", providerServiceId: serviceId,
        routingStatus: "ready_for_checkout", quantity: 2 });
      const projected = await withCartActivityOrigin(() => projection.syncItemProjection(itemId));
      assert.equal(projected.action, "upserted");
      const [projectedRow] = await db.select().from(cartItems).where(eq(cartItems.itineraryItemId, itemId));
      const projectedState = projectedRow.contentMeta;
      await db.update(itineraryItems).set({ title: "Display changed" }).where(eq(itineraryItems.id, itemId));
      await projection.syncItemProjection(itemId);
      assert.deepEqual((await fetch(projectedRow.id)).contentMeta, projectedState);
      await db.update(itineraryItems).set({ quantity: 3 }).where(eq(itineraryItems.id, itemId));
      await withCartActivityOrigin(() => projection.syncItemProjection(itemId));
      const projectedQuantity = await fetch(projectedRow.id);
      assert.equal(projectedQuantity.quantity, 3);
      assert.deepEqual(snapshot(projectedQuantity), snapshot(projectedRow));
      assert.notEqual(stamp(projectedQuantity).sequence_id, stamp(projectedRow).sequence_id);
      await projection.attachTripToCartItems(userId, tripId);
      assert.deepEqual(stamp(await fetch(projectedRow.id)), stamp(projectedQuantity));
      await db.update(itineraryItems).set({ routingStatus: "in_planning" }).where(eq(itineraryItems.id, itemId));
      assert.equal((await withCartActivityOrigin(() => projection.syncItemProjection(itemId))).action, "deleted");
      const convertLine = await storage.addToCart(userId, { serviceId });
      const converted = await projection.convertCartLinesToItems(userId, tripId, [convertLine.id]);
      assert.equal(converted.converted, 1);
      assert.equal(await fetch(convertLine.id), undefined);
      const materializeLine = await storage.addToCart(userId, { serviceId });
      const beforeMaterialize = (await fetch(materializeLine.id)).contentMeta;
      await projection.materializeCartLinesAsItems(userId, tripId);
      assert.equal((await fetch(materializeLine.id)).tripId, tripId);
      assert.ok((await fetch(materializeLine.id)).itineraryItemId);
      assert.deepEqual((await fetch(materializeLine.id)).contentMeta, beforeMaterialize);
      await storage.clearCart(userId);
      // Variant replacement uses one statement; valid service snapshots; failed FK rolls back.
      await storage.replaceUserCartWithVariantItems(userId,
        [{ providerServiceId: serviceId, dayNumber: 1, timeSlot: "AM" }]);
      const [variant] = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
      assert.equal(snapshot(variant).price, "18.00");
      await assert.rejects(storage.replaceUserCartWithVariantItems(userId,
        [{ providerServiceId: randomUUID(), dayNumber: 2, timeSlot: "PM" }]));
      assert.deepEqual(await fetch(variant.id), variant);
      const countFixtureEmails = async () => Number((await db.execute(sql`SELECT count(*) AS count
        FROM email_outbox WHERE to_email=${travelerEmail} OR metadata->>'travelerId'=${userId}`)).rows[0].count);
      assert.equal(await countFixtureEmails(), 0,
        "Cart authoring, guest claim and projection writers must not enqueue email");
      // Queue association + notified-value idempotency, without any delivery or new mail family.
      const values = { price: "19.00", currency: "USD", availability: snapshot(variant).availability };
      const [outbox] = await db.insert(emailOutbox).values({ emailType: "cart_item_changed",
        toEmail: travelerEmail, subject: "Isolated fixture; never sent", html: "",
        status: "pending", metadata: { cartItemId: variant.id } }).returning();
      assert.equal(await recordQueuedCartValues(variant.id, outbox.id, values), true);
      assert.equal(await recordQueuedCartValues(variant.id, outbox.id, values), false);
      const notified = await fetch(variant.id);
      assert.equal(evaluateCartItemChange(notified.contentMeta, values), "already_notified");
      assert.deepEqual(stamp(notified), stamp(variant));
      const previousSender = _outboxTestHooks.sendEmailFn;
      const previousNow = cartReminderVerification.now;
      const previousSubset = cartReminderVerification.recordedRailsOnly;
      let mockSends = 0;
      _outboxTestHooks.sendEmailFn = async () => {
        mockSends++;
        return { success: true, messageId: `provider-free-${randomUUID()}` };
      };
      try {
        // Use the existing guarded producer with readable-record-only eligibility.
        // This isolated fixture does not authorize UNKNOWN rails or real delivery.
        cartReminderVerification.now = new Date(stamp(variant).at_ms + 10);
        cartReminderVerification.recordedRailsOnly = true;
        await db.update(cartItems).set({ tripId, itineraryItemId: itemId })
          .where(eq(cartItems.id, variant.id));
        const nextValues = { ...values, price: "20.00" };
        await db.update(providerServices).set({ price: nextValues.price }).where(eq(providerServices.id, serviceId));
        const queueChange = () => db.transaction(async tx => {
          await lockMarketingTraveler(tx, userId);
          const assessed = await assessCartItemChanges(tx, userId, null, cartReminderVerification.now!);
          if (!assessed.changes.length) {
            assert.deepEqual(assessed.skipped, { already_notified: 1 });
            return null;
          }
          assert.deepEqual(assessed.skipped, {});
          assert.equal(assessed.changes.length, 1);
          const change = assessed.changes[0];
          assert.equal(change.cartItemId, variant.id);
          assert.equal(change.recipient, travelerEmail);
          assert.equal(await enqueuePendingCartItemChange(change, tx), true);
          const queued = await tx.execute(sql`SELECT id FROM email_outbox
            WHERE metadata->>'commerceKey'=${change.key}`);
          assert.equal(queued.rows.length, 1);
          return Number(queued.rows[0].id);
        });
        const queuedId = await queueChange();
        assert.equal(typeof queuedId, "number");
        assert.equal(mockSends, 0, "Guarded queueing must not send");
        await deliverQueuedEmail(queuedId!);
        const [queued] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, queuedId!));
        assert.equal(queued.status, "pending");
        assert.equal(queued.lastError, "must_have_payment_ordering_unknown");
        assert.equal(mockSends, 0, "Dispatcher must retain the must-have ordering hold");
        assert.equal(await queueChange(), null);
        const queuedCopies = await db.execute(sql`SELECT count(*)::int AS count FROM email_outbox
          WHERE metadata->>'commerceKey'=${(queued.metadata as any).commerceKey}`);
        assert.equal(queuedCopies.rows[0].count, 1);
        const args = { to: travelerEmail, subject: queued.subject,
          html: queued.html, emailType: "cart_item_changed", metadata: queued.metadata as Record<string, unknown> };
        assert.equal(await enqueueEmail(args), null);
        assert.equal(mockSends, 0);
        assert.equal(await enqueueEmail({ ...args, metadata: { cartItemId: variant.id } }), null);
        assert.equal(mockSends, 0);
        assert.deepEqual(stamp(await fetch(variant.id)), stamp(variant));
        assert.deepEqual(snapshot(await fetch(variant.id)), snapshot(variant));
        await db.update(providerServices).set({ price: "18.00" }).where(eq(providerServices.id, serviceId));
      } finally {
        _outboxTestHooks.sendEmailFn = previousSender;
        cartReminderVerification.now = previousNow;
        cartReminderVerification.recordedRailsOnly = previousSubset;
      }
      assert.equal(await countFixtureEmails(), 2,
        "Only the explicit setup row and guarded producer row may exist");
      assert.deepEqual(snapshot(notified), snapshot(variant));
      // Excluded payment cleanup stays byte-for-byte neutral to surviving partner state.
      const paidPartner = await storage.addToCart(userId, { contentType: "affiliate_product",
        contentId: randomUUID() });
      await storage.clearCheckedOutCartLines(userId);
      assert.equal(await fetch(variant.id), undefined);
      assert.deepEqual(await fetch(paidPartner.id), paidPartner);
      await storage.clearCart(userId);
      // Alternating exact-before/after writes reduces drift. Same schema, source subject and connection warmup.
      const timings: number[][] = [[], []];
      const successes = [0, 0], samples = 60;
      for (let i = 0; i < samples + 10; i++) {
        for (const mode of i % 2 ? [1, 0] : [0, 1]) {
          const writer = mode ? storage : baseline.storage;
          const start = performance.now();
          await writer.addToCart(userId, { serviceId, experienceSlug: `bench-${loop}-${mode}-${i}` });
          const elapsed = performance.now() - start;
          if (i >= 10) { timings[mode].push(elapsed); successes[mode]++; }
        }
      }
      const summary = timings.map((times, i) => {
        const sorted = [...times].sort((a, b) => a - b);
        return { successes: successes[i], samples, successRate: successes[i] / samples,
          p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)] };
      });
      assert.equal(await countFixtureEmails(), 2,
        "Cart cleanup and repeated baseline/current add-to-cart writes must not enqueue email");
      results.push({ loop, checks: "direct-writer atomicity, snapshots, injection, malformed JSON, concurrency, resume, notification state",
        before: summary[0], after: summary[1] });
      console.log("PART2_LOOP_RESULT=" + JSON.stringify(results.at(-1)));
    }
    assert.equal(results.length, 2);
  } finally {
    await pool.end();
    await baseline.pool?.end?.();
    rmSync(temp, { recursive: true, force: true });
  }
});
