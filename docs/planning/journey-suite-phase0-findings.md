# Journey Suite — Phase 0 findings (read-only, HARD STOP)

**Lane:** lane/journey-suite · **Date:** 2026-08-05 · **Brief:** docs/planning/JOURNEY_TEST_SUITE_BRIEF.md (header retrofitted: audited@unknown — never previously committed; all its state claims treated as hypothesis and verified below).
**Companion deliverable:** docs/testing/coverage-matrix.md (seeded).

## §8.1 Matrix columns
Enumerated from actual routes + UI controls with file:line — recorded per-surface in coverage-matrix.md. Notables vs the brief's hypotheses: `/checkout` client route redirects to `/cart` (checkout is API-driven from cart.tsx:2565 → POST /api/checkout); `/create-trip` redirects to `/experiences`; slip Spec A/B surfaces do not exist yet (trip-details.tsx is the current plan view) — Spec-specific cells are `deferred:slip-phase-4`.

## §8.2 Existing coverage inventory
- Playwright Model B journeys 1, 4-5, 5-admin, 6, 7: ALL RED (docs/audits/e2e-model-b-triage.md — 11 drift + 2 stale-deploy). Non-blocking CI (e2e-tests.yml). Kept running; superseded row-by-row, retired only when replacements are green.
- Green + absorbed: smoke.spec.ts, login-ui.spec.ts (F-auth-1); booking-confirm-payment-idempotency.test.ts (F-pay-3).
- scripts/journeys/*.mjs suite + journey-lib.mjs retained; console-sigma HTTP tests retained.
- Console-sigma §11 pre-claims absorbed verbatim (docs/testing/CONSOLE_SIGMA_AUDIT.md:192): D6(b) = J8 assertion (delivered→R7 credit) + Tier-3 negative (non-assigned actor forcing delivered mints no credit). Claimed cells cite that audit.

## §8.3 Stripe wiring — CONFIRMED
- Dev key: connector-fetched sk_test via scripts/dev-stripe-key.cjs in the Start workflow; boot guard (server/validate-env.ts:40-51 + server/utils/stripe-key-policy.ts) blocks sk_live in dev and sk_test in prod.
- Webhooks: /api/webhooks/stripe (+ /stripe-identity), server/routes/webhooks.routes.ts:535/28; dev fallback accepts unverified payloads when the secret is absent (NODE_ENV!=='production') — journeys can drive webhooks with test-mode events without Stripe CLI.
- Env allowlist enforcement point: isProdStrictEnv (stripe-key-policy.ts:29-34) + the seed/purge gate (server/index.ts:428-430, ALLOW_TEST_ACCOUNTS). **Named guard verdict: TRIVIAL — wire in this lane.** A CI-side check asserting the allowlist posture (dev/helium only; ALLOW_TEST_ACCOUNTS never set in prod deploy config) rides Wave 1 with the matrix lint, converting the "env allowlist" MISSING candidate in the guards register.

## §8.4 Test-DB helper — CONFIRMED
scripts/journeys/lib/journey-lib.mjs already provides connectDb/dbOne/dbAll (read-only assertions, plain pg, no ORM). CI parallelism: one Postgres container per job (.github/actions/ci-db-setup); within a job, run-all.mjs enforces sequential journeys. No new machinery.

## §8.5 Seed/account gaps for J9/J11/J12
Core roles exist (server/seeds/e2e-test-accounts.seed.ts:31): traveler, expert (kyoto-food), provider (kyoto-photography), **admin (test-admin@traveloure.test — DB role column, no env promotion)**, EA. kyoto-temples bench fixture is runner-owned (console-sigma) — consume, never re-seed.
Gaps (all W4/post-W1 journeys — no Wave 1 blocker):
- **J9:** no expert owns an authored ready-made + source trip; needs an authoring fixture (follow the Kyoto-bench reconciling-seeder pattern).
- **J11:** no seeded provider is Stripe-Connect booking-ready (no stripe_account_id / can_receive_payments in seeds).
- **J12:** no attributed short-link/acquisitionRef fixtures.

## §8 item 6 (dispatch addendum) — Amadeus-drop surface check
Post ruling 34, these render empty: flight search (no fallback), POIs, safety, transfers, city/airport autocomplete (unless LocationCache-hit); hotels fall back to Booking.com on-page. **NO Wave-1 journey step depends on any of them** — J1/J2/J6/J7 run on Viator/Travelpayouts/OpenTable/gems content. Beta-gate finding (not a test workaround): flight search + location autocomplete are dead surfaces until repointed (project tasks #1040/#1041).

## Ledger housekeeping done in this lane
- Ruling 35 appended (two-layer born-approved enforcement; renumbered from collided 34 — Amadeus keeps 34). Enforcement task number pending (task-proposal throttled at append time; file by amendment).
- Numbering rule appended to the protocol header: conversation numbers are provisional; the ledger is the number authority.

## HARD STOP
Awaiting approval of this findings set + the seeded matrix before Wave 1 code (matrix lint · testable Tier-3 negatives · J1-minus-expert-leg · J2 · J6 · J7 · J13-minus-lane-5-swap, with Lane S log/version assertions active from day one).
