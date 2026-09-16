# Lane report — T-1 / T-2 / T-3: the green orphan directories are wired

**Branch** `task-orphans-t1-t3-green-directories` · **base** `origin/main` @ `fa23714d9` · **date** 2026-09-15
**Ledger row** `2026-09-15-orphans-t1-t3-green-directories`
**Spec** `docs/lane-reports/2026-09-15-orphan-triage.md` §7, rows **T-1**, **T-2**, **T-3** and its three
cross-cutting notes.

**Lane kind** WIRING, plus exactly one FIXTURE repair. No production source file changed — the only
non-workflow, non-documentation edit in the diff is
`server/routes/__tests__/booking-idor-guard.test.ts`, and no assertion in it was changed, added,
relaxed or skipped.

---

## 1 · The number

```
$ node scripts/check-test-files-wired.cjs        # before (origin/main @ fa23714d9)
test-files-wired: 279/512 reachable; 233 orphan(s)
test-orphan-ratchet: OK — baseline: 233 recorded orphan(s) (debt, not exempt)

$ node scripts/check-test-files-wired.cjs        # after
test-files-wired: 318/512 reachable; 194 orphan(s)
test-orphan-ratchet: OK — baseline: 194 recorded orphan(s) (debt, not exempt)
```

**39 suites closed.** All 39 baseline lines were removed in this PR — the ratchet fails on a stale
entry, so wiring and the baseline edit are one commit by construction.

| lane | directory | suites wired | assertions executed locally |
|---|---|---|---|
| T-1 | `server/utils/__tests__` (2), `server/seeds/__tests__` (1), `server/services/travelpayouts/__tests__` (1), `server/services/trend-engine/__tests__` (1) | 5 | 28 + 9 + 8 + 5 = **50 pass / 0 fail / 0 skip** |
| T-2 | `server/services/__tests__` | **20** of the 21 orphans (see §3) + 7 already-wired re-runs | 315 (`node:test`) + 18 (`vitest`) = **333 pass / 0 fail / 0 skip** |
| T-3 | `server/routes/__tests__` (11 orphans, whole directory = 22 files) + `server/migrations/__tests__` (3) | 14 | 170 (`node:test`) + 19 (`vitest`) = **189 pass / 0 fail / 0 skip** |

## 2 · The three jobs

All three are in `.github/workflows/build.yml`, mirroring the existing shapes verbatim —
`unit-suite-shared` for the no-database one, `ready-made-clone-fields` for the two DB-backed ones
(same Postgres service block, same `./.github/actions/ci-db-setup` composite action; `ci-db-setup-lint`
forbids inline migration steps and none was written).

| job / status context | DB | selectors |
|---|---|---|
| `unit-suite-server-units (server utils · seeds · travelpayouts · trend-engine __tests__ — whole directories)` | no | four whole-directory globs |
| `suite-server-services (server/services/__tests__ — DB-backed)` | yes | 25 named `node:test` files + `vitest run --root . server/services/__tests__/anchor-*.test.ts` |
| `suite-server-routes-migrations (server/routes/__tests__ + server/migrations/__tests__ — DB-backed)` | yes | whole-directory glob for routes + three named `vitest` files for migrations |

**They are NOT added to `.github/branch-protection.json` or the CI_GATES tables**, because no existing
per-suite job is listed in either (`unit-suite-shared`, `unit-suite-client-lib`,
`unit-suite-client-components`, `confirm-honesty`, `ready-made-clone-fields` — none appears). The brief's
instruction was to mirror the precedent and not invent a tier; the precedent is that suite jobs are not
required contexts.

**Seven already-wired files in `server/services/__tests__` are re-run here.** That is the
`2026-09-14-test-files-wired-orphans` precedent: a per-file job is a ledger-named record of why that pin
exists and stays exactly where it is.

## 3 · Two corrections this lane owes the triage report

Both were found by running what it proposed, and both are written back into
`docs/lane-reports/2026-09-15-orphan-triage.md` beside its lane table.

**(a) `server/services/__tests__/content-matching.test.ts` is an HTTP suite, not a DB one — and it stays
orphaned.** Six of its nine tests `fetch("http://localhost:5000/api/content-match?…")`. The triage
report's §3 bucket row credits `server/services/__tests__` with **0 HTTP-GREEN**, so this file was
counted among its 9 DB-GREEN; in a job with a database and no app it fails with `fetch failed`. None of
these three jobs boots the app, so wiring it would put a red in a green job. **Its baseline line stays**,
and it is the reason `suite-server-services` names its 25 files instead of globbing 26: a suite leaves
the orphan list by being RUN or by being GONE, never by being hidden inside a job that cannot execute it
— which is the V-30 shape exactly.

**(b) A directory in this repo is not one runner, and that changes T-9's shape.** Five files under these
roots import from `vitest`:

```
server/services/__tests__/anchor-candidates.test.ts
server/services/__tests__/anchor-scoring.test.ts
server/migrations/__tests__/1577-cart-booking-revenue-dedup.test.ts
server/migrations/__tests__/244-platform-revenue-payment-intent-dedup.test.ts
server/migrations/__tests__/ready-made-purchase-revenue-dedup.test.ts
```

`npx tsx --test` on any of them dies inside `@vitest/runner`
(`TypeError: Cannot read properties of undefined (reading 'config')`) **before a single assertion runs**,
and `vitest` cannot run a `node:test` file either. The triage report recorded the 12 vitest files as a
HARNESS fact (§2); it is equally a WIRING fact. So the selector is a **whole-directory glob wherever a
directory has ONE runner** — all four T-1 directories, and `server/routes/__tests__` — and **two steps
split by NAME** where it does not. Node 22 has no file-level exclusion flag
(`--test-name-pattern`/`--test-skip-pattern` match test NAMES), and the tokenizer in
`scripts/check-test-files-wired.cjs` models only `*`, `**` and `?`, so a bracket class or an extglob
would be executed but not SEEN — the guard would read those files as still orphaned. Naming them is the
honest option.

**STATED NEGATIVE SPACE, written into the workflow itself:** a file added to a mixed-runner directory is
orphaned until somebody names it, and `scripts/check-test-files-wired.cjs` is what says so. The two
`server/services/__tests__` vitest files are selected by the glob `anchor-*.test.ts`, which is their whole
set, so that half cannot silently drop one.

## 4 · The one red: `booking-idor-guard`, `Expected 403 but got 503`

**It is a fixture defect, not a route defect, so the brief's STOP condition did not fire.**
`server/routes/bookings.ts` is untouched by this lane.

**What the 503 is.** `isAuthenticated`
(`server/replit_integrations/auth/replitAuth.ts:217`) runs a soft-delete / suspension check on every
request and **fails CLOSED**: any error from `authStorage.getUser()` answers
`503 {"message":"Authentication service temporarily unavailable"}` and the handler never runs. The
fixture's own header comment asserted the opposite — *"the subsequent `authStorage.getUser()` call fails
(fake `DATABASE_URL`) and is caught by the middleware's **fail-open** handler, so `next()` is called and
the real handler runs"*. That posture is gone. Twelve of the suite's eighteen tests had therefore been
asserting nothing about the IDOR guard; the 403 branch and the `[IDOR ATTEMPT]` line were never reached.

**What made the lookup throw.** The fixture patches `db.select` with a chain that resolves only at
`.limit()`. Both auth reads — `authStorage.getUser` and, behind `getDbRole`, `storage.getUser` —
destructure the query directly:

```ts
const [user] = await db.select().from(users).where(eq(users.id, id));
```

with **no `.limit()`**, so `await chain` yielded the chain object and the destructuring threw
`(intermediate value) is not iterable`, which the fail-closed handler turned into the 503. Reproduced in
isolation before touching anything.

**The repair, and only this.** The mock chain is now **thenable at every link** (so a read that awaits at
`.where()` resolves) and **table-aware** (`getTableName(table) === "users"`), answering the two `users`
reads with the session the test logged in as rather than with a booking row. The table-awareness is
load-bearing and not tidiness: a booking row carries no `role`, and the handler reads the acting role
from the DATABASE, never from the session's `claims.role` snapshot (CLAUDE.md §2, audit findings 8/14) —
so a role-blind mock would have silently dropped the admin tier to `user` and turned the suite's
`admin gets 200` proof into a false red. The stale header paragraph is rewritten to say what is actually
true, with the ledger slug beside it.

```
before: 18 tests, 6 pass, 12 fail   (4 suites failing on 503 / the 403 and IDOR-log assertions)
after:  18 tests, 18 pass, 0 fail, 0 skipped
```

**No assertion was changed, added, relaxed or skipped.** The suite's static source guard — `[IDOR
ATTEMPT]` present, `console.warn` present, `req.params.id` interpolated, `status(403)` present — still
runs against the unmodified `bookings.ts` and still passes.

## 5 · Local validation

Postgres 16 cluster initialised **from empty** on a port no other lane holds (`55440`), database
`traveloure`, then `migrate-entry.ts` → **301 applied, 0 skipped, 301/301 in ledger**, then
`scripts/create-sessions-table.ts` and `scripts/seed-ci-test-users.ts` — i.e. the `ci-db-setup` composite
action's three steps, with `seed-ci-users: true` locally (the jobs pass `false`; nothing wired here needs
a seeded user).

| check | result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json \| grep -c "error TS"` | **129** (baseline, unchanged) |
| `npm run build` | exit 0 |
| `node scripts/check-decision-guards.cjs` | OK (0 deferred warnings) |
| `node scripts/check-money-endpoints.cjs --self-test` + scan | OK |
| `bash scripts/phase2-fee-gate.sh` | PASS |
| `node scripts/check-test-files-wired.cjs --self-test` | 12/12 fixtures OK |
| `node scripts/check-test-files-wired.cjs` | `test-orphan-ratchet: OK` — 318/512, 194 orphans |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK |
| migration chain-integrity | OK |
| migrations from EMPTY | 301 applied, 0 skipped |
| `grep -c replit.local package-lock.json` | 0 |
| T-1 suites | 50 pass / 0 fail / 0 skip |
| T-2 suites | 333 pass / 0 fail / 0 skip |
| T-3 suites | 189 pass / 0 fail / 0 skip |

No schema, no migration, no route, no rail, no amount, no fee, no rate, no `shared/schema.ts` change —
`check-undeclared-tables.cjs` is not in scope for this diff.

## 6 · What this lane did NOT do

- **Wired nothing vacuous.** Every run above reports `skipped 0`. The three green-but-vacuous suites the
  triage report names (`deposit-cancel.db`, `admin-mutation-auth`, `admin-query-role-changes`) all live in
  `server/__tests__` / `server/__tests__/mutation-auth` and are outside these directories.
- **Deleted no suite, allowlisted nothing, and narrowed no run** — no `--test-name-pattern`, no
  `--test-only`, no skip.
- **Left T-4..T-10 exactly where the triage report put them** — 194 orphans, still owed repair-or-delete.
- **Did not touch CLAUDE.md.** The proposed sentence is below.

## 7 · Proposed CLAUDE.md sentence (for the decision-maker to accept or refuse)

To follow the `2026-09-14`/`2026-09-15` reachability notes, as a clause of the same standing rule:

> **A TEST DIRECTORY IS NOT NECESSARILY ONE RUNNER, so "wire the directory" is available only where it
> is.** `tsx --test` cannot load a file that imports from `vitest` (it dies in the runner before any
> assertion), and `vitest` cannot run a `node:test` file; Node 22 has no file-level exclusion flag, and
> `scripts/check-test-files-wired.cjs` models only `*`, `**` and `?`, so a bracket class or an extglob
> would run without being SEEN and the files would read as still orphaned. A mixed directory is therefore
> wired as **two steps split by NAME**, with the limit stated in the workflow — a file added there is
> orphaned until somebody names it, and the ratchet is what says so. A single-runner directory keeps the
> whole-directory glob and stays closed by construction.
