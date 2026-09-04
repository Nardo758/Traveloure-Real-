/**
 * test-only-endpoint.ts — the gate for endpoints that exist ONLY to set up a test run.
 *
 * Audit finding 11 (ledger `2026-09-03-security-9-11-13`).
 *
 * THE DEFECT: `POST /api/transport-booking-options/seed/test-variant`
 * (`server/routes/transport-hub.routes.ts`) described itself as "CI/test-only" and was mounted and
 * live in production behind `isAuthenticated` alone — unbounded junk-row insertion into the
 * traveler-facing `transport_booking_options` table by any account. §18c's "no consumer + write
 * effect ⇒ delete, don't gate" does not decide it, because it DOES have a consumer:
 * `e2e/specs/journey-6.spec.ts` drives it against staging. So it is gated, not deleted.
 *
 * WHY THE GATE IS `isProdStrictEnv` AND NOT `NODE_ENV !== "production"`:
 *   - Every CI boot that legitimately calls a seed endpoint runs the PRODUCTION bundle with
 *     `NODE_ENV=production` on purpose (journey-suite: "that is the point — it tests the real
 *     bundle"), so a bare NODE_ENV check would refuse exactly the environments this exists for.
 *   - `isProdStrictEnv` (`server/utils/stripe-key-policy.ts`) is this repo's SINGLE, already-
 *     ratified production-detection predicate — `(NODE_ENV === "production" || ENVIRONMENT ===
 *     "PROD") && ALLOW_TEST_ACCOUNTS !== "1"` — used by `validate-env.ts` (boot-time Stripe key
 *     policy) and the runtime-health check. Reusing it means ONE implementation of "am I
 *     production", never a second copy that can drift (§18 rule 1).
 *   - It is also exactly COEXTENSIVE with the endpoint's only legitimate use. Every caller is an
 *     e2e spec that first logs in as a seeded `@traveloure.test` account, and those accounts exist
 *     only where `ALLOW_TEST_ACCOUNTS=1` is set — production purges them on boot (PR #319, enforced
 *     by `scripts/check-env-allowlist.cjs`). So no new env var, no new secret and no workflow change
 *     is needed: where the test accounts can log in, the seed endpoint answers; everywhere else it
 *     refuses.
 *
 * RESPONSE SHAPE: 503 with a stated reason, mirroring `requireInternalSecret`'s
 * "disabled until configured" posture in `server/routes/internal.routes.ts`. A 404 would be a
 * cheaper lie and §9 warns that a 404 is not a reliable "route is dead" signal here anyway; an
 * explicit refusal is honest (§13) and legible to whoever hits it in CI.
 *
 * This middleware NEVER replaces authorization. It runs alongside the endpoint's existing session
 * guard — environment is not an authorization boundary.
 */
import type { Request, Response, NextFunction } from "express";
import { isProdStrictEnv } from "../utils/stripe-key-policy";

/**
 * True when test-only seeding endpoints may answer. Pure — takes the env so a unit test can prove
 * every combination without mutating `process.env`.
 */
export function isTestSeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isProdStrictEnv(env);
}

/**
 * Express guard: refuse a test-only seeding endpoint in production, before any handler body runs.
 */
export function requireTestSeedEnabled(_req: Request, res: Response, next: NextFunction) {
  if (!isTestSeedEnabled()) {
    return res.status(503).json({
      error: "Test-seed endpoint disabled in production",
      message:
        "This endpoint exists only to set up an automated test run and is refused on a production boot.",
    });
  }
  next();
}
