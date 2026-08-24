/**
 * Pure Stripe-key environment/prefix policy.
 *
 * Extracted from server/validate-env.ts (the primary, boot-time enforcement site) so the
 * "sk_live_ required in prod / sk_test_ required everywhere else" rule has exactly ONE
 * implementation. validate-env.ts calls this to decide whether to throw at boot; the H3
 * runtime-health check (server/services/runtime-health.service.ts) calls the SAME functions
 * to re-assert the rule as a read-only nightly signal, rather than re-deriving it (the same
 * "single implementation" discipline CLAUDE.md applies to fee literals, applied here to a
 * security rule instead). server/services/stripe.service.ts carries its own defense-in-depth
 * duplicate of this check (documented there as intentional, secondary enforcement) — left
 * untouched, out of scope for this file.
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

/**
 * Validates a STRIPE_SECRET_KEY's prefix against the prod-strict rule:
 *   - prod-strict  ⇒ must start with "sk_live_"
 *   - otherwise    ⇒ must start with "sk_test_"
 *
 * Never logs or returns the full key — only its first 8 characters, matching validate-env.ts's
 * existing truncation convention.
 */
export function checkStripeKeyPrefix(key: string, isProdStrict: boolean): StripeKeyPrefixCheck {
  const prefixPreview = key.slice(0, 8);

  if (isProdStrict) {
    if (!key.startsWith("sk_live_")) {
      return {
        ok: false,
        reason: `STRIPE_SECRET_KEY must be a live secret key (sk_live_...) in production. Current value's prefix is "${prefixPreview}...".`,
      };
    }
    return { ok: true };
  }

  if (!key.startsWith("sk_test_")) {
    return {
      ok: false,
      reason:
        `STRIPE_SECRET_KEY must be a TEST secret key (sk_test_...) outside production. ` +
        `Live keys (sk_live_...) are a hard stop in dev/E2E — real Stripe objects would be created ` +
        `against the live account. Current value's prefix is "${prefixPreview}...".`,
    };
  }
  return { ok: true };
}
