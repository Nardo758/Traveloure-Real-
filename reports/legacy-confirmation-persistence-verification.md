# Legacy confirmation persistence verification

## Approval and result

The founder approved atomic persistence for future legacy confirmations and
then approved the written design on 2026-10-08. No schema change, historical
recovery scan, new scheduler, registry, real mail, captures, or refunds was
authorized or performed.

24 native PostgreSQL regression tests passed using the existing isolated
development fixture runner. It created an empty constraint-preserving schema
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
  server/__tests__/legacy-webhook-confirmation.db.test.ts
git diff --check
```

TypeScript comparison against the task's initial runtime: 117 existing
diagnostics before and after, zero new diagnostics. The comparison substituted
the base versions of changed runtime sources in memory and excluded newly added
files from the baseline program; it did not edit the application to run checks.

The configured preview restarted successfully, its outbox scheduler registered,
startup applied zero migrations, and the landing page rendered. The outbox
uses its existing five-minute drain interval rather than immediate traveler
enqueue-and-send delivery.

## Boundaries

Response handlers were invoked directly with fixture requests/responses, not
through an HTTP listener or authenticated browser session. Synthetic signature
verification is not proof of a live Stripe delivery. These results do not
claim production, real provider delivery, captures/refunds, or publication.

Already-confirmed historical bookings without an outbox row remain untouched.
Provider notifications and post-confirmation fee-ledger recording remain
best-effort, as before. Existing outbox retry/dead-letter behavior is retained;
this change prevents a lost notice before persistence, not every possible
provider-delivery failure or duplicate after an ambiguous provider response.
