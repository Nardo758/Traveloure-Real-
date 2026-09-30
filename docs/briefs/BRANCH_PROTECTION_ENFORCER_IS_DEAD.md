# The branch-protection enforcer has failed every run since at least 2026-08-30

**Found 2026-09-22 while working board #713 / #786 / #787 / #790 (the "require the gates" cluster).**
**Supersedes all four of those tasks** — doing what they ask would have been a no-op that looked
like progress. Nothing is fixed here; the repair is an OPERATOR step, named below.

## The finding

`.github/workflows/enforce-branch-protection.yml` reads `.github/branch-protection.json` and PATCHes
the required status checks onto `main`. **It has never succeeded in any run I can see.** The eight
most recent runs are all `failure`, spanning **2026-08-30 → 2026-09-22**, including run **853**,
which fired right after PR #1034 merged.

The cause is exact and is the one the workflow's own header predicts:

```
Applying required status checks to branch: main
Contexts: [ "build (vite + esbuild bundle)", … 13 contexts … ]
gh: Resource not accessible by integration (HTTP 403)
{"message":"Resource not accessible by integration",
 "documentation_url":".../branch-protection#update-status-check-protection","status":"403"}
```

Updating branch protection needs repo **administration** rights, which a `GITHUB_TOKEN` cannot be
granted. The workflow authenticates with `secrets.BRANCH_PROTECTION_PAT` and falls back to
`secrets.GITHUB_TOKEN` *"only so the failure mode without the PAT is a clear 403 … not a
missing-env crash"*. That is precisely what is happening: **the PAT is absent (or lacks
`administration`), so every run 403s.**

## Why it went unnoticed for three weeks, which is the reusable part

Three things compound, and each alone would have been survivable:

1. **The enforcer is not itself a required check** — by its own deliberate design (*"This workflow
   APPLIES required checks; it does not itself need to be a required check"*). So its failure blocks
   no merge and appears in no PR's check list.
2. **It only runs on pushes to `main` touching three paths**, so it fires rarely and its failures
   never sit beside a PR anyone is reading.
3. **`CI_GATES.md` never mentions `BRANCH_PROTECTION_PAT`.** The document an operator reads to
   manage gates does not say the secret exists, so its absence is not a checklist item anyone could
   have missed — it is not on any checklist.

This is the §18d shape one level up: not a predicate that cannot fail, but a predicate that **fails
loudly into a place nobody looks**.

## What this means for the four board tasks

| Task | What it asks | Reality |
|---|---|---|
| **#790** | "Require remaining Tier 1 gates" | **Already satisfied in the FILE** — CI_GATES.md declares 13 Tier-1 contexts and `branch-protection.json` lists exactly those 13, with zero drift in either direction. Landed by PR #1034. |
| **#713** | Require the footer-link gate | Would add a line to a file no automation applies |
| **#787** | Require the neighborhood gate | Same |
| **#786** | Require remaining Tier 2 checks | Same |

**So editing `branch-protection.json` today changes nothing that is enforced.** The four tasks are
not wrong about what SHOULD be required; they are written against a mechanism that is not running.

**Protection IS live on `main`** — PRs sit `blocked` until their checks pass, and #1036 became
mergeable only as the last required context went green. So the contexts were applied at some point,
by hand or by a run predating this window. That is the danger: **the live protection and the
declared file agree today by luck, not by mechanism, and nothing will tell anyone when they stop
agreeing.**

## The green baseline the four tasks need — measured, since it is cheap and will be wanted

Over the last ~25 runs of each workflow (all since 2026-09-21, so deep in runs and shallow in
calendar time — stated rather than overclaimed):

| Gate | Workflow | Completed runs | Green | Failures |
|---|---|---|---|---|
| `footer-links-smoke (Playwright DOM gate)` | `footer-links-gate.yml` | 23 | **23** | 0 |
| `verify-neighborhoods (logic gate, no DB)` | `neighborhoods-gate.yml` | 23 | **23** | 0 |
| `e2e-selection-controls (DOM gate)` | `selection-controls-gate.yml` | 22 | **22** | 0 |
| `lockfile-purity (no replit.local)` | both of the above | 22–23 | all | 0 |

The only non-successes are `cancelled` (the documented `cancel-in-progress` supersession) and one
`queued`. **All four meet CI_GATES.md's own Tier-2 → Tier-1 bar** — *"promote to Tier 1 as each gets
a passing run"*. The promotion is correct; it just cannot take effect yet.

## The fix, in order

1. **OPERATOR, and it is the only step that unblocks the rest:** create a repo-scoped PAT with the
   `administration` scope and store it as the repository secret **`BRANCH_PROTECTION_PAT`**. Then
   re-run `enforce-branch-protection.yml` via `workflow_dispatch` and confirm it goes green.
2. **Verify the applied set matches the declared 13** once it runs — that is the first time the two
   will have been reconciled by machine rather than assumed equal.
3. **Then** promote the four Tier-2 contexts (#713 / #787 / #786) by adding them to
   `branch-protection.json` and moving their rows to the Tier 1 table. The baseline above is the
   evidence the doc asks for.
4. **Make the failure visible**, so this cannot recur silently. The cheapest honest option: document
   `BRANCH_PROTECTION_PAT` in CI_GATES.md as a prerequisite, so its absence is a checklist item.
   Making the enforcer a required check is NOT the answer — it runs on `main` pushes, not PRs, so it
   cannot be a PR gate.

## The `lockfile-purity` subtlety, already flagged by the doc and still true

That job name exists in **both** `selection-controls-gate.yml` and `neighborhoods-gate.yml`.
CI_GATES.md warns that requiring the context once covers only one workflow. Whoever does step 3
should decide deliberately which workflow's context is the required one — or require it from both —
rather than adding the string and assuming it covers both.

## Negative space

This brief changes no file, requires no migration and enforces nothing new. It deliberately does
**not** add the four contexts to `branch-protection.json`: doing so while the enforcer 403s would
close three board tasks, produce a green diff, and leave the repository exactly as protected as it
is now — which is the failure mode the tasks were written to prevent.
