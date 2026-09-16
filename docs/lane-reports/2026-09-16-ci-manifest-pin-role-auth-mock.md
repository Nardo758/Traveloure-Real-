# Lane report — CI: main red on two test defects of one class (a hand-copied derivative)

**Ledger row:** `2026-09-16-ci-manifest-pin-role-auth-mock`
**Punchlist:** V-35 filed AND struck CLOSED in this PR (a §18 rule 1 literal found by a red `main`)
**Base:** `origin/main` @ `6fc6d550d` (the merge of ledger `2026-09-15-orphans-t8-t9-server-tests-class`)
**Schema/migration:** none. No column, no CHECK, no index, no backfill, no route, no rail, no amount, no fee, no rate. **No production code touched** — two test suites, two generator scripts, one new key module, one new test fixture, the register files.

---

## 1. What each failure MEANT

Both `Suite Mutation Auth` and `Suite Server Tests` were red on `main` itself. Neither red was a
regression in the platform. Both were the same defect shape: a test carried its OWN COPY of
something the code under test already owned — a number, a fake — and the copy fell behind.

### (a) `578 !== 575` — the audit pinned a derivative of the file it was checking

`server/__tests__/mutation-auth/non-admin-payments-user-data-mutation-auth.http.test.ts:105`
asserted `manifest.uniqueMethodNormalizedPathCount === 575`, "pinned to the checked-in
575-endpoint generated manifest". Ledger `2026-09-15-d24-d26-acceptance-columns` added three
rails; the generator, doing its job, wrote 578 into the manifest; the suite then compared the
checked-in file against a number nobody had re-copied. The manifest was CORRECT and CURRENT —
`check:mutation-auth` was green — and the TEST was stale. A hand-copied count is a derivative of
the file it checks, which is exactly the drift class §18 rule 1 names for code, worn as a test.

**Fix: DERIVE, never pin.** The endpoint key `${method} ${effectivePath}` was re-typed in seven
places (the manifest generator, the coverage generator, three audit suites, two snapshot tests).
It is now ONE module, `scripts/mutation-auth/endpoint-key.ts`:

- `endpointKey(m)` — the one spelling;
- `groupByEndpoint(mutations)` — every registration under its key, first-seen order (the
  generator's "first registration classifies the endpoint" rule and the audits' "one effective
  row per endpoint" rule read the same grouping);
- `uniqueEndpointKeys(mutations)` — what `uniqueMethodNormalizedPathCount` counts.

Callers: the generator's grouping (it previously built the same `Map` inline), the coverage
generator's `keyOf`, the two wired audits that had their own `endpointKey`/`keyOf`, and the
unwired `scripts/mutation-auth/coverage.test.ts`, which carried the same `575` twice and now
derives it too. `extractor.test.ts` is left alone: its 578 is a snapshot of the EXTRACTOR against
the live source, not a copy of the manifest, and it is correct.

**What the pin meant survives** as three assertions against the derived set, all in the same test:

1. internal consistency — the manifest's RECORDED unique count equals the count derived from its
   own rows;
2. dedup — the audit scope holds exactly one effective row per endpoint, and every one is a
   manifest endpoint;
3. coverage — the scope equals the set of endpoints whose FIRST registration is non-admin
   payments or user-data (the same first-registration rule the generator classifies by).

`npm run generate:mutation-auth && npm run generate:mutation-auth-coverage` regenerated
byte-identical files (587 registrations, 578 unique): nothing to commit under `generated/`.

### (b) `expected 500 to be 200` — a second fake `db`, one `leftJoin` behind the handler

The same lane made the OWNER branch of `GET /api/bookings/:id` call `describeAcceptance(booking.id)`:
a `service_bookings` ⟕ `provider_services` select awaited directly with no `.limit()`, plus — only
when the listing takes acceptance — a raw `db.execute` COUNT over `booking_revision_requests`. That
lane repaired `server/routes/__tests__/booking-idor-guard.test.ts` with a table-aware, join-aware
chain and a `db.execute` patched (via `PgDialect().sqlToQuery`) to answer exactly that COUNT and
throw otherwise.

`server/__tests__/db-role-authorization.test.ts` mounts the SAME real handler through a SEPARATE
minimal `select/from/where/limit` chain inside `vi.mock("../db")`. It answered neither shape. The
owner's own read threw `TypeError: leftJoin is not a function`, the route's catch turned it into a
500, and R1's "the traveler owner still gets their own full row" read `expected 500 to be 200`. The
other three R1 proofs were green because a stranger, a provider and an admin never enter the owner
branch. Two hand-rolled fakes of one handler diverge the day the handler grows a link.

**Fix: ONE fixture, two callers.** `server/__tests__/fixtures/fake-db-chain.ts`:

- `makeTableAwareSelect(rowsFor)` — the thenable, join-aware chain (`from`/`leftJoin`/`innerJoin`/
  `where`/`limit`/`then`), table-aware through drizzle's `getTableName`;
- `bookingRouteRows({ user, bookings })` — the rows the bookings route family reads, resolved
  LAZILY so a suite can swap the session user or the booking row per test: `users` → the session
  user (with `isDeleted`/`isSuspended` false), `service_bookings` → the caller's rows,
  `provider_services` → NO row, anything else → nothing;
- `makeRevisionCountOnlyExecute(label)` — answers the one raw COUNT as "no revision rows" and
  THROWS a named error on any other raw read.

`booking-idor-guard.test.ts` (node:test) patches the shared `db` instance with them;
`db-role-authorization.test.ts` (vitest) builds its `vi.mock("../db")` factory from them (async
factory, dynamic import — the fixture is not a hoisted binding). **Assertions in both suites are
UNCHANGED**; only the fake moved.

§13 is kept where the fake makes a choice: `provider_services` answering no row means the fake
booking's listing is UNKNOWN, `acceptanceModeFor` resolves null and the acceptance read-out is
honestly omitted — never invented; and an unexpected raw read is a named error, not a connection
attempt against the dummy `DATABASE_URL`, so a 500 in these suites is an authorization decision or
nothing.

---

## 2. Validation

Everything below ran on the branch head, against a FRESH Postgres 16 cluster created empty on port
55510 (`pg_createcluster`), migrated by `server/migrations/migrate-entry.ts`, with the sessions
table and the ci-* seed applied exactly as `.github/actions/ci-db-setup` does, and the PRODUCTION
bundle (`npm run build`, `node dist/index.cjs`) booted with the workflow's own env block.

| Check | Result |
|---|---|
| `.github/workflows/suite-mutation-auth.yml` six-suite `run:` line (`MUTATION_AUTH_AUDIT_OK=1`) | 154 tests, 154 pass, 0 fail, 0 skipped |
| `generate-mutation-auth-manifest.ts --self-test` | 7/7 |
| `npm run check:mutation-auth` | "Verified 587 mounted mutation registrations — rail set unchanged" |
| `.github/workflows/suite-server-tests.yml` step 1/4 (node:test) | 531 tests, 531 pass, 0 fail |
| step 2/4 (node:test) | 617 tests, 614 pass, 0 fail, 3 skipped (the suites' own Stripe-key skips) |
| step 3/4 (node:test) | 478 tests, 478 pass, 0 fail |
| step 4/4 (node:test) | 407 tests, 405 pass, 0 fail, 2 skipped |
| vitest step (7 files, incl. `db-role-authorization`) | 7 files passed, 118 tests passed |
| `booking-idor-guard.test.ts` solo (node:test) | 18/18 |
| `db-role-authorization.test.ts` solo (vitest) | 17/17 |
| `scripts/mutation-auth/coverage.test.ts` (unwired, run by hand) | 4/4 |
| `scripts/mutation-auth/extractor.test.ts` (unwired, run by hand) | 4/4 |
| `npx tsc --noEmit -p tsconfig.json` error count | 129 (baseline) |
| `npm run build` | OK |
| `check-decision-guards.cjs` | OK |
| `check-money-endpoints.cjs --self-test` + scan | 37 fixtures OK; scan OK |
| `phase2-fee-gate.sh` | PASSED |
| `check-test-files-wired.cjs --self-test` + scan | 12/12; `test-orphan-ratchet: OK` |
| `check-duplicate-migration-prefixes.cjs` | OK |
| `grep -c replit.local package-lock.json` | 0 |

The ci-* seed was applied to the one database both local jobs shared (CI gives `suite-mutation-auth`
a database with `seed-ci-users: 'false'`); every mutation-auth suite creates and deletes its own
actor, and none of the 154 read a seeded account — stated so the local run is not mistaken for a
byte-identical replay of two jobs.

## 3. Not done, deliberately

- `scripts/mutation-auth/{extractor,coverage}.test.ts` stay UNWIRED, as the two prior lanes left
  them; `coverage.test.ts` still pins `30` "Explicitly excluded" dispositions (a snapshot of the
  coverage generator's exclusion list, not a copy of the manifest count) — untouched.
- The two sibling repairs the same brief carried landed on their OWN branches, not here:
  `task-d27-artifact-timer-acceptance-prompt` (`diaryCount` counts the event the acceptance timer
  actually writes) and `task-l16-lane1-create-rail` (manifest regenerated for the lane-1 rails).
- `generated/security/*` is untouched in this PR because regeneration was a byte-identical no-op.

## 4. Proposed CLAUDE.md sentence (NOT applied — CLAUDE.md is never edited by a lane)

Under **§18** beside rule 1: *"A TEST may not hand-copy a derivative of the file or handler it checks
either — a pinned count of a generated inventory, or a private fake of a shared dependency — because
the copy falls behind the moment the source honestly changes; derive the number from the artifact's
own rows through the generator's own key, and keep ONE fake per dependency in a shared fixture
(ledger `2026-09-16-ci-manifest-pin-role-auth-mock`)."*
