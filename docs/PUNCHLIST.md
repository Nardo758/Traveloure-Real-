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

> **THIS IS THE ONE DECISION REGISTER (merged 2026-09-11).** It supersedes the two lists that asked the
> same questions elsewhere: `docs/ROADMAP.md` §A (the Console & AI Concierge open register) and §19 of
> `docs/superpowers/specs/2026-09-08-offering-commerce-trip-slip-contract-design.md` (the offering
> commerce contract). Both now point here. Two registers guarantee one gets answered and the other
> quietly does not — D-1 and D-2 below were each asked twice already, in different words.
> Each row names where it came from and what it blocks.

| # | Question | Recommendation |
|---|---|---|
| D-1 | **Is a purchased ready-made trip a finished plan or an editable template?** Today the clone is an ordinary `draft` with placeholder dates and no final snapshot **[verified]** (`ready-made-purchase.service.ts:108`), while the buyer was sold "a ready-made trip". | Deliver **both**: write a final snapshot at purchase so the buyer receives a finished Trip Card, and let them reopen it to edit. Otherwise the copy must stop implying a finished product. |
| D-2 | **What is the included consultation?** It is stored as an entitlement on `ready_made_purchases`, not a `service_bookings` row, so it inherits no scheduling, acceptance, cancellation or refund machinery **[reported]**. | Decide it is **one asynchronous revision** and say exactly that everywhere, or make it a real schedulable booking. The wording and the storage must agree. |
| D-3 | **Should a single checkout mix a ready-made trip with services?** It cannot today: ready-made has its own PaymentIntent and table **[reported]**. | Keep them separate (a digital product and a reservation are different fulfilment), and make the separation **visible** so nothing implies the ready-made price includes the services inside it. |
| D-4 | **Must a bookable itinerary item reference a real provider service?** An item without one renders as reference-only and adds nothing to the total **[reported]** (`cart.tsx`). | Yes — make it an explicit authoring contract for ready-made authors, and label every item as included / recommended / bookable separately / external. |
| D-5 | **When is Expert planning work charged for a LARGE engagement?** Ruling 11 (2026-09-08) answered the ordinary case — a planning-tier listing is charged at checkout and the purchase grants advisor access on authorization. Milestone billing for a multi-week engagement has no rail and no ruling. *(from the commerce contract §19.1)* | Do not build milestone billing until an engagement rail exists; until then a large engagement is sold as a listing like any other, or not at all. |
| D-6 | **Which Expert outputs require traveler acceptance before completion and earnings release, and what revision allowance comes with a planning artifact?** *(commerce contract §19.2–3)* | Acceptance for artifacts (a plan, a brief, edited media); seller-declared for sessions and live support. One revision included, stated on the listing, so "accepted" is never a silent timeout in the seller's favour. |
| D-7 | **Who may declare completion for physical-action and coordination work, and how are reimbursable expenses quoted, approved, evidenced and refunded?** *(commerce contract §19.4–5)* | Seller declares, traveler has a stated window to dispute. Expenses are quoted and approved BEFORE they are incurred or they are not reimbursable — never reconciled after the fact against a receipt nobody agreed to. |
| D-8 | **Can custom quotes require deposits, and how long does a quote stay valid?** *(commerce contract §19.6)* | Yes to deposits, with an explicit expiry on every quote. An expired quote is re-quoted, never silently honoured or silently refused. |
| D-9 | **What happens when one bundle component fails after others are delivered?** *(commerce contract §19.7)* | Partial completion is its own state; refund the failed component and say so, rather than completing the parent or reversing the whole bundle. |
| D-10 | **Which external partners can provide confirmation, change and cancellation callbacks, and what minimum evidence lets an external booking appear as confirmed?** *(commerce contract §19.8–9)* | Until a partner provides a callback, an external booking never reaches "confirmed" on our surfaces — it stays requested with the partner named. No partner today provides one. |
| D-11 | **Is a trip-level obligation with no item link a supported product pattern or a migration exception?** *(commerce contract §19.10)* | Migration exception, marked and audited, so it cannot quietly become the normal shape. |
| D-12 | **Which booking rail becomes canonical, and when do new writes to the legacy rail stop?** *(commerce contract §19.11–12, and the legacy rail's own fee fix on 2026-09-08 touched both)* | `service_bookings` is canonical. The legacy rail needs a dated "no new writes" decision before anything is made read-only; historical reads and refunds survive retirement. |

## 2 · Verified defects, ready to fix

| # | Defect | Size |
|---|---|---|
| V-1 | **A transport option is stamped `confirmed` the moment the Stripe Checkout session is created, before any payment succeeds** — `server/routes/transport-hub.routes.ts:353-354`, whose own comment says it is "so the UI shows the green Confirmed badge immediately". A booking is shown as confirmed that may never be paid. **[verified]** | small, urgent |
| V-2 | **The booking modal displays a fabricated confirmation code** — `client/src/components/booking/BookingFlowModal.tsx:257` builds `TRV<random>` client-side while the server generates and persists the real one; the modal polls but reads only `allConfirmed`. **[verified]** | small |
| V-3 | **`ready_made_purchases` is absent from scheduled Stripe reconciliation** — `server/jobs/stripeReconciliation.ts` contains no reference to it **[verified]**, so a Stripe success whose delivery never completed has no drift detector, unlike the cart rail (§17). | medium |
| V-4 | **The fee-band admin panel cannot edit the cap.** The traveler service fee's rate is editable; `max_amount` is neither selected by the read nor accepted by the patch, though the resolver applies it. **[verified]** | small |
| V-5 | **Nothing stops an operator deactivating a band a resolver requires** — no guard, no warning; switching off the traveler service fee or the AI-task band breaks a live charge path. **[verified]** | small |
| V-7 | **Any signed-in account can stamp any transport option `confirmed`, with any reference.** `PATCH /api/transport-booking-options/:optionId/status` reads `bookingStatus` and `confirmationRef` straight off `req.body` behind `isAuthenticated` only — no ownership check, no allowlist. That is the §19 denylist shape on a status-and-authorship field, and the status it writes is the one the badge and the traveler-profile reader both treat as a real reservation. **[verified by the confirm-honesty lane]** | small, and it is an access hole |
| V-8 | **A late paid signal promotes a cancelled transport option.** `handleStripePaymentSuccess`'s promotion is unconditional on the row's current status, so it has no from-state guard (§15's atomic-conditional shape is present for the payment check but not for the status it overwrites). **[verified by the confirm-honesty lane]** | small |
| V-6 | **The AI-task price is invisible in that panel** — the page filters to percent and flat bands, and `concierge:ai_task` is stored in flat cents. **[verified]** | trivial |
| V-9 | ~~**Every live listing's booking mode is a fabricated `false`.**~~ **CLOSED 2026-09-11 by lane OC-A0b (`2026-09-11-booking-mode-provenance`), and the fix is NOT the one this row proposed.** The diagnosis stands: `server/services/buy-action-payload.ts` guards on `row.bookingMode || row.ownerUserId`, `ownerUserId` is NOT NULL, so the honest-absence branch is unreachable and an owner with no `service_provider_forms` row resolves to `request` as if they had chosen it — **64 of 67 production listings [verified]**. The proposed remedy ("test whether the OWNER FLAG is known") was **wrong**: it would make the mode `undefined` for those 64 rows, and `resolveBuyAction` gives a modeless row no booking verb — i.e. it would strip the buy button from the entire live catalogue. `request` is the safe default (the traveler asks, the seller accepts, nothing is charged without an acceptance) and is deliberately kept. What was actually missing was the PROVENANCE: `resolveBookingModeWithProvenance` (`shared/schema.ts`) now says whether the answer was `listing_declared`, `account_declared` or `platform_default`, the payload stops coercing a NULL flag to `false`, and the misleading comment is corrected. | closed |

## 3 · Reported by audit, NOT verified here — open the file before acting

- **R-1** Transport confirmation stores the Checkout Session id as the confirmation code and never stamps `stripe_payment_intent_id`, so the cancellation endpoint (which only refunds when a PaymentIntent exists) can go status-only even when a refund is owed, and reconciliation may raise a misleading "confirmed booking has no PaymentIntent" exception.
- **R-2** `TransportBookingCard` exposes no cancel or refund action after booking.
- **R-3** The cloned ready-made trip carries no durable "authored plan, do not optimize" marker, so the ordinary optimize path stays available on a professionally authored itinerary.
- **R-4** Ready-made clones receive placeholder dates; bookable services inside them need revalidating once the buyer picks real dates.
- **R-5** Ready-made delivery, revision requests, service acceptance and booking confirmation need distinct notifications.
- **R-6** Ready-made refunds intentionally differ from service cancellation (author earnings reversal, platform revenue reversal, and whether the delivered clone survives) — keep them distinct, and write the rule down.
- **R-7** `provider_services.service_type` carries a **second, category-shaped vocabulary** beside the declared six: `storage.getProviderServices` filters category with `ilike` on it (owner-scoped) and `content-matching.service.ts` does `inArray(serviceType, rule.serviceTypes)` for placement rules. Production's 61 demo listings hold values like `florist` and `av-equipment` for that reason, so **correcting them would break those readers**. Ruled a finding for lane **OC-A2**, not a data cleanup (`2026-09-11-oc-a1-ratified`); the reader inventory is [reported], not exhaustively checked.

## 4 · Lanes unblocked and ready to build

- **OC-B1 next** — the offering commerce contract. **OC-A0b, OC-A2 and OC-A4 LANDED 2026-09-11** (ledger rows
  `2026-09-11-booking-mode-provenance`, `-offering-commerce-resolver`, `-offering-activation-validation`).
  **Before publishing, run
  `DATABASE_URL=<prod> npx tsx scripts/audit-offering-classification.ts` and read its COMMERCE CONTRACT
  section.** `catalog_keys_unrecognised` does NOT block a publish (it is our table's gap, not the
  seller's — reported and counted, never refused); a large count there means migration 289's
  `service_categories.category_key` repair has not reached the deployment, and every such listing
  sells without a resolvable contract. Ratified 2026-09-11 against production
  counts. Plan and lane briefs: `docs/superpowers/specs/2026-09-11-offering-commerce-contract-implementation-plan.md`.
  **OC-B2 (checkout authority) is HELD until a real seller catalog exists** — production has six non-demo listings.

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
