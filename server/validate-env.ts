/**
 * Environment guard — must be imported FIRST in server/index.ts, before any
 * module that constructs a Stripe client. Several files independently do
 * `new Stripe(process.env.STRIPE_SECRET_KEY)` without validation, so a single
 * centralized check here (that throws before those modules finish loading)
 * is the only way to reliably catch a misconfigured key regardless of which
 * file happens to import Stripe first.
 *
 * Rule: live keys are never allowed outside production, and test keys are
 * never allowed in production.
 *
 * ── PRODUCTION DETECTION (corrected Jul 31, 2026 — the first cut would have
 * KILLED PROD AT BOOT) ────────────────────────────────────────────────────────
 * The original guard keyed on `ENVIRONMENT === "PROD"` alone — but the deployed
 * app does NOT carry that env var (recorded fact: the E2E-seeding P0 fix in
 * server/index.ts exists precisely because a gate keyed on ENVIRONMENT=PROD
 * never fired in prod). Production DOES reliably set NODE_ENV=production,
 * because the .replit [deployment] run command is `npm start` →
 * `NODE_ENV=production node dist/index.cjs` — deterministic and in-repo, no
 * manual deployment config required. So:
 *
 *   prod-strict  = (NODE_ENV === "production" OR ENVIRONMENT === "PROD")
 *                  AND ALLOW_TEST_ACCOUNTS !== "1"
 *
 * ENVIRONMENT=PROD is kept as an alternative explicit signal (belt to the
 * NODE_ENV suspenders). ALLOW_TEST_ACCOUNTS=1 is the CI escape hatch — the CI
 * gates boot the PRODUCTION BUNDLE against a throwaway DB with
 * `STRIPE_SECRET_KEY=[REDACTED_STRIPE_TEST_KEY]_stub…` (see .github/workflows/*-gate.yml),
 * and already declare themselves with that var for the E2E-accounts gate; a
 * prod deploy must never set it (if it did, the sk_live key would be REJECTED
 * below — a loud boot failure, which is the safe direction).
 *
 * The non-prod arm (reject sk_live) is the money-safety half: live keys in
 * dev/E2E would create real Stripe objects against the live account. It has
 * no escape hatch on purpose.
 */

const key = process.env.STRIPE_SECRET_KEY;
const isProdStrict =
  (process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "PROD") &&
  process.env.ALLOW_TEST_ACCOUNTS !== "1";

if (key) {
  if (isProdStrict && !key.startsWith("sk_live_")) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a live secret key (sk_live_...) in production ` +
        `(NODE_ENV=${process.env.NODE_ENV || "undefined"}, ENVIRONMENT=${process.env.ENVIRONMENT || "undefined"}). ` +
        `Refusing to start with the current value's prefix "${key.slice(0, 8)}...".`
    );
  }
  if (!isProdStrict && !key.startsWith("sk_test_")) {
    throw new Error(
      `STRIPE_SECRET_KEY must be a TEST secret key (sk_test_...) outside production ` +
        `(NODE_ENV=${process.env.NODE_ENV || "undefined"}, ENVIRONMENT=${process.env.ENVIRONMENT || "undefined"}). ` +
        `Live keys (sk_live_...) are a hard stop in dev/E2E — real Stripe objects would be created ` +
        `against the live account. Current value's prefix is "${key.slice(0, 8)}...". ` +
        `Update the STRIPE_SECRET_KEY secret.`
    );
  }
}
