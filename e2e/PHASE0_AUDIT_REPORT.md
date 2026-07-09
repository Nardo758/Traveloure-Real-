# Phase 0 — Read-Only Audit Report

**Date**: 2026-07-09  
**Auditor**: E2E Verification Protocol (Task #685)  
**Scope**: journey-1 local verification — all §0 pre-flight checks  
**DB**: heliumdb (local Replit postgres)

---

## §0.1 DB Target

| Item | Value | Status |
|------|-------|--------|
| DATABASE_URL host | `helium` (Replit local postgres) | **PASS** |
| Database name | `heliumdb` | **PASS** |
| Blast radius | Dev-only local DB; not reachable from prod | **PASS** |
| Purge predicate gate | `purgeE2EAccountsFromProd()` only runs when `ENVIRONMENT=PROD`; inverse gate protects dev seeds | **PASS** |

Citation: `server/index.ts:318` — `if (process.env.ENVIRONMENT !== "PROD") { await seedE2EAccounts(); }`

---

## §0.2 Self-Seed

| Item | Value | Status |
|------|-------|--------|
| ENVIRONMENT variable | Not set → non-PROD branch taken | **PASS** |
| E2E accounts seeded | 62 `@traveloure.test` rows in `users` | **PASS** |
| Required roles present | traveler ✓ expert ✓ provider ✓ ea ✓ admin ✓ | **PASS** |
| All have passwords | Confirmed via `password IS NOT NULL` check | **PASS** |
| Idempotency | Seed uses `ON CONFLICT DO NOTHING` / `existing.length === 0` guards | **PASS** |

Citation: `server/seeds/e2e-test-accounts.seed.ts:40–89`  
Auth fixture: `e2e/fixtures/accounts.ts:13–19`

---

## §0.3 Stripe Mode

| Item | Value | Status |
|------|-------|--------|
| STRIPE_SECRET_KEY at initial audit | `sk_live_...` (live secret key) | **FAIL** (initial state) |
| STRIPE_SECRET_KEY after user update | `sk_test_...` (test secret key) | **PASS** (resolved before Phase 4) |
| Impact | Phase 1 gate initially FAIL; resolved before Phase 4 runs began | — |

Citation: `server/services/stripe.service.ts:9` reads `process.env.STRIPE_SECRET_KEY`  
Note: follow-up #688 tracks keeping the test key consistently set

---

## §0.4 Router Mount Surface

All `import *Routes from` declarations in `server/routes.ts` cross-referenced against all `app.use()` calls (grep: `grep -n "app\.use" server/routes.ts`).

| Router file | Import line | Mount line | Status |
|-------------|-------------|------------|--------|
| `instagram.ts` | :90 | `:423 app.use("/api/instagram", ...)` | **PASS** |
| `identity.routes.ts` | :91 | `:469 app.use("/api/identity", ...)` | **PASS** |
| `webhooks.routes.ts` | :92 | `:471 app.use("/api/webhooks", ...)` | **PASS** |
| `bookings.ts` | :93 | `:426 app.use("/api/bookings", ...)` | **PASS** |
| `booking-actions.ts` | :94 | `:429 app.use("/api", ...)` | **PASS** |
| `my-itinerary.routes.ts` | :95 | `:433 app.use(myItineraryRoutes)` | **PASS** |
| `transport-hub.routes.ts` | :96 | `:436 app.use(transportHubRoutes)` | **PASS** |
| `plancard.routes.ts` | :97 | `:439 app.use(plancardRoutes)` | **PASS** |
| `optimization.routes.ts` | :98 | `:442 app.use(optimizationRoutes)` | **PASS** |
| `concierge.routes.ts` | :99 | `:445 app.use(conciergeRoutes)` | **PASS** |
| `upsell.routes.ts` | :100 | `:450 app.use(upsellRoutes)` | **PASS** |
| **`trips.routes.ts`** | :101 | **no `app.use(tripsRoutes)` found** | **FAIL** |
| `admin.routes.ts` | :103 | `:473 app.use(adminRoutes)` | **PASS** |
| **`experts.routes.ts`** | :104 | **no `app.use(expertsRoutes)` found** | **FAIL** |
| `content.routes.ts` | :105 | `:461 app.use(contentRoutes)` | **PASS** |
| `payments.routes.ts` | :106 | `:455 app.use(paymentsRoutes)` | **PASS** |
| **`cross-sell.routes.ts`** | :107 | **no `app.use(crossSellRoutes)` found** | **FAIL** |
| `expert-workspace.routes.ts` | :108 | `:466 app.use("/api/expert-workspace", ...)` | **PASS** |
| **`saved-items.routes.ts`** | :111 | **no `app.use(savedItemsRoutes)` found** | **FAIL** |
| `messages` router | :55 | `:430 app.use("/api/messages", ...)` | **PASS** |

**4 routers are imported but never mounted**: `trips.routes.ts`, `experts.routes.ts`, `cross-sell.routes.ts`, `saved-items.routes.ts`. Their route handlers are unreachable dead code. Confirmed by API probe: `PATCH /api/trips/:id` with a valid traveler session returns 401 (no route registered), consistent with an unregistered route hitting Express default error handling.

---

## §0.5 Auth Surface

| Check | Finding | Status |
|-------|---------|--------|
| Unauthenticated `GET /api/conversations` | 401 — auth guard active | **PASS** |
| Authed traveler `GET /api/my-trips` | 200 JSON — trips returned | **PASS** |
| Traveler `PATCH /api/trips/:id` (cross-user) | 401 — route not registered (`trips.routes.ts` not mounted) | **FAIL** |
| Traveler `GET /api/provider/dashboard` | 200 with financial data — IDOR | **FAIL** (doc-only per task) |
| Traveler `GET /api/admin/revenue` | 403 — role guard active | **PASS** |
| Provider `GET /api/provider/services` | 200 — correct own-data access | **PASS** |

⚠️ **Follow-up #689**: Guard `/api/provider/dashboard` behind provider role check

---

## §0.6 Playwright Config

| Item | Value | Status |
|------|-------|--------|
| Local config file | `playwright.local.config.ts` | **PASS** |
| testDir | `./e2e/specs` | **PASS** |
| globalSetup | `./e2e/global-setup.ts` | **PASS** |
| baseURL | `process.env.BASE_URL \|\| 'http://localhost:5000'` | **PASS** |
| timeout per test | 45 000 ms | **PASS** |
| retries | 0 (local) / 1 (CI) | **PASS** |
| workers | 1 | **PASS** |
| trace | `'on'` (changed from `on-first-retry` for verification runs) | **PASS** |
| webServer block | Absent — app must be pre-started | **PASS** |
| E2E auth files | `e2e/auth/{admin,ea,expert,provider,traveler}.json` all present | **PASS** |

---

## §0.7 Migration State

| Item | Value | Status |
|------|-------|--------|
| MIGRATION_FILES entries | 150 | **PASS** |
| Chain integrity test 1 | Every entry present on disk | **PASS** |
| Chain integrity test 2 | All entries unique | **PASS** |
| Migration range | `000_baseline_schema.sql` → `106_qa_run_snapshots.sql` | **PASS** |

Citation: `server/migrations/__tests__/chain-integrity.test.ts` — 2/2 tests pass

---

## §0 Summary

| Section | Subject | Rating |
|---------|---------|--------|
| §0.1 | DB target | **PASS** |
| §0.2 | Self-seed | **PASS** |
| §0.3 | Stripe mode | **PASS** (resolved before Phase 4; was FAIL at initial audit) |
| §0.4 | Router mounts | **FAIL** (4 routers unmounted — dead code endpoints) |
| §0.5 | Auth surface | **FAIL** (provider IDOR + unmounted trips route; both doc-only per task) |
| §0.6 | Playwright config | **PASS** |
| §0.7 | Migration chain | **PASS** |
