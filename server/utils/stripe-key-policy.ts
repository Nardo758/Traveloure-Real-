/**
 * Pure Stripe-key environment/prefix policy.
 *
 * Extracted from server/validate-env.ts (the primary, boot-time enforcement site) so the
 * "live key required in prod / test key required everywhere else" rule has exactly ONE
 * implementation. A live key is `sk_live_` or `rk_live_`. A test key is `sk_test_` or
 * `rk_test_`. Restricted keys (`rk_`) take the same split as secret keys (ledger
 * `2026-10-21-saved-method-required`). validate-env.ts calls this to decide whether to
 * throw at boot; the H3 runtime-health check (server/services/runtime-health.service.ts)
 * calls the SAME functions to re-assert the rule as a read-only signal. stripe.service.ts
 * calls this function too (ENVIRONMENT===PROD only) so the prefix list cannot drift.
 *
 * No side effects, no `process.env` read at import time — safe to import from a unit test
 * without triggering a boot-time throw.
 */

export interface StripeKeyPrefixCheck {
  ok: boolean;
  reason?: string;
}

/**
 * prod-strict = (NODE_ENV === "production" OR ENVIRONMENT === "PROD") AND ALLOW_TEST_ACCOUNTS !== "1".
 * Mirrors validate-env.ts's documented production-detection rule verbatim (see that file's
 * header comment for why NODE_ENV is the reliable signal and ENVIRONMENT=PROD is the belt-and-
 * suspenders alternative, plus the ALLOW_TEST_ACCOUNTS=1 CI escape hatch).
 */
export function isProdStrictEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    (env.NODE_ENV === "production" || env.ENVIRONMENT === "PROD") &&
    env.ALLOW_TEST_ACCOUNTS !== "1"
  );
}

const LIVE_KEY_PREFIXES = ["sk_live_", "rk_live_"] as const;
const TEST_KEY_PREFIXES = ["sk_test_", "rk_test_"] as const;

function hasKeyPrefix(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => key.startsWith(prefix));
}

/**
 * Validates a STRIPE_SECRET_KEY's prefix against the prod-strict rule:
 *   - prod-strict  ⇒ must start with "sk_live_" or "rk_live_"
 *   - otherwise    ⇒ must start with "sk_test_" or "rk_test_"
 *
 * A live restricted key is rejected outside production the same way a live secret
 * key is. Never logs or returns the full key — only its first 8 characters, matching
 * validate-env.ts's existing truncation convention.
 */
export function checkStripeKeyPrefix(key: string, isProdStrict: boolean): StripeKeyPrefixCheck {
  const prefixPreview = key.slice(0, 8);

  if (isProdStrict) {
    if (!hasKeyPrefix(key, LIVE_KEY_PREFIXES)) {
      return {
        ok: false,
        reason: `STRIPE_SECRET_KEY must be a live key (sk_live_ or rk_live_) in production. Current value's prefix is "${prefixPreview}...".`,
      };
    }
    return { ok: true };
  }

  if (!hasKeyPrefix(key, TEST_KEY_PREFIXES)) {
    return {
      ok: false,
      reason:
        `STRIPE_SECRET_KEY must be a test key (sk_test_ or rk_test_) outside production. ` +
        `Live keys (sk_live_ or rk_live_) are a hard stop in dev and E2E — a live key would create ` +
        `real Stripe objects. Current value's prefix is "${prefixPreview}...".`,
    };
  }
  return { ok: true };
}
