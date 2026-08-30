# Backoffice Mockups ↔ Code Audit (post-#305)

**Date:** Jul 26, 2026
**Baseline:** `main` @ `5aa14e75` (PR #305 merged — Wave 0 W0.1–W0.8, Ready-Made lane, expert-console
consolidation, self-serve payout requests all LANDED; this audit supersedes the Jul 25 pass where they conflict).
**Source designs:** the six Jul-25 mockups, now version-controlled in `docs/backoffice/mockups/`
(recovered from the authoring session's scratchpad — the published claude.ai artifact URLs are
auth-walled and unreadable by executor sessions; **cite these files, not the URLs**):

| File | Artifact title | Role in program |
|---|---|---|
| `mockup-backoffice-dashboard.html` | Backoffice — Yuki's Kyoto Experiences | the unified console ("My Offerings" table) |
| `mockup-analytics-dashboard.html` | Analytics — Yuki's Offerings | link/earnings analytics slice |
| `mockup-offering-page.html` | Book Kyoto Flower Arrangement with Yuki | public storefront ("one link that books and pays") |
| `mockup-social-sharing.html` | Share Your Offerings | share/social-engine surface |
| `gap-atlas.html` | Backoffice Gap Atlas — Today vs Proposed | meta: gap analysis |
| `sidebar-nav-comparison.html` | Sidebar Nav — Two Consoles Today vs Unified Backoffice | meta: nav consolidation |

**Verdict in one line:** the money/commerce spine the mockups assume is BUILT and in several places
ahead of the design; the **identity + distribution layer** (handle, public storefront URL, link
attribution, share assets, availability calendar) is the real gap — exactly the ROADMAP_PROPOSAL
Phase 1–2 scope. Nothing in the mockups invalidates the roadmap; several items it lists as gaps
have since closed.

**§13 guardrail for executors:** every number in the mockups (4.9★, 23 reviews, 142 clicks, 4.2%
conversion, "industry average 2–3%", "2x engagement", "3x more clicks") is **sample content**.
Implementations must derive metrics from real data or show honest empty/"New" states — never
hardcode a mockup number. This exact class (fabricated 4.9 ratings) was a shipped defect once already.

---

## Mockup 1 — Backoffice Dashboard (`mockup-backoffice-dashboard.html`)

| Element | Status | Ground truth |
|---|---|---|
| Unified 9-entry sidebar (Dashboard / My Offerings / Calendar / Earnings / Share & Promote / Analytics / Reviews / Messages / Settings) | **PARTIAL** | Two consoles remain (expert + provider layouts). Expert sidebar was consolidated in #305 (13 dead pages deleted, 9959ca80) but not unified with provider. Unified nav = Phase 1 (`sidebar-nav-comparison.html` is the spec). |
| Identity header `@yuki-flowers` (handle) | **MISSING** | No handle/slug on `users` (re-verified; `users` lives in `shared/models/auth.ts`). No `/p/:handle` route in App.tsx or server. Slug precedents to copy: `service_categories.slug`, `city_neighborhoods.slug`, `boards.slug`. Phase 1. |
| Quick stat: Link Clicks | **MISSING** | No link/short-code click store. `funnel_events` captures `viral_share` + signup `refToken` (analytics-only jsonb). Short-link table + `/r/:code` 302 handler is net-new (the Jul-25 audit's "redirects.routes.ts exists" claim was fabricated — it does not). |
| Quick stat: Bookings + "N from your link" | **PARTIAL** | Bookings surfaces exist per-role. Link attribution MISSING: checkout now writes `source:"provider"` (payments.routes.ts:395) but that is **earning routing**, not acquisition channel; the `direct|cross_sell` acquisition write is still dead (nothing sets it), and there is no per-link ref → booking join. |
| Quick stat: Earnings "$312 · Waiting to be released" + Request payout → | **BUILT** | Escrow spine `held→releasable→paid_out` (#163–170) + dispute window; self-serve `POST /api/payouts/request` (payments.routes.ts:836, §14 server-derived amount) with real buttons on both earnings pages. Mockup's "Total (held)" should read **releasable** (the payable number) — mockup vocabulary is looser than the ledger; implement against the ledger. |
| Quick stat: Rating "4.9★ · 23 verified reviews" | **PARTIAL** | Service-level aggregates real + honest ("New" when 0). **Earner-level aggregate still missing** (§13 filed): no expert/provider rating rollup table or query. Needs a real aggregate before this card can render a number. |
| Posting Opportunities (share new 5★ review / promote open slots / seasonal prompt) | **MISSING** | The social-engine trigger feed. Data sources exist (reviews, availability schema, seasons on `city_neighborhoods`); no opportunity generator, no surface. Phase 2/3; review-card share also blocked on the share-asset decision (Mockup 4). |
| **My Offerings** unified table (Service / Status / Next Availability / Price / Actions) | **PARTIAL** | Per-lane management is complete with real approval badges: `provider_services` (ServiceForm + expert/services), `expert_templates` (B1 submit/status), `ready_made_trips` (#305 authoring + admin queue). Status vocab in the mockup (Approved / Pending Review / Draft) maps 1:1 onto `approval_status` (`approved/submitted/draft` — F2). **The single cross-lane table does not exist** — it is client aggregation + a normalized status column (EXPERT_SIDE_MAP §my-offerings), no new backend. |
| "Next Availability" column | **MISSING (wiring)** | Three availability tables exist in schema — `provider_availability` (schema.ts:5755), `provider_availability_schedule` (:4783), `vendor_availability_slots` (:1611) — none wired to a next-open-slot compute, and the provider calendar page is honesty-gated as incomplete (console Fix #5). ⚠️ **Three parallel availability stores is a §4-style consolidation decision** that must be made before the calendar lane builds — do not pick one silently. |
| Earnings by source (your link vs Discover) chart + breakdown | **MISSING** | Depends on acquisition attribution (above). Ledger can already slice by earning type/lane; cannot slice by channel. |
| Upcoming bookings: Confirm / Decline | **BUILT** | provider/bookings.tsx `button-accept` → statusMutation `confirmed|cancelled` (console Fix #4). |
| Upcoming bookings: Message traveler | **PARTIAL** | Chat exists (`messages.service.ts` user↔expert); no per-booking deep-link from the bookings row. Small wiring item. |

## Mockup 2 — Analytics (`mockup-analytics-dashboard.html`)

| Element | Status | Ground truth |
|---|---|---|
| Range picker (7/30/90/all) + Export Report | **MISSING** | provider/analytics.tsx is fixed-range, no export. Low-risk UI work once metrics are real. |
| Link Views / Link Clicks tiles + daily chart | **MISSING** | Same dependency as Mockup 1: short-link store + view/click events. Nothing to chart until the write path exists. |
| Bookings (Your Link) vs (Discover) per offering | **MISSING** | Acquisition attribution (see Mockup 1). The per-offering *revenue/bookings/rating* table already exists (`servicePerformance` in provider analytics — real post-W0.8). |
| Earnings by source incl. "Repeat bookings" | **MISSING** | No repeat-booking rollup; derivable from `service_bookings` by traveler+provider once wanted. |
| **"8% commission via your link vs 25% via Discover"** | **⛔ DECISION + MISSING** | Differential commission by acquisition channel does not exist — `resolveCommissionRates` has no channel dimension. This is a **money-model decision** (decision-maker sign-off), and if adopted the rates live in `fee_bands` (§8 — no literals; the mockup's 8%/25% are illustrative, not ratified numbers). Do not implement from the mockup copy. |
| Conversion funnel (views → clicks → bookings) | **PARTIAL** | `funnel_events` spine exists (`account_created`, `viral_share`, refToken at signup). Missing: link-view/click events + a booking-completion join. |
| Coaching tips ("post Tue/Thu/Sat", "industry average 2–3%") | **MISSING** | Data-driven coaching is Phase 3 polish. The "industry average" figure is fabricated sample copy — §13: never ship it as a literal. |
| Cross-sell performance (adjacent, not in mockup) | **BUILT** | Real impressions/clicks/CTR/conversions already on provider analytics — reuse this pattern for link metrics. |

## Mockup 3 — Public Offering Page (`mockup-offering-page.html`)

| Element | Status | Ground truth |
|---|---|---|
| URL `traveloure.com/p/yuki-flowers/kyoto-ikebana` | **MISSING** | Handle + offering slug. Phase 1. Today's public detail is `/services/:id` (read-gated `approved`, §14/§15-clean checkout) — the *page* exists, the *identity URL* doesn't. |
| Provider header + rating "(12 reviews)" | **BUILT** | Honest real aggregates on `/services/:id` (PR #177 killed the fabricated fallbacks). |
| Details grid (Duration / Group Size / Location / Delivery) | **PARTIAL** | `deliveryMethod` (canonical 7), meeting-point (backoffice Phase 1 landed), location columns (migration 129). Duration/group-size fields exist unevenly across lanes — verify per-lane before rendering the grid. |
| What's Included list | **PARTIAL** | `requirements` absorbed into ServiceForm (Phase 2); a structured "inclusions" list is not a first-class field. |
| Reviews with "Verified purchase" | **BUILT** | `service_reviews` is booking-gated (verification is structural); W0.7 added response moderation. |
| **Custody label + cancellation policy** ("Free cancellation up to 7 days") | **PARTIAL → confirms a filed defect** | Origin/custody labeling exists (content P5/G7). But cancellation policy is the §13 open arm: today it's **hardcoded copy**; the mockup treats it as **per-offering data**. Implementing this card correctly requires a real cancellation-policy field — closing the §13 defect, not restyling it. |
| Availability calendar (booked/available days) + slot-conflict alert ("this slot just booked") | **MISSING (wiring + decision)** | The mockup's biggest commerce delta: date-bound slot booking with conflict detection. Schema exists ×3 (consolidation decision above); checkout has no slot dimension (`service_bookings` has no slot/hold linkage); no conflict detection. EXPERT_SIDE_MAP verdict "calendar needed, not wired" stands. |
| Book Now → Stripe | **BUILT** | Cart → `/api/checkout` (required idempotency, server-derived pricing) — but **not date-bound** until the calendar lane lands. |
| Share This Link + rich preview | **PARTIAL** | W0.5 fixed trip share links; per-offering OG is missing but the **server-side OG injection precedent exists** (`trips.routes.ts:2860` route-interception) — replicate that handler shape for `/services/:id` and later `/p/*`. No edge function needed. |

## Mockup 4 — Share Your Offerings (`mockup-social-sharing.html`)

| Element | Status | Ground truth |
|---|---|---|
| Rendered IG feed card (1080×1350) / story (1080×1920) | **MISSING + ⛔ DECISION** | No image-gen dependency in package.json (re-verified: no satori/sharp/canvas/puppeteer; only pdfkit). The **share-asset persistence decision** (render-on-demand vs stored assets) is flagged as required **before any IG activation** (IMPLEMENTATION_MAP). W0.6 (Instagram publish fix) is the adjacent filed defect. |
| Review share card | **MISSING** | Data exists (honest reviews); rendering blocked on the same image decision. |
| Quick share: WhatsApp `wa.me`, IG DM copy, X copy, copy-link | **MOSTLY TRIVIAL, MISSING on offerings** | Pure client-side; blocked only on having a link worth sharing (handle/short-link). Note wa.me/X are *informational* outbound — §16 prohibits raw outbound **booking** CTAs, not share links; the link itself must route back into the platform storefront. |
| Unique booking link + counters | **MISSING** | The B5 net-new: short-code table + `/r/:code` 302 + view/click counters, modeled on the existing `sharedTrips` token infra (views/bookings counters, expiresAt). This one table feeds Mockups 1, 2, and 4 simultaneously — build once. |
| Caption/hashtag suggestions + Sharing Tips | **MISSING** | Content Studio exists (nuggets, composer) — natural home; "Create social post" action already filed in the D4 follow-ups. Static tips are trivial; keep fabricated engagement claims out (§13). |

## Mockups 5 & 6 — Gap Atlas + Sidebar Nav (meta)

These are the program's own analysis rendered as pages, not surfaces to build. Post-#305 status of
their "Today" column: expert-console consolidation **done** (13 pages deleted, workstation live,
Ready-Made lane live), review-response moderation **done** (W0.7), tip endpoint honestly gated
(W0.4), fabricated metrics removed (W0.8), event_planner 403 dead-end fixed (W0.3). Their "Proposed"
column = ROADMAP_PROPOSAL Phases 1–3, unchanged. When using the gap atlas, treat **this document**
as the current gap state — the atlas predates the #305 merge.

---

## The dependency graph the mockups imply (build order)

1. **Handle + public storefront URL** (`users` handle column + reserved-word enforcement + `/p/:handle`
   SSR-OG page) — everything else links *to* this. (Phase 1; verification gate V.1–V.3 precedes publish.)
2. **Short-link + click store** (one table, `/r/:code`, view/click counters) — feeds dashboard stats,
   analytics funnel, and share surface at once.
3. **Acquisition attribution write** at checkout (`source` vocabulary decision + ref→booking join) —
   turns clicks into "bookings from your link" and unlocks the by-source earnings split.
4. **Availability consolidation decision** (3 tables → 1) → next-slot compute → public calendar →
   slot-aware checkout with conflict detection. Independent lane; biggest commerce change.
5. **Share assets** (⛔ persistence decision → image rendering → posting opportunities feed).
6. **Differential commission by channel** — ⛔ decision-maker money decision; `fee_bands` if ratified.

Items the mockups show that are **already done and must not be rebuilt**: checkout/idempotency,
escrow ledger + dispute window, payout request + admin processing, refund/reversal spine, approval
queues (all five), booking accept/decline, honest ratings, review moderation.
