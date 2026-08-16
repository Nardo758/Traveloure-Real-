/**
 * Central Stripe secret key resolver.
 *
 * Returns `STRIPE_SECRET_KEY_TEST` when set (dev/CI), falling back to
 * `STRIPE_SECRET_KEY` (production live key). This is the SINGLE place the
 * fallback logic lives — all Stripe initialisations and the validate-env guard
 * must call this function rather than reading `process.env.STRIPE_SECRET_KEY`
 * directly, so dev picks up the test key automatically and production falls
 * back to the live key without any further secret changes.
 *
 * No side effects, no module-level env reads — safe to import anywhere.
 */
export function getStripeSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY_TEST ?? process.env.STRIPE_SECRET_KEY;
}
