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
 */

const key = process.env.STRIPE_SECRET_KEY;
const isProd = process.env.NODE_ENV === "production";

if (key) {
  if (isProd && !key.startsWith("sk_live_")) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a live secret key (sk_live_...) when NODE_ENV=production. ` +
        `Refusing to start with the current value's prefix "${key.slice(0, 8)}...".`
    );
  }
  if (!isProd && !key.startsWith("sk_test_")) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a TEST secret key (sk_test_...) outside production ` +
        `(NODE_ENV=${process.env.NODE_ENV || "undefined"}). Live keys (sk_live_...) are a hard stop ` +
        `in dev/E2E — real Stripe objects would be created against the live account. ` +
        `Current value's prefix is "${key.slice(0, 8)}...". Update the STRIPE_SECRET_KEY secret.`
    );
  }
}
