import { test } from "node:test";
import assert from "node:assert/strict";
import { isProdStrictEnv, checkStripeKeyPrefix } from "../utils/stripe-key-policy";

/**
 * Runtime-health H3 ("Live-key sanity") reuses this pure module rather than re-deriving the
 * live/test-key rule — see server/utils/stripe-key-policy.ts's header and
 * server/validate-env.ts (the primary, boot-time enforcement site this was extracted from).
 * No DATABASE_URL needed — both functions are pure and side-effect-free.
 *
 * Run with: npx tsx --test server/__tests__/stripe-key-policy.test.ts
 */

// ── isProdStrictEnv ──────────────────────────────────────────────────────────

test("isProdStrictEnv: false when neither NODE_ENV nor ENVIRONMENT signal production", () => {
  assert.equal(isProdStrictEnv({}), false);
  assert.equal(isProdStrictEnv({ NODE_ENV: "development" }), false);
  assert.equal(isProdStrictEnv({ NODE_ENV: "test" }), false);
});

test("isProdStrictEnv: true when NODE_ENV=production", () => {
  assert.equal(isProdStrictEnv({ NODE_ENV: "production" }), true);
});

test("isProdStrictEnv: true when ENVIRONMENT=PROD (the belt-and-suspenders alternative signal)", () => {
  assert.equal(isProdStrictEnv({ ENVIRONMENT: "PROD" }), true);
});

test("isProdStrictEnv: ALLOW_TEST_ACCOUNTS=1 is the CI escape hatch — overrides both signals", () => {
  assert.equal(isProdStrictEnv({ NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1" }), false);
  assert.equal(isProdStrictEnv({ ENVIRONMENT: "PROD", ALLOW_TEST_ACCOUNTS: "1" }), false);
});

test("isProdStrictEnv: ENVIRONMENT set to something other than PROD does not trigger prod-strict", () => {
  assert.equal(isProdStrictEnv({ ENVIRONMENT: "staging" }), false);
});

// ── checkStripeKeyPrefix ─────────────────────────────────────────────────────

test("checkStripeKeyPrefix: prod-strict + sk_live_ → ok", () => {
  const result = checkStripeKeyPrefix("sk_live_abcdef123456", true);
  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
});

test("checkStripeKeyPrefix: prod-strict + sk_test_ → FAILS (live key required in prod)", () => {
  const result = checkStripeKeyPrefix("[REDACTED_STRIPE_TEST_KEY]", true);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /must be a live secret key/);
  // Never leaks the full key — only an 8-char prefix preview.
  assert.doesNotMatch(result.reason!, /abcdef123456/);
});

test("checkStripeKeyPrefix: non-prod + sk_test_ → ok", () => {
  const result = checkStripeKeyPrefix("[REDACTED_STRIPE_TEST_KEY]", false);
  assert.equal(result.ok, true);
});

test("checkStripeKeyPrefix: non-prod + sk_live_ → FAILS (live key forbidden outside prod — the money-safety half)", () => {
  const result = checkStripeKeyPrefix("sk_live_abcdef123456", false);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /TEST secret key/);
  assert.doesNotMatch(result.reason!, /abcdef123456/);
});

test("checkStripeKeyPrefix: garbage/publishable-key value fails in both directions", () => {
  assert.equal(checkStripeKeyPrefix("pk_live_abcdef", true).ok, false);
  assert.equal(checkStripeKeyPrefix("pk_live_abcdef", false).ok, false);
  assert.equal(checkStripeKeyPrefix("not-a-key-at-all", true).ok, false);
  assert.equal(checkStripeKeyPrefix("not-a-key-at-all", false).ok, false);
});
