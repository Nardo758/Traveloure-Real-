import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import Stripe from "stripe";
import { getStagingConnectWebhookDiagnostic } from "../utils/staging-connect-webhook-diagnostics";
import { getStripeWebhookSecret } from "../utils/stripe-key";

const testSecret = "whsec_synthetic_connect_fixture";
const liveSecret = "whsec_synthetic_other_fixture";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const staging = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ENVIRONMENT: "staging",
  NODE_ENV: "production",
  ALLOW_TEST_ACCOUNTS: "1",
  STRIPE_CONNECT_WEBHOOK_SECRET_TEST: testSecret,
  STRIPE_CONNECT_WEBHOOK_SECRET: liveSecret,
  ...extra,
});
const diagnose = (body: unknown, env = staging(), expected = digest(testSecret)) =>
  getStagingConnectWebhookDiagnostic(body, env, expected);

describe("staging Connect webhook diagnostics", () => {
  it("reports the test variable, matching secret and exact buffer byte count", () => {
    const body = Buffer.from("private payload — never log this");
    assert.deepEqual(diagnose(body), {
      secretVariable: "STRIPE_CONNECT_WEBHOOK_SECRET_TEST",
      secretMatchesExpected: true,
      rawBodyIsBuffer: true,
      rawBodyBytes: body.byteLength,
    });
  });

  it("reports only the four allowlisted fields and never includes sensitive inputs", () => {
    const body = Buffer.from("private_payload_marker");
    const record = diagnose(body);
    assert.deepEqual(Object.keys(record!).sort(), [
      "rawBodyBytes", "rawBodyIsBuffer", "secretMatchesExpected", "secretVariable",
    ]);
    const serialized = JSON.stringify(record);
    for (const sensitive of [testSecret, liveSecret, digest(testSecret), body.toString()]) {
      assert.equal(serialized.includes(sensitive), false);
    }
  });

  it("detects a different destination's signing secret", () => {
    assert.equal(
      diagnose(Buffer.from("{}"), staging({ STRIPE_CONNECT_WEBHOOK_SECRET_TEST: liveSecret }))!
        .secretMatchesExpected,
      false,
    );
  });

  it("does not trim or repair a signing secret with surrounding whitespace", () => {
    const env = staging({ STRIPE_CONNECT_WEBHOOK_SECRET_TEST: ` ${testSecret}\n` });
    assert.equal(diagnose(Buffer.from("{}"), env)!.secretMatchesExpected, false);
    assert.equal(getStripeWebhookSecret("connect", env), ` ${testSecret}\n`);
  });

  it("handles a missing selected signing secret without falling back to the other variable", () => {
    const env = staging({ STRIPE_CONNECT_WEBHOOK_SECRET_TEST: undefined });
    assert.equal(getStripeWebhookSecret("connect", env), undefined);
    assert.equal(diagnose(Buffer.from("{}"), env)!.secretMatchesExpected, false);
  });

  for (const flag of [undefined, "0", "true", "1 "]) {
    it(`agrees with the existing resolver when ALLOW_TEST_ACCOUNTS is ${String(flag)}`, () => {
      const env = staging({ ALLOW_TEST_ACCOUNTS: flag });
      assert.equal(getStripeWebhookSecret("connect", env), liveSecret);
      const record = diagnose(Buffer.from("{}"), env, digest(liveSecret));
      assert.equal(record!.secretVariable, "STRIPE_CONNECT_WEBHOOK_SECRET");
      assert.equal(record!.secretMatchesExpected, true);
    });
  }

  it("selects the test variable in a staging development process", () => {
    const env = staging({ NODE_ENV: "development", ALLOW_TEST_ACCOUNTS: undefined });
    assert.equal(diagnose(Buffer.from("{}"), env)!.secretVariable, "STRIPE_CONNECT_WEBHOOK_SECRET_TEST");
    assert.equal(diagnose(Buffer.from("{}"), env)!.secretMatchesExpected, true);
  });

  for (const environment of [undefined, "", "PROD", "production", "development"]) {
    it(`returns no diagnostic outside staging (${String(environment)})`, () => {
      const env = staging({ ENVIRONMENT: environment });
      assert.equal(diagnose(Buffer.from("{}"), env), null);
    });
  }

  it("uses the same normalized staging boundary as the existing staging diagnostics", () => {
    assert.notEqual(diagnose(Buffer.from("{}"), staging({ ENVIRONMENT: " StAgInG " })), null);
  });

  for (const body of [undefined, null, {}, "private_payload_marker", new Uint8Array([1, 2])]) {
    it(`handles a non-Buffer body without logging its contents (${typeof body})`, () => {
      const record = diagnose(body);
      assert.equal(record!.rawBodyIsBuffer, false);
      assert.equal(record!.rawBodyBytes, null);
    });
  }

  it("handles an invalid expected digest without throwing or exposing it", () => {
    assert.equal(diagnose(Buffer.from("{}"), staging(), "invalid")!.secretMatchesExpected, false);
  });

  it("leaves the original bytes usable for offline Stripe signature verification", () => {
    const stripe = new Stripe("sk_test_synthetic_fixture");
    const payload = '{\n  "type": "account.updated", "data": {"object": {}}\n}';
    const body = Buffer.from(payload);
    const before = Buffer.from(body);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: testSecret });
    diagnose(body);
    assert.deepEqual(body, before);
    assert.equal(stripe.webhooks.constructEvent(body, header, testSecret).type, "account.updated");
  });
});
