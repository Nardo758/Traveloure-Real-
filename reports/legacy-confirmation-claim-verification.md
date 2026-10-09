# Legacy confirmation atomic claim verification

## Approved runtime race recovery — 2026-10-08 (America/New_York)

The user separately approved the guarded runtime change and isolated
verification. The legacy route now rechecks payment and ownership facts for
both the already-confirmed fast-path and `BOOKING_ALREADY_CONFIRMED` recovery.
The service writer and webhook writer are unchanged; recovery performs no
booking, outbox, earnings, revenue, or availability writes.

### Authoritative association

Stripe retrieval must succeed, the intent must be `succeeded`, and its exact
server-authored booking ID and traveler metadata must match the request.
After that lookup, one database query requires current traveler ownership,
`confirmed` booking status, `succeeded` payment status, and no other booking
carrying the requested intent. A conflicting recorded intent is rejected.

The native regression exposed that the legacy webhook does **not** stamp
`bookings.stripe_payment_intent_id`. An unstamped booking is therefore accepted
only with an additional successful, traveler-owned `payment_intents` ledger
record containing the exact server-created booking/traveler association.
The test fixture retains that real unstamped shape and supplies metadata as
the production intent-creation path does. No synthetic stamp or weakened
constraint is used to make the race pass.

### HTTP verification

25 native PostgreSQL/HTTP tests passed through the existing constraint-preserving
isolated-schema runner. The production Express booking router and its real
authentication/ownership middleware handled actual loopback HTTP requests.
Only fixture session identity, Stripe retrieval, and mail transport are
simulated. All other provider network requests are forbidden.

Forced races cover full-payment and deposit webhooks completing after the
route's real pending read, and a webhook completing after the service's read
but before its real transaction claim. The HTTP outcome is:

```json
{
  "success": true,
  "message": "Booking confirmed",
  "source": "webhook"
}
```

Each returns HTTP 200, retains one matching confirmation code across the
booking, persisted sent outbox row, and one simulated traveler delivery,
and creates zero losing-writer earnings/revenue. Retrying remains successful
without another traveler message. The normal page fallback still returns
HTTP 200 with `source: "fallback"` and preserves its original one-time
earnings/revenue amounts and pending local PI ledger until a webhook arrives.

Negative HTTP coverage retains 403 for another traveler, 404 for a missing
booking, 402 for unsuccessful Stripe status or lookup failure, and 409 for
replay, conflicting intent, missing provenance, failed payment records,
non-confirmed terminal states, and missing/wrong/substring-only associations.
Stale-read negative cases independently change owner, status, payment status,
intent, ledger status, and Stripe association before fallback verification.

The fixture schema was removed after the successful run. TypeScript comparison
against the unchanged task base remains 117 diagnostics on each side, zero
new diagnostics. The regression file also has zero diagnostics when explicitly
checked with an ES2022 target (it is excluded from the application's tsconfig).
`git diff --check` passed.

The development application restarted successfully with zero newly applied
migrations and its landing page rendered. No UI was changed. This verifies
the browser-facing HTTP success response, not a signed-in interactive browser
checkout, webhook signatures, live mail, live Stripe charges, or production.
Nothing was published.

## Original writer-only verification

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
