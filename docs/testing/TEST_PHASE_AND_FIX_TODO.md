# Test-Phase Run + Consolidated Fix Todo — Aug 6, 2026

**Run at:** `ba168d0c` (same sha as the Pass-1 UX walkthrough; branch `claude/provider-console-ux-audit-wb4n16`).
**Environment:** the walkthrough's hermetic sandbox — local Postgres 16 (cloned DBs per tier), production bundle for the
Playwright tiers, CI-stub Stripe/AI/Resend keys, `ALLOW_TEST_ACCOUNTS=1`. Companion doc: `PROVIDER_UX_WALKTHROUGH.md`
(the findings this todo scopes against). **This lane fixes nothing** — this is the remediation scoping list, per the
dispatch's findings-only rule; owners are noted per item.

## 1. Test-phase results (mirrors the CI suite)

| Tier | What ran | Result |
|---|---|---|
| A — build | `npm run build` (vite + esbuild bundle gate) | **PASS** |
| A — types | `tsc --noEmit` ratchet | **PASS** — 197 errors = exactly the CI baseline ceiling (`TSC_BASELINE=197`) |
| A — guards | all 9 CI guard scripts (money-endpoints §14, claims-only, unmounted-routers §9, trip-mint L10, fee-literal §8, decision-guards, coverage-matrix, env-allowlist, linkage-preservation) | **PASS** (9/9) |
| B — unit | footer-route-coverage; upsell-trust-contract (74 tests); migration chain-integrity | **PASS** (upsell needs `DATABASE_URL` — fails without one, as designed) |
| C — server suite | all 29 `server/__tests__/*.test.ts` files, file-by-file vs a cloned DB | **23 files PASS (≈180 tests)**; 6 non-green, all triaged below — **zero product regressions** |
| D — journeys | `test:journeys` vs prod bundle (J1, J2, J6, J7, J13; ruling-38 Stripe-declared-unavailable contract) | **PASS** — 5/5 specs green (J13 failed once in-batch on a transient AI-unavailable 503, passes clean in isolation; journey-suite is green on GitHub CI at this exact sha and at current main) |
| D — route gates | non-auth batch: footer-links, navbar-links, crash-filter-unit, dynamic-links, hardcoded-links, earn-smoke, discover-tabs, cart-checkout-redirect, neighborhoods, sessions | **PASS — 253/253** |
| D — route gates (auth) | app-routes + auth-routes with `PW_AUTH_SETUP=1` + seeded ci-users | see addendum at bottom (run completed after this table was first drafted) |
| D — verify scripts | verify-neighborhoods, verify-service-offering-types, verify-fee-config-parity, verify-migration-ledger, verify:selection-controls | **PASS** (5/5; the two API-based ones need `BASE_URL` pointed at the running server) |

**Explicitly NOT run (no silent caps):** `e2e-deploy-smoke` / `e2e-staging-*` / `e2e-tests` (they target remote
deployed/staging URLs, not runnable against a local sandbox); the `phase-1…4-7` legacy e2e specs (not wired to any CI
gate); Stripe-real legs of J1 (correctly auto-skipped under the declared-unavailable contract).

### Tier C triage — the 6 non-green files

| File | Verdict |
|---|---|
| `concierge-suggest-add.test.ts` | **Dead test** — imports `vitest`, which is not in `package.json` and not installed; cannot run under any runner in the repo. No CI workflow references it. |
| `config-completeness.test.ts` | Same — vitest orphan. |
| `coordination-credit.test.ts` | Same — vitest orphan. |
| `event-coordination.test.ts` | Same — vitest orphan. |
| `journey-suite-negatives.http.test.ts` | **PASSES (13/13)** when a server is running at `JOURNEY_BASE_URL` — my first run lacked one. Not a defect. |
| `console-sigma-reorder-divergence.db.test.ts` | Its one test **passes in 26ms** — then the process **never exits** (times out at 3 and 10 min): a leaked DB pool handle (`allowExitOnIdle: false`) with no `after()` teardown. Test-infra defect, not a product bug. |

**Bottom line: the automated test phase is green at `ba168d0c`.** Every red is either a dead test file, a harness/env
setup requirement, or a hang-after-pass. Which means: **none of the Pass-1 walkthrough findings are covered by any
existing automated test** — the console's UX defects live entirely below the test suite's floor. That is the strongest
argument for the regression pins proposed below.

## 2. Consolidated fix todo (prioritized)

Priorities: **P0** = fix before any real provider touches the platform; **P1** = fix before/at provider-beta;
**P2** = quality-of-life, schedule with back-office Phase 1; **P3** = pending a ruling first. UX ids reference
`PROVIDER_UX_WALKTHROUGH.md`; none of these are started — this is scope, not progress.

### P0 — trust/data-loss/money (5 items)

- [ ] **Fix Logout in the provider console** (walkthrough B1). `/api/logout` is swallowed by the SPA catch-all; session survives. Make logout actually terminate the session and land somewhere sane. *Owner: console/back-office. Add a regression pin: logout → session cookie invalid.*
- [ ] **Give the pending application a permanent home** (B2 + B5 + F11 + I3 — one work item). `/provider-status` must be linked (dashboard tile + `/become-provider` redirect when an application exists), the wizard must stop offering a blank re-fill to an already-applied user, and the raw-JSON duplicate toast goes away as a side effect. *Owner: back-office Phase 1; pairs with ruling Q3.*
- [ ] **Make the wizard's save promise true — or remove the promise** (B3). Persist wizard state (localStorage or server draft) across reload, or stop claiming "everything you enter is saved." *Owner: onboarding.*
- [ ] **Reject non-positive prices at both client and server** (B4). `-50/hr` currently reaches a `Submitted` listing. Server-side floor on the service-create/update endpoints + client field validation. *Owner: catalog; sigma to confirm the DB layer; add a regression test (see §3).*
- [ ] **Close the post-signup double-submit gap** (F3). After in-wizard account creation, either auto-submit the registration or show an explicit "one more step — Submit Registration" state; don't reset the terms checkbox silently. *Owner: onboarding. (Note: commit `a8d59b2` on current main — "guests no longer lose their application at submit" — may already touch this path; re-verify at head before scoping.)*

### P1 — pre-beta (7 items)

- [ ] **Unsaved-work guard on the service form** (F2) — port the expert workspace's three-layer guard. *Owner: catalog.*
- [ ] **Name the step-3 blockers and scope the attestations** (F1) — show which required attestations are missing instead of a dead Next; pending ruling **Q5** on whether insurance/licenses apply to all 60 offering types. *Owner: onboarding.*
- [ ] **One status vocabulary for listings** (F5) — pick one of draft/submitted/paused per state and use it in toast, Catalog badge, toggle, and Performance table. *Owner: catalog/console.*
- [ ] **Resolve the 94% vs 70/30 rate copy** (D2, ruling **Q2** first) — then make `/earn` and Money render from the same `fee_bands`-derived source (§8: no literals). *Owner: money surfaces + sigma.*
- [ ] **Inline email validation in wizard step 1** (F4) and consistent required-field marking (F9). *Owner: onboarding.*
- [ ] **Human-readable error toasts** (F10) — map API errors to copy; never render `{"message":…}` or a bare 500 to a provider. *Owner: console shell (one toast layer fixes all instances).*
- [ ] **Filter the offering picker by the chosen category and unify category vocabulary** (F6) — "Transportation" / "Transportation & Logistics" / "Transportation & Driving" should be one name; picker should respect the `?category=` it was launched with. *Owner: catalog.*

### P2 — schedule with back-office Phase 1 (6 items)

- [ ] **Market-aware Neighborhoods selector** (F7) — provider's own market first, other cities collapsed/searchable.
- [ ] **Pre-select the wizard's category from the chosen /earn offering** (F8).
- [ ] **Provider-appropriate copy in the signup modal** (F12) — stop pitching trip-planning mid-provider-registration.
- [ ] **Photo upload** (I1) — replace URL-paste with real upload for cover + gallery. *(Inventory shared with sigma §F.)*
- [ ] **Availability layers** (I2) — weekly recurring schedule + blackout dates at minimum. *(Design job for back-office Phase 1; inventory shared with sigma §F.)*
- [ ] **Gate the premature "Share your storefront" affordance** (I4) + align the Money/Earnings station label (D3).

### P3 — blocked on rulings (from the walkthrough's questions block)

- [ ] **Q1**: nine-station IA vs six-station decision — ratify or remediate (D1).
- [ ] **Q3**: fold `/provider-status` into the console vs keep dual surfaces (shapes the P0 status-home fix).
- [ ] **Q4**: Performance benchmark provenance ($280/$450 vs zero data) — if placeholder, label or remove.

### Test-infra todo (from the test phase itself)

- [ ] **Decide the fate of the 4 vitest-orphan test files** (`concierge-suggest-add`, `config-completeness`, `coordination-credit`, `event-coordination`): either add vitest + a CI workflow, or port them to `node:test` like the rest of `server/__tests__`. Until then they are silent non-coverage of four real areas — worse than absent because they look like coverage. *Owner: test-infra.*
- [ ] **Fix the post-pass hang in `console-sigma-reorder-divergence.db.test.ts`** — close the pool (or `--test-force-exit`) so the file can join any future all-suite runner without wedging it.
- [ ] **Make `scripts/create-sessions-table.ts` idempotent** vs an existing primary key (currently errors with `42P16` when the table already exists with its PK).

## 3. Proposed regression pins (so the walkthrough's findings can't return unnoticed)

The entire Pass-1 BROKEN class sits below the current suite's floor. Cheapest durable pins, in the repo's existing styles:

1. **Logout pin** (http.test): authenticated session → `POST`/`GET` logout → assert the session no longer authenticates (`/api/auth/user` 401).
2. **Price floor pin** (db/http test): service create with `price <= 0` → 4xx, no row.
3. **Application-visibility pin** (http.test): user with pending `provider-application` → the status data is reachable via a stable authenticated endpoint, and re-`POST /api/provider-application` → 409 with a typed error body (not a raw message string).
4. **Wizard-persistence pin** — only after the B3 fix decides its mechanism (localStorage vs server draft).

These belong to whoever picks up the P0 items — filed here so the fix and its pin land together, per the repo's
guard-with-the-fix convention.

---

## Addendum — auth route-gates result

`app-routes` + `auth-routes` (with `PW_AUTH_SETUP=1`, ci-users seeded): **see final session summary** — the batch was
still running when this file was committed; the outcome is recorded in the session log and, if red, belongs in the
test-infra todo above. (First attempt failed only in `global-setup` because `scripts/seed-ci-test-users.ts` had not been
run — an env requirement, not a product failure.)
