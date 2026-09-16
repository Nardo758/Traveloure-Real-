# Lane report — CI: main red on two guards + one §15 race (one lane, three commits)

**Ledger row:** `2026-09-16-ci-main-red-repairs`
**Punchlist:** V-34 filed AND struck CLOSED in this PR (a §15 defect found by a whole-directory run)
**Base:** `origin/main` @ `0de20e07e` (the merge of ledger `2026-09-15-orphans-t4-t7-red-suites`)
**Schema/migration:** none. No column, no CHECK, no index, no backfill, no route, no rail, no amount, no fee, no rate.

---

## 1. What each guard MEANT, and why main was red

### (a) `check-env-allowlist.cjs` (c) — "targets a real deployment" is a FILE-level predicate

Read the predicate before touching anything. `targetsDeployment()` runs over the whole workflow file
(comments stripped) and answers true on ANY of: a `*BASE_URL` bound to `${{ secrets.* }}`/`${{ vars.* }}`
or to an `https://` literal; an `environment:` gate; or **a JOB KEY whose name contains `deploy` or
`production`**. `build.yml` has `artifact-deploy-guard:` — a guard SCRIPT job, not a deployment — and
that alone makes the entire 3,100-line file "deploy-targeting". On such a file `referencesAllowTestAccounts()`
is FAIL-CLOSED: the token may not appear in any form (YAML assignment of any value, shell
assignment/export, `${{ }}` interpolation, `env NAME=… cmd`) except on a pure `#` comment line.

Ledger `2026-09-15-orphans-t4-t7-red-suites` added `suite-mutation-auth` and
`suite-ai-draft-and-availability` to `build.yml`. Both boot the **production bundle**
(`node dist/index.cjs`, `NODE_ENV=production`) against a throwaway Postgres, and that boot needs
`ALLOW_TEST_ACCOUNTS: '1'` for `server/index.ts`'s P0 purge fail-safe. Two legitimate throwaway-DB
boots, in the one file the guard will never allow them in.

**Decision: fix the WORKFLOW, keep the GUARD.** The guard's file scope is arguably coarse
(`artifact-deploy-guard` deploys nothing), but the brief's bar for narrowing it — "provably file-scoped
where it should be job-scoped" — is not met by a case the repo already has a sanctioned answer for:
`cart-priceless-listing-gate.yml`'s header says in so many words that every server-booting gate lives
in its own file BECAUSE `build.yml` carries a deploy signal, and fee-preview, publish-gate,
payout-parity and the route gates all do exactly that. Narrowing a fail-closed P0 guard to job scope
to save two files would weaken the rule the brief says never to weaken. So both jobs moved — **job key
and `name:` byte-identical**, so the check-run names a reviewer sees do not change — into
`.github/workflows/suite-mutation-auth.yml` and `.github/workflows/suite-ai-draft-and-availability.yml`
(triggers/concurrency/permissions mirror the other gates). `build.yml` keeps a pointer comment that
forbids adding a server-booting job to it. `check-test-files-wired.cjs` scans every workflow file, so
the ten suites those jobs run are still wired (`test-orphan-ratchet: OK`).

### (b) `generate-mutation-auth-manifest.ts --check` — bytes are not rails

`--check` regenerated both files and compared them **byte-for-byte** against the committed copies.
Every mutation carries `line` (the registration's line in its source file), so the first merge after
the check landed shifted lines in mounted route files and produced **513 line-only diffs, zero rail
changes** (confirmed: every `-`/`+` pair in the diff is `"line": N`). A guard that is red on every merge
is a guard nobody reads.

**Fix:** the predicate is now ONE pure module, `scripts/mutation-auth/manifest-drift.ts`. A rail is
`METHOD | normalized path | mount source | risk | expectedAuth | sorted roles | boundary | ownership |
ownership-applies`, compared as a **multiset** (so a lost or gained shadow registration — the monolith
copy over a router twin — is drift too). `line`, `rawPath` (trailing-slash spelling) and per-mutation
`diagnostics` stay in the files for humans and are OUT of the predicate. Stale line numbers print a
`::notice::`, never a failure. The generator's header states this. `--self-test` (§18d) runs seven
fixtures immediately before the check in the new workflow: a line-only shift PASSES; a new,
removed or re-guarded rail FAILS; role order is not drift; a lost duplicate registration is.
**Stated negative space:** a handler that changed with no change to its guard chain, method, path or
mount file is invisible to this predicate — that is `check-money-endpoints.cjs`'s job.

The manifest is regenerated on this branch (584 registrations, 575 unique pairs, category and
boundary totals unchanged — `scripts/mutation-auth/extractor.test.ts` still 4/4).

### (c) `updateDailyRevenueSummary` — a §15 check-then-insert (V-34)

`server/storage.ts`: `SELECT` the day's row, then `UPDATE` it or `INSERT` it. Two writers on a date
with no row yet both read "absent", both `INSERT`, and the loser dies on
`daily_revenue_summary_date_unique`. `suite-server-routes-migrations` runs the three revenue-dedup
vitest suites in **parallel worker processes** against a fresh database; each one's first genuine
`insertPlatformRevenueOnce` rolls TODAY's row up through this writer within milliseconds of the
others. Production creates a day's row once and updates it thereafter, which is why this never
surfaced there.

**It did not reproduce locally** — three runs of the job's exact vitest line against the unfixed writer
were 19/19 green each. The window is narrow; that is stated here rather than hidden (§13). The proof
is therefore **deterministic**: `server/migrations/__tests__/daily-revenue-summary-upsert.test.ts` U1
races eight first-writers on a per-run date in 1901–1983 that nothing else touches, and against the
pre-fix writer fails with exactly `duplicate key value violates unique constraint
"daily_revenue_summary_date_unique"` (4 of 8 landed). U2 pins that every racer receives the date's
row; U3 pins that an omitted increment adds 0 and never NULLs the sum.

**The exact upsert** (drizzle; SQL it emits in prose):

```sql
INSERT INTO daily_revenue_summary (date, total_gross, total_platform_fee, total_net, transaction_count, …)
VALUES ($date, $gross, $fee, $net, 1, …)
ON CONFLICT (date) DO UPDATE SET
  total_gross        = COALESCE(daily_revenue_summary.total_gross, 0)        + excluded.total_gross,
  total_platform_fee = COALESCE(daily_revenue_summary.total_platform_fee, 0) + excluded.total_platform_fee,
  total_net          = COALESCE(daily_revenue_summary.total_net, 0)          + excluded.total_net,
  transaction_count  = COALESCE(daily_revenue_summary.transaction_count, 0)  + 1,
  updated_at         = now
  -- any other caller-passed column: = excluded.<col> (the previous overwrite semantics)
RETURNING *;
```

Same shape the cart-confirm rollup in `confirmCartBookingRevenue` already used in the same file
(§18 rule 1: two rollups, one shape). The UNIQUE constraint the old code tripped over is the one the
upsert targets — **no schema change**. `COALESCE` because the `total_*` columns are nullable
(default `"0"`) and a NULL running sum would swallow every later increment.

The proof is wired into the **same** `suite-server-routes-migrations` vitest run line as the three
dedup suites — the parallel shape that exposed the race. That line with all four files: 3× green
locally, 22/22 each. `booking-auto-complete.db.test.ts` (the other consumer of this table, run by
`scheduler-jobs-gate.yml`) green.

---

## 2. Validation (on the merge commit)

See the PR body table (tsc baseline, build, decision guards, money guards self-test + scan, fee gate,
wired-ratchet self-test + scan, duplicate-prefix guard, env-allowlist self-test + scan, manifest
self-test + check, the lane's suites, lockfile purity).

## 3. Not done, deliberately

- The guard `check-env-allowlist.cjs` is unchanged — see §1(a) for why narrowing it was refused.
- `scripts/mutation-auth/{extractor,coverage}.test.ts` stay unwired, as the prior lane left them.
- MONEY_MAP F-4's divergence (the raw cart-confirm `INSERT INTO platform_revenue` not calling this
  writer) is pre-existing, annotated in both files, and untouched.
- PR #949 (`task-d24-acceptance-columns`) is repaired in place on its own branch, not here.

## 4. Proposed CLAUDE.md sentence (NOT applied — CLAUDE.md is never edited by a lane)

Under **Coordination Prevention**, beside the migration rules: *"A CI job that boots the server bundle
with `ALLOW_TEST_ACCOUNTS=1` gets its OWN workflow file, never a `build.yml` job — `check-env-allowlist.cjs`
(c) is file-scoped and fail-closed, and `build.yml` carries a deploy signal (`artifact-deploy-guard`).
And a generated-inventory drift check compares the INVENTORY (rails, guard sets), never the bytes: line
numbers are for humans and are out of the predicate (ledger `2026-09-16-ci-main-red-repairs`)."*
