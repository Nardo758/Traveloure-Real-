# Part 1: generation-outcome emails

## Approved scope

The operator approved keeping pay-per-use and Trip Pass billing untouched and building only
itinerary_ready and itinerary_failed, including failures after five minutes. Credit alerts,
wallet reactivation, and allowance systems are explicitly excluded.

## Phase 0 reuse

Extend messaging.plan-delivered-email with itinerary.ready while preserving expert delivery.
Add messaging.itinerary-failed-email for itinerary.failed. Use the existing email_outbox,
enqueue registry boundary, provider transport, retries, kill switch, and drain.
The earlier inventory report remains reports/stage2-part1-reuse-check.html.

## Outcome ownership

Stamp the attempt at optimizer entry. A conditional update on comparison ID, generating
status, and attempt timestamp owns each terminal transition. Persist that transition and its
outbox notice in one transaction. A five-minute deadline timer handles a live stalled attempt;
the existing sweep recovers interrupted processes. Attempts older than five minutes cannot
publish a ready outcome. A stale worker/timer cannot alter a newer attempt.

Ready deduplicates per comparison, not per traveler/day, using an advisory-locked outbox
metadata key. Failure deduplicates per comparison/attempt. Delivery occurs only after commit,
uses the same provider idempotency key over retries, and suppresses deleted or superseded
outcomes before sending. Existing expert-delivery copy is unchanged.

No fee resolver, payment gate, payment identity, membership, Trip Pass, wallet, or credit
writer is changed. Failed-email copy promises neither a refund nor a free retry.

## Phase 1 and Phase 2 verification

Exercise success, errors, timeout boundary and beyond, two itineraries on one day, duplicate
completion, timeout then late completion, newer-attempt protection, retry delivery, rendering
escape safety, missing email, deleted account/itinerary, and transactional rollback.
Use two varied local loops and rollback-only development database fixtures.

Refine copy and guards based on those results. Local evidence is not live inbox certification.
An approved real inbox has now been supplied and configured in the development-only allowlist.
Provider delivery evidence and the operator's inbox receipt are separate verification stages.

Development queues notices only when the persisted traveler email matches
ITINERARY_OUTCOME_TEST_EMAIL. No recipient is rewritten. An unset or placeholder value means no
new development emails are queued; production uses the actual traveler address. Configure this
allowlist through workspace environment settings only after obtaining the operator's real inbox.

## Local verification evidence

- Read-only registry inspector validates 86 nodes: the ready node is extended and one failure
  node is added. No credit automation is added.
- Nine Node checks pass, including producer/provider adapter preservation, varied outcome
  boundaries, per-itinerary keys, safe copy, and development recipient restrictions.
- Eight database checks pass with two varied ready/failure/refinement loops. They exercise
  real development SQL inside rolled-back transactions and an intercepted sender; no provider
  receipt is claimed. Coverage includes duplicate claims, same-day independent itineraries,
  retry keys/backoff, terminal and newer-attempt guards, deletion/supersession, missing email,
  cancelled-ready recovery (exact case and two variants), and outbox atomicity.
- The application workflow was restarted and the public landing page renders.
- The repository-wide typecheck is not clean. Existing optimizer diagnostics remain on the
  unchanged nullable metrics arguments and Set iteration. New outcome-email modules have no
  reported diagnostics. A separate full baseline compiler comparison timed out; it is not a
  passing verification step.
- Billing/credit/Trip Pass sources and configuration are unchanged. No commit or publish.

## Live development verification

The live suite passed on 2026-10-04 in approximately six minutes and twenty-four seconds:

- Two consecutive ready cases used actual Anthropic calls, persisted AI variants, and produced
  separate ready notices for two itineraries on the same day.
- Two consecutive error cases injected a preprocessing failure and exercised the optimizer's
  real failure handler, committed outcome, registry, outbox, and provider delivery.
- Two concurrent stalled-upstream cases used an intercepted never-resolving model response.
  Neither clock nor timestamp was mocked: the optimizer's actual five-minute deadline marked
  both comparisons failed and sent their timeout notices. Both rejected late ready completion.
- All six outbox records were sent, with six distinct provider IDs. Read-only Resend lookups
  confirmed `last_event=delivered` for every message.
- The operator confirmed on 2026-10-04 that all six messages arrived in Inbox, not Spam.
- New sends were limited to the approved persisted recipient. The harness blocked unrelated
  recipients and used development links, rather than links to production-only data.
- After the operator confirmed Inbox receipt and authorized cleanup, the isolated development
  QA account and all six labeled comparison fixtures were deleted in one guarded transaction.
  Verification found zero remaining QA accounts, comparisons, or variants. All six delivery
  audit records were retained byte-for-byte unchanged. The test-email links no longer resolve
  to fixture data. No production fixtures, payment, Trip Pass, wallet, or credit changes were
  made. This run did not exercise checkout or certify unchanged billing flows.
- The local harness is in `.local/tests/itinerary-outcomes-live.vitest.ts`; output evidence is
  in `/tmp/itinerary-outcomes-live.log`. No recipient address or credentials belong in this doc.

Status: implementation, real generation, real elapsed timeout, provider delivery, and operator
Inbox receipt verified. Authenticated link usability and unchanged billing journeys were not
exercised by this live run and are not certified.

## Phase 2 refinement closeout — 2026-10-04

### Phase 0: exact inventory and billing mapping

There are **two**, not four, in-scope automation definition files:

1. `server/automations/messaging/plan-delivered-email.ts` — existing node
   `messaging.plan-delivered-email`, extended with `itinerary.ready`.
2. `server/automations/messaging/itinerary-failed-email.ts` — added node
   `messaging.itinerary-failed-email`, handling generation errors and timeout outcomes.

Supporting modules `server/services/itinerary-generation-outcome.service.ts` and
`server/services/itinerary-outcome-email.ts` are not additional automations. Counting those
helpers as two more automation definitions would misrepresent the implementation.

Fresh registry inspection reports 86 valid nodes, exactly two nodes for `itinerary.ready`
and `itinerary.failed`, and no one-credit-left/out-of-credits nodes. A source search found no
references to those excluded automation names in server, client, shared, or scripts.

The actual run gate is `server/services/optimizer-run-authorization.ts`, wired from
`server/routes.ts`: Trip Pass coverage, the recent-run window, an already-recorded payment,
or verified pay-per-use payment. There is no active itinerary-credit allowance/decrement in
this approved path. A null payment ID in service-level QA is not evidence of credit safety
or of payment authorization. These tests deliberately do not exercise checkout/run-gate HTTP
flows or modify billing.

### Phase 1: loop-by-loop evidence and bug list

The original six live cases remain delivery audits 475–480:
two actual AI ready cases, two controlled preprocessing-error cases, and two concurrent
stalls with real elapsed five-minute deadlines. Resend confirmed delivery of all six and the
operator confirmed Inbox receipt. Those ready cases were sequential, not concurrent successes.

Fresh refinement ran separately from that evidence, with new randomized inputs and UUIDs:

| Fresh case | Evidence | Result |
| --- | --- | --- |
| Concurrent ready generation 1 | Audit 504; comparison `a5b93666-278d-44ae-a6fd-54f84c5b9746`; provider `01a106db-6ed5-75a9-8f57-79b8794ca17c` | Real AI variants persisted; sent and provider-delivered |
| Concurrent ready generation 2 | Audit 505; comparison `ce571435-1579-4b76-9918-fe5c9d9fc846`; provider `01a106db-7eda-76c2-bc5b-9143b37e1724` | Real AI variants persisted; separate sent and provider-delivered notice |
| Fresh failure loop 1 | Random item selection and unique fault token; item-name getter failure, not the earlier array-reduce interception; audit 506; provider `01a106db-7f79-75f8-a38a-a7ce311db527` | Failed comparison; no optimized timestamp or payment ID added; failure notice provider-delivered |
| Fresh failure loop 2 | New random item selection and fault token; item-duration getter failure; audit 507; provider `01a106db-8007-7718-8319-a630cdfeabb3` | Same failure invariants; independent failure notice provider-delivered |

Both successful generations belonged to the same newly created QA user. Both attempt timestamps
are `2026-10-04T12:19:31.749Z`; their completion timestamps are `12:20:06.389Z` and
`12:20:10.542Z`. The test also observed both comparisons in generating state simultaneously.
Their ready deduplication keys contain different comparison IDs. Concurrent duplicate delivery
attempts did not create extra outbox notices.

Each fresh message was independently checked through Resend until `last_event=delivered`.
New Inbox placement was not manually confirmed; the older six-message Inbox confirmation
is not reused as confirmation for these four.

The fresh live case and all eight rollback-only DB regression checks passed:
**2 test files, 9 tests, 55.33 seconds**. The DB suite's sender is intercepted and its rows are
rolled back; its fake provider IDs are not live-delivery evidence. The separate Node checks and
registry validation also passed.

Reproduction:

```sh
RUN_GENERATION_OUTCOME_DB_TESTS=1 npx vitest run \
  --config .local/tests/itinerary-outcomes-refine.config.ts
npx tsx --test server/services/__tests__/itinerary-outcome-email.test.ts
npx tsx scripts/check-automation-registry.ts
```

Fresh run output: `/tmp/itinerary-outcomes-refine.log`. Committed live-delivery evidence is
retained in outbox audits 504–507. The new harness refuses to reuse an existing account at the
approved address and removes its own new QA account/comparisons after verification.

Bug/risk disposition for the notification path:

- Previously fixed cancelled-ready suppression remains closed: two new regression loops
  exercise the exact cancelled-row case plus two destination variants; the same row/key is
  recovered and delivered once.
- Per-user/day dedupe risk is closed for the two-itinerary case by live concurrent evidence
  504/505. The ready identity remains per comparison.
- Terminal-state/outbox split is closed by the transaction and fresh insert-failure rollback
  regression. A notice-persistence failure does not leave a generated terminal status.
- Late-terminal and newer-attempt overwrite risks remain closed by conditional attempt/status
  ownership and fresh rollback-only regression loops. These assertions cover terminal state
  and notification ownership, not every intermediate optimizer write.
- Provider retry duplication remains closed by fresh lease/claim and stable-key regressions.
- Missing-email/deleted/superseded recipient risks remain closed by fresh no-send/cancellation
  regressions.
- No new failures occurred in this refinement run. Repository-wide compiler cleanliness,
  authenticated email-link usability, intermediate optimizer-write isolation, and unchanged
  billing journeys are not certified by this test set.

### Phase 2: requested item statuses

| Requested item | Status | Evidence / remaining condition |
| --- | --- | --- |
| 1. Exactly four automation files | **Deferred** | Two definition files exist and are named above. The two credit alerts were explicitly excluded. Scope reconciliation is required; no dummy files were created. |
| 2. Every automation fired with real evidence | **Satisfied for the two approved automations** | Ready 504/505 and failure 506/507 each sent and provider-delivered; original timeout deliveries 479/480 remain available. This does not certify two nonexistent credit automations. |
| 3. Structural risk flags resolved | **Fixed for previously identified notification-path flags; broader certification Deferred** | Existing fixes were freshly reverified as listed above. Global compiler, authenticated-link/billing verification, and intermediate optimizer-write isolation are not passed off as resolved. |
| 4. Fresh randomized failure never consumes a credit | **Deferred** | Two genuinely fresh randomized failures passed, but there is no active itinerary-credit counter to measure. An absent counter is not passing credit-integrity evidence. A separately approved credit policy is required. |
| 5. Concurrent successes, two sends, correct credit decrement | **Deferred overall; notification portion Satisfied** | Two overlapping real AI generations for one user produced distinct delivered ready notices. Credit decrement cannot be certified without an active, approved credit policy. |
| 6. No orphaned references | **Satisfied for notification registry and QA operational references** | Registry validation passes; fresh account, four comparisons and associated variants are absent. Read-only post-cleanup SQL finds zero pending/sending/failed outcome notices with missing comparison/user references. Historical sent audits intentionally retain their comparison identifiers, as previously authorized. |

The four fresh delivery audits remained unchanged during guarded transactional cleanup.
The original six audits were not deleted. Production data, billing sources, and app runtime
configuration were not changed; no commit or publish was performed. The landing page renders.
The new fixture email links no longer resolve to fixture data, intentionally following cleanup.

**Closeout:** the requested six-point checklist is not fully certified. Do not declare Part 1
genuinely complete while the count/credit acceptance requirements and broader verification
deferrals remain unresolved.