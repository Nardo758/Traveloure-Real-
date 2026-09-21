/**
 * plan-price-resolver.test.ts — memberships increment 2 (ledger `2026-09-21-membership-checkout`).
 *
 * PURE: no database, no network, no `process.env`. The resolver takes its three inputs injected,
 * which is exactly what makes the mode rule provable here rather than only in a deployed
 * environment. R1–R10.
 *
 * The rule that earns most of these proofs is the ONE this module exists for: NO CROSS-MODE
 * FALLBACK. A live key with only a test price configured must REFUSE, not reach for the id it can
 * see — because that id does not exist in the account the key addresses, and Stripe's "No such
 * price" would arrive later and to the traveler instead of to the operator.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePlanPriceId,
  resolveStripeMode,
  describePlanPriceRefusal,
} from "../plan-price-resolver";

const TEST_KEY = "sk_test_abc123";
const LIVE_KEY = "sk_live_abc123";
const P_TEST = "price_test_xyz";
const P_LIVE = "price_live_xyz";

describe("plan price resolver — mode comes from the key prefix", () => {
  test("R1: a test key picks the TEST price id", () => {
    const r = resolvePlanPriceId({
      secretKey: TEST_KEY,
      stripePriceIdTest: P_TEST,
      stripePriceIdLive: P_LIVE,
    });
    assert.deepEqual(r, { ok: true, priceId: P_TEST, mode: "test" });
  });

  test("R2: a live key picks the LIVE price id", () => {
    const r = resolvePlanPriceId({
      secretKey: LIVE_KEY,
      stripePriceIdTest: P_TEST,
      stripePriceIdLive: P_LIVE,
    });
    assert.deepEqual(r, { ok: true, priceId: P_LIVE, mode: "live" });
  });

  test("R3: NO CROSS-MODE FALLBACK — a live key with only a TEST price REFUSES", () => {
    const r = resolvePlanPriceId({
      secretKey: LIVE_KEY,
      stripePriceIdTest: P_TEST,
      stripePriceIdLive: null,
    });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "price_not_configured");
    assert.equal(r.mode, "live");
    // The test id must not appear anywhere in the answer.
    assert.ok(!JSON.stringify(r).includes(P_TEST));
  });

  test("R4: NO CROSS-MODE FALLBACK — a test key with only a LIVE price REFUSES", () => {
    const r = resolvePlanPriceId({
      secretKey: TEST_KEY,
      stripePriceIdTest: null,
      stripePriceIdLive: P_LIVE,
    });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "price_not_configured");
    assert.equal(r.mode, "test");
    assert.ok(!JSON.stringify(r).includes(P_LIVE));
  });

  test("R5: no key at all is its OWN refusal, distinct from an unconfigured price", () => {
    for (const k of [undefined, null, "", "   "]) {
      const r = resolvePlanPriceId({
        secretKey: k,
        stripePriceIdTest: P_TEST,
        stripePriceIdLive: P_LIVE,
      });
      assert.equal(r.ok, false, `key=${JSON.stringify(k)}`);
      assert.equal(r.ok === false && r.reason, "no_stripe_key");
      assert.equal(r.mode, null);
    }
  });

  test("R6: an unrecognised prefix is refused, never guessed into a mode", () => {
    for (const k of ["rk_live_abc", "pk_test_abc", "abc123", "sk_abc"]) {
      const r = resolvePlanPriceId({
        secretKey: k,
        stripePriceIdTest: P_TEST,
        stripePriceIdLive: P_LIVE,
      });
      assert.equal(r.ok, false, `key=${k}`);
      assert.equal(r.ok === false && r.reason, "unrecognised_key_mode");
      assert.equal(r.mode, null);
    }
  });

  test("R7: a BLANK column is NOT a price id — treated as never configured", () => {
    for (const blank of ["", "   ", "\t"]) {
      const r = resolvePlanPriceId({
        secretKey: TEST_KEY,
        stripePriceIdTest: blank,
        stripePriceIdLive: P_LIVE,
      });
      assert.equal(r.ok, false, `blank=${JSON.stringify(blank)}`);
      assert.equal(r.ok === false && r.reason, "price_not_configured");
    }
  });

  test("R8: the resolved id is trimmed, so a stray newline cannot reach Stripe", () => {
    const r = resolvePlanPriceId({
      secretKey: TEST_KEY,
      stripePriceIdTest: `  ${P_TEST}\n`,
      stripePriceIdLive: null,
    });
    assert.deepEqual(r, { ok: true, priceId: P_TEST, mode: "test" });
  });

  test("R9: resolveStripeMode is total — every input lands on test, live or null", () => {
    assert.equal(resolveStripeMode("sk_test_x"), "test");
    assert.equal(resolveStripeMode("sk_live_x"), "live");
    assert.equal(resolveStripeMode("sk_test_ci_stub_key"), "test"); // the CI stub is a test key
    assert.equal(resolveStripeMode(""), null);
    assert.equal(resolveStripeMode(undefined), null);
    assert.equal(resolveStripeMode(null), null);
    assert.equal(resolveStripeMode("whatever"), null);
  });

  test("R10: a refusal sentence names the COLUMN an operator must fill, and the expected prefixes", () => {
    const live = describePlanPriceRefusal("price_not_configured", "live");
    assert.ok(live.includes("stripe_price_id_live"), live);
    const test_ = describePlanPriceRefusal("price_not_configured", "test");
    assert.ok(test_.includes("stripe_price_id_test"), test_);

    // The unrecognised-mode sentence NAMES both expected prefixes on purpose: that is the
    // actionable half for the operator reading it. Naming the constant `sk_test_` is not leaking a
    // key, and leaking one is STRUCTURALLY IMPOSSIBLE here — `describePlanPriceRefusal` takes only
    // (reason, mode) and never receives a key to leak. An earlier version of this test asserted the
    // substring `sk_test_` was absent, which failed against correct code; the property worth
    // pinning is the signature, asserted below, not the wording.
    const unknown = describePlanPriceRefusal("unrecognised_key_mode", null);
    assert.ok(unknown.includes("sk_test_") && unknown.includes("sk_live_"), unknown);
    assert.equal(describePlanPriceRefusal.length, 2, "takes (reason, mode) only — no key parameter");

    // Every (reason, mode) pair produces a non-empty sentence: no refusal is nameless (§13).
    for (const reason of ["no_stripe_key", "unrecognised_key_mode", "price_not_configured"] as const) {
      for (const mode of ["test", "live", null] as const) {
        assert.ok(describePlanPriceRefusal(reason, mode).length > 0, `${reason}/${mode}`);
      }
    }
  });
});
