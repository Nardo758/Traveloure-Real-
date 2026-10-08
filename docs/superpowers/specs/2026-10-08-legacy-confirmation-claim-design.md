# Legacy traveler confirmation claim

## Approval and scope

The founder approved a narrow no-schema runtime fix on reviewed main through a PR.
This is not approval for Automation Part 2, publication, real payment operations,
new registries, a replacement outbox, or schema changes.

## Design

Replace the legacy webhook's separate status read and unconditional update with
an atomic conditional `UPDATE ... RETURNING confirmation_code`. Only a caller
that changed the booking can enqueue its traveler confirmation through the
existing email-outbox helper. Preserve the original acceptance rule: any existing
booking whose status is not confirmed, including a null status.

Keep the deposit and full-payment assignments unchanged. Keep the payment-intent
status update and all other payment rails unchanged. The browser fallback's
existing transactional claim, earnings, revenue, and availability writers remain
unchanged. PostgreSQL rechecks the claim predicate after a concurrent update, so
the losing webhook cannot replace a browser winner's code or enqueue another mail.

An outbox unique index would require schema approval and is not part of this fix.
An in-process mutex would not protect multiple application instances and is not
used.

## Verification and limits

Use the existing constraint-preserving isolated development fixture runner, native
writers, and simulated provider transports. Force callers to reach the same update
before allowing them to execute; verify two and eight concurrent deliveries for
deposit and full payments, repeated delivery, both writer orderings, and matching
stored/emailed codes. Verify existing provider and revenue amounts.

The route's unchanged already-confirmed fast-path is checked at its database
precondition; these tests do not claim browser or webhook-signature verification.
This fix does not address the existing crash window between booking confirmation
and fire-and-forget outbox insertion, or the generic helper's fallback send when
outbox persistence fails. Those require separate approval and work.
