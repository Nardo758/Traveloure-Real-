# Operating procedure — how lanes are built, landed and published

Ratified by the decision-maker on 2026-09-06 after a day that landed PRs #794–#819. This file
is the standing configuration for every Claude Code session on this repository. CLAUDE.md
carries the *architecture*; this file carries the *way of working*. A session reads both.

## 1 · Roles, and which model does what

| Role | Who | Never |
|---|---|---|
| Coordinator | The interactive session (Fable when that is what the user opened) | Writes code, runs test suites, or lands PRs itself. It reads reports, dispatches lanes, relays results, and holds the decision log. |
| Build lane | **Opus** subagent, one per lane, own git worktree | Touches another lane's worktree or the main checkout |
| Landing | **Sonnet** subagent, one per PR, in the lane's own worktree | Weakens a test, rebases, amends, force-pushes, pushes an empty commit |
| Review | Opus subagent, read-only | Edits anything |
| Production QA | Claude in Chrome, from a written dispatch | Publishes, purchases, hires, or presses "Draft it with AI" on a real plan |
| Replit Agent | Opens PRs from a `task-*` / `fix/*` branch and stops | Publishes; commits on `main`; pushes to `main` (see `.agents/memory/publish-only-from-main.md`) |
| Operator | The decision-maker | — publishes, from a clean checkout at `origin/main` only, after the preflight passes |

The coordinator's turns are the expensive ones (a long context re-read per wake). Keep them
to dispatch, relay and decision.

## 2 · Usage hygiene (why the roles above are shaped this way)

- **Do not subscribe the coordinator to PR events.** A landing agent polls once and reports.
  Gate comments arrive ~20 per CI run per PR and each one is a full coordinator turn.
- **One agent per PR.** The build lane merges `origin/main`, waits for CI and merges its own PR
  when it is a small lane; a separate landing agent is for lanes whose author has finished.
- **A fresh session per wave.** The build-order artifact and `docs/DECISIONS.md` hold
  everything a new session needs; a day-long context is the cost, not the value.
- **Worktrees never share Vite's dependency cache.** Give each worktree its own
  `node_modules` (a tree of per-package symlinks plus a real `.vite`), never one bare symlink —
  a shared cache poisons sibling dev servers with `/@fs` 403s and blank pages.
- **Delete regenerable `node_modules` from stale worktrees** when disk fills; never source.

## 3 · Lane brief — what every build lane is told

- Branch `task-<slug>` off `origin/main` in `/home/user/wt-<slug>`; never `main`; never the
  shared checkout.
- Commit trailers, exactly, on every commit:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: <the session URL>`. No model identifier anywhere in repo artifacts.
- PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` and the
  session URL on its own line. Fill the merge write-back checklist truthfully.
- One `docs/DECISIONS.md` row per lane, keyed `YYYY-MM-DD-<kebab-slug>` (never a number,
  never a renumber). CLAUDE.md delta only when a ruling is executed or amended.
- **Every new test is wired into `build.yml` in a job that runs `npm ci`** — never a
  "Node built-ins only" guard job (a test that imports `shared/` pulls in `zod`; #812 lost a
  CI cycle to this).
- **A new Playwright spec wired into a workflow needs a `spec-green:` line in the PR body**
  pointing at a genuinely green run of the final spec code; the arming gate re-runs on body
  edit. Prefer extending an armed spec.
- **Every static pin derives from the file SET** (comments stripped), never a literal
  call-site count or a single-file literal. A pin that breaks because main moved code is
  repaired to assert the invariant, never deleted.
- Chromium is pre-installed at `/opt/pw-browsers` (the config's
  `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` hook); never `playwright install`.
- Run the DOM gates that touch your surface locally before pushing; the rail-actions gate
  found a production regression (#810's Finalize chooser) that no static pin could see.

## 4 · Landing procedure (serial, one PR at a time)

1. `git fetch origin main <branch>`; merge `origin/main` into the branch with a **merge
   commit**. `docs/DECISIONS.md` resolves as a **union** (its driver runs locally, not on
   GitHub — a GitHub conflict badge on a ledger-appending PR is usually this and nothing
   else; verify with `git merge-tree --write-tree`). CLAUDE.md keeps Locked Decisions in
   numeric order. `build.yml` keeps **both** sides' appended jobs and `TSC_BASELINE: '132'`.
2. Validate on the merge commit: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"`
   ≤ `TSC_BASELINE`; `npm run build`; `node scripts/check-decision-guards.cjs`; the guards the
   lane touches with their `--self-test`; the lane's suites plus the slip suites it borders;
   `grep -c replit.local package-lock.json` = 0; playwright `hardcoded-links` +
   `dynamic-links` (114/114 at time of writing).
3. Push. Wait for CI with **one long wait** (`timeout 1200 tail -f /dev/null` when `sleep`
   is blocked) — never a 60-second poll loop. Then read check runs once (perPage 100).
   Every run `success` or `skipped`. Cancelled superseded-head runs and docker
   `toomanyrequests` pulls are not PR failures, but the final head must end fully green.
   The Actions rerun API returns 403 for this integration; `update_pull_request_branch` is
   refused when base has no new commits.
4. Merge with method `merge` and `expectedHeadSha` = the verified head. Report the merge sha.
5. Known sandbox limits, stated so nobody "fixes" them: production is unreachable from the
   sandbox (proxy 403); Stripe's script CDN is unreachable, so the finalized-slip case (A10)
   white-screens locally and passes in CI; the GitHub API rate limit is shared across all
   agents (on 403 back off 10 minutes once).

## 5 · Publish procedure (operator)

`docs/RELEASE.md` is authoritative; the short form:

1. `git checkout main && git fetch origin && git reset --hard origin/main`;
   `git status --short` must be **empty**; `git rev-parse --short HEAD` must equal the sha
   the coordinator gave you; `grep -c replit.local package-lock.json` = 0.
2. Run once. Expect the JSON log lines `Migrations complete` (with `appliedCount` matching
   what the release carries) and `[build] commit <sha>`. Migrations apply on boot via
   `runMigrations`; a publish never runs its own SQL.
3. **If the release carries a data migration, run its read-only preview against production
   first and read the output** (e.g. `scripts/preview-category-key-repair.cjs`). The preview,
   not the CI reference run, is the go/no-go — #819's production state differed from the
   reference by seven rows.
4. Republish. The Provision stage's "Development database changes detected / Generating
   database migrations…" is Replit's schema push and always appears. **Decline** only a dialog
   offering DROP, ALTER, a constraint failure, or "copy dev database over production".
5. Verify `/api/version` (`commit` = the sha, `source` = `file`), then hand Chrome the
   re-check dispatch. Chrome stops at step 0 if the sha is wrong.

The build preflight (`scripts/publish-preflight.cjs --strict`, wired into
`npm run build:prod`) enforces step 1 mechanically. A publish from a checkout that is not
`main == origin/main` and clean is the incident of 2026-09-06 (commit `96c39f5` served before
it was on `main`) and is refused.

## 6 · Records

- Build order and landing status: the "After the Finish" artifact (section 7).
- Ratified UI: the "Slip as the Surface" canvas; a canvas claim with no data source is
  redrawn, not built.
- Rulings: CLAUDE.md Locked Decisions (frozen numbers) and `docs/DECISIONS.md` (date-slug
  rows). This file changes only by a decision-maker's word, recorded as a ledger row.
