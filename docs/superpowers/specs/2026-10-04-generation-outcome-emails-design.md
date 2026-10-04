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
The supplied inbox is still a literal placeholder; no live sends may be initiated to it.
Receipt and real-AI end-to-end evidence remain blocked until an approved real inbox is supplied.

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

Status: implemented and locally verified, NOT live certified. Real generation, real timeout
timing, inbox receipt, and the requested live clean loops await an approved real test inbox.