# Open question for the decision-maker — "credit" names three unrelated things

**Status: RECORDED, NOT RULED. Nothing is renamed by this file.**
**Precedent: Locked Decision 42 D10** (the `boys-trip` vocabulary) — an unruled string left in place
is honest; a lane silently renaming it would be a vocabulary decision taken by whoever happened to
touch the file (§13). This brief exists so the question is asked once, with a census, rather than
re-derived every time someone meets the word.

**Why it is being filed now:** the collision produced a live wrong conclusion in conversation on
2026-09-22 — that connecting payment methods removes the need for "the credits system". That is
**true of one of the three things below and false of the other two**, and acting on it would have
deleted the record that stops a traveler being charged twice.

## The census — verified 2026-09-22 at `07429e4`

| # | Thing | Where | Status | Is it stored value? |
|---|---|---|---|---|
| 1 | **Platform credits** | `wallets.credits`, `credit_transactions` (`shared/schema.ts:1873`, `:1878`) | **RETIRED.** All four wallet endpoints answer **410 Gone** (`payments.routes.ts:273-285`); tables dormant, no drop, no migration | **Yes** — a prepaid balance |
| 2 | **Coordination fee credits** | `coordination_fee_credits` (`:3923`), 22 live references across `optimization-fee.service.ts`, `optimization.routes.ts`, `routes.ts` | **LIVE** | **No** — an obligation |
| 3 | **Trip Pass allowances** | `trip_entitlements` | **LIVE** | **No** — purchased coverage |
| 4 | **Scrape cost meter** | `dmo_scrape_jobs.credits_consumed` (`:10347`) | LIVE, unrelated | No — third-party API units |

**(1) is the one the saved-card argument already retired, on that exact reasoning.**
`payments.routes.ts:265` records it: *"the per-use fee funnel + saved-card one-click checkout is the
AI monetization model; credits had ZERO real consumers (`deductCredits` has no callers) and
`POST /api/wallet/add-credits` was a free-credits hole."* Decision-maker ratified. Settled.

**(2) is NOT a payment instrument and a saved card cannot replace it.** It records that the traveler
**already paid** an optimize fee on an event, applied ONCE against a later coordination fee
(`consumed_by_coordination_id`; `source_payment_intent_id` UNIQUE so the insert is idempotent). It is
money already taken, owed back as a discount. Delete it and a traveler who optimizes and then
upgrades to coordination pays for the same work twice. A saved card makes the second charge *easier*;
it does not make it *right*.

**(3) is the same shape** — coverage bought up front (`optimizer_run`, `ai_task`,
`traveler_service_fee`). **And it is the sharpest part of the question: the code never calls these
"credits" at all.** `trip-entitlement.service.ts` and the traveler-facing Trip Pass copy contain the
word zero times. Only the BOARD does — #857 is titled *"a traveler's remaining credits"*. So for (3)
the collision lives entirely in how we talk about it, which is precisely the kind of drift that
reaches code through a ticket title.

## What the traveler actually reads today

- **(1)** nothing — the product is gone, and the Terms' §7.2 "Platform Credit System" and its 16.3
  forfeiture clause were **deleted** by V-21 (ledger `2026-09-15-v21-terms-copy`). Live
  `client/src/pages/terms.tsx` contains the phrase zero times. *(A stale copy survives in
  `artifacts/traveloure/src/pages/terms.tsx:516`; that tree is referenced by neither `vite.config.ts`
  nor `script/build.ts` nor `tsconfig.json`, so it is an inert snapshot, not a live claim. Noted so
  nobody re-files it as a defect.)*
- **(2)** `admin/concierge-requests.tsx:123` — *"The coordination fee has been reversed and the credit
  restored."* **This is the live surface using the retired product's noun for an obligation.**
- **(3)** nothing — no surface calls an allowance a credit.

## There is already a guard, and it draws a different line

`client/src/lib/__tests__/terms-copy-honesty.test.ts` separates **"platform credit"** (the retired
product noun, forbidden) from **"credit card"** (a live payment instrument, protected) — T8 exists
only to keep the Stripe card copy from being scrubbed along with the retired product. That guard is
correct for what it covers and says nothing about (2) or (3); it is evidence the line has been drawn
once already, at a different place, for a different reason.

## The question

**What is each of the three called, and does the retired noun get reused?**

- **(a) Keep "credit" for the retired product only; rename (2) and (3).** e.g. (2) → **fee offset**,
  (3) → **entitlement** (which the schema already calls it). Costs one pass over 22 references plus
  one toast string. Gains: the word means exactly one thing, and it means *a thing that no longer
  exists* — so any future appearance is a bug by construction.
- **(b) Keep "credit" for the live obligations; the retired product is gone anyway.** Cheapest — no
  code moves. Costs: the retired noun stays ambiguous while its tables sit dormant and undropped, and
  the guard above has to keep distinguishing three senses rather than two.
- **(c) Rule nothing; leave all four as they are.** Honest, and the D10 default. The cost is that
  this conversation recurs, and it has now produced one wrong conclusion about money.

**My recommendation: (a).** The decisive asymmetry is that (2) and (3) are obligations arising from
money already taken, and (1) is a product that no longer exists — so the collision is not merely
confusing, it points the wrong way: it makes a *live liability* sound like a *retired convenience*.

## Negative space

This file renames nothing, deletes nothing and rules nothing. No code, schema, guard predicate or
copy string is changed by filing it. **Whichever option is chosen, it is a rename only — none of
them changes what anyone is charged, what is owed, or when an offset is consumed.** If (a) is
ruled, the `coordination_fee_credits` TABLE should keep its name (a rename there is a migration on a
live money-adjacent table for a readability gain), and the rename applies to code identifiers, copy
and ticket vocabulary.
