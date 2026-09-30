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

### Tier 2 — RECOMMENDED (add once a green baseline exists)

These are safe to require but may need one green CI run first to establish the baseline before
enforcement. Promote to Tier 1 as each gets a passing run.

| Status context string | Workflow file | What it catches |
|---|---|---|
| `verify-neighborhoods (logic gate, no DB)` | `neighborhoods-gate.yml` | Phase 8.3 neighborhood logic (16 assertions, pure script) |
| `e2e-selection-controls (DOM gate)` | `selection-controls-gate.yml` | Full DOM render/narrow/parity/tab-isolation for selection controls |
| `lockfile-purity (no replit.local)` | `selection-controls-gate.yml` **or** `neighborhoods-gate.yml` | package-lock.json must not contain Replit firewall URLs |
| `footer-links-smoke (Playwright DOM gate)` | `footer-links-gate.yml` | Every configured footer link resolves without rendering the NotFound page |

> **lockfile-purity note:** This job name exists in both `selection-controls-gate.yml` and
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

> ### ⚠️ PREREQUISITE — `BRANCH_PROTECTION_PAT`, and it is currently MISSING
>
> `.github/branch-protection.json` is applied to `main` by
> `.github/workflows/enforce-branch-protection.yml`. Updating branch protection requires repo
> **administration** rights, which a `GITHUB_TOKEN` cannot be granted, so that workflow
> authenticates with the repository secret **`BRANCH_PROTECTION_PAT`** (a repo-scoped PAT carrying
> the `administration` scope) and falls back to `GITHUB_TOKEN` only to make the failure legible.
>
> **As of 2026-09-22 that secret is absent, and the workflow has failed every run since at least
> 2026-08-30** with `Resource not accessible by integration (HTTP 403)` — including the run right
> after PR #1034 merged. **While that is true, editing `branch-protection.json` changes nothing
> that is enforced:** the file is a declaration, not an enforcement, and any protection live on
> `main` was applied by hand.
>
> It went unnoticed because the enforcer is deliberately **not** itself a required check, it runs
> only on `main` pushes touching three paths, and — until this note — this document never mentioned
> the secret, so its absence was on nobody's checklist.
>
> **Fix:** create the PAT, store it as `BRANCH_PROTECTION_PAT`, re-run the workflow via
> `workflow_dispatch`, and confirm the applied set matches the declared one. Full write-up:
> `docs/briefs/BRANCH_PROTECTION_ENFORCER_IS_DEAD.md`.
>
> Until then, steps 1–6 below (the manual UI route) are the ONLY way a gate actually becomes
> required.

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
