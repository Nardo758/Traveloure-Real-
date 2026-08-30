/**
 * Unit tests for server/utils/stripe-key.ts — the central Stripe secret-key resolver.
 *
 * Covers:
 *   R1  Dev: STRIPE_SECRET_KEY_TEST present → resolver returns it, ignores live key
 *   R2  Dev: only STRIPE_SECRET_KEY present → resolver returns it
 *   R3  Dev: neither key present → resolver returns undefined
 *   R4  Prod (NODE_ENV=production): ignores STRIPE_SECRET_KEY_TEST, returns live key
 *   R5  Prod (ENVIRONMENT=PROD): same as R4
 *   R6  CI escape hatch (ALLOW_TEST_ACCOUNTS=1 with NODE_ENV=production):
 *         treated as non-prod → prefers TEST key
 *   R7  Both prod signals + escape hatch → still prefers TEST key
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getStripeSecretKey } from "../utils/stripe-key";

type Env = Partial<NodeJS.ProcessEnv>;

// Helpers that build a minimal env snapshot for a given scenario
const devEnv = (extra: Env = {}): NodeJS.ProcessEnv =>
  ({ NODE_ENV: "development", ...extra } as NodeJS.ProcessEnv);

const prodEnv = (extra: Env = {}): NodeJS.ProcessEnv =>
  ({ NODE_ENV: "production", ...extra } as NodeJS.ProcessEnv);

const prodEnvViaEnvironment = (extra: Env = {}): NodeJS.ProcessEnv =>
  ({ ENVIRONMENT: "PROD", ...extra } as NodeJS.ProcessEnv);

describe("getStripeSecretKey — key-selection rules", () => {
  // ── Dev / CI preference ───────────────────────────────────────────────────

  it("R1: dev with both keys → returns STRIPE_SECRET_KEY_TEST", () => {
    const env = devEnv({
      STRIPE_SECRET_KEY_TEST: "sk_test_abc",
      STRIPE_SECRET_KEY: "sk_live_xyz",
    });
    assert.equal(getStripeSecretKey(env), "sk_test_abc");
  });

  it("R2: dev with only live key → returns STRIPE_SECRET_KEY", () => {
    const env = devEnv({ STRIPE_SECRET_KEY: "sk_live_xyz" });
    assert.equal(getStripeSecretKey(env), "sk_live_xyz");
  });

  it("R3: dev with neither key → returns undefined", () => {
    assert.equal(getStripeSecretKey(devEnv()), undefined);
  });

  // ── Production strict (NODE_ENV=production) ───────────────────────────────

  it("R4: prod (NODE_ENV) with both keys → returns STRIPE_SECRET_KEY only", () => {
    const env = prodEnv({
      STRIPE_SECRET_KEY_TEST: "sk_test_abc",
      STRIPE_SECRET_KEY: "sk_live_xyz",
    });
    assert.equal(getStripeSecretKey(env), "sk_live_xyz");
  });

  it("R4b: prod (NODE_ENV) with only TEST key → returns undefined (no live key)", () => {
    const env = prodEnv({ STRIPE_SECRET_KEY_TEST: "sk_test_abc" });
    assert.equal(getStripeSecretKey(env), undefined);
  });

  // ── Production strict (ENVIRONMENT=PROD) ─────────────────────────────────

  it("R5: prod (ENVIRONMENT=PROD) with both keys → returns STRIPE_SECRET_KEY only", () => {
    const env = prodEnvViaEnvironment({
      STRIPE_SECRET_KEY_TEST: "sk_test_abc",
      STRIPE_SECRET_KEY: "sk_live_xyz",
    });
    assert.equal(getStripeSecretKey(env), "sk_live_xyz");
  });

  // ── CI escape hatch ───────────────────────────────────────────────────────

  it("R6: NODE_ENV=production + ALLOW_TEST_ACCOUNTS=1 → treats as non-prod, prefers TEST key", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      ALLOW_TEST_ACCOUNTS: "1",
      STRIPE_SECRET_KEY_TEST: "sk_test_ci",
      STRIPE_SECRET_KEY: "sk_live_xyz",
    } as NodeJS.ProcessEnv;
    assert.equal(getStripeSecretKey(env), "sk_test_ci");
  });

  it("R7: ENVIRONMENT=PROD + ALLOW_TEST_ACCOUNTS=1 → treats as non-prod, prefers TEST key", () => {
    const env: NodeJS.ProcessEnv = {
      ENVIRONMENT: "PROD",
      ALLOW_TEST_ACCOUNTS: "1",
      STRIPE_SECRET_KEY_TEST: "sk_test_ci",
      STRIPE_SECRET_KEY: "sk_live_xyz",
    } as NodeJS.ProcessEnv;
    assert.equal(getStripeSecretKey(env), "sk_test_ci");
  });

  it("no-arg call uses process.env (smoke — no throw)", () => {
    assert.doesNotThrow(() => getStripeSecretKey());
  });
});
