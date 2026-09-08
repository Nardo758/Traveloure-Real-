# Punchlist — pick up here

> Compiled 2026-09-08 at the end of the console/AI-concierge program's build nights.
> Companion documents: `docs/ROADMAP.md` §A–§G (the open register and the agreed cheapest path),
> `docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md` (design of record), `docs/OPERATING_PROCEDURE.md`
> (how a lane is briefed and landed). **Evidence discipline:** every item below is marked
> **[verified]** (checked in this repo at the sha noted) or **[reported]** (asserted by an audit and
> NOT re-checked here). Do not treat a `[reported]` line as fact until someone opens the file.

## 0 · How to resume

1. `git fetch origin && git checkout -B <task-slug> origin/main`. Never commit on `main`.
2. Read `docs/OPERATING_PROCEDURE.md` §3 (lane brief) and §4 (serial landing).
3. Cost levers that worked, measured: **batch adjacent lanes into one agent run** (three lanes cost
   ~350–450k tokens together versus ~400k each alone); **forbid repo sweeps**; **cap ledger rows at
   150 words and PR bodies at 250**; **do not stand up a local server or DB unless extending an
   armed spec** — CI proves it for free. Run lanes **serially**: the one parallel pair collided on a
   shared module and the reconciliation cost more than the lane.
4. Two recurring traps, both of which cost CI cycles this session: **a pin that asserts a literal
   string** (an exact URL, a handler slice, a fee total) goes red on a correct refactor — repair it
   to assert the invariant, never delete it; and **`docs/DECISIONS.md` unions locally but not on
   GitHub**, so any two open PRs that both append a row will show "dirty" until you merge `main` in.

## 1 · Decisions still needed (nobody can build these without an answer)

| # | Question | Recommendation |
|---|---|---|
| D-1 | **Is a purchased ready-made trip a finished plan or an editable template?** Today the clone is an ordinary `draft` with placeholder dates and no final snapshot **[verified]** (`ready-made-purchase.service.ts:108`), while the buyer was sold "a ready-made trip". | Deliver **both**: write a final snapshot at purchase so the buyer receives a finished Trip Card, and let them reopen it to edit. Otherwise the copy must stop implying a finished product. |
| D-2 | **What is the included consultation?** It is stored as an entitlement on `ready_made_purchases`, not a `service_bookings` row, so it inherits no scheduling, acceptance, cancellation or refund machinery **[reported]**. | Decide it is **one asynchronous revision** and say exactly that everywhere, or make it a real schedulable booking. The wording and the storage must agree. |
| D-3 | **Should a single checkout mix a ready-made trip with services?** It cannot today: ready-made has its own PaymentIntent and table **[reported]**. | Keep them separate (a digital product and a reservation are different fulfilment), and make the separation **visible** so nothing implies the ready-made price includes the services inside it. |
| D-4 | **Must a bookable itinerary item reference a real provider service?** An item without one renders as reference-only and adds nothing to the total **[reported]** (`cart.tsx`). | Yes — make it an explicit authoring contract for ready-made authors, and label every item as included / recommended / bookable separately / external. |

## 2 · Verified defects, ready to fix

| # | Defect | Size |
|---|---|---|
| V-1 | **A transport option is stamped `confirmed` the moment the Stripe Checkout session is created, before any payment succeeds** — `server/routes/transport-hub.routes.ts:353-354`, whose own comment says it is "so the UI shows the green Confirmed badge immediately". A booking is shown as confirmed that may never be paid. **[verified]** | small, urgent |
| V-2 | **The booking modal displays a fabricated confirmation code** — `client/src/components/booking/BookingFlowModal.tsx:257` builds `TRV<random>` client-side while the server generates and persists the real one; the modal polls but reads only `allConfirmed`. **[verified]** | small |
| V-3 | **`ready_made_purchases` is absent from scheduled Stripe reconciliation** — `server/jobs/stripeReconciliation.ts` contains no reference to it **[verified]**, so a Stripe success whose delivery never completed has no drift detector, unlike the cart rail (§17). | medium |
| V-4 | **The fee-band admin panel cannot edit the cap.** The traveler service fee's rate is editable; `max_amount` is neither selected by the read nor accepted by the patch, though the resolver applies it. **[verified]** | small |
| V-5 | **Nothing stops an operator deactivating a band a resolver requires** — no guard, no warning; switching off the traveler service fee or the AI-task band breaks a live charge path. **[verified]** | small |
| V-6 | **The AI-task price is invisible in that panel** — the page filters to percent and flat bands, and `concierge:ai_task` is stored in flat cents. **[verified]** | trivial |

## 3 · Reported by audit, NOT verified here — open the file before acting

- **R-1** Transport confirmation stores the Checkout Session id as the confirmation code and never stamps `stripe_payment_intent_id`, so the cancellation endpoint (which only refunds when a PaymentIntent exists) can go status-only even when a refund is owed, and reconciliation may raise a misleading "confirmed booking has no PaymentIntent" exception.
- **R-2** `TransportBookingCard` exposes no cancel or refund action after booking.
- **R-3** The cloned ready-made trip carries no durable "authored plan, do not optimize" marker, so the ordinary optimize path stays available on a professionally authored itinerary.
- **R-4** Ready-made clones receive placeholder dates; bookable services inside them need revalidating once the buyer picks real dates.
- **R-5** Ready-made delivery, revision requests, service acceptance and booking confirmation need distinct notifications.
- **R-6** Ready-made refunds intentionally differ from service cancellation (author earnings reversal, platform revenue reversal, and whether the delivered clone survives) — keep them distinct, and write the rule down.

## 4 · Lanes unblocked and ready to build

- **L25 plan-work rail** — ruling 11 (ratified 2026-09-08): a planning-tier listing bought at checkout writes the advisor row on authorization, inside the booking's transaction, through the existing single author. One more caller, never a new insert site.
- **Booking-agent claim lane** — ruling `2026-09-08-assignment-is-claimed`: retire auto-assignment, requests are claimed from the pooled queue, matching only orders the queue, existing assignees keep theirs.
- **L16 Ask AI drawer** — its brief exists (`docs/design/ASK_AI_DRAWER_BRIEF.md`) and its blocker (the conversation trip link, migration 290) has landed.
- **The three cards that still author their own buy label** — `OfferingCard` (no importers), the live storefront card (blocked on vacation mode, which the descriptor cannot express) and the catalog preview (owner is not a buyer). Each carries a grep-able `ld23-buy-action-gap` note naming what is missing.

## 5 · Landed in this program (context, not work)

Twelve lanes plus the decisions record: the console grammar, home honesty, my-plans rows, trip-card
honesty, the start-with-AI door, the concierge door, the Trip Card one page, Home's time axis, the
client pen scope, the expert-request review sheet, the impact-class lookup, the buy-action resolver,
the my-events fold, inbox context, the first Home browser gate, Discover in the shell, doors passing
the trip id, the extraction date anchor, bookings by plan, the orphan sweep, the all-advisors reader,
the concierge ownership check, the shadowed-twin sweep, the agent status vocabulary, the conversation
trip link, and **the fee correction on both money rails** (`2026-09-08-cart-fee-line`,
`2026-09-08-legacy-rail-fee`) — travelers are no longer billed the commission that is also withheld
from the provider's payout.
