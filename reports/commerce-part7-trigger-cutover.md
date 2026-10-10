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
| Native isolated regression loop 1 | FAIL | 67/68 passed, zero skipped; cart-email-state.db.test.ts:207 expects number but receives null after the current pre-queue verifier reports empty_cart |
| Native isolated regression loop 2 | NOT RUN | First loop failed; no claim of two clean regression loops |
| Signup welcome suite | PASS WITHIN LOOP 1 | Existing signup-welcome-outbox.db.test.ts included |
| Itinerary pure-policy suites | PASS WITHIN LOOP 1 | itinerary-followup-email.test.ts and itinerary-outcome-email.test.ts included; not a full DB cancellation proof |
| Original 143-test golden harness | UNAVAILABLE | Harness absent in current checkout; reports retain prior results only; no Git-history reconstruction |
| Application boot / signed-out preview | PASS | Existing workflow restarted once; landing screenshot renders; expected signed-out 401s |
| Cart-write-only / sweep-only full gate | INCOMPLETE | Native regression failed before completing Part 2 fixture proof; no assertion weakened |

The original node invocation of check-automation-registry.ts failed because Node cannot execute TypeScript directly; rerunning with its proper tsx runner passed. This is an invocation correction, not a code change.

## Carried forward

The identities of the original 37 wrappers, legacy TypeScript mutation/lifecycle helpers and trigger-migration drafts remain UNKNOWN. They were not deleted or counted as already removed. Eight backing SQL trigger functions remain UNKNOWN for deletion and were retained. All KEEP items stay. Direct-sender report completion and full remaining Part 7 regression certification are outside this approved trigger-only removal result. Parts 4–6 release blockers and normal-send holds remain unchanged.

PART 7 IS NOT COMPLETE. NOT READY FOR PART 8. No release certification or activation.
