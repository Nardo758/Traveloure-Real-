# Legacy confirmation persistence verification

## Approval and result

The founder approved atomic persistence for future legacy confirmations and
then approved the written design on 2026-10-08. No schema change, historical
recovery scan, new scheduler, registry, real mail, captures, or refunds was
authorized or performed.

49 native PostgreSQL regression tests passed on the final application-main-based
branch: 24 persistence/recovery tests and 25 retained webhook/browser race tests.
Each suite used its own empty constraint-preserving development fixture schema
with owned sequences, then verified its removal. Stripe retrieval and email
transports were simulated; unexpected HTTP/HTTPS/fetch provider calls were
forbidden.

## Persistence and recovery evidence

- Both authoritative legacy writers persist a pending traveler notice in the
  same transaction as their winning booking confirmation. No traveler mail is
  sent by the writer before commit.
- Real PostgreSQL detail-query errors and outbox trigger rejection roll back
  confirmation. After the failure is removed, the authoritative writer commits
  exactly one notice with the booking's stored code.
- Separate writer processes were killed with SIGKILL after their native action
  completed but before transaction commit, and after commit but before traveler
  delivery. Both webhook and page writers were tested at both boundaries.
- A pre-commit kill leaves no confirmation code, email, or earnings/revenue;
  an authoritative retry succeeds. A post-commit kill leaves a pending notice
  that the surviving process delivers through the existing outbox drain.
- Repeated delivery preserves the committed code and confirmed timestamp.
  Booking, outbox metadata, and simulated traveler mail contain the same code.
- Two/eight concurrent webhook deliveries for full payment and deposit retain
  one winner, one traveler outbox row, and one successful simulated send.
  Both writer orderings and a page/webhook race preserve winner-only earnings.
- Provider earnings and platform revenue counts, amounts, and existing flags
  remain unchanged. The webhook does not gain a new earnings writer.
- Missing traveler recipients produce one explicit dead/blocked outbox row.
  It is not silently discarded or sent to an invented recipient.
- A simulated transport outage retries the same persisted row and code.
- The native browser response handler returns retryable 503 with a warning
  not to pay again after a persistence failure, then succeeds on retry.
- The native webhook response handler locally verifies a synthetic signature,
  returns 500 after persistence failure, and returns 200 for the same event
  after recovery and for subsequent duplicate delivery.

## Checks

```sh
# Independently obtain the fingerprint from the DEVELOPMENT database.
MESSAGING_DEV_FINGERPRINT=<verified-development-fingerprint> \
  node scripts/verification/run-messaging-gate.mjs --isolated-db \
  server/__tests__/legacy-confirmation-persistence.db.test.ts
MESSAGING_DEV_FINGERPRINT=<verified-development-fingerprint> \
  node scripts/verification/run-messaging-gate.mjs --isolated-db \
  server/__tests__/legacy-webhook-confirmation.db.test.ts
git diff --check
```

Earlier TypeScript comparison against the task's initial runtime: 117 existing
diagnostics before and after, zero new diagnostics. The comparison substituted
the base versions of changed runtime sources in memory and excluded newly added
files from the baseline program; it did not edit the application to run checks.
An origin/main comparison also returned 117 on each side. A subsequent in-memory
two-program comparison on the final application-main branch exceeded its
four-minute limit without a result; it is not claimed as a passing final check.

The first scoped branch was based on GitHub's `origin/main`, but task completion
syncs with the separate application main branch. Its attempted sync replayed
unrelated history and produced incorrect edits outside this task; that sync was
aborted. The final branch starts directly from application main, contains no
client/shared/script changes, and retains its existing browser-race tests.
The recovery suite is separate; the retained tests now invoke the existing
drain after commit and synchronize the actual transactional claim.

The preview started successfully, registered its existing outbox scheduler, and
rendered the landing page; the development proxy returned 200. The first restart
applied zero migrations. Normal startup on the intermediate GitHub-main branch
applied its pre-existing `359_trips_stay_pick.sql`, unrelated to this fix. This
task adds or changes no schema or registered migration. The existing five-minute
drain interval replaces immediate traveler enqueue-and-send delivery.

## Boundaries

Persistence-failure response handlers were invoked directly with fixture
requests/responses. The retained main suite also checks the native authenticated
router over an owned loopback HTTP listener with synthetic session identity.
Neither suite uses an authenticated browser. Synthetic signature verification
is not proof of a live Stripe delivery. These results do not claim production,
real provider delivery, captures/refunds, or publication.

Already-confirmed historical bookings without an outbox row remain untouched.
Provider notifications and post-confirmation fee-ledger recording remain
best-effort, as before. Existing outbox retry/dead-letter behavior is retained;
this change prevents a lost notice before persistence, not every possible
provider-delivery failure or duplicate after an ambiguous provider response.
