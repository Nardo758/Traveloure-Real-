# Production receives ONE Stripe event, and several documented invariants have fewer enforcement layers than they claim

**As of 2026-09-22.** Established by a live-mode Stripe inventory run from the Replit workspace,
cross-checked against the code in this repository at `b959e85`. **Nothing here is a code defect
introduced by a lane — it is a configuration gap, and its consequence is that code which is
correct has never executed in production.**

---

## The fact

Live-mode Stripe has **one** enabled webhook endpoint:

| Endpoint | URL | Subscribed events |
|---|---|---|
| Connect | `https://traveloure.com/api/webhooks/stripe` | `account.updated` — and nothing else |
| Platform | `/api/bookings/webhooks/stripe` | **no Stripe endpoint points at this route at all** |

Test mode has no registered endpoints.

The two route paths are confirmed in code: `app.use("/api/bookings", bookingsRoutes)`
(`server/routes.ts:1094`) plus `router.post('/webhooks/stripe', …)`
(`server/routes/bookings.ts:535`) resolves to `/api/bookings/webhooks/stripe`.

Between them the two handlers carry **14** event types. Production delivers **one**.

**Never delivered:** `payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.canceled`, `payment_intent.requires_action`, `charge.refunded`,
`charge.dispute.created`, `charge.dispute.closed`, `transfer.created`, `transfer.paid`,
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`.

---

## 1. Two hosted-checkout rails have NO completion path

This is the part with live money on it. Both rails complete **only** through
`checkout.session.completed`, and each completion handler has **exactly one caller** — the
webhook switch. There is no client-side fallback and no reconciliation path for either.

| Rail | Handler | Sole caller | What does not happen |
|---|---|---|---|
| `transport_booking` | `handleStripePaymentSuccess` (`stripe.service.ts:282`) | `stripe-payment.service.ts:701` | the `service_bookings` row is never promoted to `confirmed` and never gets its `stripe_payment_intent_id`; the transport option keeps `booking_status = 'available'` |
| `expert_service` | `handleExpertServicePayment` (`stripe-payment.service.ts:1768`) | `stripe-payment.service.ts:699` | **the `expert_requests` row is never CREATED** — it is an INSERT, not an UPDATE — and no `expert_review_fee` revenue is recorded |

**The expert-service case is the worse of the two.** Transport leaves a row in a wrong state,
which a query can find. Expert service leaves **nothing**: the traveler is charged and no artifact
exists anywhere in the platform to say so. The only record is in Stripe.

`transport-hub.routes.ts:397` documents the dependency in its own words — *"The promotion to
'confirmed' is the PAYMENT's own signal and already exists: `checkout.session.completed`
(metadata.type === 'transport_booking') → `handleStripePaymentSuccess`"*. The signal does not
arrive.

**NOT ESTABLISHED, and it is the difference between damage and a trap:** whether either rail has
actually taken a payment in production. That is a Stripe-side query, not a code question — it is
step 1 of the dispatch that accompanies this brief. **Do not describe this as money lost until
that query has been run**, and do not describe it as harmless until it has either.

---

## 2. §15c's recovery layer 2 has never existed in production

CLAUDE.md §15c is titled *"ONE payment promotion, TWO callers"* — the webhook and the client
fallback. The webhook caller does not fire.

What survives for the CART rail, and it is why cart checkout still works:

1. `POST /api/bookings/confirm-payment` — the client fallback (`server/routes/bookings.ts:233`).
2. The §15b TTL sweep, which reconciles a marked row against Stripe rather than voiding blindly.
3. The §17 drift job, scheduled at `server/index.ts:797` — **detection**, not repair.

What is lost is the specific case §15c names: *"the server-died-mid-authorization window, where
nothing keyed on `stripe_payment_intent_id` can find the row"*. Only the webhook may resolve a
booking from `pi.metadata.bookingIds` and stamp an unstamped claim, and only the webhook and the
reconciliation job are `SERVER_VERIFIED_ACTORS` (§17b). One of those two has never run.

**§15c is not wrong as written — it describes the code, and the code is correct.** It describes a
layer that configuration never switched on. The redundancy §15c exists to provide is one layer
thinner than the document implies, and has been for as long as the endpoint has been unregistered.

---

## 3. Silently inert, listed so nobody assumes otherwise

- **Refunds** — `charge.refunded` has a handler; it never runs.
- **Disputes** — `charge.dispute.created` / `.closed` drive the admin dispute alerts in
  `processStripeWebhookEvent`. The Connect endpoint does not subscribe to them.
- **Payout tracking** — `transfer.created` / `transfer.paid`, same endpoint, same reason.
- **Subscriptions** — `customer.subscription.*`. Locked Decision 26 states that `plan_memberships`
  is *"WRITTEN later by the separate Plus-checkout lane from the Stripe subscription webhook"*.
  That lane is not built and `PLUS_SALES_ENABLED` is off, so nothing is broken today — but it is
  specified against a signal that is not wired, and whoever builds it will otherwise discover this
  at the end rather than the beginning.

---

## What this brief does NOT claim

- **It does not claim any specific payment was lost.** See §1 — that needs the Stripe query.
- **It does not propose a subscription set.** Which events each endpoint should receive is an
  operator decision with a blast radius (turning on `payment_intent.succeeded` starts running code
  paths that have never run in production against real rows), and it is not this brief's to make.
  The accompanying dispatch lists what the CODE handles so the decision is informed, not taken.
- **It does not touch code.** Every handler named here is correct; none of them has been called.
- **It says nothing about the Connect endpoint's `account.updated` arm**, which is delivered and
  presumably working — expert Stripe-onboarding status sync depends on it.

## Why it went unnoticed

The same shape as `BRANCH_PROTECTION_ENFORCER_IS_DEAD.md`: **a mechanism that is never exercised
produces no signal when it is absent.** A webhook that is never delivered logs nothing, fails
nothing, and reports nothing. `webhook_events` was empty, which reads identically to "quiet". The
§17 drift job would have surfaced the cart-side consequence, and the admin digest's gap check
compares Stripe's event list to `webhook_events` — both are worth checking for historical rows
once the endpoint is registered, because their silence so far is also a fact about this gap.
