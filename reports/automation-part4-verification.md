# Part 4 — cart reminders: blocked before runtime implementation

## Approval and scope

The founder approved the proposed development-only file list. The sending window
is 09:00 inclusive to 20:00 exclusive in the traveler's explicitly known timezone.
No production activation, schema change, migration registration, payment-writer
change, cart-writer change or checkout behavior change is authorized.

## Status

**NOT IMPLEMENTED / NOT CERTIFIED.**

The initial read-only writer review found a cart/payment identity gap. The approved
plan requires stopping if complete payment coverage would require a payment-writer
change. No runtime or test file was changed, and no verification email was sent.

This is a static coverage finding, not a reproduced wrong-email incident.

## Reviewed evidence

- `shared/schema.ts`, `cartItems`: rows identify an account/guest, optional experience
  scope, optional trip, service/content, and optional itinerary item.
- `server/services/cart-email-state.service.ts`: the server-authored activity sequence
  lives in cart-row JSONB. Real activity changes it; payment cleanup is deliberately
  excluded from activity stamping.
- `server/services/commerce-email-sweep.service.ts`: candidates and dedupe keys are
  account + experience scope + activity sequence, not account alone.
- `server/routes/payments.routes.ts`, `/api/checkout` claim payload: bookings persist
  traveler, service, optional trip, and an optional `bookingDetails.itineraryItemId`.
  The payload does not persist the originating cart-row ID, experience scope or
  activity sequence. The itinerary-item relation is useful for projected lines but
  does not cover every direct/tripless cart line.
- `server/services/stripe-payment.service.ts`, shared PaymentIntent metadata:
  user, booking IDs, deposit/balance flags and booking count are persisted. These
  connect an intent to bookings, but do not fill the missing cart-scope/sequence
  identity on those bookings.
- `server/services/checkout-claim.service.ts`, `clearCartAfterPaidPromotion`:
  cleanup delegates by owner to the existing checked-out-line cleaner. A surviving
  partner line's activity clock is not itself proof of the removed provider line's
  payment-to-sequence association.
- `server/services/itinerary-followup.service.ts`: the existing booking check is
  itinerary/account based. Reusing its SQL unchanged would not establish the
  cart-scope/sequence condition.

## Why this blocks full proof

Service, traveler, optional trip and approximate timestamps are not unique
cart-sequence identities. A reminder reader must not guess that a payment belongs
to a particular scope, or guess that a residual cart is unpaid after its paid
provider lines have been removed.

The approved fail-closed policy permits an explicit unknown-payment-state skip.
That is a safety fallback, not evidence of complete all-rail correlation or a
passing proof for the uncovered writer paths.

No authoritative read-only relation covering those direct/tripless paths was
found in the reviewed writers. A supplied existing relation could resolve this
without changing a writer. Otherwise, adding server-authored provenance at claim
time is a separate payment-writer scope decision, not an authorized Part 4 edit.

## Sites deliberately not changed

- `/api/checkout` booking authoring in `server/routes/payments.routes.ts`.
- PaymentIntent authoring/persistence in `server/services/stripe-payment.service.ts`.
- Payment promotion and post-payment cart cleanup.
- Legacy booking/payment writers and migration registration.

## Verification accounting

| Requested group | Loops run | Clean loops | Disposition |
| --- | ---: | ---: | --- |
| Passing/failing fixtures for every eligibility condition | 0 | 0 | Blocked |
| Below/at/above all three idle thresholds | 0 | 0 | Not run |
| Unsubscribe | 0 | 0 | Not run |
| Suspension/deletion | 0 | 0 | Not run |
| Local window / unknown timezone | 0 | 0 | Not run |
| Shared daily marketing cap | 0 | 0 | Not run |
| Cart-over-itinerary priority | 0 | 0 | Not run |
| Guest before/after authenticated claim | 0 | 0 | Not run |
| Fourth-step rejection | 0 | 0 | Not run |
| Concurrency orderings | 0 | 0 | Not run |
| Real provider-delivered QA emails | 0 | 0 | Not run; no receipt IDs |

Golden regression, registry/roster and typecheck were not rerun: no runtime or test
changes were made. No fresh pass or fresh baseline measurement is claimed.

The held commerce heartbeat migration remains unregistered and unchanged.
Parts 5 and later were not started.
