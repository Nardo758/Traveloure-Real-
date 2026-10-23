/**
 * Gap 9 payout-admin policy. No database.
 *
 * Run: npx tsx --test server/__tests__/gap9-payout-admin.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STRIPE_CONNECT_REMINDER_COOLDOWN_MS,
  expertNeedsStripeConnectReminder,
  providerNeedsStripeConnectReminder,
  candidateNeedsStripeConnectReminder,
  stripeConnectReminderLink,
  reminderCooldownCutoff,
} from "../services/stripe-connect-reminder-policy";
import { externalPayoutMethod, EXTERNAL_PAYOUT_METHOD, EXTERNAL_MARK_PAID_FROM } from "../config/payout.config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function source(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("the shared cooldown is 72 hours and the scheduler does not keep a second literal", () => {
  assert.equal(STRIPE_CONNECT_REMINDER_COOLDOWN_MS, 72 * 60 * 60 * 1000);
  const now = Date.UTC(2026, 9, 22, 12, 0, 0);
  assert.equal(reminderCooldownCutoff(now).getTime(), now - STRIPE_CONNECT_REMINDER_COOLDOWN_MS);

  const scheduler = source("server/services/stripe-connect-reminder.service.ts");
  assert.match(scheduler, /CHECK_INTERVAL_MS = STRIPE_CONNECT_REMINDER_COOLDOWN_MS/);
  assert.doesNotMatch(scheduler, /72\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.doesNotMatch(scheduler, /3\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  const policy = source("server/services/stripe-connect-reminder-policy.ts");
  assert.equal(policy.split("72 * 60 * 60 * 1000").length, 2);
});

test("Identity-only experts are skipped; an open Connect step is still a reminder", () => {
  assert.equal(expertNeedsStripeConnectReminder({
    stripeConnectStatus: "complete",
    identityVerificationStatus: "pending",
  }), false);
  assert.equal(expertNeedsStripeConnectReminder({
    stripeConnectStatus: "active",
    identityVerificationStatus: "pending",
  }), false);
  assert.equal(expertNeedsStripeConnectReminder({
    stripeConnectStatus: "not_started",
    identityVerificationStatus: "verified",
  }), true);
  assert.equal(expertNeedsStripeConnectReminder({
    stripeConnectStatus: null,
    identityVerificationStatus: "verified",
  }), true);

  assert.equal(candidateNeedsStripeConnectReminder({
    role: "travel_expert",
    stripeAccountId: "acct_stale",
    stripeAccountStatus: "complete",
    formStripeConnectStatus: "not_started",
    identityVerificationStatus: "verified",
  }), true);
  assert.equal(candidateNeedsStripeConnectReminder({
    role: "local_expert",
    stripeAccountStatus: "onboarding_incomplete",
    formStripeConnectStatus: "complete",
    identityVerificationStatus: "pending",
  }), false);
  assert.equal(candidateNeedsStripeConnectReminder({
    role: "service_provider",
    stripeAccountId: "acct_ok",
    stripeAccountStatus: "complete",
  }), false);
  assert.equal(providerNeedsStripeConnectReminder({
    stripeAccountId: null,
    stripeAccountStatus: "complete",
  }), true);
});

test("expert-family roles link to /expert/money", () => {
  for (const role of ["expert", "local_expert", "travel_expert", "event_planner"]) {
    assert.equal(stripeConnectReminderLink(role), "/expert/money");
  }
  assert.equal(stripeConnectReminderLink("service_provider"), "/provider/money");
});

test("external payout method is never stripe", () => {
  assert.equal(externalPayoutMethod("stripe"), EXTERNAL_PAYOUT_METHOD);
  assert.equal(externalPayoutMethod("Stripe"), EXTERNAL_PAYOUT_METHOD);
  assert.equal(externalPayoutMethod(" STRIPE "), EXTERNAL_PAYOUT_METHOD);
  assert.equal(externalPayoutMethod(""), EXTERNAL_PAYOUT_METHOD);
  assert.equal(externalPayoutMethod(null), EXTERNAL_PAYOUT_METHOD);
  assert.equal(externalPayoutMethod("bank_transfer"), "bank_transfer");
  assert.equal(externalPayoutMethod("PayPal"), "paypal");
  assert.notEqual(externalPayoutMethod("stripe"), "stripe");
  assert.deepEqual([...EXTERNAL_MARK_PAID_FROM], ["pending", "approved"]);
});

test("reminder and mark-paid modules do not send email or touch the email gate", () => {
  const files = [
    "server/services/stripe-connect-reminder.service.ts",
    "server/services/stripe-connect-reminder-policy.ts",
    "server/services/payout-admin.service.ts",
  ];
  for (const rel of files) {
    const text = source(rel);
    assert.equal(text.includes("sendEmail"), false, rel);
    assert.equal(text.includes("canQueueGenerationNotice"), false, rel);
  }
  const service = source("server/services/stripe-connect-reminder.service.ts");
  assert.match(service, /recordAdminDecisionAudit/);
  const routes = source("server/routes/admin.routes.ts");
  const start = routes.indexOf("async function postStripeConnectReminder");
  const end = routes.indexOf('router.post("/api/admin/experts/:userId/remind-stripe"');
  assert.ok(start > 0 && end > start);
  const helper = routes.slice(start, end);
  assert.equal(helper.includes("sendEmail"), false);
  assert.equal(helper.includes("canQueueGenerationNotice"), false);
  assert.match(helper, /adminRemindStripeConnect/);
  assert.match(helper, /sent\.status/);
  assert.match(service, /isRoutableExpert\(/);
  assert.match(service, /providerNeedsStripeConnectReminder\(/);

  const notRoutable = source("server/services/expert-routability.ts");
  const fnStart = notRoutable.indexOf("export async function listNotRoutableExperts");
  const fnEnd = notRoutable.indexOf("export async function isExpertIdRoutable");
  const fn = notRoutable.slice(fnStart, fnEnd);
  assert.match(fn, /routableExpertFilterSql\(\)/);
  assert.equal(fn.includes("lef.status = 'approved'"), false);
});
