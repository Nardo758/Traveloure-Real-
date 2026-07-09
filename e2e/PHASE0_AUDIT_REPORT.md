# Phase 0 — Read-Only Audit Report

**Date**: 2026-07-08  
**Auditor**: E2E Verification Protocol (Task #685)  
**Scope**: Phases 0–4 of e2e/specs/journey-1.spec.ts local verification

---

## §0.1 DB Target

| Item | Value | Status |
|------|-------|--------|
| DATABASE_URL host | `helium` (Replit local postgres) | **PASS** |
| Database name | `heliumdb` | **PASS** |
| User | `postgres` | **PASS** |
| Blast radius | Dev-only local DB, not reachable from prod | **PASS** |
| Purge predicate | `purgeE2EAccountsFromProd()` runs only when `ENVIRONMENT=PROD` — inverse gate protects seeds in dev | **PASS** |

Citation: `server/index.ts:318` — `if (process.env.ENVIRONMENT !== "PROD") { await seedE2EAccounts(); }`

---

## §0.2 Self-Seed

| Item | Value | Status |
|------|-------|--------|
| ENVIRONMENT gate | Not set → non-PROD branch taken | **PASS** |
| E2E accounts seeded | 62 `@traveloure.test` rows in `users` | **PASS** |
| Required roles present | traveler ✓ expert ✓ provider ✓ ea ✓ admin ✓ | **PASS** |
| All have passwords | Confirmed via `password IS NOT NULL` query | **PASS** |
| Idempotency | Seed uses `ON CONFLICT DO NOTHING` / `existing.length === 0` checks | **PASS** |
| Row count after restart | Identical (62 users, 55 trips) | **PASS** |

Citation: `server/seeds/e2e-test-accounts.seed.ts:40–89`  
Accounts file: `e2e/fixtures/accounts.ts:13–19`

---

## §0.3 Stripe Mode

| Item | Value | Status |
|------|-------|--------|
| STRIPE_SECRET_KEY prefix | `pk_live_51T8XrdRLkzu...` | **FAIL** |
| Expected prefix | `sk_test_` | — |
| Impact | Payment steps in Journey 1A/1B lines 101–112 would hit live Stripe | **DOCUMENTED** |
| Mitigation | Service-card skip guard (`test.skip()` when cards=0) prevents payment reach if data absent | — |

Citation: `e2e/specs/journey-1.spec.ts:81–86` — skip guard for data-dependent steps  
⚠️ **Follow-up #688** created: Switch to `sk_test_` key in dev env

---

## §0.4 Router Mount Surface

Every `import *Routes from` in `server/routes.ts` cross-referenced against `app.use()`:

| Router file | Import line | Mount line | Status |
|-------------|-------------|------------|--------|
| `instagram.ts` | routes.ts:90 | routes.ts:423 | **PASS** |
| `bookings.ts` | routes.ts:93 | routes.ts:426 | **PASS** |
| `booking-actions.ts` | routes.ts:94 | routes.ts:429 | **PASS** |
| `messages.ts` | routes.ts:55 | routes.ts:430 | **PASS** |
| `my-itinerary.routes.ts` | routes.ts:95 | routes.ts:433 | **PASS** |
| `transport-hub.routes.ts` | routes.ts:96 | routes.ts:436 | **PASS** |
| `plancard.routes.ts` | routes.ts:97 | routes.ts:439 | **PASS** |
| `optimization.routes.ts` | routes.ts:98 | routes.ts:442 | **PASS** |
| `concierge.routes.ts` | routes.ts:99 | routes.ts:445 | **PASS** |
| `upsell.routes.ts` | routes.ts:100 | routes.ts:450 | **PASS** |
| `payments.routes.ts` | routes.ts:106 | routes.ts:455 | **PASS** |
| `content.routes.ts` | routes.ts:105 | routes.ts:461 | **PASS** |
| `expert-workspace.routes.ts` | routes.ts:108 | routes.ts:466 | **PASS** |
| `identity.routes.ts` | routes.ts:91 | routes.ts:469 | **PASS** |
| `webhooks.routes.ts` | routes.ts:92 | routes.ts:471 | **PASS** |
| `admin.routes.ts` | routes.ts:103 | routes.ts:473 | **PASS** |
| `trips.routes.ts` | routes.ts:101 | routes.ts:476+ | **PASS** |
| `experts.routes.ts` | routes.ts:104 | — | **SUSPECT** (not confirmed mounted) |
| `cross-sell.routes.ts` | routes.ts:107 | — | **SUSPECT** (not confirmed mounted) |
| `saved-items.routes.ts` | routes.ts:111 | — | **SUSPECT** (not confirmed in mount list) |

All mounts verified via `grep "app.use" server/routes.ts`.

---

## §0.5 Auth Surface

| Check | Finding | Status |
|-------|---------|--------|
| `getTripRole` squash fix | `server/utils/trip-role.ts` present; checks ownership + expert advisor + EA roles | **PASS** |
| Provider IDOR | `GET /api/provider/dashboard` returns `{"summary":{"totalRevenue":0}}` for traveler role | **FAIL** (doc-only per task) |
| Suggest-token write gap | `tripSuggestions` table has no auth middleware on write paths — not audited in detail | **SUSPECT** |

Citation: Phase 3 auth matrix D result  
⚠️ **Follow-up #689** created: Guard provider dashboard behind role check

---

## §0.6 Playwright Config

| Item | Value | Status |
|------|-------|--------|
| Local config | `playwright.local.config.ts` | **PASS** |
| testDir | `./e2e/specs` | **PASS** |
| globalSetup | `./e2e/global-setup.ts` | **PASS** |
| baseURL | `process.env.BASE_URL \|\| 'http://localhost:5000'` | **PASS** |
| timeout per test | 45 000 ms (raised to 60 000 for Phase 4) | **PASS** |
| retries | 0 (local) | **PASS** |
| workers | 1 | **PASS** |
| trace | `on-first-retry` | **PASS** |
| E2E_BASE_URL guard | `playwright.e2e.config.ts` requires HTTPS; local config uses `BASE_URL` with http dev allowance | **PASS** |
| webServer assumption | webServer block commented out — app must be pre-started | **PASS** |

Journey-1 step list (from `e2e/specs/journey-1.spec.ts`):
1. Landing page (link-logo visible) — 1A
2. Navigate to /discover?tab=services — 1A
3. Click first service card — 1A (skip guard)
4. Click add-to-cart button — 1A (skip guard)
5. Navigate to /cart, verify total — 1A
6. Click Prepare Trip, then Checkout — 1A
7. Fill Stripe iframe, click Pay — 1A (Stripe key issue)
8. Booking Confirmed + booking-reference — 1A
9. Guest cart → sign in → migrate → checkout — 1B
10. EscalationCTA in trip expert tab — Stage 1 wiring
11. ExpertMatchCard in discover — Stage 1 wiring
12. SmartServiceRecommendations — Stage 1 wiring
13. /local-experts route not 404 — Stage 1 wiring

---

## §0.7 Migration State

| Item | Value | Status |
|------|-------|--------|
| MIGRATION_FILES entries | 150 | **PASS** |
| Chain integrity (disk files) | All 150 present on disk | **PASS** |
| Duplicate entries | None | **PASS** |
| Migration range | 000_baseline_schema.sql → 106_qa_run_snapshots.sql | **PASS** |

Citation: `server/migrations/__tests__/chain-integrity.test.ts` — 2/2 tests pass  
Run output: `✔ every MIGRATION_FILES entry exists on disk (8.831212ms)` / `✔ entries are unique (0.215202ms)`

---

## Summary

| Phase | Section | Rating |
|-------|---------|--------|
| §0.1 | DB target | **PASS** |
| §0.2 | Self-seed | **PASS** |
| §0.3 | Stripe mode | **FAIL** (live key; documented) |
| §0.4 | Router mount | **PASS** (3 routers SUSPECT — not confirmed mounted) |
| §0.5 | Auth surface | **FAIL** (provider IDOR; doc-only) |
| §0.6 | Playwright config | **PASS** |
| §0.7 | Migration state | **PASS** |
