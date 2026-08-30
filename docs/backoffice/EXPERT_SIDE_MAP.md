# Backoffice Program — Expert-Side Integration Map

**Date:** Jul 25, 2026 (4-agent verified pass; every claim file:line-cited against the repo)
**Why this doc:** the program covers BOTH roles. The provider-side map (PHASE0_AUDIT.md corrections +
integration pass) under-weighted the expert, who has **three selling lanes**, **four order types**, and a
**multi-stream ledger** the provider doesn't. This doc is the expert half.

---

## 1. Storefront — the "one link that books and pays," per lane

The expert sells through three lanes. **Two of the three are already complete "one link that books and
pays" implementations** — the mockup's core primitive exists today for digital products:

| Lane | Public page | Checkout | Calendar? | Verdict |
|---|---|---|---|---|
| Custom services (`provider_services`) | `/services/:id` (shared with providers) | cart → `/api/checkout` → StripeCheckout | **Needed, not wired** (human-delivered) | extend |
| Itinerary templates (`expert_templates`) | `/expert-templates/:id` (`expert-template-detail.tsx:83`) | 2-step: `POST /purchase` → StripeCheckout → `/purchase/confirm` (§14/§15-clean) | None — digital, content-gated teaser→full | **reuse** |
| Ready Made Trips (`ready_made_trips`) | `/ready-made/:id` (`ready-made-detail.tsx:52`), shelf on Discover (`discover.tsx:1324`) | `POST /:id/purchase` (server-derived amount, idempotency key, self-buy block) → StripeCheckout → confirm → clone into buyer's trip; **D7 refund live** (`ready-made.routes.ts:852`) | None — clone is re-dateable | **reuse** |

Key expert-specific gaps found:

- **`/services/:id` is role-blind** — no expert identity block, no link to `/experts/:id`; "Contact
  Provider" goes to chat. The one expert element is the "Ready made trips by this expert" cross-sell
  (`service-detail.tsx:369`).
- **`/expert-templates/:id` renders NO expert identity at all** — no name, avatar, or profile link (the
  row carries `expertId`; the client never displays it).
- **`/ready-made/:id` shows the author as text only** ("Trip by a Local — <firstName>",
  `ready-made-detail.tsx:161`) — no authorId/link in the DTO.
- So the storefront work for experts is largely **identity stitching + handle/slug + share**, not commerce:
  the money rails are done.

**Scheduling (Lane 1 only):** `vendor_availability_slots` FKs `provider_services`, so the calendar
substrate applies **identically** to expert services. The slot CRUD (`/api/provider/availability`,
routes.ts:5779-5850) is self-scoped `isAuthenticated` — an expert can technically call it today; there is
simply **no expert UI** (the manager component is mounted only on the provider dashboard). The traveler-side
date input on `/services/:id` is a free-form preference never validated against slots (`service-detail.tsx:458-482`).
One calendar build serves both roles.

---

## 2. Console — where the unified backoffice must diverge by role

### Offering management: 1 catalog (provider) vs 3 catalogs (expert)

`expert/services.tsx` + `expert/templates.tsx` + `expert/ready-made.tsx` — three tables
(`provider_services` / `expert_templates` / `ready_made_trips`), three lifecycles (active/paused with
**approval invisible to the owner**; approvalStatus × isPublished; 4-state status), three feeds, three
builders (ServiceForm / in-page dialog / Workstation authoring). **No unified read endpoint exists.** The
mockup's single "My Offerings" table = client aggregation + a normalized status column. Approval badges
already exist on templates (§10 B1) and ready-made (`STATUS_STYLE`), and are **missing on services** — the
same born-`submitted`-but-owner-can't-see-it gap as the provider side.

### Fulfillment: experts have FOUR order types (providers have one)

All live, mounted, consumer-backed — the mockup's "orders" view is aggregation, not backend:
1. Service bookings — `/expert/bookings`, real Accept/Decline.
2. Trip assignments — `assigned-trips.tsx:140` accept (pending→accepted) → workspace deliver machine
   (draft→in_review→delivered, `workspace.tsx:637`).
3. Coordination engagements — rendered atop Assigned Trips (`assigned-trips.tsx:113`) from
   `GET /api/expert/coordination-engagements` (`expert-console.routes.ts:178`).
4. Affiliate booking requests — confirm/decline inside the workspace.

### The Workstation is the backoffice archetype — generalize it, don't parallel it

The ready-made authoring flow (server-resolved workspace mode + listing panel + pipeline state with
rejection reasons + **config-resolved earnings preview** + AI build-review) is already the richest
backoffice surface in the codebase (`workspace.tsx:344`, `ready-made-listing-panel.tsx:33`,
`ready-made.routes.ts:50`). The unified backoffice should extend its patterns across the other two
catalogs — consistent with the already-signposted folding of `/expert/templates` into this factory
(`ready-made.tsx:10-12` header comment).

### Net-new for experts
- **Expert calendar** — no page/route/nav. Would aggregate 4 date sources: service bookings
  (`bookingDetails->>'scheduledDate'` jsonb — the awkward one), `trips.startDate/endDate` (assignments),
  `coordination_states.dates` jsonb, and optionally `vendor_availability_slots`.
- **Reviews management** — `POST /api/expert/reviews/:id/respond` exists owner-gated
  (routes.ts:4299) with **zero client consumers** (backend-without-a-surface); no "my reviews" list
  endpoint exists. The list is a join over `service_reviews`; the respond action reuses the endpoint verbatim.

---

## 3. Social engine — the headline finding

**A near-complete Tier-2 (auto-post) Instagram rail already exists for experts** — the dispatch assumed
Tier 2 was future/deferred, but the repo disagrees:

- `server/routes/instagram.ts` (mounted): Graph API v21 — OAuth callback → long-lived token stored per-user
  (`auth.ts:53-54`), single-image publish, 2–10-image carousel, publishing-limit check, disconnect.
- The Content Studio has the connect flow, caption field (2200-char), hashtag generator, and a
  `publishToInstagram` switch — **but the publish call has never worked**: `content-studio.tsx:308` passes
  the URL in `apiRequest`'s method slot (signature is `(method, url, data)`), so the request never reaches
  the server. One-line fix + Meta env vars (`META_APP_ID`/`META_APP_SECRET`/`VITE_META_APP_ID`) + a
  token-refresh job (long-lived tokens expire ~60 days) = working auto-post.
- **Decision needed:** the dispatch says "do NOT scope Tier 2." Given it's ~built for experts, the honest
  options are (a) activate it for experts (small fix), (b) leave dormant deliberately. Not a build decision
  — a product decision.
- Constraint either way: Graph API pulls `image_url` server-side → any generated share asset must be hosted
  at a publicly-fetchable URL.

**Attribution: three purchase rails, zero functioning attribution — but one pre-provisioned column.**
`ready_made_purchases.attributionRef` (schema.ts:6840, "share-link first-touch") **already exists and is
write-dead** — the confirm insert (`ready-made.routes.ts:807`) never sets it. `template_purchases` has no
attribution column (full list, schema.ts:3971-3983). `service_bookings.source` write-dead (prior pass).
Phase 2's expert-side work: wire the existing column, add one to template_purchases (additive-nullable).

**Referral loop: complete machinery, all three links missing.** Table + $50 default + an escrow-correct
`referral_bonus` earning creator all exist (`storage.ts:3371-3407`), but: nothing ever **generates** a code
(`local_expert_forms.referral_code` has no writer; the endpoint fabricates a non-persisted `REF-<userid>`
fallback, routes.ts:3476 — §13-class), nothing **redeems** (`?ref=` dies in funnel analytics;
`getReferralByCode` caller-less), nothing **qualifies** (`updateReferralStatus` caller-less).

**Share affordances: new on all three expert public pages** (one decorative Share2 on expert-detail, none
on template/ready-made detail). The working pattern to lift: `VariantActionButtons.tsx:249-273` (share
token + clipboard + wa.me + intent URLs). Card components for the share-asset design exist per lane; the
package + ready-made shelf cards are inline JSX in `discover.tsx` and need extraction first. Ready-made
hero images carry Unsplash attribution requirements (`heroImageMeta`) a generated asset must respect.

---

## 4. Earnings & analytics — multi-stream, with two money-adjacent findings

**Five live `expert_earnings.type` values** (creation sites verified): `consulting` (every completed
service booking, storage.ts:1576), `template_sale` (marketplace confirm, routes.ts:3240),
`ready_made_sale` (fulfil, ready-made-purchase.service.ts:118), `tip` (storage.ts:3329), `referral_bonus`
(storage.ts:3397). `affiliate_commission` write path exists, caller-less. **No coordination type.**

1. **🔴 Coordinator pay is a confirmed gap.** The §7-ratified coordination fee is 100%-platform; the design
   comment says the coordinator is "paid via the earnings ledger on the bookings they place" — but the only
   earning path is being the booked service's own provider. A coordinator placing third-party vendor
   bookings earns **$0** (`revenue-tracking.service.ts:70`, `booking-actions.ts:957` commission endpoint is
   a read-only projection, `createCoordinationBooking` has no earning side effect). **Decision-maker call**
   before any earnings mockup shows a "coordination" slice.
2. **🔴 Tip rail hazard (§14/§15-class, currently unreachable).** `POST /api/expert/:expertId/tip`
   (routes.ts:3419) records the client-sent amount as a real born-`held` earning + a `tip_commission`
   platform-revenue row **with NO Stripe charge anywhere in the flow**. Zero client consumers today, so not
   exploitable from the UI — but the endpoint is live. Must gain a payment leg (PaymentIntent + confirm,
   the coordination-fee pattern) **before** any tip surface ships; do not surface as-is.
3. **Earnings feed dishonest for multi-stream earners:** `GET /api/expert/earnings` builds its transactions
   list only from service bookings with hardcoded type `'service_booking'` (routes.ts:3376-3386) — template/
   ready-made/tip/referral earnings never appear, so visible transactions don't sum to the (correct,
   ledger-sourced) totals.
4. **Doughnut spine:** `type` is the right dimension; needs one new server `GROUP BY type` aggregate
   (mirror the provider `byService` pattern, `revenue-tracking.service.ts:274`; the current expert details
   `slice(0,20)` is not a valid source). Escrow: exclude `reversed`; follow `summarizeEscrowEarnings`
   semantics (storage.ts:3244) so the doughnut total matches the earnings page.
5. **Analytics real-vs-fabricated inventory:** REAL — summary aggregates, revenueByService,
   templateRevenue, market trending (travel_pulse tables), revenue-optimization stream sums. FABRICATED —
   funnel (×3.5/×0.85), CLV ×1.8 / repeatRate 35, seasonalDemand hardcoded 6-region map, benchmarks
   response-time literals, projections ×1.15/×1.5, client-side achievements/suggestedPricing literals,
   split-percentage string-literal fallbacks ('75'/'85'/'80'/'60'/'95', §8-adjacent). DEAD-RENDER —
   recentReviews/monthlyMetrics/overallStats read fields no endpoint returns.

---

## 5. Role-divergence summary for the unified backoffice design

| Dimension | Provider | Expert | Design consequence |
|---|---|---|---|
| Catalogs | 1 (`provider_services`) | 3 (services + templates + ready-made) | "My Offerings" needs a normalized-status merge; approval badges missing on services for BOTH roles |
| Orders | Service bookings | Bookings + assignments + coordination + affiliate requests | Expert "Orders" is a 4-source aggregation; provider is reuse |
| Calendar | Page exists (bookings view real, availability editor local-only) | No page at all | Shared slot substrate; build once, mount twice |
| Earnings streams | ~1 (`service_booking`) | 5 live types | By-source doughnut is expert-first; provider trivial |
| Storefront | Detail page needs photos/identity/calendar | 2 of 3 lanes DONE; needs identity stitching + share | Expert storefront is cheaper than provider's |
| Social | Nothing | Content Studio + built-but-broken Instagram Tier-2 rail | Tier-2 activation is a product decision, not a build |
| Fulfillment console | Bookings page | Workstation = the archetype to generalize | Extend the Workstation pattern, no parallel system |
