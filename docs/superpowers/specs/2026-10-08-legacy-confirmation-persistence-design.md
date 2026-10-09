# Durable legacy traveler confirmations

## Approved scope

The founder selected atomic persistence for future legacy confirmations on
2026-10-08. Use the existing authoritative booking writers and email outbox.
No schema changes, new registry, scheduler, historical backfill, real mail,
captures, refunds, deployment, or changes to other payment rails are authorized.

## Transaction boundary

The webhook keeps its atomic conditional booking update, but executes it in a
database transaction. Only its winning update persists a traveler confirmation
in that transaction. The browser writer persists the same email inside its
existing booking, provider-earnings, and platform-revenue transaction.

A focused transaction-bound helper in the existing email-outbox service reads
the confirmed booking and traveler through the supplied transaction, builds
the existing legacy confirmation payload using the stored confirmation code,
and inserts one existing `booking_confirmation` outbox row. It must not call
the best-effort enqueue-and-send helper or send mail before commit.

The booking's conditional update owns deduplication: a losing or repeated
writer neither changes the confirmation code nor inserts another email.
No outbox unique index is needed within this scope. Already-confirmed
historical rows remain untouched.

## Failure behavior and delivery

Detail-query, payload-building, or outbox-insert failures propagate as a named
retryable persistence error, rolling back the booking transaction, including
any earnings/revenue it wrote. Stripe's successful payment remains successful.
The webhook must report failure for redelivery; the browser endpoint must
report a retryable persistence failure and tell the traveler not to pay again.
No new automatic confirmation-retry mechanism is introduced.

After commit, the email is pending and the existing outbox drain owns delivery
and retry. A process stopping after commit cannot lose the persisted notice.
This replaces immediate best-effort traveler delivery with scheduled outbox
delivery. Provider alerts and existing post-confirmation fee recording remain
unchanged.

A missing or blank traveler email stores a dead row with an explicit
delivery-blocked reason, preserving the existing outbox's administrator
visibility. It does not invent a recipient or claim delivery.

## Compatibility

Keep legacy deposit/full-payment fields, ownership/payment validation, amounts,
earnings/revenue behavior, and winner-only writes unchanged. The existing
canonical-booking persistence error handling provides the model for the
retryable error; legacy handling must reach the webhook boundary and browser
route without affecting other rails. Concurrent work on payment identity,
terminal-status policy, and browser race-success handling is separate.

## Verification

Use the existing constraint-preserving isolated development fixture runner.
All mail and Stripe transports are simulated and unexpected network calls
are forbidden.

Verify both authoritative writers for detail lookup and outbox insertion
failure followed by retry; a committed confirmation with no send followed by
outbox drain; missing recipients; repeated and concurrent deposit/full-payment
webhooks; both page/webhook winner orderings; and one matching code in booking,
outbox metadata, and simulated traveler mail.

Verify no pre-commit traveler send, no losing-writer email, and unchanged
provider earnings and platform revenue counts and amounts. Retain the existing
concurrency harness or adapt its barrier to transactional execution without
mocking database outcomes. These are native database-writer proofs, not live
payment, production, webhook-signature, or browser certification.
