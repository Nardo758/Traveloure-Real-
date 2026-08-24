import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMoneySecretPresence } from "../services/runtime-health.service";

/**
 * H2 ("Money-secret presence") pure-logic coverage — see
 * server/services/runtime-health.service.ts. evaluateMoneySecretPresence() takes an env
 * snapshot (never mutates/reads live process.env directly) so it's fully unit-testable and
 * never prints a secret VALUE, only booleans.
 *
 * Run with: npx tsx --test server/__tests__/runtime-health-secrets.test.ts
 */

test("evaluateMoneySecretPresence: all absent → no gap flagged (nothing to verify with no Stripe key), all present=false", () => {
  const report = evaluateMoneySecretPresence({});
  assert.equal(report.hasUnverifiableWebhookGap, false);
  assert.equal(report.present.STRIPE_SECRET_KEY, false);
  assert.equal(report.present.STRIPE_WEBHOOK_SECRET, false);
  assert.equal(report.missingWebhookSecrets.length, 3);
});

test("evaluateMoneySecretPresence: STRIPE_SECRET_KEY set + all webhook secrets set → no gap", () => {
  const report = evaluateMoneySecretPresence({
    STRIPE_SECRET_KEY: "[REDACTED_STRIPE_TEST_KEY]",
    STRIPE_WEBHOOK_SECRET: "whsec_a",
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_b",
    STRIPE_IDENTITY_WEBHOOK_SECRET: "whsec_c",
  });
  assert.equal(report.hasUnverifiableWebhookGap, false);
  assert.equal(report.missingWebhookSecrets.length, 0);
});

test("evaluateMoneySecretPresence: STRIPE_SECRET_KEY set but ONE webhook secret missing → FAILS (the F-2 lesson)", () => {
  const report = evaluateMoneySecretPresence({
    STRIPE_SECRET_KEY: "[REDACTED_STRIPE_TEST_KEY]",
    STRIPE_WEBHOOK_SECRET: "whsec_a",
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_b",
    // STRIPE_IDENTITY_WEBHOOK_SECRET intentionally absent
  });
  assert.equal(report.hasUnverifiableWebhookGap, true);
  assert.deepEqual(report.missingWebhookSecrets, ["STRIPE_IDENTITY_WEBHOOK_SECRET"]);
});

test("evaluateMoneySecretPresence: STRIPE_SECRET_KEY set but ALL webhook secrets missing → FAILS", () => {
  const report = evaluateMoneySecretPresence({ STRIPE_SECRET_KEY: "sk_live_x" });
  assert.equal(report.hasUnverifiableWebhookGap, true);
  assert.equal(report.missingWebhookSecrets.length, 3);
});

test("evaluateMoneySecretPresence: STRIPE_SECRET_KEY absent, webhook secrets absent too → NOT flagged as a gap (nothing to verify without a Stripe key)", () => {
  const report = evaluateMoneySecretPresence({
    STRIPE_WEBHOOK_SECRET: undefined,
    STRIPE_CONNECT_WEBHOOK_SECRET: undefined,
  });
  assert.equal(report.hasUnverifiableWebhookGap, false);
});

test("evaluateMoneySecretPresence: informational vars are reported present/absent but never affect the gap flag", () => {
  const withInfo = evaluateMoneySecretPresence({
    STRIPE_SECRET_KEY: "[REDACTED_STRIPE_TEST_KEY]",
    STRIPE_WEBHOOK_SECRET: "a",
    STRIPE_CONNECT_WEBHOOK_SECRET: "b",
    STRIPE_IDENTITY_WEBHOOK_SECRET: "c",
    TAVILY_API_KEY: "tvly_x",
  });
  assert.equal(withInfo.present.TAVILY_API_KEY, true);
  assert.equal(withInfo.present.GOOGLE_MAPS_API_KEY, false);
  assert.equal(withInfo.hasUnverifiableWebhookGap, false);

  const withoutInfo = evaluateMoneySecretPresence({
    STRIPE_SECRET_KEY: "[REDACTED_STRIPE_TEST_KEY]",
    STRIPE_WEBHOOK_SECRET: "a",
    STRIPE_CONNECT_WEBHOOK_SECRET: "b",
    STRIPE_IDENTITY_WEBHOOK_SECRET: "c",
  });
  // Missing informational vars never flip hasUnverifiableWebhookGap.
  assert.equal(withoutInfo.hasUnverifiableWebhookGap, false);
});

test("evaluateMoneySecretPresence: never includes a secret VALUE, only booleans", () => {
  const report = evaluateMoneySecretPresence({ STRIPE_SECRET_KEY: "sk_live_super_secret_value_12345" });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /super_secret_value_12345/);
  for (const v of Object.values(report.present)) {
    assert.equal(typeof v, "boolean");
  }
});
