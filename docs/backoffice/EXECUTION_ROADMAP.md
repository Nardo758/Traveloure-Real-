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
| S5 | Analytics v1: per-offering link views/clicks + conversion funnel + range picker (mockup 2), real data only | Sonnet | ~55k | S3, S4 | §13: empty states until data exists; no fabricated benchmarks |
| S5b | CSV export of analytics | Haiku | ~15k | S5 | Mechanical |
| S6 | Dashboard "earnings by source" split (your link vs Discover) | Sonnet | ~35k | S4 | Reads existing ledger + new source dim |
| S7 | Earner-level rating aggregate (closes §13 filed gap; unblocks mockup 1's rating card) | Sonnet | ~40k | — | Real aggregate or "New" — never a number without reviews |

## Wave N — Unified backoffice nav (mockup 6)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| N1 ✅ `feafc515` | Converge entries: both sidebars adopt the mockup's 9-entry vocabulary (Dashboard / My Offerings / Calendar / Earnings / Share & Promote / Analytics / Reviews / Messages / Settings), role-computed visibility f(user.role) | Haiku (enumerated file list) | ~30k | — | No layout unification yet — labels/links only |
| N2 | Unify the two console shells into one backoffice layout | Sonnet | ~60k | N1 | The big visual step; auth-routes gate covers regressions |

## Wave V — Verification gating (Phase 0.5; REQUIRED before marketing pushes of /p/ links)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| V.1 ✅ `29899773` (default OFF — flip platform_settings.storefront_require_verified to "true" after V.2/V.3) | Gate /p/ visibility + publish on `identityVerificationStatus='verified'` (F2-style read-gate; build-while-pending preserved) | Sonnet | ~55k | S1 | Interim gate today = zero-approved-items 404 |
| V.2 | Sequence Identity/KYB into application flow | Sonnet | ~50k | — | Existing `/api/identity/*` endpoints |
| V.3 | Connect onboarding sequenced into go-live | Sonnet | ~45k | — | Payout money-block already exists |
| V.4 | `provider` vs `service_provider` vocab normalization | Haiku | ~25k | — | Grep-enumerated |
| V.5 ✅ `ee069bfe` | Env-keys launch checklist + readiness log line | Haiku | ~10k | — | — |

## Wave C — Availability & calendar (mockup 3's biggest commerce delta)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| C0 | ⛔ **Consolidation decision:** 3 availability tables (`provider_availability`, `provider_availability_schedule`, `vendor_availability_slots`) → 1 canonical | Fable analysis ~30k → decision | ~30k | — | §4-class decision; blocks all of Wave C |
| C1 | Next-availability compute + My Offerings "Next Availability" column | Sonnet | ~45k | C0 | — |
| C2 | Public availability calendar on offering page (booked/available days) | Sonnet | ~60k | C1 | Read-only first |
| C3 | 🔴 Slot-aware checkout + conflict detection ("this slot just booked") | Fable | ~100k | C2 | §15 atomic slot claim; the money-path centerpiece |

## Wave SH — Share & social engine (mockup 4)

| ID | Item | Tier | Est. | Depends | Notes |
|----|------|------|------|---------|-------|
| SH0 | ⛔ Share-asset persistence decision (render-on-demand vs stored) | decision | — | — | Blocks SH1; flagged in IMPLEMENTATION_MAP before any IG activation |
| SH1 | Image render pipeline (IG feed 1080×1350 / story 1080×1920 / review card) | Fable design ~40k → Sonnet ~60k | ~100k | SH0, S3 | New dependency (satori or canvas) — deliberate add |
| SH2 | Share surface page: cards + captions + wa.me/X/copy (informational outbound OK per §16; links route back to /p/) | Haiku | ~30k | SH1 | Mostly mockup 4 verbatim |
| SH3 | Posting Opportunities feed (new 5★ review / open slots / seasonal) | Sonnet | ~50k | SH1, C1 | Data all exists; generator + surface |
| SH4 | W0.6 Instagram publish fix (filed defect) | Sonnet | ~40k | — | Independent |

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
| R4 | F7: wire `createAffiliateEarning` at agent-booking confirm sites so reconciliation has a spine | Sonnet | ~45k | — | 70/30 split constants → fee_bands while touching (standing directive) |
| R5 | Credits fulfillment (lifts the F2 501 gate): `credit_purchase` webhook + real balance ledger + revenue row | Fable 🔴 | ~80k | — | Only when credits become a priority |
| R6 | ⛔ Expert-compensation split on completed review work (fee is 100% platform at capture today) | decision → Sonnet | ~30k | — | Credit expert share at `expert_requests` completion |

## Singles (independent, cheap — fill idle capacity)

| ID | Item | Tier | Est. |
|----|------|------|------|
| X1 | Cancellation-policy field (per-offering data; closes the §13 hardcoded-copy arm) | Sonnet | ~45k |
| X2 | Booking row → Message deep-link | Haiku | ~15k |
| X3 | Repeat-bookings rollup line | Haiku | ~25k |
| X4 ✅ `ee069bfe` | OG injection for `/services/:id` (replicate the /p/ handler) | Haiku | ~20k |

---

## ⛭ Decisions — RATIFIED Jul 26, 2026 (decision-maker)

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
