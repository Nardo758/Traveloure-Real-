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