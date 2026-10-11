import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "../../db";
import { emailOutbox } from "../../../shared/schema";
import { drainOutbox, deliverQueuedEmail, enqueueEmail, _outboxTestHooks,
  loadUncertainEmailSummary } from "../../services/email-outbox.service";
import { buildUncertainEmailDigestSection } from "../../services/email.service";

test("development claims, immediate/fallback and status-independent reports: two fresh loops", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal(process.env.RESEND_API_KEY, undefined);
  const saved = [process.env.NODE_ENV, process.env.SIGNUP_QA_TEST_INBOX, process.env.ITINERARY_OUTCOME_TEST_EMAIL];
  let providerCalls = 0;
  _outboxTestHooks.sendEmailFn = async () => { providerCalls++; return { ok: true, id: randomUUID() }; };
  const queue = async (to: string, family = "generic", status = "pending", metadata = {}) =>
    (await db.insert(emailOutbox).values({ toEmail: to, emailType: family, status, subject: "owned proof",
      html: "", metadata }).returning())[0];
  try {
    process.env.NODE_ENV = "development";
    for (let loop=1; loop<=2; loop++) {
      await db.execute(sql`DELETE FROM email_outbox`);
      providerCalls = 0;
      const a = `${randomUUID()}@qa.test`, b = `${randomUUID()}@qa.test`;
      process.env.SIGNUP_QA_TEST_INBOX = a; process.env.ITINERARY_OUTCOME_TEST_EMAIL = b;
      for (const family of ["generic","booking_confirmation","booking_alert","signup_welcome",
        "itinerary_ready","itinerary_failed","cart_reminder_1h","cart_reminder_1d","cart_reminder_3d","cart_item_changed"])
        await queue("outsider@example.invalid", family);
      const blocked = await drainOutbox();
      assert.equal(blocked.drained, 0); assert.equal(blocked.blockedRecipients, 10);
      assert.equal(providerCalls, 0);
      const denied = await queue("outsider@example.invalid");
      await deliverQueuedEmail(denied.id);
      assert.equal((await db.select().from(emailOutbox).where(eq(emailOutbox.id, denied.id)))[0].status, "pending");
      const immediate = await enqueueEmail({ to: "outsider@example.invalid", subject: "owned", html: "" });
      assert.ok(immediate);
      assert.equal((await db.select().from(emailOutbox).where(eq(emailOutbox.id, immediate!)))[0].lastError,
        "development_recipient_not_allowed");
      assert.equal(providerCalls, 0);
      const originalInsert = db.insert;
      (db as any).insert = () => { throw new Error("fixture_insert_fault"); };
      try {
        assert.equal(await enqueueEmail({ to: "outsider@example.invalid", subject: "fallback proof", html: "" }), null);
      } finally { (db as any).insert = originalInsert; }
      assert.equal(providerCalls, 0, "Insert failure cannot bypass the development recipient guard");
      const mixed = await queue(`${a}, outsider@example.invalid`);
      await deliverQueuedEmail(mixed.id); assert.equal(providerCalls, 0);
      const allowed = await queue(a);
      await deliverQueuedEmail(allowed.id); assert.equal(providerCalls, 1);
      const both = await queue(`${a}, ${b}`);
      await drainOutbox(); assert.equal(providerCalls, 2);
      assert.equal((await db.select().from(emailOutbox).where(eq(emailOutbox.id, both.id)))[0].status, "sent");
      delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
      const missing = await queue(a); await deliverQueuedEmail(missing.id);
      assert.equal(providerCalls, 2);
      process.env.ITINERARY_OUTCOME_TEST_EMAIL = b;
      // Claim returns an old payload while the actual row changed underneath it.
      const late = await queue(a);
      const execute = db.execute.bind(db);
      let changed = false;
      (db as any).execute = async (statement: unknown) => {
        const result = await execute(statement as any);
        if (!changed && result.rows?.some((row: any) => row.to_email === a && row.email_type === "generic")) {
          changed = true; await db.update(emailOutbox).set({ toEmail: "outsider@example.invalid" })
            .where(eq(emailOutbox.id, late.id));
        }
        return result;
      };
      try { await deliverQueuedEmail(late.id); } finally { (db as any).execute = execute; }
      assert.equal(changed, true); assert.equal(providerCalls, 2);
      await db.execute(sql`DELETE FROM email_outbox`);
      const marker = (id: number, phase: string) => ({ commerceDeliveryAttempt: {
        version: 1, ownerToken: randomUUID(), payloadDigest: "a".repeat(64), key: `cart-reminder-${id}`, phase,
      } });
      for (const status of ["dead","processing","failed"]) {
        const row = await queue(a, "cart_reminder_1h", status);
        await db.update(emailOutbox).set({ metadata: marker(row.id, "intent") }).where(eq(emailOutbox.id, row.id));
      }
      await queue(a, "cart_item_changed", "pending", { commerceDeliveryAttempt: null });
      const malformed = await queue(a, "cart_item_changed", "pending",
        { commerceDeliveryAttempt: { version: 1, phase: "not_invoked" } });
      await deliverQueuedEmail(malformed.id);
      assert.equal((await db.select().from(emailOutbox).where(eq(emailOutbox.id, malformed.id)))[0].status, "pending");
      const sent = await queue(a, "cart_reminder_1h", "sent");
      await db.update(emailOutbox).set({ metadata: marker(sent.id, "accepted"), resendId: randomUUID() })
        .where(eq(emailOutbox.id, sent.id));
      const notInvoked = await queue(a, "cart_reminder_1h");
      await db.update(emailOutbox).set({ metadata: marker(notInvoked.id, "not_invoked") })
        .where(eq(emailOutbox.id, notInvoked.id));
      const held = await loadUncertainEmailSummary();
      assert.equal(held.total, 5);
      assert.equal(held.rows.length, 5);
      assert.ok(held.rows.some(row => row.status === "processing"));
      assert.ok(!JSON.stringify(held).includes(a));
      assert.ok(!buildUncertainEmailDigestSection(held).includes("/retry"));
      const originalExecute = db.execute;
      (db as any).execute = async () => { throw new Error("report_fixture_fault"); };
      try { await assert.rejects(loadUncertainEmailSummary(), /report_fixture_fault/); }
      finally { (db as any).execute = originalExecute; }
      writeFileSync(`reports/automation-part10-evidence/dev-clock-safety-${loop}.json`,
        JSON.stringify({ loop, scenarioId: randomUUID(), blockedFamilies: 10, held,
          singleClaimHeld: true, immediateHeld: true, insertFailureFallbackHeld: true,
          mixedRecipientsHeld: true, approvedMockSends: 2, missingSettingHeld: true,
          recipientChangedAfterClaimHeld: true,
          reportQueryFailureVisible: true, malformedClaimBlocked: true, realProviderCalls: 0, status: "CLEAN" }, null, 2));
    }
  } finally {
    delete _outboxTestHooks.sendEmailFn;
    ["NODE_ENV","SIGNUP_QA_TEST_INBOX","ITINERARY_OUTCOME_TEST_EMAIL"].forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
    });
    await pool.end();
  }
});
