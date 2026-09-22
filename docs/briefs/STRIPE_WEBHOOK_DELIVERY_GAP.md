# The Stripe webhook delivery gap — Stage 1 CLOSED, Stage 2 still open

**Originally written 2026-09-22 from a live-mode Stripe inventory, against code at `b959e85`.
AMENDED the same day: Stage 1 landed while this brief was in review, so its original headline —
"production receives one Stripe event" — is no longer true and is corrected below. Read every
sentence here as a claim about a DATE, not about now** (the lesson CLAUDE.md's Lockfile-purity
section already records about "VERIFIED WORKING" prose).

**Nothing here is a code defect introduced by a lane.** It is a configuration gap; its consequence
was that correct code had never executed in production.

---

## STAGE 1 — LANDED AND PROVEN END TO END (2026-09-22)

The platform endpoint now exists and is enabled:

- Endpoint `we_1UIbtDJZ5fFY5Q8LhomT6nVq` → `https://traveloure.com/api/bookings/webhooks/stripe`
- Live mode, Connect false, secret `STRIPE_WEBHOOK_SECRET` configured and republished
- Subscribed to exactly four types: `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- No change to the Connect endpoint

Proven by a REAL live Checkout, not a fabricated dashboard event — which is the stronger test,
because it exercised the actual Checkout → webhook → signature path rather than a simulation of
it. Event `evt_1UIcxLJZ5fFY5Q8LhHkh4pIa`, HTTP 200 on first attempt in 53 ms, signature verified,
exactly one `webhook_events` row written, `processed = false` as designed for this rail (the row's
EXISTENCE is the signal — §18 rule 1 left the Connect rail as the only author of that column),
no handler errors, and zero unintended writes across bookings, service bookings, payment intents,
purchases, tips, proposals, credits, refunds and reconciliation records. The $1.00 charge was
refunded (`re_3UIcxHJZ5fFY5Q8L0ToVKNVH`) and the temporary product and price archived.

**The damage question was answered before any of this, and the answer was the good one.** All 80
live Checkout Sessions across all time were scanned: **zero** paid `expert_service`, **zero** paid
`transport_booking`. The hosted-checkout rails had never been used. This was a TRAP, not observed
damage — and that is a finding in its own right, not an absence of one.

So of the 14 event types the two handlers carry, production now delivers **five**. The section
below is preserved as written because the reasoning still holds for the nine that remain.

---

## The fact

**As originally found (superseded for the platform endpoint by Stage 1 above).** Live-mode Stripe
had **one** enabled webhook endpoint:

| Endpoint | URL | Subscribed events |
|---|---|---|
| Connect | `https://traveloure.com/api/webhooks/stripe` | `account.updated` — and nothing else |
| Platform | `/api/bookings/webhooks/stripe` | **no Stripe endpoint points at this route at all** |

Test mode has no registered endpoints.

The two route paths are confirmed in code: `app.use("/api/bookings", bookingsRoutes)`
(`server/routes.ts:1094`) plus `router.post('/webhooks/stripe', …)`
(`server/routes/bookings.ts:535`) resolves to `/api/bookings/webhooks/stripe`.

Between them the two handlers carried **14** event types. Production delivered **one**. After
Stage 1 it delivers five.

**Still never delivered, and this is the live remainder:** `payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.canceled`, `payment_intent.requires_action`, `charge.refunded`,
`charge.dispute.created`, `charge.dispute.closed`, `transfer.created`, `transfer.paid`,
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
— **the last four of these are now DELIVERED by Stage 1**; the `payment_intent.*` family,
`charge.refunded`, `charge.dispute.*` and `transfer.*` are not.

---

## 1. Two hosted-checkout rails had NO completion path — **CLOSED by Stage 1**

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

**ESTABLISHED 2026-09-22, and the answer was the good one:** all 80 live Checkout Sessions across
all time were scanned — zero paid `expert_service`, zero paid `transport_booking`. Neither rail had
ever been used, so this was a trap rather than observed damage. Stage 1 subscribed
`checkout.session.completed` and both handlers now have their signal.

**WHAT THAT DOES NOT MEAN:** neither handler has yet run against a REAL paid session of its own
type — the Stage 1 proof used a synthetic no-op whose `metadata.type` matched neither branch, which
is exactly why it was safe. The first genuine `expert_service` or `transport_booking` purchase will
be the first execution of that code in production. Worth watching deliberately rather than
assuming.

---

## 2. §15c's recovery layer 2 STILL does not exist — **this is now the headline gap**

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
thinner than the document implies, and remains so after Stage 1: `payment_intent.*` was
deliberately excluded, because turning it on starts running `promotePaidCheckout` and the
revenue/earnings mint against live cart rows for the first time, and that deserves its own staged
change with monitoring rather than riding along with a zero-volume one.

**A FRESH DATA POINT FROM THE STAGE 1 TEST ITSELF:** that $1.00 charge and its refund emitted
`payment_intent.succeeded` and `charge.refunded` at Stripe, and **nothing received either** — no
endpoint subscribes to them. The gap was observable in real time, in the same minute the Stage 1
success was being confirmed.

**Event ownership for Stage 2, read off the `case` arms — an inventory, not a recommendation:**
`payment_intent.succeeded` belongs on the **Connect endpoint alone**, whose arm calls the same
`handlePaymentSucceeded` the platform arm does AND adds revenue tracking plus the earnings mint —
a strict superset, so subscribing both merely runs the shared handler twice. `payment_intent.
payment_failed` wants **both**, because there the arms are complementary rather than overlapping:
the platform updates `payment_intents` and the legacy `bookings`, while Connect flips
`service_bookings` to `failed` and emails the traveler.

---

## 3. Silently inert, listed so nobody assumes otherwise

- **Refunds** — `charge.refunded` has a handler; it never runs.
- **Disputes** — `charge.dispute.created` / `.closed` drive the admin dispute alerts in
  `processStripeWebhookEvent`. The Connect endpoint does not subscribe to them.
- **Payout tracking** — `transfer.created` / `transfer.paid`, same endpoint, same reason.
- **Subscriptions** — `customer.subscription.*`. **DELIVERED as of Stage 1.**
  **CORRECTION to this brief's first draft, which said the lane "is not built":** it is. Ledger
  `2026-09-21-membership-writer` landed `plan-membership-writer.service.ts`, migration 316 and all
  three subscription arms, and `membership-checkout.service.ts` plus migration 317's Stripe price-id
  columns show the checkout rail in flight. That ledger row states its own reasoning — *"THE WRITER
  COMES BEFORE THE CHECKOUT RAIL, DELIBERATELY: a checkout that can charge for a subscription the
  platform cannot record is strictly worse than no checkout"* — and that precaution was being
  silently defeated by configuration, since the writer could never fire. Stage 1 included these three
  types for that reason, at zero risk: `plan_memberships` is empty and no subscription exists yet, so
  there was no volume to disturb and the path is proven before it matters.

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
