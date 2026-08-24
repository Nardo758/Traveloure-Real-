# Lane dispatch protocol

Standing rules for subagent build lanes ("lanes") working this repo in isolated git
worktrees. The integrator authors each lane brief; these clauses are mandatory in every
brief and are ledgered in `docs/DECISIONS.md` (rows cited inline).

## 1. Worktree base guard — `[guarded]` (ledger `2026-08-24-worktree-base-guard`)

Every lane brief MUST include the dispatch-time HEAD SHA of the integration branch, and
the lane's FIRST action MUST be:

```bash
bash scripts/check-lane-base.sh <sha-from-the-brief>
```

Non-zero exit = **hard stop**: the lane reports the mismatch and builds nothing. The
worktree base must equal the integration branch's HEAD **at dispatch time** (when
dispatching from `main`, that is `main` HEAD) — never an older commit. Basing at a stale
commit has happened twice (both times `f660ed75`); the second merge was safe only
because the single touched file was identical across bases — luck, not design.

Stated bounds (§18d): this is a lane-runtime guard, not a CI gate. It protects only
briefs that carry the SHA and order the check first; the integrator's brief template is
the enforcement point.

## 2. Tree canonicality (ledger `2026-08-24-client-tree-canonical`)

`client/src` is the **sole production client**. `artifacts/traveloure` is a **design
reference only** — never a lane write target, never a deploy target, and `client/src`
never imports from `artifacts/`. Transcribe designs inward; do not edit the reference
tree to match `client/src`.

## 3. Existing standing clauses (recap — briefs must still carry them)

- Commit early and often; never push — the integrator merges (`--no-ff`), verifies,
  ledgers, pushes.
- No `npm install` (lockfile purity, CI-gated).
- Revert every environment hack (playwright config, imageValidation stubs, scratch
  scripts) before the final commit.
- Verify before finishing: `npx tsc --noEmit` adds zero errors over the brief's stated
  baseline; client units add zero failures; report exact before/after counts.
