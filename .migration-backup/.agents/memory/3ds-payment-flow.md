---
name: 3DS payment flow
description: Where and how to handle Stripe requires_action / 3DS across the stack
---

# 3DS / requires_action handling — 3 required touch-points

**Rule:** Any Stripe PaymentIntent checkout must handle `requires_action` in three places or 3DS cards silently fail.

## Touch-point 1: Client — after stripe.confirmPayment()
`stripe.confirmPayment({ redirect: 'if_required' })` returns inline on success/failure,
but for full-page 3DS redirects the call never resolves (page navigates away).
After the redirect returns the `paymentIntent` object must be checked for all statuses:
- `succeeded` → onSuccess()
- `processing` → treat as success (webhook confirms later)
- `requires_action` → show "check your banking app" message, not silent no-op
- anything else → show error with status code

File: `client/src/components/booking/StripeCheckout.tsx`

## Touch-point 2: Redirect-back landing page
When Stripe redirects to `return_url`, it appends:
  `?payment_intent=pi_xxx&payment_intent_client_secret=xxx&redirect_status=succeeded|failed|canceled`

A standalone page at that URL must read these params and call
`stripe.retrievePaymentIntent(clientSecret)` to get authoritative status.
Without this page the user sees a 404 or the app's home screen.

File: `client/src/pages/BookingConfirmationPage.tsx`
Route: `/booking/confirmation`

## Touch-point 3: Webhook — payment_intent.requires_action
Stripe fires this event when it cannot auto-confirm. Handler should:
- Stamp `payment_intents.status = 'requires_action'` in DB
- Emit a `[WEBHOOK]` warn log with `nextAction.type` so stuck-payment report sees it
- Do NOT cancel the booking — the user may still complete the challenge

File: `server/services/stripe-payment.service.ts` → `handleRequiresAction()`

**Why:** Without all three, cards that require 3DS leave bookings stuck in `payment_pending`,
the user gets no feedback, and the admin report is the only way to detect them hours later.

**How to apply:** Any new payment surface (transport checkout, credit purchase, etc.)
that creates a PaymentIntent must verify all three touch-points are wired up.
