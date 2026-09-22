# Lane brief — `payment_intent.payment_failed` throws for every non-cart PaymentIntent (board #350, #857)

**Status:** ready to build, needs one ruling inside it. **Class:** webhook correctness on the money
rail. **Severity:** every non-cart payment failure is (a) never recorded and (b) answered to Stripe
with a 400, so the delivery is retried and fails identically on every retry.

## The chain, verified in this repo

| Step | Evidence |
|---|---|
| 1 | `handlePaymentFailed` destructures `const { bookingIds } = paymentIntent.metadata` (`stripe-payment.service.ts:926`) and calls `bookingIds.split(',')` (`:934`) with **no guard**. |
| 1b | **CORRECTED 2026-09-22 — it is TWO handlers, not one.** `handlePaymentCanceled` carries the IDENTICAL unguarded pair (`:951`, `:959`) and is wired to `payment_intent.canceled` at `:647`. This brief originally named only the failure path. `handlePaymentSucceeded` is NOT affected — it already guards (`if (!bookingIds) { log; return; }`, `:846`), which is the shape both others need; `handleRequiresAction` (`:978`) only LOGS `bookingIds` and never splits, so it is safe. |
| 2 | `metadata.bookingIds` is written only by the CART checkout path. An optimizer PI carries `metadata.type="optimization_fee"` + `userId` (`optimization.routes.ts:554`, `:559`) and no `bookingIds`. So the destructure yields `undefined` and `.split` raises a **TypeError**. |
| 3 | `handleWebhook` catches, logs `Webhook handling error:` and **rethrows** (`stripe-payment.service.ts`, end of the method). |
| 4 | The route catches and answers **HTTP 400** (`server/routes/bookings.ts:571-575`). |

Stripe treats a non-2xx as a failed delivery and redelivers with backoff, so each retry re-runs the
same TypeError. The event is never acknowledged and the failure is never recorded.

**Blast radius is every PaymentIntent that is not a cart checkout:** the optimizer run, Trip Pass,
the ready-made purchase, the coordination fee, the expert-service session and the balance payment
— **times two events**, since `payment_intent.canceled` fires on an abandoned or cancelled PI and
takes the same unguarded path. An abandoned Trip Pass checkout is the commonest way to hit it.

**#857 is the same defect seen from the traveler's side.** The board files it as "a traveler's
remaining credits disappear if a payment fails mid-flow" — credits are only released on a *handled*
failure, and an optimizer failure is never handled. Fix this and #857 closes with it; fixing #857
alone would be a second release path for a failure nobody recorded.

## A second defect in the same handler, recorded not assumed

The handler writes `payment_intents` and the legacy **`bookings`** table (`:930`, `:936`), not
`service_bookings`. That is the **failure-side twin of the bug §15c already fixed on the success
side** — ids from one rail never match rows in the other, so the UPDATE matches zero rows and
errors on nothing. §15c fixed `handlePaymentSucceeded` by routing it through `promotePaidCheckout`;
nothing did the same for the failure path.

## Build

1. **Guard the destructure first, in BOTH handlers.** `bookingIds` absent must not throw. Copy the
   shape `handlePaymentSucceeded` already uses at `:846` rather than inventing a second one
   (§18 rule 1). This alone stops the retry storm and is the smallest safe change in the lane.
2. **Answer Stripe 2xx once the event is understood.** A 400 is correct for a signature failure and
   wrong for "this PI is not mine" — retrying cannot change the outcome.
3. **Route by `metadata.type`, the way the success path routes by rail.** A cart PI keeps its
   behaviour; an `optimization_fee` PI records the failure against its own `optimization_payments`
   row; the other typed PIs get their own arm or an explicit, logged no-op.
4. **THE RULING THIS LANE NEEDS:** what a failed optimizer payment does to the traveler's credits.
   Release them (#857's implied answer), or leave them held until a re-run. It is a money-adjacent
   state change and must be decided, not inferred from the board's one-line framing.
5. **Do not widen the legacy-rail write.** Whether the cart arm should move to `service_bookings`
   is §15c's question, not this lane's; state the divergence in the code and leave it.

## Negative space

No amount, rate, `fee_bands` read, idempotency key or atomic claim changes. No refund is issued.
No migration. The lane makes a handler stop throwing and start recording; it moves no money.

## Proof

A `payment_intent.payment_failed` carrying no `bookingIds` must return 2xx and write exactly one
honest record; carrying `bookingIds` must behave as today. Assert the handler never throws for
each `metadata.type` the platform mints — the list is enumerable from `createPaymentIntent`'s
call sites.
