/**
 * Row 274 — the timer wrapper of `payments.stripe-connect-reminder`.
 * No database, no payout, no Stripe call, no notification. The reminder body stays stubbed.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isScheduledAutomationSkip } from "../../scheduler-wrapper";
import { paymentAutomationRegistry } from "..";
import { runPaymentSchedule } from "../runtime";
import { STRIPE_CONNECT_REMINDER_COOLDOWN_MS } from "../../../services/stripe-connect-reminder-policy";
import { stripeConnectReminderScheduler } from "../../../services/stripe-connect-reminder.service";

const SERVICE_PATH = path.resolve(import.meta.dirname, "../../../services/stripe-connect-reminder.service.ts");

test("R1 — the registry holds the Stripe Connect reminder on its schedule id", () => {
  const node = paymentAutomationRegistry.byId.get("payments.stripe-connect-reminder");
  assert.ok(node, "registry holds payments.stripe-connect-reminder");
  assert.equal(node.trigger.kind, "cron");
  assert.equal(node.trigger.kind === "cron" ? node.trigger.scheduleId : "", "stripe-connect-reminder");
});

test("R2 — the node runs from its own schedule and skips any other trigger", async () => {
  let calls = 0;
  const action = async () => {
    calls += 1;
    return "reminded";
  };

  const ran = await runPaymentSchedule(
    "payments.stripe-connect-reminder",
    "stripe-connect-reminder",
    action,
    { useBackgroundJobRunner: false },
  );
  assert.equal(isScheduledAutomationSkip(ran), false);
  assert.equal(ran, "reminded");
  assert.equal(calls, 1);

  const skipped = await runPaymentSchedule(
    "payments.stripe-connect-reminder",
    "stripe-connect-reminder",
    action,
    { useBackgroundJobRunner: false, context: { triggeredBy: "not-the-reminder" } },
  );
  assert.equal(isScheduledAutomationSkip(skipped), true);
  assert.equal((skipped as { reason?: string }).reason, "condition");
  assert.equal(calls, 1, "the wrong trigger did not call the action");
});

test("R3 — runRemindersGuarded reaches the reminder through the node", async () => {
  const scheduler = stripeConnectReminderScheduler as unknown as {
    runReminders: () => Promise<void>;
    runRemindersGuarded: () => Promise<void>;
  };
  const original = scheduler.runReminders;
  let calls = 0;
  scheduler.runReminders = async () => {
    calls += 1;
  };
  try {
    await scheduler.runRemindersGuarded();
    assert.equal(calls, 1);
  } finally {
    scheduler.runReminders = original;
  }
});

test("R4 — the interval is the 72-hour cooldown", () => {
  assert.equal(STRIPE_CONNECT_REMINDER_COOLDOWN_MS, 72 * 60 * 60 * 1000);
  const source = fs.readFileSync(SERVICE_PATH, "utf8");
  assert.match(source, /const CHECK_INTERVAL_MS = STRIPE_CONNECT_REMINDER_COOLDOWN_MS/);
});
