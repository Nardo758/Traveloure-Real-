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

import { isProdStrictEnv, checkStripeKeyPrefix } from "./utils/stripe-key-policy";

const key = process.env.STRIPE_SECRET_KEY;
const isProdStrict = isProdStrictEnv();

if (key) {
  const prefixCheck = checkStripeKeyPrefix(key, isProdStrict);
  if (!prefixCheck.ok) {
    throw new Error(
      `${prefixCheck.reason} (NODE_ENV=${process.env.NODE_ENV || "undefined"}, ` +
        `ENVIRONMENT=${process.env.ENVIRONMENT || "undefined"}). Refusing to start. ` +
        `Update the STRIPE_SECRET_KEY secret.`
    );
  }

  /**
   * ── WEBHOOK SECRET DISCOVERABILITY (MONEY_MAP F-2) ──────────────────────────
   * A configured-payments app (STRIPE_SECRET_KEY present) whose webhook secrets
   * are missing can accept charges but can't verify the webhooks that confirm/
   * fail/dispute them — a real but easy-to-miss hazard. Non-fatal WARN only:
   * dev/CI routinely runs without webhook delivery configured at all, and the
   * three webhook ROUTES themselves already refuse unsafely (bookings.ts's
   * production guard below; webhooks.routes.ts's existing non-prod fallback).
   */
  const webhookSecretVars = [
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CONNECT_WEBHOOK_SECRET",
    "STRIPE_IDENTITY_WEBHOOK_SECRET",
  ];
  for (const varName of webhookSecretVars) {
    if (!process.env[varName]) {
      console.warn(
        `[validate-env] WARN: STRIPE_SECRET_KEY is set but ${varName} is not — its webhook ` +
          `cannot verify signed deliveries until it's configured. See .env.example.`
      );
    }
  }
}
