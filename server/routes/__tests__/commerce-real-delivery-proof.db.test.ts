import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, vendorAvailabilitySlots } from "../../../shared/schema";
import { createScenarioRig, anchor, preferences } from "./helpers/commerce-scenario-fixtures";
import { enqueuePendingCommerceReminder, deliverQueuedEmail, _outboxTestHooks } from "../../services/email-outbox.service";
import { lockMarketingTraveler } from "../../services/marketing-delivery-policy.service";

test("Part 9: owned QA reminders and separate held-item template transport", {
  skip: process.env.COMMERCE_QA_DELIVERY_PROOF !== "1" ? "Explicit private QA owner required" : false,
}, async () => {
  const binding = JSON.parse(process.env.COMMERCE_QA_PROOF_RUN_ID!);
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(binding.schema, process.env.MESSAGING_VERIFICATION_SCHEMA);
  assert.match(binding.schema, /^automation_msg_[a-f0-9]{16}$/);
  assert.equal(typeof binding.itemCopyOnly, "boolean");
  assert.equal(process.env.RESEND_API_KEY, undefined);
  assert.equal(process.env.SIGNUP_QA_TEST_INBOX, undefined);
  assert.equal(process.env.ITINERARY_OUTCOME_TEST_EMAIL, undefined);
  const rig = await createScenarioRig(), previousSender = _outboxTestHooks.sendEmailFn;
  const post = async (body: unknown, authorized = true) => {
    const response = await fetch(`http://127.0.0.1:${binding.port}/proof`, {
      method: "POST", headers: { "content-type": "application/json",
        authorization: authorized ? `Bearer ${binding.token}` : "Bearer rejected" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, body: await response.json() as any };
  };
  let handoffs = 0;
  const records: object[] = [];
  try {
    const reminderFamilies = binding.itemCopyOnly ? []
      : ["cart_reminder_1h", "cart_reminder_1d", "cart_reminder_3d"] as const;
    for (const family of reminderFamilies) {
      rig.reset();
      const idle = { cart_reminder_1h: 3_660_000, cart_reminder_1d: 86_460_000, cart_reminder_3d: 259_260_000 }[family];
      const f = await rig.fixture({ idle });
      await db.update(users).set({ preferences: { ...preferences, commerceQaProofRun: binding.runId } })
        .where(eq(users.id, f.user.id));
      for (const previous of family === "cart_reminder_1h" ? []
        : family === "cart_reminder_1d" ? ["cart_reminder_1h"] : ["cart_reminder_1h", "cart_reminder_1d"]) {
        await db.execute(sql`INSERT INTO email_outbox(email_type,to_email,subject,html,status,sent_at,metadata)
          VALUES(${previous},${f.user.email},'synthetic','synthetic','sent',${new Date(anchor.getTime()-86_400_000)},
          ${JSON.stringify({ cartReminderVersion:1,travelerId:f.user.id,sequenceId:f.sequence,
            cartScopeRaw:f.scope,marketing:true })}::jsonb)`);
      }
      const key = `${family}:${f.cart.id}:${f.sequence}`;
      assert.equal(await db.transaction(async tx => {
        await lockMarketingTraveler(tx, f.user.id);
        return enqueuePendingCommerceReminder(f.user.email!, key, f.sequence, f.scope, {
          kind: family, travelerId: f.user.id, scope: f.scope, sequenceStartMs: f.start,
        }, tx);
      }), true);
      const id = Number((await db.execute(sql`SELECT id FROM email_outbox WHERE metadata->>'commerceKey'=${key}`)).rows[0].id);
      const request = { runId: binding.runId, accountId:f.user.id, outboxId:id, family, mode:"guarded-reminder" };
      // Before each permitted handoff, reject unrelated accounts and arbitrary destinations.
      assert.equal((await post({ ...request, accountId: randomUUID() })).status, 403);
      assert.equal((await post({ ...request, to: "forbidden@example.invalid" })).status, 403);
      assert.equal((await post({ ...request, runId: randomUUID() })).status, 403);
      assert.equal((await post(request, false)).status, 403);
      _outboxTestHooks.sendEmailFn = async () => {
        handoffs++;
        const result = await post(request);
        assert.equal(result.status, 200, "Approved parent QA transport rejected");
        return result.body;
      };
      // Respect the provider's request budget BEFORE the final eligibility check.
      await new Promise(resolve => setTimeout(resolve, 650));
      await deliverQueuedEmail(id);
      assert.equal((await rig.row(id)).status, "sent");
      assert.equal((await post(request)).status, 403); // no second provider call
      records.push({ family, outboxRowId:id, proofLevel:"guarded-readable-subset", status:"sent" });
    }
    rig.reset();
    const availabilityLoss = binding.itemCopyOnly && binding.loop === 2;
    const f = await rig.fixture({ slot: !binding.itemCopyOnly || availabilityLoss });
    await db.update(users).set({ preferences: { ...preferences, commerceQaProofRun: binding.runId } })
      .where(eq(users.id, f.user.id));
    if (availabilityLoss) {
      assert.ok(f.slot);
      await db.update(vendorAvailabilitySlots).set({ bookedCount: f.slot.capacity })
        .where(eq(vendorAvailabilitySlots.id, f.slot.id));
    } else {
      await rig.price(f, "12.00");
    }
    const id = await rig.queue(f, true), before = handoffs;
    _outboxTestHooks.sendEmailFn = async () => { throw new Error("Held item must not reach provider"); };
    await deliverQueuedEmail(id);
    const held = await rig.row(id);
    assert.equal(held.status, "pending");
    assert.equal(held.last_error, "must_have_payment_ordering_unknown");
    assert.equal(handoffs, before);
    const metadataBefore = JSON.stringify(held.metadata);
    await new Promise(resolve => setTimeout(resolve, 650));
    const request = { runId:binding.runId, accountId:f.user.id, outboxId:id,
      family:"cart_item_changed", mode:"template-only" };
    if (binding.itemCopyOnly) {
      for (const wrong of [{ ...request, accountId: randomUUID() },
        { ...request, to: "forbidden@example.invalid" }, { ...request, runId: randomUUID() },
        { ...request, family:"cart_reminder_1h", mode:"guarded-reminder" }]) {
        assert.equal((await post(wrong)).status, 403);
      }
      assert.equal((await post(request, false)).status, 403);
    }
    const result = await post(request);
    assert.equal(result.status, 200);
    assert.equal((await post(request)).status, 403);
    const after = await rig.row(id);
    assert.equal(after.status, "pending");
    assert.equal(after.sent_at, null);
    assert.equal(JSON.stringify(after.metadata), metadataBefore);
    records.push({ family:"cart_item_changed",outboxRowId:id,proofLevel:"template-only",
      copyScenario: binding.itemCopyOnly ? availabilityLoss ? "availability_loss" : "price_change_unknown_stock" : "price_change",
      dispatcherStatus:"pending", dispatcherHandoffs:0, hold:held.last_error });
    console.log(`COMMERCE_QA_FIXTURE_PROOF=${JSON.stringify({loop:binding.loop,records,
      noProductionChanges:true,allRailProof:false,qaDomain:"traveloure-qa.test"})}`);
  } finally { _outboxTestHooks.sendEmailFn = previousSender; rig.restore(); await pool.end(); }
});
