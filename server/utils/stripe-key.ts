/**
 * Central Stripe secret key resolver.
 *
 * Key-selection rule:
 *   - **prod-strict** (NODE_ENV=production OR ENVIRONMENT=PROD, AND
 *     ALLOW_TEST_ACCOUNTS !== "1"): always returns `STRIPE_SECRET_KEY`.
 *     `STRIPE_SECRET_KEY_TEST` is intentionally ignored so a stray test key
 *     in a production environment cannot silently override the live key.
 *   - **dev / CI**: returns `STRIPE_SECRET_KEY_TEST ?? STRIPE_SECRET_KEY`,
 *     so the server picks up the test key automatically without any env-var
 *     rename needed.
 *
 * This is the SINGLE place the fallback logic lives — all Stripe
 * initialisations and the validate-env guard must call this function rather
 * than reading `process.env.STRIPE_SECRET_KEY` directly.
 *
 * No side effects, no module-level env reads — safe to import anywhere.
 */
export function getStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const isProdStrict =
    (env.NODE_ENV === "production" || env.ENVIRONMENT === "PROD") &&
    env.ALLOW_TEST_ACCOUNTS !== "1";

  if (isProdStrict) {
    // In production, never let a test key override the live key.
    return env.STRIPE_SECRET_KEY;
  }

  // Dev / CI: prefer the dedicated test key, fall back to the main secret.
  return env.STRIPE_SECRET_KEY_TEST ?? env.STRIPE_SECRET_KEY;
}
