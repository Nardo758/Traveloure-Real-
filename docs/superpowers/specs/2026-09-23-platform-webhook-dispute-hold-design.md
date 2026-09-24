# Platform Stripe webhook coverage and dispute holds

## Scope and charge model

Traveloure creates booking charges on its platform Stripe account and subsequently sends separate transfers to connected accounts. The live `/api/bookings/webhooks/stripe` endpoint listens to platform events; `/api/webhooks/stripe` listens to connected-account events. Keep each endpoint's existing signing secret and raw-body verification. Do not modify live subscriptions until code has been published and checked.

## Event ownership

- The platform endpoint will process `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`, `payout.paid`, and `payout.failed`. Unknown types still receive 2xx.
- Extract existing dispute behavior from the Connect route into a shared handler. Resolve canonical `service_bookings` through the charge/PaymentIntent as well as legacy `bookings` metadata. Do not assume every charge has a legacy `bookingId`.
- On dispute creation, mark affected bookings disputed and hold only earnings attributable to the disputed booking. Payouts are currently aggregate amounts rather than booking-bound transfers: at claim time, atomically reserve enough eligible, undisputed earnings to cover the requested amount, excluding the disputed booking's earnings; block only a payout that cannot be funded without them, not every request by the provider. Keep the blocked payout pending and record the booking-scoped hold (and any linked processing or sent payout IDs) against the dispute ID in durable admin notifications. Never send the transfer when this check fails.
- On a won dispute, release the booking's unpaid-earnings hold automatically and log the release against the dispute ID. On a lost dispute, leave the booking-scoped hold in place and flag it for manual review with the dispute ID; never re-open the earning for automatic payout.
- A payout already in `processing` may have been sent to Stripe, even if the local transfer ID has not been recorded. Never automatically cancel, retry, or reverse it. Alert an operator for reconciliation. On a lost dispute, flag transferred earnings/payout IDs for a manual reversal decision; do not invoke a transfer reversal. Record each hold, release, and manual-review decision against the dispute ID.
- A Stripe `payout.*` object is a bank payout, not Traveloure's platform-to-provider transfer. Record and alert on platform `payout.failed`, and record `payout.paid`, without marking provider payout requests completed. Keep connected `charge.refunded` and `payout.*` unsubscribed: connected accounts receive transfers, while this app neither originates direct charges on them nor maps their subsequent bank payouts to internal records.
- Use event-ID deduplication for new platform processing with a separate per-consumer claim, not the shared `webhook_events.processed` flag: the existing platform and Connect handlers may both receive an event ID for different business work. Serialize the dispute lifecycle across both consumers so a late open event cannot undo a terminal outcome. A handled event must durably finish before HTTP 2xx; errors must be retryable. Do not change existing payment or subscription event ownership.

## Data repair

Add one registered data-only SQL migration that sets `requires_background_check=true` only for `tour_guide`, `private_chef`, `childcare_family`, and `private_transportation`, with `IS DISTINCT FROM true` to avoid rewriting correct values. Leave `accessibility_specialist` and all other category fields untouched. Publishing the code will apply this approved repair; do not write directly to the production database.

Proposals only, not part of this migration: move `childcare_family` from risk `moderate`/band `2` to risk `high`/band `3`. For `custom_other`, propose a conservative `high` risk / band `3` starting point, with manual category review before publication rather than silently accepting its current null risk/band; whether it also needs a background check should be decided from the actual service, not guessed from the free-text label. These require their own approval and pricing/risk impact review before implementation.

## Verification and operator handoff

Test valid/invalid signatures, duplicate deliveries, both booking rails, dispute transitions, payout hold versus already-sent manual review, and unknown events locally. Use Stripe CLI test-mode forwarding for both endpoints and the requested event triggers if the CLI and sandbox connected account are available; otherwise report which cases could only be exercised using signed local fixtures. Never use live-mode triggers or disclose signing secrets. After verification and a user-triggered publish, give the exact events the operator should add to each live endpoint; do not modify the dashboard.

## Timing boundary to review

There is no atomic transaction spanning a database claim and an external Stripe API call. `pending` payouts can be blocked before claiming; `processing` payouts are treated as possibly sent and routed to manual reconciliation, rather than pretending they can be safely stopped. This distinction prevents an accidental double transfer or unauthorized reversal.