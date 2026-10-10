# Part 7 — approved trigger-only cutover

## Scope completed

All 15 explicitly approved development commerce trigger instances were removed in one guarded transaction. Their trigger and function DDL was saved in draft PR https://github.com/Nardo758/Traveloure-Real-/pull/1391 before removal; the SQL archive was verified byte-for-byte (SHA256 ca050dff6b612af6ad65ef82cdd71c4c6bcf06f8c9e7f442e3ae78fff8260aa8). PR contents are documentation only, with no runtime or migration edits.

Guards checked each approved trigger/function definition and enable state against the archived catalog before removal; drift would abort. Postconditions checked zero commerce triggers and unchanged protected itinerary-trigger/function definitions and dedupe index before commit.

Two post-removal catalog reads, including one after app restart, confirmed zero commerce triggers. All five itinerary-cancellation triggers remain; their DDL and function DDL are unchanged. The commerce dedupe index is unchanged. All eight UNKNOWN backing SQL functions remain. No production operation, new migration, payment/checkout edit, flag change or direct-sender edit.

## Verification

| Check | Result | Evidence / limitation |
|---|---|---|
| Approved trigger uninstall | PASS | 15 DROP TRIGGER commands committed atomically after DDL archive |
| Post-removal catalog checks | PASS, 2 checks | Zero commerce triggers; five protected itinerary triggers; dedupe index intact; eight backing functions retained |
| Build | PASS | npm run build, exit 0; 11 existing import.meta/CommonJS warnings |
| Typecheck baseline | PASS AT BASELINE | 117 diagnostics, same count as Part 1; not a clean typecheck claim |
| Registry | PASS | npx tsx scripts/check-automation-registry.ts |
| Cron roster | PASS | node scripts/check-jobs-cron-roster.cjs |
| Test wiring | PASS | Existing orphan baseline remains; no new wiring edits |
| Native isolated regression loop 1 | PASS AFTER APPROVED FIXTURE CORRECTION | 68/68 passed, zero failed, zero skipped; disposable schema removed |
| Native isolated regression loop 2 | PASS AFTER APPROVED FIXTURE CORRECTION | 68/68 passed, zero failed, zero skipped; disposable schema removed |
| Signup welcome suite | PASS IN BOTH LOOPS | Existing signup-welcome-outbox.db.test.ts included |
| Itinerary pure-policy suites | PASS IN BOTH LOOPS | itinerary-followup-email.test.ts and itinerary-outcome-email.test.ts included; not a full DB cancellation proof |
| Original 143-test golden harness | UNAVAILABLE | Harness absent in current checkout; reports retain prior results only; no Git-history reconstruction |
| Application boot / signed-out preview | PASS | Existing workflow restarted once; landing screenshot renders; expected signed-out 401s |
| Guarded queue / generic rejection / dispatcher hold | PASS IN BOTH LOOPS | One guarded row; repeat reports already_notified, no duplicate; generic enqueue rejected; dispatcher retains must_have_payment_ordering_unknown; zero mocked provider calls |
| Cart-write-only / sweep-only full gate | INCOMPLETE | These checks do not resolve the UNKNOWN legacy identities or replace the unavailable full golden harness |

## Approved test-only correction and final loop evidence

Only `server/__tests__/cart-email-state.db.test.ts` changed. The fixture uses the
account's own randomized QA-domain recipient, a fixed-price service and valid
cart/trip/item correlation. It uses the existing recipient lock, assessment,
guarded producer and dispatcher; runtime code remains unchanged. Its original
generic-immediate-success expectation was obsolete: generic item-change enqueue
is intentionally forbidden, and the dispatcher must defer this must-have family
while payment ordering remains UNKNOWN.

Snapshot and activity-stamp assertions remain. The guarded producer returns one
outbox ID, a repeat records `already_notified` with no duplicate, and generic
enqueue is independently rejected. Queueing and dispatcher invocation produce
zero provider calls. Existing test-only readable-rail and clock seams are restored
in `finally`; no production or deployment flag was changed.

The initial uncorrected regression run failed 67/68. The first correction caught
a test expectation error on the repeat: `already_notified` is the expected dedupe
reason, not an empty skip map. After correcting that expectation, two consecutive
fresh full isolated native runs passed 68/68 with zero skips. Fresh typecheck
remained at 117 diagnostics and test wiring passed.

The final runs used workspace source `500b01774ea5b755cfd169d699019b7ca5e83e7f`
plus the single-file fixture diff. Both runs also completed the Part 2 test's two
randomized inner loops and its before/after benchmark (60/60 successful writes
per mode per inner loop). No real email delivery claim is made.

The test file is absent from the draft documentation PR's base branch. It was
not copied onto main with its feature-branch dependencies; the PR body records
the exact test diff and verification instead. The approved correction is retained
in the development workspace.

The original node invocation of check-automation-registry.ts failed because Node cannot execute TypeScript directly; rerunning with its proper tsx runner passed. This is an invocation correction, not a code change.

## Carried forward

The identities of the original 37 wrappers, legacy TypeScript mutation/lifecycle helpers and trigger-migration drafts remain UNKNOWN. They were not deleted or counted as already removed. Eight backing SQL trigger functions remain UNKNOWN for deletion and were retained. All KEEP items stay. Direct-sender report completion and full remaining Part 7 regression certification are outside this approved trigger-only removal result. Parts 4–6 release blockers and normal-send holds remain unchanged.

PART 7 IS NOT COMPLETE. NOT READY FOR PART 8. No release certification or activation.
