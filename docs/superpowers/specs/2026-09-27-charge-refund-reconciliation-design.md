# Charge refund reconciliation

## Scope and current defect

The signed Platform `charge.refunded` handler records a refund and, for refunds issued outside the app, holds earnings, but does not set a fully refunded service booking to `refunded`. The app-issued service-booking refund path instead writes `refunded` **before** Stripe confirms the refund, even for a partial refund. These are separate defects in the money-state rule. Record the pre-confirmation write explicitly in a new append-only decision-ledger entry; do not quietly reinterpret an old ruling.

No live Stripe transactions or production booking writes are part of verification. The existing signed local Platform replay is the starting point; no R161-named harness is present in this checkout.

## Shared rule

One reconciliation routine accepts a trusted Charge snapshot after a successful app-issued refund or a signature-verified webhook. Require valid nonnegative integer cent values for `charge.amount` and `charge.amount_refunded`, with refunded cents no greater than charge cents. Never decide full versus partial from refund metadata or a caller-supplied booking status.

- A charge is **fully refunded** only when its cumulative `amount_refunded` equals its positive `amount`. Every service booking linked to that charge's PaymentIntent may then become `refunded`, once. For a shared payment, a partial payment refund changes **none** of its bookings to `refunded`, even if the partial amount happens to equal an individual booking's price.
- A partial charge refund keeps every linked booking's existing status. Persist the observed refunded cents and the distinct refund IDs idempotently. On a booking backed by a shared payment, show this as a **shared-payment refund amount**, not an asserted per-item allocation.
- The existing out-of-band marker and earnings hold remain for refunds the app did not issue. Keep the separate bundle-partial-settlement promoter, which must never turn a partially fulfilled booking into a whole-row refund.
- A replay with the same Stripe event/refund IDs must not add a second audit row, re-date the first observation, release inventory twice, reverse earnings twice, or change a partial refund to a terminal status.

The app-issued `/v1/refunds` path must call the same reconciliation routine using an authoritative post-refund Charge snapshot. Replace its pre-Stripe status write with a non-terminal idempotent in-flight guard; a partial refund leaves the prior status untouched, and only the shared charge rule makes a booking terminal. Fail explicitly if a successful Stripe refund cannot yet be reconciled; do not pretend a failed follow-up read means the payment was not refunded. A later webhook must be able to finish reconciliation.

The refund ledger remains the record of actual money movement. A booking detail/read model exposes the observed refunded amount alongside existing status. The My Bookings item already renders `Refunded` from `service_bookings.status`; add a partial-refund amount line without showing an item-level amount that cannot be attributed for a shared charge.

## Verification

Extend the signed local `/api/bookings/webhooks/stripe` replay using fake Stripe IDs and a disposable development DB, with refund data embedded in the Charge so no Stripe API call is made. Assert booking state, ledger amount and idempotency for: (1) full refund, (2) partial refund, (3) two partial refunds whose cumulative amount reaches the full charge, (4) identical repeat delivery, and (5) a shared-charge partial refund across multiple bookings. Also test the app-issued refund path through a mocked Stripe client to prove its full and partial results converge on this same rule. The local test must fail closed if pointed at production.

## Boundaries

Do not change Stripe endpoint subscriptions, initiate live charges/refunds, infer a full refund from metadata, or claim that a payment-level partial amount belongs wholly to each item. A Charge missing trustworthy amount fields is an error/retry case, not a silent `refunded` transition.