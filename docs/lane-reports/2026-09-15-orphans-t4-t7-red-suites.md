# Lane report — orphans T-4 / T-5 / T-6 / T-7: the red suites

**Branch** `task-orphans-t4-t7-red-suites` · **base** `origin/main` @ `fa23714d9`, with
`origin/task-orphans-t1-t3-green-directories` @ `67b70ee34` (PR #948) merged in first so its
baseline removals and CI jobs sit underneath this lane's · **date** 2026-09-15
**Ledger row** `2026-09-15-orphans-t4-t7-red-suites`

Implements rows **T-4**, **T-5**, **T-6** and **T-7** of
`docs/lane-reports/2026-09-15-orphan-triage.md` §7, plus the decision-maker's 401→403 ruling.

```
before (after merging #948):  test-files-wired: 318/512 reachable; 194 orphan(s)
after:                        test-files-wired: 328/511 reachable; 183 orphan(s)
```

Ten suites wired, one deleted (hence the denominator moving 512 → 511), eleven baseline lines
removed in the same commit that wired or deleted each.

---

## 1 · What landed

| Job | Shape | Suites | Result |
|---|---|---|---|
| `suite-mutation-auth` | Postgres 16 + `ci-db-setup` + **the built app** (`npm run build` → `node dist/index.cjs`), `MUTATION_AUTH_AUDIT_OK=1` | the six `server/__tests__/mutation-auth/*` files | **154 tests, 154 pass, 0 skipped** |
| `suite-ai-draft-and-availability` | same shape, `JOURNEY_DB_WRITES_OK=1` | `availability-model.db`, `s11-stay-booking.db` (step 1); `generated-itinerary-atomicity.db`, `regenerate-booking-guard.db` (step 2) | **21 + 7 = 28 tests, 28 pass, 0 skipped** |

Both jobs boot the app because **every one of these ten is an HTTP or HTTP+DB suite** — which is
exactly why the DB-only job shapes T-1..T-3 added could not carry them. The selectors are NAMED
FILE LISTS, not directory globs: `server/__tests__` is not all-green (triage §5, T-8), and a
whole-directory selector would import a red into a green job. That limit is stated in the workflow
itself, because a file added to that directory tomorrow is orphaned until somebody names it and
`scripts/check-test-files-wired.cjs` is what says so.

`server/__tests__/text-sanitization.test.ts` is **deleted** (T-7).

---

## 2 · The 401→403 ruling: already implemented, nothing changed, and that is the finding

The ruling: every `/api/admin/*` route answers **403** to an authenticated non-admin, **401** only
when unauthenticated, fixed at the guard/route and never by weakening the probe.

**Both guards already do exactly that**, and I read them rather than inferring it from a green run:

- `adminApiGuard` — `server/routes.ts`, the §2 blanket `app.use("/api/admin", adminApiGuard)`:
  `401` on `!req.isAuthenticated()`, then a **DB role lookup on the session** and `403` when the
  row is absent or `role !== "admin"`, `500` on lookup error. Default-deny, unchanged.
- `isEA` — `server/middleware/ea-rbac.ts`, mounted `router.use("/api/ea", isEA)`: `401` on
  `!req.isAuthenticated()` or a missing principal, `403` on a DB role lookup that is neither
  `executive_assistant` nor `admin`.

Measurements, all on a local app built from this head against a Postgres built from empty:

| probe | result |
|---|---|
| `DELETE /api/admin/service-offering-types/x-probe` | anon **401**, authenticated ordinary user **403** |
| `DELETE /api/admin/slow-queries` | anon **401**, authenticated ordinary user **403** |
| `DELETE /api/ea/executives/x-probe` | anon **401**, authenticated ordinary user **403** |
| `admin-mutation-auth` with the audit flag | **143/143** on three consecutive runs, and again on a database built from empty |
| a tight register → login → 6 immediate probes, 8 rounds | **0 of 48** 401s |

**So there was nothing to fix, and I did not invent something to change.** `git diff` on the two
guards between the triage report's base (`a6a80c28e`) and this head is empty; the 26 intervening
commits touch neither.

**What I cannot say (§13).** I cannot explain what the triage saw. The three rails sit at
inventory indices **9, 10 and 17 of 143** — early in a run whose fixture logs in and immediately
starts probing — which is consistent with that fixture's session not yet being live, in which case
`401` was the *correct* answer to a request that genuinely was not authenticated. That is a shape,
not a mechanism, and I am not going to write a mechanism into the record to make a row close
tidily. The suite now runs in CI, so a real recurrence will be visible rather than anecdotal.

**The punchlist's candidate row is struck as SETTLED — no code change** — with the measurements and
the unexplained half both recorded there.

---

## 3 · T-4 · the six mutation-auth suites, and the two derivation-drift bugs underneath them

### 3.1 The generated manifest had rotted, and nothing in CI looked at it

Three of the six suites drive every probe off `generated/security/mutation-auth-manifest.json`.
`npm run check:mutation-auth` reported **drift**. Regenerating it:

- **removed 14** endpoints that no longer exist — including the four retired
  `/api/expert/templates*` rails (ledger `2026-09-03-expert-templates-consumer-sunset`) and the
  `expert-templates` admin/purchase/review family;
- **added 43** live ones — `POST /api/conversations/start`, `POST /api/trips/:tripId/advisors`,
  `PUT /api/trips/:tripId/destinations`, the eleven `/internal/jobs/*` runners, the
  neighborhood-claim rails, the trip-pass purchase pair, and more.

`npm run check:mutation-auth` is now **a step of `suite-mutation-auth`**. It existed, it worked,
and no workflow ran it — which is the whole reason a generated security inventory was 43 endpoints
behind the product.

### 3.2 `non-admin-payments-…` is NOT dead, and this lane departs from ruling (b) — openly

The brief's ruling (b) held that this file "asserts the retired `POST /api/expert/templates` is
mounted" and is therefore dead, and told me to delete it.

**The premise turned out to be inexact.** `grep` finds no `expert/templates` reference anywhere in
that file. What it has is `assert.notEqual(response.status, 404, "<key> is unmounted")` applied to
**whatever the manifest lists** — and the stale manifest listed four retired rails. The suite was
reading a dead inventory; it was not itself dead.

With the manifest regenerated and its one snapshot count re-pinned (546 → 575, the file's own
stated convention: "a changed rejection is recorded as an intentional audit update rather than
silently accepted"), the suite is **green and runs 220 real unauthenticated probes** — and it is
the **only** unauthenticated audit of the non-admin payment/user-data surface in the tree.

I did not delete it. Deleting a live security audit on a premise that had stopped being true would
have removed real coverage to satisfy a sentence, and CLAUDE.md's Coordination Prevention rule says
to escalate rather than override when a plan and the record disagree. **The decision-maker can
still overrule this** — the file is one `git rm` plus one baseline line away — and this paragraph
exists so that choice is made with the corrected facts rather than the original ones.

### 3.3 A hand-copied production list had silently shrunk a security audit (§18 rule 1)

`expert-provider-mutation-auth.test.ts` carried its own copy of `server/routes.ts`'s role-backstop
prefixes, with a comment saying they were "copied from the production assembly … rather than
inferred from endpoint names". They had drifted in both directions: the copy still listed
`/api/expert/templates` (retired) and had **never gained `/api/expert/neighborhood-claims`**
(ruling 27) — so three live high-risk rails were outside the probe set while the suite reported
green. That is the worst failure mode a security audit has, because nothing about it looks wrong.

The test now **reads the three `*_SELF_SERVICE_PREFIXES` arrays out of the source by NAME** and
throws loudly if any is renamed or emptied, so the failure is a loud parse error rather than a
silently shrunk audit. Its stated negative space is written into the file: it proves the prefixes
are the ones production assembles; it does not prove the middleware still consults all three, and
it cannot see a prefix added under a fourth name.

**Probe set: a stale subset → 41 rails, all 403.** The suite's own coverage assertion — every
high-risk role-console mutation is probed or explicitly excluded with a reason — is what caught the
three missing rails once the manifest was current, which is the assertion doing its job.

### 3.4 Fixture credentials

None of the six suites needs a seeded account: each creates and deletes its **own** disposable
ordinary-user fixture over `POST /api/auth/register`. `ci-db-setup` is therefore called with
`seed-ci-users: 'false'`, and the workflow says why — a seed step nothing reads is a step nobody
can later remove safely. No credential was invented.

---

## 4 · T-5 · R-12 / R-13 — one read-back, one implementation, two callers

Triage §6 had already measured the cause: the actor is created by `POST /api/auth/register` **in
the server process** and every dependent fixture row is inserted **from the test process**, with
nothing in between, so the dependent insert raced the register and died on
`provider_services_user_id_users_id_fk` before a single assertion ran.

`server/__tests__/fixtures/registered-actor.ts` is the one repair both suites call:

- it **reads the actor back on the test's own connection** with real `SELECT` round-trips and
  **never calls `setTimeout`** — §6 measured a bare 50 ms sleep as 13/13 on one run and 0/13 on
  another, while one extra round-trip was 13/13, so a timer would be a guess dressed as a fix;
- it asserts the role `UPDATE` **matched exactly one row**. That statement could previously match
  zero in silence, which is precisely how the race stayed invisible until it broke a foreign key
  two statements later;
- it reports its three failure modes as **three different sentences** (§13): the register did not
  return 201; the actor never became readable; the role update matched nothing.

**Not one assertion was changed, relaxed or skipped.** `availability-model` 13/13 and
`s11-stay-booking` 8/8 on four consecutive runs, the last against a database built from empty.

The punchlist's option (c) — split the pure half out first — was **not** taken and is not owed: a
suite leaves the orphan list by being RUN, and it now runs whole.

---

## 5 · T-6 · the two suites LD 41 (b) overtook — restated, not weakened

Both died on `[ai-draft-eligibility] refusing to rebuild trip …: the slip already holds N item(s)`
because their fixtures seeded a slip that already held items, and the free draft now runs only on
an empty one (LD 41 (b), ledger `2026-09-05-draft-only-on-empty`).

**Emptying the slip was only half the repair.** Both suites hold `assert.rejects` proofs *with no
predicate*, so once the slips were emptied those proofs would have been satisfied by the LD 41 (b)
refusal itself rather than by the failure they were written to prove — green, and proving nothing.
So every expected rejection is now **identified**: the forced trigger's message is searched down
the drizzle error's `cause` chain (matching only `err.message` finds the wrapper's "Failed query:
…" and reports the wrong reason), and the ruling's refusal is matched by
`isAiDraftSlipHasItemsError`.

`generated-itinerary-atomicity.db.test.ts`:
- every slip is born empty, and **each test owns its own trip** — under LD 41 (b), emptiness is a
  precondition of the rail, so a suite whose tests share one trip is a suite whose tests depend on
  each other's leftovers;
- the concurrency proof is restated in the ruling's own terms: two drafts race one empty slip, the
  `FOR UPDATE` lock serialises them, **exactly one wins and the loser is refused by LD 41 (b)**,
  with the loser's plan and comparison rows rolled back. The property the proof has always been
  about — the slip never holds half of each set — is unchanged, and the refusal is now part of what
  makes it true.

`regenerate-booking-guard.db.test.ts`:
- **G1a** — the snapshot rail REFUSES a slip holding a `purchased` row, and the refusal leaves all
  three rows byte-identical, inserts nothing, and writes no `ai_generated_itineraries` and no
  `itinerary_comparisons` row. This is D-1's money-safety intent in the form the ruling now takes:
  the row that used to be spared by the delete predicate is now never reached by a delete at all.
- **G1b** — the same rail DOES write on an empty slip, so G1a is a refusal and not a broken rail.
- **G2** — untouched. It drives the delete predicate (`itineraryItemRebuildDeletable()`) directly
  and never calls the snapshot rail, so no ruling overtook it.

---

## 6 · T-7 · `text-sanitization.test.ts` — DELETED, and nothing is lost

It imports `sanitizeProviderServiceBody`, `sanitizeTextFields`, `PROVIDER_SERVICE_TEXT_FIELDS` and
`EXPERT_LISTING_TEXT_FIELDS` from `server/utils/text-sanitizer.ts`, which exports exactly three
names: `sanitizeText`, `sanitizeStringFields`, `sanitizeDeep`. The file cannot load, and it is the
only reference to those symbols left in the tree.

**It is not worth rewriting, and the reason matters more than the missing exports.** Its very first
assertion expects `sanitizeText` to entity-encode quotes — which that module's own canonical-policy
header says it **deliberately does not do**, because provider listing text renders through React
text nodes and a stored `&quot;` would display literally; entity-encoding is `sanitizeInput`'s job
in `server/utils/sanitize.ts`. Rewriting this suite would mean re-deciding a ratified policy, not
repairing a test.

Every behaviour the module actually has is already pinned by
`server/utils/__tests__/text-sanitizer.test.ts` — **22 tests**, covering all three exports
including idempotency and the deliberate preservation of bare `<`/`>` in prose — and T-1 wired that
directory by whole-directory glob.

---

## 7 · Validation

| check | result |
|---|---|
| `npx tsc --noEmit` error count | **129** (baseline) |
| `npm run build` | exit 0 |
| `node scripts/check-decision-guards.cjs` | OK, 0 deferred warnings |
| `node scripts/check-money-endpoints.cjs --self-test` + scan | OK (37 fixtures), scan exit 0 |
| `bash scripts/phase2-fee-gate.sh` | PASSED |
| `node scripts/check-test-files-wired.cjs --self-test` + scan | 12/12; `test-orphan-ratchet: OK — baseline: 183` |
| `node scripts/check-duplicate-migration-prefixes.cjs` | OK |
| `node scripts/check-ai-draft-eligibility.cjs` | OK (479 files, 3 exemptions) |
| migration chain-integrity | 2/2 |
| migrations from EMPTY on local Postgres (:55450) | 301 applied, 0 skipped |
| `npm run check:mutation-auth` | Verified 584 mounted mutation registrations |
| `grep -c replit.local package-lock.json` | 0 |
| both new jobs' exact `run:` lines, fresh DB + fresh app | 154/154 and 21/21 + 7/7, **0 skipped** |

No schema, no migration, no route, no rail, no amount, no fee and no rate changed. **Not one
production source file was edited** — the entire diff is workflows, test files, a new test fixture,
regenerated `generated/security/*` artifacts, the baseline file and docs.

---

## 8 · What this lane did NOT do

- **It wired nothing vacuous.** Every run reports `skipped 0`. `MUTATION_AUTH_AUDIT_OK=1` is set at
  job level precisely because without it `admin-mutation-auth` executes 1 test and skips 124 —
  triage note 3's forbidden shape.
- **It allowlisted nothing and skipped nothing.** No `--test-name-pattern`, no `t.skip`, no
  baseline line added.
- **It left T-8 / T-9 / T-10 alone** — 183 orphans, exactly where the triage report put them.
- **It did not repair the two `scripts/mutation-auth/*.test.ts` suites into CI.** Their snapshot
  counts were pinned to the old manifest (one of the three assertions was **already failing before
  this lane touched anything** — the extractor reads live source, and the source had moved), and
  they are re-pinned to the regenerated figures so they are green. They are not in the reachability
  guard's inventory and they are **not** claimed as wired or closed.
- **It did not touch `CLAUDE.md`.**

---

## 9 · Proposed CLAUDE.md sentence

For the Locked Decision 41 (b) paragraph, after the clause ruling the free draft onto an empty
slip:

> **A RULING THAT OVERTAKES A TEST IS NOT SATISFIED BY MAKING THE TEST STOP THROWING (ledger
> `2026-09-15-orphans-t4-t7-red-suites`).** Two snapshot-atomicity suites died on this rule's own
> refusal, and both held `assert.rejects` proofs with no predicate — so simply emptying their slips
> would have turned the refusal itself into the "proof", green and asserting nothing. **A suite
> repaired after a ruling states WHICH failure it expects**, and where the old shape is now
> unreachable by construction it proves the ruling's own guarantee instead: the rail REFUSES a
> non-empty slip and leaves every row, including a `purchased` one, byte-identical — which is what
> D-1's money-safety proof was always about.

