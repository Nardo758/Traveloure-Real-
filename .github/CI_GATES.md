# CI Gates — Required Status Check Decision

This document is the single source of truth for which CI jobs are (or should be) required
branch-protection checks on `main`, and why. Update it whenever a new gate workflow is added.

---

## How GitHub branch protection works

In GitHub → Settings → Branches → Branch protection rules → "Require status checks to pass
before merging", you enter the **exact** status context string. That string is the value of
the `name:` field on the _job_, not the workflow. `report` jobs are always informational and
must never be added.

---

## All gates — status contexts and tier

### Tier 1 — REQUIRED (block merges today)

These are fast, deterministic, or cover regressions that have already shipped once.
Add all of them to branch protection now.

| Status context string | Workflow file | What it catches |
|---|---|---|
| `build (vite + esbuild bundle)` | `build.yml` | JS syntax / bundling errors — app cannot start |
| `money-endpoint-guard (CLAUDE.md §14)` | `build.yml` | Client-trusted amounts/identity in money handlers |
| `claims-only-lookup-guard (session-user extraction)` | `build.yml` | Claims-only `claims.sub` session-user reads under server/ without an `.id` fallback (false 403s for OAuth users) |
| `navbar-links-smoke` | `navbar-links-gate.yml` | Broken nav links; href in nav-config with no matching Route |
| `hardcoded-links-check` | `navbar-links-gate.yml` | Hardcoded `href`/`to` literals in components pointing at deleted routes |
| `app-routes-smoke (Playwright DOM gate)` | `app-routes-gate.yml` | Every `<Route>` in App.tsx renders content (not 404 / blank) |
| `auth-routes-smoke (Playwright DOM gate)` | `auth-routes-gate.yml` | Role-gated pages don't crash when a real session receives real API data |
| `verify-selection-controls (logic gate)` | `selection-controls-gate.yml` | Narrowing + parity logic for selection controls (32/32 assertions) |
| `verify-service-offering-types (HTTP count gate)` | `service-offering-types-gate.yml` | /earn catalog row-count floors (guards silent migration wipe-out) |
| `earn-page-smoke (Playwright DOM gate)` | `service-offering-types-gate.yml` | /earn page renders at least one catalog card per role |
| `relevance-dominance (pure unit)` | `upsell-trust-contract.yml` | Revenue-reordering bug in upsell engine; pure unit, zero flakiness |
| `ci-db-setup-lint (no inline migration steps)` | `ci-db-setup-lint.yml` | Guards the composite action contract — detects inline `migrate-entry.ts` / `create-sessions-table.ts` run steps in any of the 6 Playwright workflow files |
| `test-file-reachability (ratchet - new orphans fail)` | `build.yml` | A test file no workflow command can reach. Ratchets against `scripts/test-orphan-baseline.txt`: a NEW orphan fails, and a baseline row since wired or deleted fails until its line goes. The baseline is RECORDED DEBT and may only shrink — it exempts nothing (`2026-09-14-test-files-wired-orphans`). Blind to `e2e/` by ruling, and to runners reached through constructs its tokenizer does not model. |
| `suite-mutation-auth (server/__tests__/mutation-auth — live authorization probes, DB + app)` | `build.yml` | Every mutation route answers anonymous / wrong-role / wrong-owner callers as its manifest says (already required; row added for completeness) |
| `unit-suite-shared (shared/__tests__ — whole directory)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `unit-suite-server-units (server utils · seeds · travelpayouts · trend-engine — whole dirs)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `unit-suite-client-lib (client/src/lib/__tests__ — whole directory)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `unit-suite-client-components (client component __tests__ — whole directories)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `migration-chain-integrity (DECISIONS.md rulings 19, 27)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `lockfile-purity (no replit.local)` | `selection-controls-gate.yml` / `neighborhoods-gate.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `guard-batch (26 grep/logic guards — each a named step)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `suite-server-services (server/services/__tests__ — DB-backed)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `suite-server-routes-migrations (server/routes/__tests__ + server/migrations/__tests__ — DB-backed)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `traveler-charge-composition (docs/ROADMAP.md §A A3 — the commission is never billed to the buyer)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `concierge-fee-split (Locked Decision 51; ledger 2026-09-18-concierge-fee-cap-split)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `one-trip-write-resolver (V-29; ledger 2026-09-15-v29-one-trip-write-resolver)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `slip-card-integrity (slip is live, finalized plan is not re-routed, expert must exist)` | `slip-card-integrity-gate.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `booking-birth-provenance (rulings 41/46; ledger 2026-09-12-booking-birth-holes)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `slot-units (V-26; ledger 2026-09-15-v26-slot-units)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `from-state-guards (V-23/V-24/V-25b; ledger 2026-09-15-v23-v25-from-state-guards)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `reconciliation-detection (§17; ledger 2026-09-12-readymade-reconciliation-rail)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `legacy-rail-traveler-charge (2026-09-08-legacy-rail-fee — the same fix on the legacy rail)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `transport-payment-intent (punchlist R-1; ledger 2026-09-14-transport-confirm-stamps-pi)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `acceptance-rails (D-24..D-27, D-32..D-40; four ledgers, see comment)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `plan-proposals (D-19; ledger 2026-09-15-d19-plan-proposals)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `quote-born-charge (LD 49's charge lane; ledger 2026-09-18-quote-born-charge)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `leads-door-and-trip-read-gate (V-32, V-33; ledger 2026-09-15-v32-v33-leads-door-item-read-gate)` | `build.yml` | Promoted 2026-09-27 (ledger `2026-09-27-required-checks-promotion`, R153): ≥95% pass over Sep 20–27 |
| `supply-demand-e2e` | `supply-demand-e2e.yml` | Promoted 2026-09-27 (ledger `2026-09-27-supply-demand-e2e-required`, R169): 59/61 job runs green Sep 20–27 excluding the three while the harness was being written (59/64 = 92.2% counting them); both remaining failures were harness races since fixed (R159, `2026-09-27-s1-login-must-land`). Runs on EVERY PR (no `paths:` filter) — a required check a PR never triggers leaves it waiting forever. |

### Tier 2 — RECOMMENDED (add once a green baseline exists)

> **Held optional by R153 (2026-09-27):** `suite-server-tests (server/__tests__ as a class — DB + app)` passed 93.4% over Sep 20–27
> (below the 95% bar). Its 19 failures (6 on `main`, 13 on PRs) must be triaged into real breaks vs flakes by
> **2026-10-04**; if they are not, it is an UNOWNED suite and ownership is assigned before anything else is
> promoted from it. `footer-links-smoke`, `verify-neighborhoods` and `e2e-selection-controls` stay here for one
> more week of observation.

These are safe to require but may need one green CI run first to establish the baseline before
enforcement. Promote to Tier 1 as each gets a passing run.

| Status context string | Workflow file | What it catches |
|---|---|---|
| `verify-neighborhoods (logic gate, no DB)` | `neighborhoods-gate.yml` | Phase 8.3 neighborhood logic (16 assertions, pure script) |
| `e2e-selection-controls (DOM gate)` | `selection-controls-gate.yml` | Full DOM render/narrow/parity/tab-isolation for selection controls |
| `footer-links-smoke (Playwright DOM gate)` | `footer-links-gate.yml` | Every configured footer link resolves without rendering the NotFound page |

> **lockfile-purity note (now Tier 1):** This job name exists in both `selection-controls-gate.yml` and
> `neighborhoods-gate.yml`. GitHub tracks status contexts per-workflow/job combination, so
> adding the status context once will only cover one workflow. Add it from the workflow that
> runs on every PR (both do). If you require it from one workflow, the other's `lockfile-purity`
> job will still run but won't block merges unless both contexts are listed.

### Tier 3 — INFORMATIONAL (never block merges)

| Status context string | Workflow file | Why not required |
|---|---|---|
| `e2e-journey-2 (Stage 3 exit gate)` | `selection-controls-gate.yml` | Longer journey test; monitor for flakiness before requiring |
| `e2e-deploy-smoke (deployed app; non-blocking)` | `e2e-deploy-smoke.yml` | Runs against live deployment, not the PR artifact; self-described non-blocking |
| `Playwright E2E Tests` | `e2e-tests.yml` | Deploy-triggered (Model B); runs against the deployed app post-deploy, not on PR |
| `report (PR comment)` | all workflows | PR comment only; no assertions |
| `report (PR completion comment)` | `selection-controls-gate.yml` | PR comment only |

---

## How to configure branch protection

> ### How it is applied — `BRANCH_PROTECTION_PAT` (working since 2026-09-22)
>
> `.github/branch-protection.json` is applied to `main` by
> `.github/workflows/enforce-branch-protection.yml` on every push to `main` that touches it. That
> needs repo **administration** rights, which a `GITHUB_TOKEN` cannot be granted, so the workflow
> authenticates with the repository secret **`BRANCH_PROTECTION_PAT`**. The secret was added on
> 2026-09-22 and every enforcer run since has succeeded; the earlier "enforcer is dead" brief
> (`docs/briefs/BRANCH_PROTECTION_ENFORCER_IS_DEAD.md`) is SUPERSEDED. The applied set can be read
> back without credentials: `GET /repos/Nardo758/Traveloure-Real-/branches/main` →
> `protection.required_status_checks.contexts`. Read it back after a change rather than assuming.
>
> The manual UI route below remains for an emergency only; a hand edit is overwritten by the next
> enforcer run.

1. Go to **GitHub → repository → Settings → Branches**
2. Click **Edit** on the `main` branch protection rule (or create one)
3. Check **"Require status checks to pass before merging"**
4. In the search box, paste each Tier 1 status context string exactly as written above
5. Repeat for any Tier 2 checks you want to enforce
6. Save

> GitHub only shows status contexts that have already reported at least once on that repo.
> If a context doesn't appear in the search, trigger a PR to populate it, then add it.

---

## Convention for future gates

When adding a new CI workflow that should block merges:

1. Add a comment block near the top of the workflow YAML listing each blocking job's
   status context and confirming it is safe to require. Follow the pattern in
   `app-routes-gate.yml` and `auth-routes-gate.yml`:
   ```yaml
   # Status context (for branch-protection required checks):
   #   * <exact job name string> — safe to mark as a REQUIRED branch-protection check.
   ```
2. Add the status context to the appropriate tier in this file — and to
   `.github/branch-protection.json` if it is Tier 1. **The string is the job's `name:`
   verbatim**: GitHub reports a check run under that name and nothing else, so a
   descriptive suffix added here or in the JSON is a required context that never
   reports, and every PR sits `blocked` with all checks green.
3. `report` jobs are always informational — never add them as required checks.
4. Fast/pure-logic gates (no DB, no browser) → Tier 1 immediately.
5. DOM/E2E gates that test a fresh local build → Tier 2 until one green run is confirmed,
   then promote to Tier 1.
6. Gates that run against the live deployed app → Tier 3 always (they test the deployment,
   not the PR artifact).
