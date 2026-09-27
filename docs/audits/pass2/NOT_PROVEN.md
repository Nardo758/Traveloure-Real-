# NOT PROVEN — Supply → Demand pass 2

Everything in this list is either blocked by the environment, exercised statically only, or limited
by the harness's own stated rules. None of it is evidence of a defect; it is a list of what this pass
could not observe.

## Held: Stripe

The Stripe secret key is a 29-character CI stub (`sk_test_ci_stub…`); `GET https://api.stripe.com/v1/account`
with it returns **401 "Invalid API Key provided"**, and neither `STRIPE_PUBLISHABLE_KEY` nor
`VITE_STRIPE_PUBLIC_KEY` is set. Every step below is `test.skip('HELD:stripe')` (4 skips in the final run):

- **Stripe Connect onboarding** (provider and expert) — `POST /api/stripe/connect/onboard`, status,
  dashboard, return/refresh (`payments.routes.ts:2713,2762,2797,2821,2830`); the identity/business
  verification flip that gates publish (RC2-A) — seeded directly instead (`GAP_REGISTER_PASS2.md` §C).
- **Checkout (`D6`), including the 3DS card.** No PaymentIntent could be created or confirmed; the D6b
  confirmed booking used to exercise the join-link reveal was seeded directly with
  `stripe_payment_intent_id=NULL` rather than fabricated (§19a) — flagged instead as the honest
  `payment_provenance_unverified` state a real drift job would also flag (§19b).
- **Trip Pass purchase.** No pass could be bought; any Trip-Pass-covered behaviour (e.g. optimizer run
  coverage, `traveler_service_fee` waiver) is untested this pass.
- **Payouts / transfers** (`POST /api/payouts/request`, admin transfer execution) — blocked on Connect.
- **The paid AI proposal apply (D4's paid leg)** — the free draft was exercised (`P2-D4-1`, confirmed
  no fee row); the charge-on-apply leg needs a real PaymentIntent.
- **Quote acceptance charge** (`quote-charge.service.ts`) — no custom_quote fixture existed this run
  (`P2-D6-1`), so even the pre-Stripe leg (accept → `service_bookings.platform_fee`/`provider_earnings`)
  was not exercised; `P2-RES-1`'s behavioural leg is HELD for this reason.
- **Stripe Identity** sessions (`identity.routes.ts:18`) — same key limitation.

Stripe **is** confirmed live in test mode at the account level (outside this harness): the Stripe
connector shows account `Traveloure` (`acct_1OL2SOJZ5fFY5Q8L`) with Express + Standard Connect
accounts existing. The app's own runtime key is a CI-only stub for this pass.

## Held: other external services

- **AI model calls (Grok/x.ai).** `server/services/grok.service.ts:35` hardcodes
  `baseURL: "https://api.x.ai/v1"`; the key present in this environment is a stub. The free AI draft
  frame (`D4-04-after-generate-wait.png`) shows the UI completing a generation, but the underlying
  model call's actual content/cost was not independently verified — only the DB-side effect (no fee
  row written on an empty plan) was proven.
- **Unsplash.** No Unsplash key is present in this environment; any listing/cover-photo flow that
  calls Unsplash for stock imagery is untested end to end. No journey in this pass depended on it for
  a pass/fail assertion.

## Static-only claims (file:line reading, not run this pass)

- **`P2-RES-1`** (resolver disagreement, money path, P1 candidate) — every resolver in the table is a
  static trace (`server/services/fee-resolution.service.ts:178`,
  `server/services/direct-charge-rate.service.ts:92`, `server/services/commission.ts:575,668-696`,
  `server/services/service-quotes.service.ts:747-780`, `server/services/quote-charge.service.ts:264-340`).
  See `$P2/D5_RESOLVER.md` for the full table.
- **`P2-STORE-1`** (storefront has no booking action) — static trace of
  `client/src/pages/storefront.tsx` and `shared/buy-action.ts`; the proposed design is documented, not
  built (being built separately on `claude/storefront-booking-actions`).
- **Trip Card expert-note fallback** (`server/services/trip-plan.service.ts:802`) — dead today
  (`itinerary_items` has no `notes` column), traced statically, not exercised.
- Every content-type × surface cell in `VISIBILITY_MATRIX.md` marked **not exercised** — event
  packages, neighbourhood sections, slip "Browse services", slip event-role chips, the AI free-draft
  candidate pool, the paid optimizer catalog, advisor stays, recommendations, `/experts`, and
  HireExpertDialog. Their governing filters are Phase 0 §3 static readings; the final run's fixtures
  did not exercise all of them.

## Harness's own stated limits

- **R-1 seeding is not a UI path**, by design, for four classes of write (identity/business
  verification × 2, meeting pin, one seeded confirmed booking) — each is filed as its own finding in
  `GAP_REGISTER_PASS2.md` §C rather than silently absorbed.
- **`P2-D3-3`** (expert workspace "suggest" toggle) is explicitly UNPROVEN either way per the original
  finder: the harness never drove an "accept invitation" step for the expert, so the missing control
  is equally consistent with a real `DEAD_TRIGGER` or with LD 12 ("a pending advisor may not write")
  correctly withholding it. Not resolved this pass.
- ~~`P2-D3-4`~~ — resolved: proven passing in run `nu4fb2` (see the register, section F).
- ~~`P2-S2-3`~~ — resolved: the ready-made was submitted and approved in run `nu4fb2`. Still not proven: that a CLONED plan's items resolve to A, B, C (the purchase is HELD:stripe).
- **Ids reused across drafts.** `P2-<journey>-<n>` finding ids were reused for different content
  between the raw pre-curation runs and the curated 38-row set the lead reviewed; this pass's register
  resolves the two collisions the lead's verdicts named (`P2-S1-1`, `P2-S1-2`) with new slugged ids
  rather than trusting the number alone. See the header note in `GAP_REGISTER_PASS2.md`.
- **`P2-S1-8`/ready-made `/ready-made` visibility** — both show a hidden-then-visible pattern across
  repeated polls within the same run, consistent with eventual-consistency/indexing lag rather than a
  hard filter defect, but this pass's 10s poll window is not long enough to rule that out with
  confidence. Flagged, not resolved.
