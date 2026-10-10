import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, cartItems, vendorAvailabilitySlots } from "../../../shared/schema";
import { addedCartState } from "../../services/cart-email-state.service";
import {
  assessCartReminder, cartReminderVerification, READABLE_COMMERCE_RAILS,
  PAYMENT_COVERAGE_DEFECTS, readTravelerCommerceActivity,
} from "../../services/cart-reminder.service";
import { assessCartItemChanges } from "../../services/cart-item-change.service";
import { verifyCommerceSend, commerceSendVerification } from "../../services/commerce-send-verification.service";
import { deliverQueuedEmail, drainOutboxForAdminRetry } from "../../services/email-outbox.service";
import { runCommerceEmailSweep, commerceSweepDependencies } from "../../services/commerce-email-sweep.service";
import internalRoutes from "../internal.routes";
import { CONTROL_FILE, anchor, preferences, createScenarioRig, type ScenarioFixture } from "./helpers/commerce-scenario-fixtures";

type Observation = Record<string, unknown>;
type Outcome = { id: string; label: string; scenario: string; scope: string;
  status: "PASS" | "FAIL" | "BLOCKED"; observation?: Observation; error?: string };
type MatrixCase = { id: string; label: string; scope: string; action: () => Promise<Observation> };

test("Part 8: explicit randomized scenario matrix; provider-free isolated database",
  { skip: !process.env.MESSAGING_VERIFICATION_SCHEMA
    ? "Requires the isolated native runner; shared-database execution is prohibited" : false }, async () => {
    const control = existsSync(CONTROL_FILE)
      ? JSON.parse(readFileSync(CONTROL_FILE, "utf8"))
      : { loop: 1, scenario: randomUUID(), active: null };
    assert.ok(Number.isInteger(control.loop) && control.loop >= 1 && control.loop <= 6);
    const rig = await createScenarioRig();
    const cases: MatrixCase[] = [], outcomes: Outcome[] = [];
    const add = (id: string, label: string, action: MatrixCase["action"],
      scope = "readable-record-subset") => cases.push({ id, label, action, scope });
    const assess = (f: ScenarioFixture, requested?: { kind: string; sequenceId: string }) =>
      db.transaction(tx => assessCartReminder(tx, f.user.id, f.scope, anchor, requested));
    const changes = (f: ScenarioFixture) =>
      db.transaction(tx => assessCartItemChanges(tx, f.user.id, f.scope, anchor));
    const identity = (f: ScenarioFixture, marketing = true) => ({
      travelerId: f.user.id, scope: f.scope, sequenceId: f.sequence, recipient: f.user.email!, marketing,
    });
    const cancel = async (f: ScenarioFixture, id: number, reason: string) => {
      await deliverQueuedEmail(id);
      const row = await rig.row(id);
      assert.equal(row.status, "cancelled");
      assert.equal(row.metadata.cancelReason, reason);
      assert.equal(rig.callsFor(id), 0);
      await deliverQueuedEmail(id); await drainOutboxForAdminRetry(id);
      assert.equal((await rig.row(id)).status, "cancelled");
      assert.equal(rig.callsFor(id), 0);
      return { rowId: id, reason, calls: 0, terminal: true };
    };
    add("enqueue.eligible", "All readable eligibility conditions passing", async () => {
      const f = await rig.fixture(); assert.equal((await assess(f)).eligible, true);
      const id = await rig.queue(f); await deliverQueuedEmail(id);
      assert.equal((await rig.row(id)).status, "sent"); assert.equal(rig.callsFor(id), 1);
      return { rowId: id, syntheticCalls: 1 };
    });
    for (const [label, mutation, reason] of [
      ["unsubscribed", (f: ScenarioFixture) => db.update(users).set({
        preferences: { itineraryMarketing: { ...preferences.itineraryMarketing, enabled: false } },
      }).where(eq(users.id, f.user.id)), "marketing_unsubscribed"],
      ["suspended", (f: ScenarioFixture) => db.update(users).set({ isSuspended: true })
        .where(eq(users.id, f.user.id)), "account_suspended"],
      ["deleted", (f: ScenarioFixture) => db.update(users).set({ isDeleted: true })
        .where(eq(users.id, f.user.id)), "account_deleted"],
      ["no_email", (f: ScenarioFixture) => db.update(users).set({ email: null })
        .where(eq(users.id, f.user.id)), "no_account_recipient"],
      ["unknown_timezone", (f: ScenarioFixture) => db.update(users).set({
        preferences: { itineraryMarketing: { enabled: true } },
      }).where(eq(users.id, f.user.id)), "unknown_timezone_or_preferences"],
      ["empty", (f: ScenarioFixture) => db.delete(cartItems).where(eq(cartItems.id, f.cart.id)), null],
      ["no_stamp", (f: ScenarioFixture) => db.execute(sql`UPDATE cart_items SET
        content_meta=content_meta- '_cart_automation' WHERE id=${f.cart.id}`), null],
    ] as const) {
      add(`enqueue.reject.${label}`, `Enqueue rejects ${label}`, async () => {
        const f = await rig.fixture(); await mutation(f);
        const decision = await assess(f); assert.equal(decision.eligible, false);
        if (reason) assert.equal(decision.reason, reason);
        assert.ok(decision.reason); assert.equal(await rig.count(f.user.id), 0);
        return { reason: decision.reason, rows: 0 };
      });
    }
    for (const kind of ["cart_reminder_1h", "cart_reminder_1d", "cart_reminder_3d"] as const) {
      const threshold = { cart_reminder_1h: 3_600_000, cart_reminder_1d: 86_400_000,
        cart_reminder_3d: 259_200_000 }[kind];
      for (const offset of [-1, 0, 1]) {
        add(`idle.${kind}.${offset}`, `${kind}: idle threshold ${offset}ms`, async () => {
          const f = await rig.fixture({ idle: threshold + offset });
          for (const previous of kind === "cart_reminder_1h" ? []
            : kind === "cart_reminder_1d" ? ["cart_reminder_1h"]
              : ["cart_reminder_1h", "cart_reminder_1d"]) {
            await db.execute(sql`INSERT INTO email_outbox(email_type,to_email,subject,html,status,sent_at,metadata)
              VALUES(${previous},${f.user.email},'synthetic','synthetic','sent',${new Date(anchor.getTime() - 86_400_000)},
              ${JSON.stringify({ cartReminderVersion: 1, travelerId: f.user.id, sequenceId: f.sequence,
                cartScopeRaw: f.scope, marketing: true })}::jsonb)`);
          }
          const decision = await assess(f, { kind, sequenceId: f.sequence });
          assert.equal(decision.eligible, offset >= 0);
          return { thresholdMs: threshold, offsetMs: offset, eligible: decision.eligible, reason: decision.reason };
        });
      }
    }
    add("enqueue.step_sent", "Sent step cannot enqueue again in the same sequence", async () => {
      const f = await rig.fixture(); const id = await rig.queue(f); await deliverQueuedEmail(id);
      assert.equal((await assess(f, { kind: "cart_reminder_1h", sequenceId: f.sequence })).reason, "step_already_sent");
      return { rows: await rig.count(f.user.id), syntheticCalls: rig.callsFor(id) };
    });
    add("enqueue.fourth", "Fourth reminder is impossible", async () => {
      const f = await rig.fixture({ idle: 30 * 86_400_000 });
      const result = await assess(f, { kind: "cart_reminder_4d", sequenceId: f.sequence });
      assert.equal(result.eligible, false); assert.equal(result.reason, "no_due_step_or_unsupported_step");
      return { reason: result.reason, rows: await rig.count(f.user.id) };
    });
    add("enqueue.item_changed_today", "Sent change notice suppresses today's reminder", async () => {
      const f = await rig.fixture();
      await db.execute(sql`INSERT INTO email_outbox(email_type,to_email,subject,html,status,sent_at,metadata)
        VALUES('cart_item_changed',${f.user.email},'synthetic','synthetic','sent',${anchor},
        ${JSON.stringify({ travelerId: f.user.id })}::jsonb)`);
      assert.equal((await assess(f)).reason, "item_change_sent_today");
      return { reason: "item_change_sent_today" };
    });
    for (const sequential of [true, false]) add(`sweep.${sequential ? "sequential" : "concurrent"}`,
      sequential ? "Two sweeps in a row" : "Two sweeps at once", async () => {
        const f = await rig.fixture(); rig.narrowSweep([f.user.id]);
        const result = sequential ? [await runCommerceEmailSweep(), await runCommerceEmailSweep()]
          : await Promise.all([runCommerceEmailSweep(), runCommerceEmailSweep()]);
        assert.equal(await rig.count(f.user.id), 1);
        assert.equal(result.reduce((n, r) => n + r.enqueued, 0), 1);
        return { rows: 1, enqueued: 1, duplicates: result.reduce((n, r) => n + r.duplicates, 0) };
      });
    add("sweep.empty", "Nothing due succeeds with zero enqueues", async () => {
      const f = await rig.fixture({ idle: 1 }); rig.narrowSweep([f.user.id]);
      const result = await runCommerceEmailSweep(); assert.equal(result.enqueued, 0);
      assert.equal(result.itemChanges?.enqueued, 0);
      return { enqueued: 0, skipReasons: result.skipReasons };
    });
    for (const rail of READABLE_COMMERCE_RAILS) for (const before of [true, false]) {
      add(`payment.${rail.name}.${before ? "before_send" : "after_send"}`,
        `${rail.name}: recorded birth ${before ? "before" : "after"} synthetic send`, async () => {
          const f = await rig.fixture(); const id = await rig.queue(f);
          if (before) {
            await rig.addRail(rail, f);
            const activity = await readTravelerCommerceActivity(db, f.user.id, f.start, f.start);
            assert.ok(activity.activityRails.includes(rail.name), `Fixture did not exercise ${rail.name}`);
            return { ...await cancel(f, id, "paid"), rail: rail.name, stimulus: "recorded-birth-not-authoritative-writer" };
          }
          await deliverQueuedEmail(id); assert.equal((await rig.row(id)).status, "sent");
          await rig.addRail(rail, f); await deliverQueuedEmail(id);
          assert.equal(rig.callsFor(id), 1);
          assert.ok((await readTravelerCommerceActivity(db, f.user.id, f.start, f.start)).activityRails.includes(rail.name));
          return { rowId: id, syntheticCalls: 1, rail: rail.name, stimulus: "recorded-birth-not-authoritative-writer" };
        });
    }
    for (const [reason, mutate] of [
      ["cart_empty", (f: ScenarioFixture) => db.delete(cartItems).where(eq(cartItems.id, f.cart.id))],
      ["unsubscribed", (f: ScenarioFixture) => db.update(users).set({ preferences: {
        itineraryMarketing: { ...preferences.itineraryMarketing, enabled: false },
      } }).where(eq(users.id, f.user.id))],
      ["account_gone", (f: ScenarioFixture) => db.update(users).set({ isDeleted: true }).where(eq(users.id, f.user.id))],
      ["no_email", (f: ScenarioFixture) => db.update(users).set({ email: `${randomUUID()}@traveloure-qa.test` })
        .where(eq(users.id, f.user.id))],
      ["superseded", (f: ScenarioFixture) => db.execute(sql`UPDATE cart_items SET content_meta=
        jsonb_set(content_meta,'{_cart_automation,activity,sequence_id}',${JSON.stringify(randomUUID())}::jsonb)
        WHERE id=${f.cart.id}`)],
      ["item_changed", (f: ScenarioFixture) => rig.price(f, "10.01")],
      ["payment_correlation_ambiguous", (f: ScenarioFixture) => db.update(cartItems).set({ tripId: null })
        .where(eq(cartItems.id, f.cart.id))],
    ] as const) add(`cancel.${reason}`, `Live cancel reason ${reason}; cancelled row terminal`, async () => {
      const f = await rig.fixture(), id = await rig.queue(f); await mutate(f);
      return cancel(f, id, reason);
    });
    add("cancel.suspended", "Suspended account mid-sequence", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      await db.update(users).set({ isSuspended: true }).where(eq(users.id, f.user.id));
      return cancel(f, id, "account_gone");
    });
    add("cancel.missing_email", "Email removed after queue", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      await db.update(users).set({ email: null }).where(eq(users.id, f.user.id));
      return cancel(f, id, "no_email");
    });
    add("cancel.payment_rail_unknown", "Unreadable payment coverage cancels an already queued reminder", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      cartReminderVerification.recordedRailsOnly = false;
      return cancel(f, id, "payment_rail_unknown");
    });
    add("claim.concurrent", "Two dispatchers atomically claim one row; one synthetic handoff", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      await Promise.all([deliverQueuedEmail(id), deliverQueuedEmail(id)]);
      assert.equal((await rig.row(id)).status, "sent"); assert.equal(rig.callsFor(id), 1);
      return { syntheticCalls: 1, competingClaims: 2 };
    });
    for (const soldFirst of [true, false]) add(`sellout.${soldFirst ? "before_send" : "after_send"}`,
      `Sell-out ${soldFirst ? "before" : "after"} due reminder handoff`, async () => {
        const f = await rig.fixture({ slot: true }), id = await rig.queue(f);
        const sell = () => db.update(vendorAvailabilitySlots).set({ bookedCount: 4 })
          .where(eq(vendorAvailabilitySlots.id, f.slot!.id));
        if (soldFirst) { await sell(); return cancel(f, id, "item_changed"); }
        await deliverQueuedEmail(id); await sell(); await deliverQueuedEmail(id);
        assert.equal((await rig.row(id)).status, "sent"); assert.equal(rig.callsFor(id), 1);
        return { syntheticCalls: 1, sellOutAfterHandoff: true };
      });
    add("sellout.final_read_handoff", "Hostile sell-out between final read and provider handoff", async () => {
      const f = await rig.fixture({ slot: true, quantity: 1 + Math.floor(Math.random() * 3) });
      const id = await rig.queue(f);
      commerceSendVerification.afterFinalRead = async () => {
        await db.update(vendorAvailabilitySlots).set({ bookedCount: 4 })
          .where(eq(vendorAvailabilitySlots.id, f.slot!.id));
      };
      await deliverQueuedEmail(id);
      const actual = await rig.row(id);
      assert.equal(rig.callsFor(id), 0,
        `Availability changed before handoff: status=${actual.status}, syntheticCalls=${rig.callsFor(id)}; payment-only residual approval does not cover inventory`);
      return { rowId: id, status: actual.status, syntheticCalls: rig.callsFor(id) };
    });
    for (const [price, expected] of [["9.99", "price_down"], ["10.00", null], ["10.01", "price_up"]] as const) {
      add(`price.${price}`, `Integer-cent price boundary ${price}`, async () => {
        const f = await rig.fixture(); await rig.price(f, price);
        const assessment = await changes(f);
        assert.equal(assessment.changes.length, expected ? 1 : 0);
        if (expected) assert.deepEqual(assessment.changes[0].reasons, [expected]);
        return { priceDeltaCents: price === "9.99" ? -1 : price === "10.01" ? 1 : 0,
          changes: assessment.changes.length, reasons: expected ? [expected] : [] };
      });
    }
    add("change.no_snapshot", "Legacy cart without snapshot is skipped, not guessed", async () => {
      const f = await rig.fixture();
      await db.execute(sql`UPDATE cart_items SET content_meta=
        jsonb_set(content_meta,'{_cart_automation}',(content_meta->'_cart_automation')-'snapshot')
        WHERE id=${f.cart.id}`);
      await rig.price(f, "12.00");
      const decision = await changes(f); assert.equal(decision.changes.length, 0);
      assert.ok(decision.skipped.no_snapshot);
      return { reason: "no_snapshot", rows: await rig.count(f.user.id) };
    });
    add("change.notified_once", "Same catalog change queues and marks once", async () => {
      const f = await rig.fixture(); await rig.price(f, "12.00"); await rig.queue(f, true);
      const result = await changes(f); assert.equal(result.changes.length, 0);
      assert.ok(result.skipped.already_notified); assert.equal(await rig.count(f.user.id), 1);
      return { rows: 1, reason: "already_notified" };
    });
    add("change.unsubscribed_eligibility", "Change notice exempt from consent and quiet hours", async () => {
      const f = await rig.fixture(); await rig.price(f, "12.00"); const id = await rig.queue(f, true);
      await db.update(users).set({ preferences: { itineraryMarketing: { enabled: false } } })
        .where(eq(users.id, f.user.id));
      // Outside the window, but after (not before) the cart's activity instant.
      cartReminderVerification.now = new Date("2030-05-06T01:00:00Z");
      assert.equal((await verifyCommerceSend(db, identity(f, false), (await rig.row(id)).metadata.cartSendFacts)).eligible, true);
      await deliverQueuedEmail(id);
      assert.equal((await rig.row(id)).last_error, "must_have_payment_ordering_unknown");
      assert.equal(rig.callsFor(id), 0);
      return { consentExemptionVerified: true, deliveryHeld: true, syntheticCalls: 0 };
    });
    add("change.unsubscribed_sent", "Unsubscribed traveler actually receives change notice", async () => {
      const f = await rig.fixture(); await rig.price(f, "12.00");
      await db.update(users).set({ preferences: { itineraryMarketing: { enabled: false } } })
        .where(eq(users.id, f.user.id));
      const id = await rig.queue(f, true); await deliverQueuedEmail(id);
      assert.equal((await rig.row(id)).last_error, "must_have_payment_ordering_unknown");
      assert.equal(rig.callsFor(id), 0);
      return { blocked: "must_have_payment_ordering_unknown", actualDeliveryProof: false, rowId: id };
    }, "unresolved-delivery-guarantee");
    add("guest.claim", "Guest receives nothing; authenticated claim starts reminders", async () => {
      const f = await rig.fixture(), guest = randomUUID();
      await db.update(cartItems).set({ userId: null, guestSessionId: guest }).where(eq(cartItems.id, f.cart.id));
      commerceSweepDependencies.selectCandidates = async () =>
        (await (await import("../../services/commerce-email-sweep.service")).selectCommerceCandidates())
          .filter(row => row.scope === f.scope);
      const before = await runCommerceEmailSweep(); assert.equal(before.enqueued, 0);
      assert.ok(before.skipReasons.no_account_recipient);
      // Recorded authenticated ownership claim; no unauthenticated address capture.
      await db.update(cartItems).set({ userId: f.user.id, guestSessionId: null })
        .where(eq(cartItems.id, f.cart.id));
      const after = await runCommerceEmailSweep(); assert.equal(after.enqueued, 1);
      return { beforeClaim: 0, afterClaim: 1 };
    });
    add("resume.cap", "New sequence ignores old step history but respects daily cap", async () => {
      const f = await rig.fixture({ idle: 4 * 3_600_000 }), old = f.sequence;
      await db.execute(sql`INSERT INTO email_outbox(email_type,to_email,subject,html,status,sent_at,metadata)
        VALUES('cart_reminder_1h',${f.user.email},'synthetic','synthetic','sent',${anchor},
        ${JSON.stringify({ travelerId: f.user.id, cartReminderVersion: 1, sequenceId: old,
          cartScopeRaw: f.scope, marketing: true })}::jsonb)`);
      const sequence = randomUUID();
      await db.update(cartItems).set({ quantity: 2, contentMeta: addedCartState(f.cart.contentMeta,
        f.service.id, null, { at_ms: anchor.getTime() - 3_600_000, sequence_id: sequence }) })
        .where(eq(cartItems.id, f.cart.id));
      const decision = await assess(f); assert.equal(decision.eligible, true);
      assert.equal(decision.sequenceId, sequence); assert.notEqual(sequence, old);
      await db.execute(sql`UPDATE email_outbox SET metadata=
        metadata || '{"deliveryCalendarDay":"2030-05-05"}'::jsonb
        WHERE metadata->>'travelerId'=${f.user.id} AND metadata->>'sequenceId'=${old}`);
      rig.narrowSweep([f.user.id]);
      const sweep = await runCommerceEmailSweep(); assert.equal(sweep.enqueued, 0);
      assert.ok(sweep.skipReasons.daily_marketing_cap);
      return { newSequence: true, dailyCapRespected: true };
    });
    for (const [time, shouldSend] of [["08:59:59", false], ["09:00:00", true],
      ["19:59:59", true], ["20:00:00", false]] as const) add(`quiet.${time}`, `Quiet-window send boundary ${time}`, async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      cartReminderVerification.now = new Date(`2030-05-06T${time}Z`);
      await deliverQueuedEmail(id);
      const row = await rig.row(id); assert.equal(rig.callsFor(id), shouldSend ? 1 : 0);
      if (!shouldSend) { assert.equal(row.status, "pending"); assert.equal(row.last_error, "outside_marketing_window"); }
      return { time, status: row.status, calls: rig.callsFor(id), reason: row.last_error };
    });
    add("quiet.unknown_at_send", "Timezone disappears after queue; no send and reason recorded", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      await db.update(users).set({ preferences: { itineraryMarketing: { enabled: true } } }).where(eq(users.id, f.user.id));
      await deliverQueuedEmail(id);
      const row = await rig.row(id); assert.equal(rig.callsFor(id), 0);
      assert.match(String(row.metadata.cancelReason ?? row.last_error), /timezone/);
      return { status: row.status, reason: row.metadata.cancelReason ?? row.last_error, calls: 0 };
    });
    add("marketing.cart_priority", "Cart beats itinerary reminder for one marketing day", async () => {
      const f = await rig.fixture();
      const { deliverItineraryFollowup } = await import("../../services/itinerary-followup.service");
      const oldInbox = process.env.ITINERARY_OUTCOME_TEST_EMAIL;
      // Ephemeral, provider-free test child only; never a workspace/deployment secret.
      process.env.ITINERARY_OUTCOME_TEST_EMAIL = f.user.email!;
      try {
        const comparison = await rig.seed("itinerary_comparisons", f.user.id, new Date(f.start - 1),
          { user_id: f.user.id, status: "generated" });
        const id = Number((await db.execute(sql`INSERT INTO email_outbox
          (email_type,to_email,subject,html,status,metadata)
          VALUES('itinerary_nudge_2h',${f.user.email},'synthetic','synthetic','processing',
          ${JSON.stringify({ travelerFollowupVersion: 1, marketing: true, travelerId: f.user.id,
            itineraryId: comparison, readyAt: new Date(f.start).toISOString(), unsubscribeToken: randomUUID() })}::jsonb)
          RETURNING id`)).rows[0].id);
        const { _outboxTestHooks } = await import("../../services/email-outbox.service");
        assert.equal(await deliverItineraryFollowup(id, _outboxTestHooks.sendEmailFn!), "deferred");
        assert.match((await rig.row(id)).last_error, /cart priority/);
        rig.narrowSweep([f.user.id]); assert.equal((await runCommerceEmailSweep()).enqueued, 1);
        return { cartEnqueued: 1, itineraryDeferred: true, syntheticCalls: rig.callsFor(id) };
      } finally {
        if (oldInbox === undefined) delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
        else process.env.ITINERARY_OUTCOME_TEST_EMAIL = oldInbox;
      }
    });
    add("marketing.cap_at_send", "Another marketing delivery takes the day after queue: no second send", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      await db.execute(sql`INSERT INTO email_outbox(email_type,to_email,subject,html,status,sent_at,metadata)
        VALUES('itinerary_nudge_2h',${f.user.email},'synthetic','synthetic','sent',${anchor},
        ${JSON.stringify({ travelerId: f.user.id, marketing: true, deliveryCalendarDay: "2030-05-05" })}::jsonb)`);
      await deliverQueuedEmail(id);
      const row = await rig.row(id);
      assert.equal(rig.callsFor(id), 0); assert.equal(row.status, "pending");
      assert.equal(row.last_error, "daily_marketing_cap");
      return { reason: row.last_error, syntheticCalls: 0 };
    });
    add("fault.skipped_sweep", "Deliberately skipped cart still cancelled by dispatcher", async () => {
      const f = await rig.fixture(), id = await rig.queue(f); await rig.price(f, "13.00");
      commerceSweepDependencies.selectCandidates = async () => [];
      const sweep = await runCommerceEmailSweep(); assert.equal(sweep.enqueued, 0);
      return { ...await cancel(f, id, "item_changed"), skippedCandidates: 0 };
    });
    add("fault.candidate_query", "Candidate query exception produces FAILED heartbeat", async () => {
      const f = await rig.fixture();
      const express = (await import("express")).default;
      const app = express(); app.use(express.json()); app.use(internalRoutes);
      const oldSecret = process.env.INTERNAL_JOB_SECRET, secret = randomUUID();
      process.env.INTERNAL_JOB_SECRET = secret;
      const server = app.listen(0, "127.0.0.1");
      try {
        await new Promise<void>(resolve => server.once("listening", resolve));
        commerceSweepDependencies.selectCandidates = async () => {
          await db.execute(sql`SELECT 1 / 0 AS part8_candidate_query_fault`);
          throw new Error("unreachable");
        };
        const address = server.address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/internal/jobs/commerce-email-sweep`,
          { method: "POST", headers: { "x-internal-secret": secret } });
        assert.equal(response.status, 500);
        const hb = (await db.execute(sql`SELECT last_result,last_success_at FROM job_heartbeats
          WHERE job_name='commerce-email-sweep'`)).rows[0] as any;
        assert.equal(hb.last_result.status, "FAILED"); assert.equal(await rig.count(f.user.id), 0);
        return { heartbeat: "FAILED", httpStatus: 500, enqueued: 0 };
      } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        if (oldSecret === undefined) delete process.env.INTERNAL_JOB_SECRET;
        else process.env.INTERNAL_JOB_SECRET = oldSecret;
      }
    });
    for (const stage of ["initial", "final"] as const) add(`fault.check.${stage}`,
      `Dispatcher ${stage} check throws: terminal cancellation, zero send`, async () => {
        const f = await rig.fixture(), id = await rig.queue(f);
        const crash = async () => { throw new Error("part8_verifier_fault"); };
        if (stage === "initial") commerceSendVerification.beforeCheck = crash;
        else commerceSendVerification.beforeFinalRead = crash;
        return cancel(f, id, "check_failed");
      });
    add("payment.residual", "Approved marketing-only final-read/payment residual window measured", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      commerceSendVerification.afterFinalRead = async () => {
        await rig.addRail(READABLE_COMMERCE_RAILS[2], f);
        await new Promise(resolve => setTimeout(resolve, 10));
      };
      await deliverQueuedEmail(id); assert.equal(rig.callsFor(id), 1);
      const measured = commerceSendVerification.timings.at(-1)!;
      assert.ok(measured.postReadToInvokeMs >= 10);
      return { postReadToInvokeMs: measured.postReadToInvokeMs, syntheticCalls: 1, acceptedMarketingWindowOnly: true };
    });
    add("stripe.recorded_replays", "Three recorded Stripe-like signals never duplicate email", async () => {
      const f = await rig.fixture(), id = await rig.queue(f); await deliverQueuedEmail(id);
      for (let n = 0; n < 3; n++) { await rig.addRail(READABLE_COMMERCE_RAILS[2], f); await deliverQueuedEmail(id); }
      assert.equal(rig.callsFor(id), 1); return { replays: 3, syntheticCalls: 1, actualWebhookCalls: 0 };
    });
    add("stripe.recorded_competition", "Concurrent recorded success signals plus competing dispatchers", async () => {
      const f = await rig.fixture(), id = await rig.queue(f);
      await Promise.all([rig.addRail(READABLE_COMMERCE_RAILS[2], f), rig.addRail(READABLE_COMMERCE_RAILS[2], f)]);
      await Promise.all([deliverQueuedEmail(id), deliverQueuedEmail(id)]);
      return { ...await cancel(f, id, "paid"), actualWebhookCalls: 0, actualSuccessPageCalls: 0 };
    });
    for (const defect of PAYMENT_COVERAGE_DEFECTS) add(`unknown.${defect}`, `All-rail coverage gap: ${defect}`, async () => {
      const f = await rig.fixture(); cartReminderVerification.recordedRailsOnly = false;
      const activity = await readTravelerCommerceActivity(db, f.user.id, f.start, f.start);
      assert.equal(activity.allowed, false); assert.ok(activity.unknownRails.includes(defect));
      assert.equal((await assess(f)).eligible, false); assert.equal(await rig.count(f.user.id), 0);
      return { blocked: defect, failClosed: true, allRailProof: false };
    }, "unresolved-payment-coverage");
    for (const handler of ["replay_3x", "webhook_success_together"]) add(`stripe.actual.${handler}`,
      `Actual payment handlers: ${handler}`, async () => {
        const f = await rig.fixture();
        // Do not equate the retained fake signals with authentic handler execution.
        // Probe the real entry handler without injecting a replacement payment writer.
        const routes = await import("../bookings");
        const factory = Object.entries(routes).find(([name]) => /create.*WebhookHandler/.test(name))?.[1];
        assert.equal(typeof factory, "function", "Expected retained injectable webhook entry");
        let status = 0;
        const response: any = { status(code: number) { status = code; return this; }, json() { return this; } };
        await (factory as any)()({ headers: { "stripe-signature": "synthetic-invalid-signature" },
          rawBody: Buffer.from("{}") }, response);
        assert.ok([400, 503].includes(status), "Provider-free entry must fail closed");
        assert.equal(await rig.count(f.user.id), 0);
        return { blocked: "authentic-handler-writer-proof-not-established", entryStatus: status,
          authenticatedEventsProcessed: 0, actualSuccessPageCalls: 0,
          detail: "Entry probe only; no signing credentials or replacement payment writer injected" };
      }, "unresolved-authoritative-handler-coverage");
    try {
      for (const item of cases) {
        if (control.active && !control.active.includes(item.id)) continue;
        rig.reset();
        const result: Outcome = { id: item.id, label: item.label, scope: item.scope,
          scenario: randomUUID(), status: "PASS" };
        try {
          result.observation = await item.action();
          if (result.observation.blocked) result.status = "BLOCKED";
        } catch (error) {
          result.status = "FAIL";
          // Persist no raw SQL values, recipients, payloads or stack traces.
          result.error = error instanceof assert.AssertionError
            ? `assertion:${String(error.message).split("\n")[0]}`
            : `exception:${(error as any)?.cause?.code ?? (error as any)?.code ?? (error as any)?.name ?? "unknown"}` +
              ((error as any)?.cause?.column ? `:column:${(error as any).cause.column}` : "");
        }
        outcomes.push(result);
      }
      console.log(`COMMERCE_PART8_MATRIX=${JSON.stringify({
        loop: control.loop, scenario: control.scenario, outcomes, realEmails: 0,
        actualExternalPaymentCalls: 0, releaseBlocked: true,
      })}`);
      assert.ok(outcomes.length);
      assert.equal(outcomes.filter(row => row.status === "FAIL").length, 0,
        "Matrix assertions failed; see sanitized per-row evidence");
    } finally { rig.restore(); await pool.end(); }
  });
