# Lane report — T-8 and T-9: `server/__tests__` closed as a class

**Branch** `task-orphans-t8-t9-server-tests-class` · **base** `origin/main` @ `2507fe63c`, merged with
`origin/task-orphans-t4-t7-red-suites` @ `a5bfdfbb6` (PR #953) · **date** 2026-09-15
**Spec** `docs/lane-reports/2026-09-15-orphan-triage.md` §4/§5/§7 rows T-8 and T-9;
`docs/lane-reports/2026-09-15-orphans-t4-t7-red-suites.md`.

**Inventory: 328/511 reachable → 479/512 reachable. Baseline 183 → 33.**
**`server/__tests__` goes from 152 recorded orphans to 2**, and both remaining ones carry a
stated reason rather than a shrug.

**Zero production source files changed.** No schema, no migration, no route, no rail, no amount,
no fee, no rate. Everything below is a test fixture, a test assertion re-pinned to a ratified
ruling, a new test fixture helper, or workflow YAML.

---

## 1 · Headline

One new job, **`suite-server-tests`** in `build.yml` (DB + the built app on `:5000`), runs **232 of
the directory's 238 suites**. Six do not run in it, each for a reason stated in the job itself and
in §5 below; **two of those six stay ORPHANED**, so **T-9 is landed but not complete**, exactly as
the brief requires it to be reported.

**T-8's repairs were not thirty local patches.** The triage's 32 red rows collapsed into **six
causes**, and the fix for each was written once:

| # | cause | suites | the fix |
|---|---|---|---|
| a | an assertion **overtaken by a ratified ruling** | 6 | re-pinned to the ruling's own guarantee, citing the ledger slug, with the proof preserved or strengthened |
| b | a fixture referencing a **retired table, column or response key** | 2 | the reference removed, the retirement named |
| c | **malformed fixture SQL** that never reached an assertion | 3 | the statement fixed; no assertion moved |
| d | a **hand-copied production rule** inside a test that had drifted (§18 rule 1) | 2 | the test now READS the production derivation |
| e | a **shared bench another suite can destroy or never creates** | 4 | the suite seeds its own, through a shared fixture |
| f | a **harness whose premise stopped being true** | 1 | the missing seam mocked, with the reason recorded |

**Sixteen of the triage's 29 red rows needed no repair at all.** They were RED in the triage's
harness and GREEN on a harness with a migrated database, the four `ci-*` accounts and the built app
— which is worth recording because it means the triage's RED-FIXTURE bucket over-counted real work
by roughly half, and a later lane reading that table should re-run before repairing.

---

## 2 · The six causes, one row per suite

### (a) Overtaken by a ratified ruling — re-pinned, never deleted

| suite | the pin that was overtaken | the ruling | what it says now |
|---|---|---|---|
| `trip-pass-suppression.db` | `billedOnDirectPathToday === false` | `2026-09-02-traveler-fee-applies-everywhere` | `=== true`. The traveler fee IS billed on the direct path, so the pass waiver is a REAL reduction, not a counterfactual. An exact value is still asserted — it is the ruling's value. |
| `storefront-role-agnostic.http` | `deepEqual(body.templates, [])` | `2026-09-03-expert-templates-consumer-sunset` ("response key included") | the key must be **ABSENT**. §13 decides between the two: an empty array claims "zero itinerary templates" about a product that no longer exists. The new pin is **stronger** — it fails if the retired key is ever re-introduced. |
| `market-insights.db` (all 15) | a RUN-unique synthetic city | the partner-facing scope gate "STEP 3.7 Part B (B1, R13)" | the city is an **operating market**, read from `OPERATING_MARKETS` rather than spelled. A synthetic city resolves to no market, so `cities` came back empty and the route returned its honest empty surface before either layer was built. |
| `provider-money-hardening.db` P1 | the row carries "the fee_bands-resolved provider share" | **ruling 71 Step 1** (the 1C provider-lane snapshot retirement) | a provider-owned row carries **NO stamped split** — deliberately, because its charge path resolves the D1 category band live and that band outranks a snapshot. What §18 actually guarantees on that lane (the client's number never reaches the row) is what is pinned. |
| `provider-money-hardening.db` P2 | the band-edit discriminator on the provider lane | same | the discriminator **MOVES to the expert lane**, which still stamps. It is not deleted; deleting it would leave an equality that the unfixed code also satisfies. |
| `travel-surcharge.db` D1 | `total = subtotal + platformFeeTotal + conciergeFeeTotal + 20` | `2026-09-08-cart-fee-line` | the total is composed by the **production** `composeTravelerCharge` from the lines the response disclosed, and the surcharge is isolated as the difference between composing with it and without it. `platformFeeTotal` is still disclosed; it is no longer a term of the TRAVELER's total. D1b was a pure cascade of D1's abort. |
| `expert-profile-xss.http` | advisor row seeded `status = 'active'` | **Locked Decision 12** ("a PENDING advisor may not write", Aug 7 2026) | the status is READ from `TRIP_ADVISOR_WRITE_ACCESS_STATUSES`, so a later change to that list moves the fixture with it instead of silently un-authorizing it again. Four sanitization proofs had been answering 403 without ever reaching the sanitizer. |

### (b) A retired table / column / key

* `booking-confirm-payment-idempotency` imported `providerAvailability`, a table **migration 242
  dropped** and `shared/schema.ts` deliberately no longer declares (publish-trap rule). The import
  resolved to `undefined`; reading `.providerId` off it threw **synchronously inside `finally`**,
  which replaced both tests' real outcome with a `TypeError`. Neither assertion had failed.
* `storefront-role-agnostic` — see (a).

### (c) Malformed fixture SQL

* `guest-invite-send.db` — `ANY(${array})` interpolated as `ANY(($1, $2, …))`, which is not valid
  SQL. All six proofs passed and the `after()` hook failed the file.
* `ready-made-author-filter.http` — one parameter used both as a `varchar` column value and inside
  a `= 'approved'` comparison: `inconsistent types deduced for parameter $5`, and all four proofs
  died before running. A cast does not help — it only moves which position disagrees — so the value
  is bound twice, once per position.
* `provider-money-hardening.db` P4 — every slot was seeded at the same `10:00` on the same day, and
  `vendor_availability_slots` carries `UNIQUE (service_id, date, start_time)`. P4 needs two slots on
  one service, one per recovery layer.

### (d) A hand-copied production rule that had drifted (§18 rule 1)

This is the class the T-4..T-7 lane found inside a security audit and predicted would be waiting
here. It was.

* `provider-money-hardening.db` restated band resolution as SQL: *"`band_key` = the
  `active_provider_commission_policy` setting"*. That copy went stale in **two** ratified steps —
  **RULING 49** deactivated `beta_flat` so the policy value no longer names a band at all, and the
  resolution now lands on `default_commission_band_key`. The copy returned no row, `typeof rate` was
  `'undefined'`, and three proofs died in the helper. The test now calls
  `resolveServiceOwnerShareRate` — the production derivation `storage.createProviderService` itself
  calls — and reads the band key as CONFIG, asserting rather than substituting a literal (§8: no
  rate and no band name is spelled in that file).
* `travel-surcharge.db` restated the traveler-charge composition — see (a).

### (e) A shared bench another suite can destroy, or that nothing creates

* `expert-profile-xss-regression.http` logged in as the **durable kyoto bench**
  (`kyoto-temples@traveloure.test`), which no seed script creates — it is reconciled by K4 inside
  `console-sigma-kyoto-bench.http.test.ts`. On a fresh database, or in any job that does not happen
  to run that suite first, all sixteen tests died on `login failed (401)`. It now registers its own
  disposable expert through `registerActorWithReadBack` and inserts the one `local_expert_forms`
  row the profile surfaces read back.
* `journey-suite-negatives.http` N16 selected an approved+active priced listing with
  `ORDER BY random()` and asserted one came back. **A database built from empty carries ZERO
  `provider_services` rows** — migrations seed none, and neither the CI user seed nor the app's boot
  seeding creates a listing — so that precondition can only ever have passed on another suite's
  leftovers. New shared fixture **`server/__tests__/fixtures/catalog-listing.ts`** seeds one the
  caller owns and cleans up. It deliberately does **not** "find or create": a found row belongs to
  somebody else's suite and can be deleted mid-test by that suite's `after()`, which is the same bet
  one layer down.
* `market-insights.db` / `provider-office-location.db` — see §3, the purge finding.
* `item-event-link.db` minted its trips with a raw `db.insert(trips)`, which skips the owner's
  `trip_collaborators` row. `storage.createTrip` writes that row *"in the same operation that
  creates the trip"* precisely because `getTripRole`, the READ resolver, resolves access by
  ASSIGNMENT and never by `trips.userId`. The fixture now mints through that door. **The gap is
  recorded, not papered over:** `2026-09-15-v29-one-trip-write-resolver` states in its own closing
  note that *"a raw-insert plan still 403s its owner on the plancard READ"* and that its ruling does
  not reach it. What was wrong here is the fixture, which was not minting a plan the way the
  platform mints one.

### (f) A harness whose premise stopped being true

* `provider-approval-email` asserted the approval email fires exactly once and observed zero.
  Nothing about the email changed: `updateUserRole` was made **atomic** — *"role update and audit
  insert commit or roll back together"* — so it now runs inside `db.transaction`, a seam this
  harness never mocked. The callback reached the **real** database, the `access_audit_logs` insert
  failed its actor foreign key on a fabricated admin id, the handler's own catch reverted and
  returned 500, and the send site was never reached. The harness's stated premise ("without touching
  the database") had quietly stopped being true. The tx handle now gets the same chain mocks, so the
  transaction body — including the role-transition assertion inside it — is **exercised, not
  skipped**.
* `service-content-translation.http` P7 read `process.env.ANTHROPIC_API_KEY` **in the test process**
  to decide what the **server** would answer, which it cannot see. Re-pinned to the guarantee the
  proof exists for (the draft REFUSES and writes no row), keeping `AI_DRAFT_UNAVAILABLE` (no provider
  configured) and `AI_DRAFT_ERROR` (one was, and the call failed) as **distinct** facts rather than
  collapsing them.

---

## 3 · Three findings the whole-directory run produced, which no per-file run could

A serial pass over all 238 files was run once before any job was written. **231 passed.** The seven
that did not are the interesting part, and five of them had nothing to do with the suites
themselves.

1. **One suite's SUBJECT is a destructive purge of the shared account namespace.**
   `e2e-purge-fk-naming.db.test.ts` calls `purgeE2EAccountsFromProd()`, which neutralises **every**
   `@traveloure.test` account — including the four `ci-*` accounts `seed-ci-test-users` creates and
   that **three** suites in the same directory log in as (`booking-eligibility-gates`,
   `market-insights`, `provider-office-location`). Their listings cascade away with them, which is
   also how `journey-suite-negatives` lost the catalog row it was betting on. After the run the
   `users` table held **zero** `ci-*` rows and the whole `provider_services` table was empty. It is
   already wired in its own isolated job and is **excluded here**.
2. **Two already-wired suites assert a CLEAN platform.** `reconciliation-detection.db` and
   `reconciliation-run-tallies.db` assert zero drift exceptions and a clean run row — a claim no
   suite sharing a database with 230 others can honestly make. Excluded; their own jobs are the
   right shape.
3. **Two suites share a 5-minute in-process cache, the order matters, and the pair must run
   FIRST.** `GET /api/discover/location/:city` is served from `locationViewCache`, keyed
   `v5|<canonical city>:<country>`, with every casing of one city sharing ONE entry.
   `city-case-match.db` and `fp1-console-defects.db` are the only two suites that read that URL, and
   they read the same key. fp1's B4-b creates three listings and then asserts the payload contains
   them, so a payload cached beforehand makes it fail — **reproduced deterministically**, in both
   orders. **A second measurement corrected the first fix:** running the ordered pair AFTER the four
   alphabetical steps still failed B4-b, because the URL grep only finds suites that fetch the
   endpoint directly and the same view is resolved behind other surfaces (the landing feed's own
   comment says it *"can never disagree with /discover/location/:city"*). So the pair runs **FIRST**,
   immediately after the server is ready, against a **cold** cache — and **both files carry the
   contract in their headers** so a later reorder is a deliberate act.

---

## 4 · What landed

| thing | detail |
|---|---|
| new job | `suite-server-tests` in `.github/workflows/build.yml` — Postgres service, `ci-db-setup` with `seed-ci-users: 'true'`, `npm run build`, `node dist/index.cjs` on `:5000`, `TIER2_DEV_AUDIT_OK=1`, then four alphabetical node:test steps (223 files), the ordered location-view pair (2), and one vitest step (7). |
| new fixture | `server/__tests__/fixtures/catalog-listing.ts` — one approved/active/priced listing the caller owns, with its own cleanup and its stated negative space. |
| repaired suites | 13 (listed in §2). |
| baseline | 150 lines removed; `server/__tests__` goes from 152 rows to 2. |

**Why the files are NAMED and not globbed.** Six of them must not run in this job, and
`scripts/check-test-files-wired.cjs` states in its own CANNOT-DETECT list that it cannot follow a
`$(...)` substitution. An exclusion written as `$(ls … | grep -v …)` would therefore make the entire
directory read as **unreachable**, which is the opposite of the point. A named list is what the
guard can see.

---

## 5 · What is NOT in the job, and why

| file | reason | status |
|---|---|---|
| `e2e-purge-fk-naming.db.test.ts` | its subject purges the `@traveloure.test` namespace this job's own seed creates (§3.1) | already wired — own job |
| `reconciliation-detection.db.test.ts` | asserts a CLEAN platform (§3.2) | already wired — own job |
| `reconciliation-run-tallies.db.test.ts` | asserts a CLEAN platform (§3.2) | already wired — own job |
| `checkout-oneclick.stripe.db.test.ts` | 3 tests, **3 skipped** without a real Stripe test key | already wired — own job |
| `deposit-cancel.db.test.ts` | 5 tests, **5 skipped** without a real Stripe test key — the green-but-vacuous shape triage note 3 forbids wiring | **STILL AN ORPHAN** |
| `deliverable-protected-rail.http.test.ts` | needs the app started with `OBJECT_STORAGE_DRIVER=memory`, and `server/infrastructure/object-storage.ts` refuses that driver when `NODE_ENV=production`. A production-bundle job cannot satisfy it **by construction**; a non-production app would need the Vite dev server | **STILL AN ORPHAN** |

**Therefore T-9 is LANDED but NOT COMPLETE**, and this report says so rather than rounding up. Two
suites in this directory remain unrun. Closing them needs a decision, not effort:
`deposit-cancel` needs a real Stripe test key in CI, and `deliverable-protected-rail` needs either a
non-production app job or a ruling that the memory object-storage driver may be reachable under a
named CI flag.

---

## 6 · Validation

Every figure below was measured on this branch. The DB is a local Postgres cluster on port 55490,
built from **empty** (301/301 migrations), `create-sessions-table`, `seed-ci-test-users`, then
`npm run build` + `node dist/index.cjs` — the job's own sequence.

| check | result |
|---|---|
| `node scripts/check-test-files-wired.cjs` | `479/512 reachable; 33 orphan(s)`, `test-orphan-ratchet: OK` |
| `node scripts/check-test-files-wired.cjs --self-test` | `12/12 fixtures` |
| the job's own `run:` lines, from an EMPTY database | see §7 |
| `npx tsc --noEmit -p tsconfig.json \| grep -c "error TS"` | **129** (baseline) |
| `npm run build` | exit 0 |
| `node scripts/check-decision-guards.cjs` | OK |
| `node scripts/check-money-endpoints.cjs --self-test` + scan | OK |
| `bash scripts/phase2-fee-gate.sh` | OK |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK |
| migration chain-integrity | OK |
| `grep -c replit.local package-lock.json` | **0** |
| schema / migrations touched | **none** |

## 7 · Harness caveats, stated rather than buried

1. **Timings are not CI timings.** A 4-core sandbox, serial, sharing it with other lanes. The whole
   directory took roughly an hour; the CI job carries `timeout-minutes: 60`, which is tight rather
   than generous, and is the first thing to raise if it bites.
2. **The app ran on `:5008`, not `:5000`** (another lane owns the default port), with
   `JOURNEY_BASE_URL` / `BASE_URL` / `XSS_TEST_BASE_URL` pointed at it. `expert-profile-xss.http` is
   the one suite reading `XSS_TEST_BASE_URL`; in CI its default (`http://127.0.0.1:5000`) is correct
   and the job sets nothing.
3. **Sixteen of the triage's RED rows were green here with no repair.** That is a fact about the two
   harnesses, not about the suites, and it is recorded so nobody repairs a suite that does not need
   it. The most likely difference is the `ci-*` seed and the built app.
4. **`fp1-console-defects` is not repeatable within five minutes of itself**, for the cache reason in
   §3.3. That is a property of the suite, not of this job, and it is now written in its header.
5. **What this lane did NOT do:** it wired nothing vacuous, skipped nothing, allowlisted nothing,
   added no `--test-name-pattern`, changed no production source file, and filed no new punchlist row
   — the one real product gap it met (`getTripRole`'s collaborator-only owner resolution) is already
   stated in the V-29 close as out of that ruling's reach.

## 8 · Proposed CLAUDE.md sentence

Not applied — CLAUDE.md is the decision-maker's. Proposed, for the Branch-and-publish / testing
neighbourhood:

> **A whole-directory test job is only available where the directory has one runner, no suite whose
> subject is destructive to the shared fixtures, and no suite that asserts a clean platform.**
> `server/__tests__` has all three problems and is therefore wired as a NAMED list with its
> exclusions stated in the job (`suite-server-tests`, ledger
> `2026-09-15-orphans-t8-t9-server-tests-class`) — a shell-substitution exclusion is not available,
> because `scripts/check-test-files-wired.cjs` cannot follow one and the directory would read as
> unreachable.
