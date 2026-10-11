# Part 10 — final development gates and review package

## Decision boundary

**Development review only. NOT RELEASE-CERTIFIED. Production release is blocked.**
No production read, write, configuration change, scheduler activation, payment,
booking, account, expert or sender change was performed for Part 10.
No live email was sent for this gate; Part 9's previously approved receipts are
retained, not recreated or relabelled.

The implementation is carried in the existing draft PR **#1396**, not a second
implementation PR. The earlier archive-only PR #1391 is historical context;
the full archive is also in this implementation tree. The merge ledger entry
is **Deferred until actual human merge**, not recorded as if a merge occurred.

## Fresh gates

Authoritative fresh command results:
[`automation-part10-evidence/commands.json`](automation-part10-evidence/commands.json).
The checked command and provider-free isolation policy are retained in
`scripts/verification/run-commerce-final-gates.mjs`.

Typecheck: **117 diagnostics**, unchanged from the Part 1 baseline and exactly
the retained Part 9 diagnostic set after line-number normalization. **No new
diagnostics. Not a globally clean compiler/build.** Evidence:
[`typecheck-comparison.json`](automation-part10-evidence/typecheck-comparison.json).
The baseline was not raised.

Mutation-auth manifest/inventory and coverage were regenerated because the
implementation contains route changes; both subsequent checks passed. This
does not constitute a new guard-policy approval.

The initial guard batch was **77/78**, with the provider-idempotency test
unreachable from CI. It was wired into the existing isolated cart-test command
without changing the orphan baseline or guard policy. The corrected batch is
**78/78**, with the failed and corrected results both retained.

The first combined send-suite run failed one leaf assertion (and its parent):
the real handler replay suite had left eight fixture alert obligations in the
same schema, so a later drain test correctly counted unrelated due alerts.
Provider-failure tests now receive a separate disposable schema. No assertion,
runtime sender or expected unsafe-outcome characterization was weakened.
Corrected send and provider-failure results are recorded separately from the
original failed combined run.

Final command counts and any failed gates are recorded in the PR and the
completion addendum below. A passing characterization test is not evidence
that the unsafe behavior it reproduces has been repaired.

### Completion addendum — fresh development results

| Gate | Final disposition | Count / evidence |
|---|---|---|
| Typecheck | Satisfied at baseline | 117 existing diagnostics, zero additions/removals; compiler exits nonzero |
| Guard batch | Fixed, then satisfied | Initial 77/78; corrected 78/78, `golden-1-9093261c-e24f-4105-bc01-8684a27ed222/results.json` |
| Golden regression | Satisfied | 143/143 reported entries, 0 failing; `golden-1-43a19117-93b5-4300-a14b-023c479f3ded/results.json` |
| Mutation-auth inventory/coverage | Satisfied | Four generated artifacts, regeneration and check exits 0 |
| Parts 2–5 retained native suites | Satisfied on approved subset | 11/11 reported TAP entries each of two outer runs; randomized inner two-loop scenarios retained |
| Parts 6–9 verifier/replay/isolation suites | Fixed isolation, then satisfied | Corrected 9/9 TAP entries each of two fresh runs, 0 failures/skips |
| Provider-failure characterizations | Satisfied as tests, safety still open | 15/15 TAP entries each of two separately isolated runs; 14 leaf scenarios plus parent each run |
| Actual sendEmail / mocked SDK boundary | Satisfied as provider-free proof | 16/16 Vitest checks, two randomized inner loops; not a real provider guarantee |
| Vendor-bulk proposal specification | Satisfied as specification | 17/17 Vitest checks; direct sender unchanged |
| Part 9 owned QA dry proof | Satisfied | Two fresh randomized loops, four synthetic submissions each, owned schemas removed; 0 real messages |
| Trigger archive/catalog | Satisfied | Full 15-trigger DDL retained; read-only public commerce trigger count 0 |
| Current-main mergeability | Open | Conflict in cart-projection service; held heartbeat draft numbering/schema decision |
| Production/release checks and ledger merge row | Deferred | No authorization/merge claimed |

Fresh QA dry artifact:
`automation-part9-evidence/proof-c8dd5964-f778-40f5-ad09-74b10bfe5490.json`.
Corrected send commands are in
`automation-part10-evidence/commands-send-corrected.json`.
The initial full-run command file intentionally preserves its failed guard and
combined-schema test entries and resulting nonzero aggregate exit. It is not
rewritten as a successful run. Corrected evidence supersedes those individual
failed gates only; it does not close the reproduced release safety failures.

## Per-rule disposition

Satisfied means the approved development/readable-record scope only unless
expressly stated otherwise. Deferred means an approved hold or accepted scope
limit. Open means a requirement for full release remains unproven or unsafe.
The detailed randomized per-rule counts remain in the linked reports.

| Rule | Disposition | Evidence / boundary |
|---|---|---|
| Part 1 baseline freeze and retained golden coverage | Satisfied | Golden results and Part 7 original-runner coverage explanation; 143 reported entries are not 143 unique database tests |
| Development-only, isolated fixtures and no live transport in final gates | Satisfied | Retained schema owner, provider-free child, QA dry mode; command logs and cleanup assertions |
| Server-authored activity clock in cart JSONB | Satisfied | Part 2 report; cart-email-state pure/DB tests |
| Client stamp/snapshot ignored | Satisfied | Cart-email-state DB/pure tests |
| Only add/remove/quantity activity moves clock | Satisfied | Part 2 tests; display/page/background updates do not move it |
| Atomic one-statement cart and stamp writes, safe failure | Satisfied | Part 2 DB rollback/error tests |
| Null, malformed, huge and legacy input safety | Satisfied | Part 2 randomized/fuzz tests |
| Concurrent cart writes, no lost update | Satisfied | Part 2 DB ordering tests |
| Add-time price/currency/availability/captured_at snapshot | Satisfied | Part 2 DB tests |
| Display metadata does not overwrite snapshot | Satisfied | Part 2 tests |
| Legacy missing stamp/snapshot skipped without guessed backfill | Satisfied | `no_snapshot` and missing-activity checks |
| Resumed cart starts new sequence; old step history does not suppress it | Satisfied | Part 2/4/8 tests |
| Idle boundary below/at/above 60 minutes | Satisfied | Part 2/4/8 randomized scenarios |
| Latency and success comparison | Satisfied in measured development scope | Part 2 evidence, refreshed native DB test; not a production benchmark |
| Post-payment cleanup excluded from activity clock | Deferred, approved scope exception | Founder-approved Part 2 exclusion; no payment cleanup edit |
| One query/enqueue sweep, existing registry/job system reused | Satisfied in development | Part 3 report, registry/roster checks and sweep tests |
| Sequential and simultaneous sweeps do not duplicate obligations | Satisfied | Part 3/8 DB tests, existing commerce dedupe index |
| Successful and empty sweep heartbeat | Satisfied | Part 3 tests, explicit zero-enqueued success |
| Candidate-query fault produces failed heartbeat | Satisfied in isolated schema | Part 3/8 fault tests; persistent heartbeat migration remains held |
| Heartbeat nullable-success migration registration/deployment | Open | Unregistered `360_job_heartbeats_nullable_success.sql`; current main owns 360 with a different migration |
| 1h / 1d / 3d eligibility and threshold boundaries | Satisfied on readable subset | Part 4/8 matrix; 15-minute scheduling interval is not real next-day timing proof |
| Items present and authenticated claim required | Satisfied | Part 4/8 before/after-claim and empty-cart cases |
| Known email, unchanged recipient and account ownership | Satisfied | Part 4/6/8 live-recipient checks |
| Account exists, not deleted or suspended | Satisfied | Part 4/6/8 account scenarios |
| Marketing consent and unsubscribe enforcement | Satisfied | Part 4/6/8; item change exemption tested separately |
| No previously sent step for this sequence | Satisfied | Part 4/8 dedupe/history tests |
| Fourth reminder impossible | Satisfied | Part 4/8 family/step validation |
| Sending window 09:00 inclusive to 20:00 exclusive, local time | Satisfied | Part 4/6/8 boundaries at queue and final handoff |
| Unknown timezone skipped with reason | Satisfied | Part 4/6/8 scenarios |
| One marketing message per traveler/local day | Satisfied | Shared recipient locking and daily-cap tests |
| Cart wins over simultaneously due itinerary reminder | Satisfied | Part 4/8 priority scenarios |
| Unpaid on every payment rail | Open | Readable sources tested; UNKNOWN lifecycle/ownership rails remain blocked |
| Normal cart reminders remain blocked | Satisfied as safety hold; Deferred activation | Ordinary runtime gates remain closed; no production sending authorized |
| Price up/down and availability-loss classification | Satisfied on recorded facts | Part 5/8 matrices; active listing alone is not stock proof |
| One notification per observed change; notified values retained | Satisfied on readable subset | Part 5/6 tests |
| Unsubscribed traveler eligible for item-change notice | Satisfied for eligibility | Part 5/6; actual must-have dispatch stays held |
| Actual item-change notice delivery | Open | `must_have_payment_ordering_unknown`; Part 9 copies are transport/template proofs, not actual item dispatch |
| A→B→A / repeated-target limit and absent historical facts | Deferred, documented known limit | Part 5 report; no event-history guessing/backfill |
| Late live account/cart/payment/recipient/content/sequence verification | Satisfied on readable subset | Part 6/8 send verifier tests |
| Cancel reason `paid` | Satisfied on readable subset | Part 6/8 persisted reason tests |
| Cancel reason `cart_empty` | Satisfied | Part 6/8 persisted reason tests |
| Cancel reason `unsubscribed` | Satisfied | Part 6/8 persisted reason tests; item-change exemption retained |
| Cancel reason `item_changed` | Satisfied | Part 6/8 stale-price/availability tests |
| Cancel reason `superseded` | Satisfied | Part 6/8 sequence tests |
| Cancel reason `account_gone` | Satisfied | Part 6/8 deleted/suspended tests |
| Cancel reason `no_email` | Satisfied | Part 6/8 missing/changed recipient tests |
| Any check exception fails closed | Satisfied before provider acceptance | Part 6/8 fault tests; `check_failed`, no handoff |
| Atomic claims and cancelled rows terminal | Satisfied for pre-handoff cases | Part 6/8 concurrent/retry tests; provider-acceptance faults listed separately |
| Sweep deliberately misses cart, dispatcher still cancels invalid row | Satisfied | Part 6/8 fault scenario |
| Payment versus send, both orderings | Satisfied on readable rails only | Part 6/8; not proof of external/unrecorded activity |
| Stripe event repeated three times; actual webhook/success handler together | Satisfied in isolated handler proof | Handler-replay suite; Stripe retrieval mocked, no real payment |
| Sell-out versus due reminder, both recorded orderings | Satisfied within approved marketing scope | Part 8 matrix and decision measurements |
| Final-read to handoff payment/inventory residual | Deferred, accepted marketing-only risk | Measurement table below; not repaired, not extended to must-have messages |
| No lost acceptance / duplicate submission after provider success and DB failure | Open | Provider-failure suite reproduces lost receipts and duplicate submissions; passing test means reproduced, not fixed |
| Fifteen development commerce triggers archived and uninstalled | Satisfied | Full DDL below; fresh read-only catalog count 0 |
| Shared itinerary cancellation, recipient locks, timezone, registry, outbox retained | Satisfied | Part 7 import/KEEP tables and fresh itinerary/signup golden DB tests |
| Original 37 wrappers, hook helpers, unregistered trigger draft identities/removals | Deferred, accepted blocker | UNKNOWN identities in Part 7 classification; no fabricated removal claim |
| Eight unused backing SQL functions | Deferred, approved cleanup hold | Part 7 classification; functions retained, no further DDL |
| Migrations 346/347 remain main-owned; no new Part 10 migration | Satisfied | No migration/registry edits in this gate |
| Direct senders inventoried, vendor bulk first; none changed | Satisfied for inventory | All ten families and unused helper below |
| Corrected cart-email-state fixture carried in actual implementation PR | Satisfied for carriage | Full source file and dependencies included in PR #1396, not only an archive-body reference |
| New randomized scenarios and two clean loops for readable rules | Satisfied for approved development scope | Part 8 matrix and fresh retained suites; structural risks remain explicit |
| Six unsuccessful closure loops classified STRUCTURAL RISK | Satisfied for reporting | Part 8 matrix; no UNKNOWN removed to make tests green |
| Real provider-observed QA receipts | Satisfied for approved QA proof only | Part 9 receipt tables; monitored development substitution, not literal `.test` mailbox delivery |
| Corrected timestamp-qualified item-change copy wording | Fixed in development QA harness only | Part 9 two separately approved corrected copies; actual item rows stayed held |
| Real next-day proof | Open | Controlled-clock 1d QA proof is not a real elapsed next-day proof |
| Email-client/browser rendering and authenticated journey certification | Open / Deferred | Existing payload/handler proof does not establish full email-client/browser matrix |
| Approved deployed commit/configuration/scheduler/real delivery checks | Deferred until release authorization | Not run for Part 10 |
| Current-main integration / mergeability | Open | Read-only merge preview conflict in `server/services/cart-projection.service.ts`; no runtime reconciliation authorized here |
| Ledger row at merge | Deferred until merge | PR checklist requires human merge write-back; no merge or false ledger row |

## Required archives and removal/KEEP manifest

- Full observed DDL for **15 triggers**, including function definitions:
  [`commerce-development-triggers.sql`](commerce-development-triggers.sql).
  This is an archive, **not an executable registered migration**.
- Removal inventory: [`commerce-part7-removal-inventory.html`](commerce-part7-removal-inventory.html).
- Trigger uninstall evidence: [`commerce-part7-trigger-cutover.md`](commerce-part7-trigger-cutover.md).
- KEEP/import and UNKNOWN classification:
  [`commerce-part7-unknown-classification.md`](commerce-part7-unknown-classification.md).
- Original-runner restoration and per-behavior DB parity:
  [`commerce-part7-golden-db-proof.md`](commerce-part7-golden-db-proof.md).
- Fresh read-only development catalog check: **0** non-internal `commerce_%`
  triggers in public. No uninstall or function cleanup was performed in Part 10.

## Residual measurement, not a repaired guarantee

Retained Part 8 decision measurements, two randomized loops:

| Family | Availability-read return → synthetic invocation (ms), loops 1 / 2 | Final verifier return → synthetic invocation (ms), loops 1 / 2 |
|---|---:|---:|
| 1h reminder | 36.637 / 24.702 | 30.688 / 17.106 |
| 1d reminder | 10.548 / 15.154 | 4.414 / 6.066 |
| 3d reminder | 9.733 / 13.276 | 5.081 / 4.539 |
| Marketing payment residual | N/A | 25.628 / 31.907 |
| Item change | No actual handoff | Prospective boundary only: 19.442 / 19.170 |

Synthetic invocation is not provider HTTP transmission, delivery, production
latency, or an exact global payment snapshot instant. Item-change rows remained
pending with zero provider calls. Fresh send-suite logs retain new measured
windows; they do not expand the approved marketing exception.

## Previously authorized real delivered proof

Part 9 preserves all ten provider-observed delivered IDs with schema-local outbox
IDs and scope. No real mail was sent again for Part 10.
The final corrected copies had outbox row **1** in each distinct loop schema:

- `01a1278b-871e-7b42-b294-54dd88d0db2d` — delivered; price-change/unknown-stock copy.
- `01a1278b-c906-7184-a932-d52ad5736d6b` — delivered; recorded-capacity-loss copy.

The original six guarded reminder deliveries and two earlier item copies are
listed in [`automation-part9-verification.md`](automation-part9-verification.md).
QA copies do not clear actual item-change ordering holds. Prior historical
“zero receipts” language in earlier reports describes those earlier passes,
not the later authorized Part 9 run.

## Every direct sender found

Exact file/line/caller, reliability and duplicate risks and priority are in
[`commerce-direct-senders.md`](commerce-direct-senders.md).

1. **Vendor bulk email — first future conversion priority.**
2. Booking/claim failure, cancellation, refund and expiry notices.
3. Authentication verification and password reset.
4. Identity verification decisions.
5. Expert application decisions.
6. Provider application decisions.
7. Plan-delivered notices.
8. Traveler plan decisions: approval/changes requested.
9. New-suggestion notices.
10. Administrative digests.

Also found and retained: unused `sendBookingConfirmationEmail`; operational
nightly-QA report sender; manual admin test-email sender; generic transport
helper (not a distinct business family). Signup welcome and normal itinerary
messages already use the outbox and are not direct-sender conversions.
No sender was changed or converted in Part 10.

## Outside scope / held

- Payment/checkout/booking writers, metadata/provenance implementation and
  unresolved external payment rails.
- Schema/migration registration, renumbering or production migration application.
- Direct-sender conversion, runtime retry fixes, provider reconciliation and
  must-have dispatch activation.
- Guard-policy approval or baseline increase.
- Production publish/configuration/scheduler changes and checks before release
  authorization; account, expert and routing requests.
- Cleanup of deferred SQL functions or unidentified historical wrapper/helpers.
- Real new emails, real charges/refunds/captures and extra delivery retries.

## Final readiness

**Part 4 is DEV-CLOSED on the approved readable-record subset, not genuinely
complete.** All-rail lifecycle/ownership provenance, normal-send activation,
provider/DB ambiguity safety, real elapsed next-day proof and authorized
production/configuration/scheduler/delivery checks remain open or held.
The actual item-change dispatch and accepted marketing residual remain distinct.
The draft PR must not be merged or released as an all-rule certification.
