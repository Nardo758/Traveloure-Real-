---
name: tsc baseline ratchet gap
description: Why a PR merged to main can silently push the tsc error count over TSC_BASELINE, blocking every later PR's gate.
---

The "tsc baseline ratchet (down-only)" job in `.github/workflows/build.yml` checks a PR
branch's own `tsc --noEmit` error count against `TSC_BASELINE`. It does not verify that
merging the PR keeps **main's own live count** at or under that number. A branch that is
clean in isolation can still tip main over the limit if main had already drifted (e.g. a
prior merge introduced errors the branch never rebased onto), or if the branch itself adds
errors that only show up once merged into main's actual module graph.

This happened for real: a PR to audit authorization across mutation endpoints added 3 new
`TS2802` errors (spreading a `Set`, iterating `.matchAll()` without `--downlevelIteration`)
in a test-inventory file, merged clean, and pushed main from 156 to 159 — over its own
ratchet ceiling. Every subsequent PR's tsc gate then failed until someone diagnosed it
(two throwaway git worktrees diffing tsc output pre/post the suspect merge) and shipped a
one-line `Array.from(...)` fix on a dedicated branch off `origin/main`.

**Why:** the gate's implicit assumption — "if my branch is clean, merging is safe" — breaks
whenever main is not exactly the branch's base at merge time.

**How to apply:** if a PR's tsc gate is failing for reasons that don't trace to that PR's
own diff, check whether `origin/main` itself is already over `TSC_BASELINE` from a prior
merge (`git checkout origin/main && npx tsc --noEmit | grep -c "error TS"`) before assuming
the current PR's code is at fault. Never bump `TSC_BASELINE` upward to paper over a
regression — fix the regression on a small branch off `origin/main` and merge that first.
Task #1683 proposes hardening the gate itself so this can't slip through silently again.
