// e2e/fixtures/base-url.ts
// SINGLE resolution point for "which deployed app is this run pointed at".
//
// There are now TWO deploy targets, deliberately split (docs/STAGING.md):
//
//   E2E_STAGING_BASE_URL — the STAGING deploy, provisioned with
//     ALLOW_TEST_ACCOUNTS=1 so the seeded @traveloure.test accounts exist and
//     persist. This is the ONLY target an auth-dependent spec may run against.
//
//   E2E_BASE_URL — the production deploy. Production PURGES @traveloure.test
//     accounts on every boot (the PR #319 P0 fix), so logging in there is
//     structurally impossible and correctly 401s. Only UNAUTHENTICATED specs
//     may target it (see playwright.e2e.public.config.ts + public-smoke.spec.ts).
//
// Staging wins when both are set: a run that has a staging URL is an auth run.
// There is NO localhost fallback — the session cookie is Secure, so an http
// target silently drops it and surfaces as a misleading 401. The previous
// `process.env.E2E_BASE_URL || "https://localhost:5000"` inline default in the
// journey specs was exactly that landmine (nothing listens on :5000 in CI, so
// it produced connection errors attributed to the app).

export const E2E_TARGET_BASE_URL: string | undefined =
  process.env.E2E_STAGING_BASE_URL || process.env.E2E_BASE_URL;

/**
 * The resolved deploy URL, or a loud throw naming BOTH variables. Call this
 * from a spec that needs to build an absolute URL; prefer relative
 * `page.goto('/x')` where possible (the Playwright config already sets baseURL).
 */
export function requireBaseUrl(): string {
  if (!E2E_TARGET_BASE_URL) {
    throw new Error(
      'No deploy target configured: set E2E_STAGING_BASE_URL (auth-dependent runs, ' +
        'staging with ALLOW_TEST_ACCOUNTS=1) or E2E_BASE_URL (unauthenticated prod runs). ' +
        'See docs/STAGING.md.',
    );
  }
  return E2E_TARGET_BASE_URL;
}
