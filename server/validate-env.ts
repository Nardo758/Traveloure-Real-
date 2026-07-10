/**
 * Environment guard — must be imported FIRST in server/index.ts, before any
 * module that constructs a Stripe client. Several files independently do
 * `new Stripe(process.env.STRIPE_SECRET_KEY)` without validation, so a single
 * centralized check here (that throws before those modules finish loading)
 * is the only way to reliably catch a misconfigured key regardless of which
 * file happens to import Stripe first.
 *
 * Rule: live keys are never allowed outside production, and test/publishable
 * keys are never allowed in production.
 *
 * Uses ENVIRONMENT (checked against "PROD"), the canonical env var already
 * used by the E2E-seeding guards (server/index.ts, e2e-test-accounts.seed.ts).
 * Do NOT switch this to NODE_ENV — it is unset on this deployment target and
 * would make every environment look non-production, defeating the check.
 */

const key = process.env.STRIPE_SECRET_KEY;
const isProd = process.env.ENVIRONMENT === "PROD";

if (key) {
  if (isProd && !key.startsWith("sk_live_")) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a live secret key (sk_live_...) when ENVIRONMENT=PROD. ` +
        `Refusing to start with the current value's prefix "${key.slice(0, 8)}...".`
    );
  }
  if (!isProd && !key.startsWith("sk_test_")) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a TEST secret key (sk_test_...) outside production ` +
        `(ENVIRONMENT=${process.env.ENVIRONMENT || "undefined"}). Live keys (sk_live_...) are a hard stop ` +
        `in dev/E2E — real Stripe objects would be created against the live account. ` +
        `Current value's prefix is "${key.slice(0, 8)}...". Update the STRIPE_SECRET_KEY secret.`
    );
  }
}
