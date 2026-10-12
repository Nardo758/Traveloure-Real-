# Legacy confirmation atomic claim verification

Verified on 2026-10-08 against a branch based on reviewed `origin/main`.

## Result

11 native PostgreSQL regression tests passed. The existing verification runner
created an empty constraint-preserving development fixture schema and removed it
after completion. Mail sends and Stripe retrieval were simulated; HTTP/HTTPS
provider requests were forbidden. No real captures, refunds, or email deliveries
were performed by this verification.

Coverage:

- Two and eight simultaneous webhooks, both full payment and deposit, each with
  two fresh randomized fixtures. All callers reached the real booking update
  before execution, eliminating dependence on accidental timing.
- One matching confirmation code in the booking, outbox metadata, and simulated
  traveler message; one outbox row and one simulated traveler send.
- Sequential triple delivery and retries retain the original code and timestamp.
- Page writer before webhook preserves its existing earnings/revenue transaction.
- Webhook before page retains the route fast-path's confirmed precondition.
- Concurrent page/webhook writers produce one winner and no losing-writer earnings.
- Duplicate booking IDs, missing booking IDs, and already-confirmed bookings.
- Existing payment status/amount/currency, deposit/full-payment flags, provider
  amounts, platform fee, processing fees, and net revenue remain unchanged.

## Checks

```sh
# Obtain the fingerprint independently from the development database only.
MESSAGING_DEV_FINGERPRINT=<verified-development-fingerprint> \
  node scripts/verification/run-messaging-gate.mjs --isolated-db \
  server/__tests__/legacy-webhook-confirmation.db.test.ts
git diff --check
```

TypeScript baseline comparison: main 117 diagnostics, branch 117 diagnostics,
zero new diagnostics. The baseline program used main's original payment service
and excluded the new test; all other compiler inputs were identical.

The configured development application restarted and rendered its landing page.
Its normal startup applied the pre-existing main migration `358_trips_pets.sql`;
this PR adds or changes no schema or registered migration.

## Boundaries

This is not browser, webhook-signature, live-mail, live-payment, or production
verification. The route's unchanged fast-path was not exercised over HTTP. The
generic best-effort enqueue helper and its pre-existing post-confirmation crash
window remain unchanged. The PR is not published.
