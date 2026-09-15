# Lane report — D-42: the ready-made rail's per-pass tallies are persisted on `reconciliation_runs`

- **Branch:** `task-d42-reconciliation-tallies` (worktree `/home/user/wt-d42`), off `origin/main` at `cc855f9f4`.
- **Ledger row:** `2026-09-15-d42-reconciliation-tallies`
- **Punchlist row:** section 1, **D-42** — ruled **A** by the decision-maker on 2026-09-15.
- **Migration:** `301_reconciliation_runs_ready_made_tallies.sql` (296 reserved; 297–299 landed on
  main; **300 belongs to the parallel D-20/D-21 lane** — re-checked at merge time, see Validation).
- **Governing rules:** CLAUDE.md §13, §17 (esp. rule 2), §18 rule 1, §19, the Coordination
  Prevention / publish-trap / deploy-push durability rules.

## What this lane landed

`reconciliation_runs` carries a per-rail tally column for every rail the drift job scans —
`scanned_payment_intents`, `scanned_charges`, `scanned_refunds`, `scanned_cart_bookings`,
`scanned_legacy_bookings` — **except the ready-made rail**. The D-18 lane computed both of that
rail's per-pass numbers and deliberately did not persist them, saying so in the result type's own
comment; they reached only the manual `run-now` response and the clean-pass log line. So a
SCHEDULED pass left no durable record of how many ready-made purchases it examined, nor of how many
unannounced deliveries it handed back to the shared sender — which is the asymmetry §17 rule 2
exists to prevent (silence must be distinguishable from the job not having run).

Two additive columns close it:

| Column | Type | Written from |
|---|---|---|
| `checked_ready_made_purchases` | `integer`, **nullable, NO DEFAULT, NO CHECK** | `ReconciliationResult.checkedReadyMadePurchases` |
| `ready_made_announce_hand_offs` | `integer`, **nullable, NO DEFAULT, NO CHECK** | `ReconciliationResult.readyMadeAnnounceHandOffs.length` |

Both are written by the **existing run-row writer** (`closeRun`) on **every** pass — completed,
skipped and failed alike (§17 rule 2) — beside the five per-rail columns already in that one
`UPDATE`. There is **no second writer** (§18 rule 1) and **no new run-row insert path**: `openRun`
still opens the row with the columns unset, exactly as it leaves the other tallies unset, and
`closeRun` is the only statement that fills them.

### §13 — NULL is an answer, and it is never 0

There is **NO BACKFILL** and **NO DEFAULT**. Every `reconciliation_runs` row written before this
migration was written by a job that did not count these things at all; a `DEFAULT 0` would claim
that those passes examined **zero** ready-made purchases, which is a fact nobody has — the passes
that ran before the ready-made rail existed did not examine the rail, and the ones after it did
examine it and simply did not record the number. **NULL = NOT TALLIED**, and the admin surface
renders it as "not tallied" rather than as a zero. A genuine 0 (a pass in a quiet window) is a
different fact and is stored as `0`.

This is the one deviation from the punchlist row's own wording of option A, which proposed
`NOT NULL DEFAULT 0`; the decision-maker's ruling as dispatched to this lane is nullable with no
default, for the §13 reason above. It is recorded here and in the ledger row rather than left to be
noticed as a discrepancy.

### Publish-trap / deploy-push posture

- **NO CHECK and NO DEFAULT** — the migration-181/195/273/275/277/279/280/281/282/284/287/295/297
  posture. A CHECK is exactly the publish-time drizzle-push failure the Coordination Prevention
  rules warn about.
- **Both columns are declared in `shared/schema.ts`** in the same commit — per the deploy-push
  durability rule, a DB object the code depends on that `schema.ts` does not declare is dropped by
  Replit's publish-time push and NEVER recreated (the stamped migration will not re-run).
- **No new index.** The one reader is the admin run log, which orders by the already-indexed
  `started_at` and reads these columns off the rows it has.
- **`scripts/preflight-prod-constraints.cjs` needs NO manifest entry** — this migration adds no
  CHECK and changes none, so there is nothing for the preflight's CHECK manifest to cover.

### Read exposure

The two admin SELECTs that name their columns explicitly —
`GET /api/admin/reconciliation/exceptions` (its `lastRun` sub-query) and
`GET /api/admin/reconciliation/runs` — carry the two new columns. The admin page
(`client/src/pages/admin/reconciliation.tsx`) renders them on the "Last recorded run" line. When
`checked_ready_made_purchases` is NULL the line says **"ready-made rail: not tallied on this run"**
instead of a number — the spec's second option, chosen over a bare omission so a reader is not left
inferring that the rail did not run — and it never prints 0 for a NULL. The hand-off count is
rendered only when it is a positive number, on the same reasoning the `promoted` count already
uses: a pass that re-drove an unannounced delivery DID something, and both NULL (never counted) and
0 (counted, none to do) are silent there because neither is that.

### What this lane did NOT change

No detection predicate, no exception kind, no dedupe key, no severity, no rail vocabulary, and not
the announce hand-off itself. `notifyBuyerOfReadyMadeDelivery` remains the ONE writer of
`ready_made_purchases.notified_at` (ledger `2026-09-15-d18-announced-marker`); the job still only
detects and hands off (§17). No money amount, rate or identity is read from a body anywhere in this
lane (§14/§18/§19 untouched).

## Files

| File | Change |
|---|---|
| `server/migrations/301_reconciliation_runs_ready_made_tallies.sql` | NEW — the two additive nullable columns |
| `server/migrations/migration-files.ts` | registry entry for 301 |
| `shared/schema.ts` | declares both columns on `reconciliationRuns` (deploy-push durability) |
| `server/jobs/stripeReconciliation.ts` | `closeRun` writes both; the V-3/D-18 result-type comments updated to say the tallies are now persisted |
| `server/routes/admin.routes.ts` | both reconciliation SELECTs name the two columns |
| `client/src/pages/admin/reconciliation.tsx` | run summary renders them; NULL ⇒ "not tallied on this run", never 0 |
| `server/__tests__/reconciliation-run-tallies.db.test.ts` | NEW — T1–T4 |
| `.github/workflows/build.yml` | the new suite runs in the existing `reconciliation-detection` job |
| `docs/DECISIONS.md` | ledger row `2026-09-15-d42-reconciliation-tallies` |
| `docs/PUNCHLIST.md` | D-42 struck ANSWERED / landed |

## Tests

`server/__tests__/reconciliation-run-tallies.db.test.ts` (Postgres, disposable-DB guard, injected
`StripeReader` — no network, no Stripe key):

- **T1** — a pass that scans a real seeded ready-made purchase writes both tallies on its own
  `reconciliation_runs` row, and they equal the values in the response.
- **T2** — a **clean** pass (nothing in the window) and a **skipped** pass (no Stripe key) each
  still write the run row with the tallies (§17 rule 2).
- **T3** — a row shaped like a pre-migration run (both columns left NULL) reads back NULL, and the
  admin projection emits `null`, never 0.
- **T4** — schema/DB parity: `getTableColumns(reconciliationRuns)` and `information_schema.columns`
  agree on both columns, and both are `is_nullable = YES` with `column_default IS NULL`.

Plus the migration chain-integrity test and the duplicate-prefix guard.

## Proposed CLAUDE.md sentence (NOT applied by this lane)

To §17, appended to rule 2:

> Every per-rail tally the pass computes is written onto that row by the ONE run-row writer —
> including the ready-made rail's `checked_ready_made_purchases` and `ready_made_announce_hand_offs`
> (ledger `2026-09-15-d42-reconciliation-tallies`, migration 301) — and the columns are additive
> **nullable with no default**, because **NULL = not tallied** is the only reading a pre-migration
> run can bear and a stamped `0` would claim a pass examined nothing (§13).

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` (error count) | **129** = `TSC_BASELINE` (129) |
| `npm run build` | PASS |
| `node scripts/check-decision-guards.cjs` | `decision-guards lint OK (0 deferred warning(s))` |
| `node scripts/check-money-endpoints.cjs --self-test` | `self-test OK (37 predicate fixtures)` |
| `node scripts/check-money-endpoints.cjs` | exit 0 |
| `bash scripts/phase2-fee-gate.sh` | exit 0 |
| `node scripts/check-test-files-wired.cjs` | new suite NOT an orphan (orphan count unchanged at 30) |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK (3 grandfathered collisions, unchanged) |
| migration chain-integrity (`server/migrations/__tests__/chain-integrity.test.ts`) | 2/2 |
| `grep -c replit.local package-lock.json` | 0 |
| all migrations from an EMPTY database (local Postgres 16) | 300 applied, 301 included, 0 errors |
| `server/__tests__/reconciliation-run-tallies.db.test.ts` (T1–T4) | **7/7** |
| `server/__tests__/reconciliation-detection.db.test.ts` (N20–N27) | **47/47**, unchanged |
