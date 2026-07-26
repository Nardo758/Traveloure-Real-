# Backoffice Execution Roadmap — token-optimized, post-P1a-1c

**Date:** Jul 26, 2026 · **Baseline:** branch `claude/sync-local-repo-2j7ghv` @ `d8c02aed`
**Design source:** `docs/backoffice/mockups/` · gap state: `MOCKUP_CODE_AUDIT.md` (supersedes the gap atlas)
**Token model:** Fable plans/briefs + money/schema diffs; Sonnet executes fenced endpoint/UI work behind the
four standard gates (tsc-delta-0, build, money guard, unmounted-router guard) + a per-brief behavioral gate;
Haiku does enumerated mechanical work. Fable never executes what a fenced Sonnet can (IMPLEMENTATION_MAP tier
philosophy). Estimates are output-token budgets per session, ±40%.

## ⚠️ Surface registry — the storefront has ONE canonical page (anti-duplication rule)

Public earner surfaces that exist after P1b:

| URL | Component | Role |
|---|---|---|
| `/p/:handle` | `client/src/pages/storefront.tsx` | **CANONICAL public storefront** — the shareable identity URL (mockups 1/3/4 all point here) |
| `/experts/:id` + alias `/local-experts/:id` | `client/src/pages/expert-detail.tsx` | Browse-context detail (AI-match, request-expert, cart handoff) — linked from expert-card.tsx:326, city-feed-card-expert.tsx:116, TopExpertsPanel.tsx:44, expert-match-card.tsx:358 |
| `/services/:id`, `/expert-templates/:id`, `/ready-made/:id` | lane detail pages | Per-offering booking pages — both surfaces above LINK here; never duplicated |

**Rule: do not create another earner-profile page.** S2 below reconciles the two that exist. Until S2
lands, any new feature that needs "the earner's public page" targets `/p/:handle` if it's about sharing/
identity, `/experts/:id` if it's about in-platform browse — and nothing new gets built on either without
checking this table.

## Status key
✅ done · ⛔ decision-maker required before build · 🔴 money-path (HUMAN READ of diff after gates)

---

## Wave S — Storefront identity & distribution (the mockups' core gap)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| S1 ✅ | handle + `/p/:handle` + OG + My Offerings table + claim card | — | done | — | `d8c02aed` |
| S2 ✅ `7fd17178` | **Reconcile `/p/:handle` ⇄ `/experts/:id`** (the anti-duplication item): expert-detail header gains the earner's `/p/` link when claimed; decide-and-wire the long-term shape — recommended: `/experts/:id` 302s to `/p/:handle` once claimed, `/p/` absorbs the browse extras (match-context, request-expert) later | ⛔ then Sonnet | ~40k | S1 | Decision is one question: redirect-when-claimed (recommended) vs keep-two-pages |
| S3 ✅ `29899773` | Short-link + click store: one table (`short_links`: code, targetType/id, ownerId, views, clicks, createdAt), `GET /r/:code` 302 + counter, Share buttons emit short links | Fable brief ~15k → Sonnet ~70k | ~85k | S1 | Modeled on `sharedTrips` counters; feeds mockups 1, 2, 4 at once. No money path |
| S4 ✅ `b6346ff8` 🔴 | Acquisition attribution: `?ref=` capture → `service_bookings` write at checkout (vocabulary: `direct \| link \| cross_sell`) + ref→booking join | ⛔ vocab sign-off, then Fable 🔴 | ~60k | S3 | Touches checkout insert (payments.routes.ts) → money-adjacent, HUMAN READ |
| S5 ✅ `fb953bf7` | Analytics v1: per-offering link views/clicks + conversion funnel + range picker (mockup 2), real data only | Sonnet | ~55k | S3, S4 | §13: empty states until data exists; no fabricated benchmarks |
| S5b ✅ `97179bf4` | CSV export of analytics | Haiku | ~15k | S5 | Mechanical |
| S6 ✅ `a2128872` | Dashboard "earnings by source" split (your link vs Discover) | Sonnet | ~35k | S4 | Landed with the §13 pre-attribution caveat (pre-S4 bookings read the column-default direct) |
| S7 ✅ `55920401` (delta-only — browse/detail aggregate already existed via #202/#239) | Earner-level rating aggregate (closes §13 filed gap; unblocks mockup 1's rating card) | Sonnet | ~40k | — | Real aggregate or "New" — never a number without reviews |

## Wave N — Unified backoffice nav (mockup 6)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| N1 ✅ `feafc515` | Converge entries: both sidebars adopt the mockup's 9-entry vocabulary (Dashboard / My Offerings / Calendar / Earnings / Share & Promote / Analytics / Reviews / Messages / Settings), role-computed visibility f(user.role) | Haiku (enumerated file list) | ~30k | — | No layout unification yet — labels/links only |
| N2 ✅ | Unify the two console shells into one backoffice layout | Sonnet | ~60k | N1 | Landed as shared BackofficeShell + thin role adapters (24 consumer pages untouched, testids preserved; role status badges stay divergent by design). Follow-on filed: merge the two sidebars into one role-parameterized nav config |

## Wave V — Verification gating (Phase 0.5; REQUIRED before marketing pushes of /p/ links)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| V.1 ✅ `29899773` (default OFF — flip platform_settings.storefront_require_verified to "true" after V.2/V.3) | Gate /p/ visibility + publish on `identityVerificationStatus='verified'` (F2-style read-gate; build-while-pending preserved) | Sonnet | ~55k | S1 | Interim gate today = zero-approved-items 404 |
| V.2 ✅ (already existed — ground-truthed Jul 26) | Sequence Identity/KYB into application flow | Sonnet | ~50k | — | The full path predates this task (commit `5fbe0552`): pre-approval verify flows on expert/provider-status pages + Verification cards in both Settings consoles, wired to the live `/api/identity/*` + webhook status writers; honest degrade when Persona keys absent. V.1 flip now waits only on V.3 |
| V.3 ✅ `39f53d99` | Connect onboarding sequenced into go-live | Sonnet | ~45k | — | Stack already existed; delta = Connect-readiness gate on POST /api/payouts/request + honest no-key degrades |
| V.4 | `provider` vs `service_provider` vocab normalization | Haiku | ~25k | — | Grep-enumerated |
| V.5 ✅ `ee069bfe` | Env-keys launch checklist + readiness log line | Haiku | ~10k | — | — |

## Wave C — Availability & calendar (mockup 3's biggest commerce delta)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| C0 | ⛔ **Consolidation decision:** 3 availability tables (`provider_availability`, `provider_availability_schedule`, `vendor_availability_slots`) → 1 canonical | Fable analysis ~30k → decision | ~30k | — | §4-class decision; blocks all of Wave C |
| C1 ✅ `e0323cbb` (found the availability-manager writer dead — filed for C2) | Next-availability compute + My Offerings "Next Availability" column | Sonnet | ~45k | C0 | — |
| C2 ✅ | Public availability calendar on offering page (booked/available days) | Sonnet | ~60k | C1 | Landed: repaired the dead slot writer (client sent a weekly shape the server never accepted — every save 400d) + ADDED the missing §14 ownership check on POST /api/provider/availability (any provider could create slots on another's service); public month read is F2-gated (approved-only, proven both directions). Filed: blackout-dates GET wiring; recurring-pattern generator (schedule layer) |
| C3 ✅ 🔴 | Slot-aware checkout + conflict detection ("this slot just booked") | Fable | ~100k | C2 | Landed (migration 145): slot pick rides add-to-cart (soft-validated, server-derived date), checkout claims capacity via the rewritten ATOMIC bookSlot (§15 — the old check-then-update TOCTOU had zero callers) BEFORE any booking/Stripe call, with compensation release + 409 slot_unavailable on a lost race; slot_id stamped on the booking. Filed: release the slot on refund/abandoned payment_pending (rides the existing recovery design) |

## Wave SH — Share & social engine (mockup 4)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| SH0 | ⛔ Share-asset persistence decision (render-on-demand vs stored) | decision | — | — | Blocks SH1; flagged in IMPLEMENTATION_MAP before any IG activation |
| SH1 ✅ `49090eb0`+`285102d5` | Image render pipeline (IG feed 1080×1350 / story 1080×1920 / review card) | Fable design ~40k → Sonnet ~60k | ~100k | SH0, S3 | Landed: satori + @resvg/resvg-js (deliberate add, lockfile clean) + bundled Inter woff (OFL); F2/REV-MOD-gated endpoints, §13-honest cards, cacheable + rate-limited |
| SH2 ✅ | Share surface page: cards + captions + wa.me/X/copy (informational outbound OK per §16; links route back to /p/) | Haiku | ~30k | SH1 | Landed: shared /expert|provider/share-promote page (offering picker, live SH1 previews, editable real-data captions, short-link-first actions). Ground-truth catch: N1 never actually added the Share & Promote nav entry — added to both sidebars here |
| SH3 ✅ `2eaf10a9` | Posting Opportunities feed (new 5★ review / open slots / seasonal) | Sonnet | ~50k | SH1, C1 | Landed (reviews + open slots). Seasonal source honestly SKIPPED — seasonal_opportunities has readers but zero writers and 0 rows (§13); add only with a real write path |
| SH4 ✅ (Tier-2 ACTIVATE ratified) | W0.6 Instagram publish fix (filed defect) | Sonnet | ~40k | — | Ground-truthed Jul 26: defect confirmed real (content-studio.tsx:310 apiRequest arg-order bug — the publish call never reaches the server; :849 dropdown decorative) BUT the W0.6 brief is VOID unless the Instagram Tier-2 activate/dormant PRODUCT decision is ratified "activate" — it is not among the five ratified decisions. Fix is pre-scoped in the brief (2 client lines; server already complete + honestly key-gated); executes on ratification |

## Wave M — Money-model decision

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| M0 | ~~Channel pricing~~ **SCRATCHED (Jul 26 ruling): link-channel pricing = identical to platform pricing.** No build. S4 stays analytics-only. See REVENUE_MODEL.md rulings | — | 0 | — | Revenue-review fixes F2/F3 landed instead |

## Wave R — Revenue-model fixes (from REVENUE_MODEL.md; F2/F3 landed `9ae879d7`)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| R1 ✅ `0505e13a` | F5: seed the 4 missing category fee bands (`transportation`/`flights`/`car_rental`/`insurance`) — today those slugs 500 checkout | Haiku | ~10k | — | Or remap slugs; seed at 0.25 like siblings |
| R2 ✅ `3fa5b6cb` 🔴 | F4: platform_revenue writes for Ready-Made + template sales (brief 03) | Sonnet | ~35k | — | Idempotent on purchase id; `recordRevenueEventOnce` now exists |
| R3 ✅ `0505e13a` | F6 + F1 disclosure: /pricing + checkout disclose the service fee (F1 ratified model); gate/label Power Pass card; kill the 0.30 display literal | Haiku | ~25k | — | Honesty sweep, §13 class |
| R4 ✅ 🔴 | F7: wire `createAffiliateEarning` at agent-booking confirm sites so reconciliation has a spine | Sonnet | ~45k | — | Landed: atomic confirm claim (§15) fires the ledger write once; commission fields honestly 0 pending partner report (§13); 70/30 → `fee_bands.affiliate_standard` (migration 143); money-guard regex extended to cover affiliate-earning writes |
| R5 | Credits fulfillment (lifts the F2 501 gate): `credit_purchase` webhook + real balance ledger + revenue row | Fable 🔴 | ~80k | — | Only when credits become a priority |
| R6 ✅ (ratified + landed) | Expert-compensation split on completed review work: expert **75% / platform 25%**, admin-editable via `fee_bands.expert_review_expert_share` (migration 142). Credited at `completeExpertRequest` from the capture-time `platform_revenue` ledger row (atomic re-split, §15 idempotent; earning born `held` on the escrow spine). Legacy paid requests without a stamped PI are grandfathered (manual handling). | Fable 🔴 | ~30k | — | Ratified Jul 26: "platform gets 25% but more importantly is the ability to change the splits in the admin panel" |

## Singles (independent, cheap — fill idle capacity)

| ID | Item | Tier | Est. |
|----|------|------|------|
| X1 ✅ `2ffa1774` (structured cancellation_policy_type alongside the pre-existing free-text column) | Cancellation-policy field (per-offering data; closes the §13 hardcoded-copy arm) | Sonnet | ~45k |
| X2 | Booking row → Message deep-link | Haiku | ~15k |
| X3 | Repeat-bookings rollup line | Haiku | ~25k |
| X4 ✅ `ee069bfe` | OG injection for `/services/:id` (replicate the /p/ handler) | Haiku | ~20k |

---

## ⛭ Decisions — RATIFIED Jul 26, 2026 (decision-maker)

0. **Instagram Tier-2 = ACTIVATE** (ratified later on Jul 26, unblocking SH4/W0.6). The publish
   wiring fix is landed; live publishing additionally needs `META_APP_ID`/`META_APP_SECRET` at
   deploy and each expert connecting their IG account (the existing OAuth flow). Filed next:
   point published images at the SH1 render-on-demand share-image URLs (needs the deployed public
   origin) and the P4.4 token-refresh job.

1. **S2 = redirect-when-claimed.** `/experts/:id` (and `/local-experts/:id`) 302 → `/p/:handle` once the
   earner has claimed a handle; unclaimed earners keep the id page. `/p/` later absorbs the browse extras.
2. **S4 vocabulary = `direct | link | cross_sell`** written at checkout; `?ref=` capture joins link→booking.
3. **C0 = two-layer availability model.** `vendor_availability_slots` is CANONICAL for concrete bookable
   slots (service-scoped, dated, full CRUD already in storage.ts:2285-2312); `provider_availability_schedule`
   is retained as the recurring-pattern layer that *generates* slots (writer at storage.ts:4394);
   `provider_availability` (schema.ts:5755) is DEPRECATED — no live readers; do not write to it, fold/drop
   in a later migration. Ground-truthed Jul 26: slots has the only calendar-shaped CRUD.
4. **SH0 = render-on-demand.** Share images render from a public GET endpoint (cacheable, no storage
   infra); a public URL satisfies IG publish-time needs. Stored assets can layer later if ever required.
5. **M0 = flat booking fee + payment-processing passthrough — NOT differential % commission.** For
   storefront-link-acquired bookings the platform take is a FLAT booking fee plus the payment-processing
   cost, both admin-configurable in `fee_bands` (flat band + processing percent/flat config rows — §8, no
   literals anywhere; seed defaults marked PLACEHOLDER pending amounts). The mockup's "8% vs 25%" copy is
   dead. 🔴 money item; fee amounts still needed from the decision-maker before the band seeds.
   **Scope note (flagged, not assumed silently):** recorded as applying to LINK-CHANNEL bookings (the M0
   question's frame). If the intent is platform-wide replacement of the % commission model, that is a much
   larger change to resolveCommissionRates + the earnings ledger — reconfirm before widening.

## Token-optimal execution order

Decisions cost zero tokens and unblock the most work — batch them first, then run cheap lanes in parallel:

1. **Decide now (one sitting):** S2 (redirect-when-claimed?), S4 vocab, C0 (availability table), SH0
   (share assets), M0 (differential commission — can be "no/later").
2. **Fable, one session (~90k):** briefs for S3, S4, C-lane, SH1 — the fences cheap models execute against.
3. **Sonnet lane A (storefront):** S3 → S4 🔴 → S5 → S6 (~220k)
4. **Sonnet lane B (trust):** V.1–V.3 + S7 (~190k) — parallel with lane A, no file overlap
5. **Haiku batch:** N1, V.4, V.5, S5b, X2, X3, X4 (~140k) — anytime
6. **Then:** N2 (~60k) → C1–C3 (~205k, C3 🔴) → SH1–SH4 (~220k)

**Remaining spend ≈ 1.1M output tokens: ~230k Fable · ~700k Sonnet · ~185k Haiku** (M0 scratched −80k; Wave R added +225k; F2/F3 already landed).
Fable share is ~22% — the map's tier philosophy holding. Every 🔴 item stops after gates for the
decision-maker's diff read; nothing executes past a ⛔ until its decision is recorded here.


## Wave FP — Frictionless Payments (ratified Jul 26, 2026: "map it out then execute it" + Cart fix)

| ID | Item | Tier | Status |
|----|------|------|--------|
| FP-1 🔴 | Stripe Customer layer (migration 146 users.stripe_customer_id) + saved-card service (list/default/detach, §14 ownership-checked) + off-session one-click chargeSavedMethod (§15 idempotent, 3DS requires_action fallback) + /api/me/payment-methods router + one-click wired into optimize + coordination pay (useSavedCard consent flag; confirm contracts unchanged) + customer attached to cart checkout PI so the sheet offers saved cards | Fable | ✅ |
| FP-2 ✅ `4b8f0ce7` | Checkout sheet upgrade + one-click buttons + Payment Methods card (sheet was already PaymentElement; Stripe-native save/Link UI; coordination-sheet customer parity fixed) | Sonnet | landed |
| FP-3 ✅ `ad6d07db` | Credits retirement (−846 lines: every credits surface was fabricated demo content; 410 gates on purchase/add-credits/wallet; tables dormant). Filed: terms/privacy legal copy still describes credits — dedicated legal pass | Sonnet | landed |
| FP-4 ✅ | Cart UI + process fix (audit-first): slot-held lines on items, per-item 409 conflict flagging, checkout-snapshot order review (was going BLANK at card entry — checkout clears the cart pre-Stripe), Stripe-cancel dead-end fixed, ~112 lines dead generateItinerary removed. Filed: GET /api/cart conciergeFee parity; slot time-of-day join in _enrichCartItems; the unreachable itinerary flowStep (wire-or-delete decision) | Sonnet | landed |

PCI posture: cards live ONLY in Stripe's vault; this DB stores the opaque customer id. One-click
guardrails: saving is opt-in at the sheet, the price is always on the button, every charge gets a
receipt, and nothing charges without a click.
