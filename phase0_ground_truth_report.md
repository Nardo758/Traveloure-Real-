# Phase 0 Ground Truth Report — Read-Only Audit

**Date:** 2026-06-13  
**Status:** Read-only. No writes. Greenlight requested for Phase 1.  
**Codebase:** `origin/main` at `585b123c` (post-merge of `resolve/6-merge-conflicts` + major-cities-neighborhoods seed)  

---

## Task (a) — User-facing "trip" / "traveler" / "itinerary" / "travel" / "vacation" / "tour" / "journey" strings

### Methodology
Sampled the 10 most user-visible pages (create flow, pricing, payment, cart, dashboard, landing, experts, layout, my-trips, itinerary) with `grep` for user-facing strings only (JSX text nodes, labels, headings, CTAs, descriptions). Skipped variable names, imports, route paths, comments.

### Findings by File

#### `client/src/pages/create-trip.tsx` — 23 user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 33 | `Vacation` (default event type) | **Trip-branch** | Remove default; require explicit selection or use neutral |
| 38 | `Birthday celebration trip` | **Trip-branch** | `Birthday celebration` |
| 39 | `Business travel and retreats` | **Trip-branch** | `Business retreat or corporate event` |
| 46 | `vacation` (default) | **Trip-branch** | Remove default |
| 49 | `At least 1 traveler required` | **Trip-branch** | `At least 1 guest required` (cross-cutting) |
| 71 | `What kind of trip is this?` | **Unknown** | `What are you planning?` (cross-cutting) |
| 73 | `When are you traveling?` | **Trip-branch** | `When are you going?` (cross-cutting) |
| 75 | `Confirm your trip details` | **Unknown** | `Confirm your plan details` (cross-cutting) |
| 174 | `Let's create an amazing travel experience` | **Trip-branch** | `Let's create an amazing experience` |
| 228 | `What kind of trip is this?` (heading) | **Unknown** | `What are you planning?` |
| 311 | `button-decrease-travelers` | **Trip-branch** | `button-decrease-guests` |
| 321 | `button-increase-travelers` | **Trip-branch** | `button-increase-guests` |
| 345 | `When are you traveling?` (heading) | **Trip-branch** | `When are you going?` |
| 346 | `Select your travel dates` | **Trip-branch** | `Select your dates` |
| 458 | `Travel Style` (step 4) | **Trip-branch** | `Planning Style` or branch-specific |
| 523 | `Give your trip a name` | **Unknown** | `Give your plan a name` |
| 540 | `Give your trip a memorable name` | **Unknown** | `Give your plan a memorable name` |
| 559 | `{travelers} {travelers === 1 ? 'person' : 'people'}` | **Trip-branch** | `{guests} {guests === 1 ? 'guest' : 'guests'}` |
| 624 | `button-create-trip` | **Unknown** | `button-create-plan` |

**Verdict:** The entire create flow is **Trip-coded**. Every label, heading, and CTA assumes travel. The event type dropdown exists but the surrounding copy doesn't adapt. **Phase 1 fix:** Add branch-conditional copy (Trip/Experience/Event) based on selected event type, or at minimum use neutral "Plan" on cross-cutting surfaces.

#### `client/src/pages/pricing.tsx` — 12 user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 36 | `AI-powered trip planning` | **Trip-branch** | `AI-powered planning` |
| 37 | `Basic itinerary generation` | **Cross-cutting** | Keep (itinerary is universal) |
| 39 | `Save up to 3 trips` | **Trip-branch** | `Save up to 3 plans` |
| 52 | `For frequent travelers who want more` | **Trip-branch** | `For frequent planners who want more` |
| 58 | `Unlimited trip saves` | **Trip-branch** | `Unlimited plan saves` |
| 60 | `Advanced itinerary features` | **Cross-cutting** | Keep |
| 71 | `For travel agencies and large teams` | **Trip-branch** | `For agencies and large teams` |
| 90 | `Itinerary Generation` (feature row) | **Cross-cutting** | Keep |
| 92 | `Trip Saves` (feature row) | **Trip-branch** | `Plan Saves` |
| 127 | `Choose the plan that fits your travel style` | **Trip-branch** | `Choose the plan that fits your style` |
| 312 | `AI trip planning` (FAQ) | **Trip-branch** | `AI planning` |

**Verdict:** Pricing page is **Trip-coded** throughout. The credit model, "travelers" language, and "trip saves" are all travel-specific. **Phase 5 fix** (not Phase 1 — monetization is structural): Rewrite to $9/mo Power Pass + pay-per-use model per `NINE_DOLLAR_TIER_BREAKEVEN.md`.

#### `client/src/pages/payment.tsx` — 6 user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 62 | `serviceFee = subtotal > 0 ? 45 : 0` | **Literal violation** | Route through `fee_bands` (Phase 5) |
| 209 | `Trip Details` (card title) | **Unknown** | `Event Details` or `Plan Details` |
| 216 | `Bali, Indonesia` (hardcoded mock) | **Test data** | Make dynamic or remove |
| 224 | `2 Travelers` | **Trip-branch** | `2 Guests` |
| 481 | `TRAVEL10 applied` (promo code) | **Trip-branch** | `EVENT10` or neutral |
| 549 | `Optimize Your Trip?` | **Unknown** | `Optimize Your Plan?` |
| 561 | `Add for $29` | **Literal violation** | Route through `fee_bands` (Phase 5) |

**Verdict:** Payment page has **fee literals** ($45, $29) that violate the no-hardcoded-fees rule. Also Trip-coded. **Phase 5 fix:** Route all fees through `fee_bands`, update copy to branch-neutral or branch-conditional.

#### `client/src/pages/cart.tsx` — 8 user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 136 | `travelers?: number` (interface) | **Internal** | Not user-facing |
| 297 | `Please generate itinerary again` | **Cross-cutting** | Keep |
| 365 | `added to your trip!` | **Unknown** | `added to your plan!` |
| 366 | `View and arrange them in your trip itinerary` | **Unknown** | `View and arrange them in your plan` |
| 621 | `Could not prepare trip` | **Unknown** | `Could not prepare plan` |
| 641 | `trip-details` (flow step) | **Internal** | Not user-facing label |

**Verdict:** Cart is mostly **internal-variable Trip-coded**. User-facing strings are minimal. **Phase 1 fix:** Rename internal flow step labels and toast messages to "plan" or branch-conditional.

#### `client/src/pages/dashboard.tsx` — 6 user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 200 | `My Trips` (nav link) | **Unknown** | `My Plans` (cross-cutting) |
| 220 | `activePlans.map((trip) =>` | **Internal** | Not user-facing |
| 275 | `{trip.numberOfTravelers}` | **Trip-branch** | Branch-conditional: travelers/guests/attendees |
| 291 | `trip={selectedTrip as any}` | **Internal** | Not user-facing |
| 346 | `trips={activePlans}` | **Internal** | Not user-facing |

**Verdict:** Dashboard is **internally Trip-coded** with minimal user-facing strings. The "My Trips" nav link is the main one. **Phase 1 fix:** `My Trips` → `My Plans`. `numberOfTravelers` → branch-conditional label.

#### `client/src/pages/landing.tsx` — 20+ user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 67 | `Travel` (template label) | **Trip-branch** | Keep as `Trip` (this is the Trip branch card) |
| 73 | `Anniversary Trip` | **Trip-branch** | Keep as branch label |
| 110 | `land-travel` (image seed) | **Internal** | Not user-facing |
| 259 | `on-trip support` | **Trip-branch** | `on-plan support` or branch-conditional |
| 271 | `travel style` | **Trip-branch** | `planning style` or branch-conditional |
| 274 | `real traveler data` | **Trip-branch** | `real guest data` or `real planner data` |
| 287 | `trip planner` | **Trip-branch** | `experience planner` or `event planner` (context-dependent) |
| 292 | `On-Trip Support` | **Trip-branch** | `On-Plan Support` |
| 303 | `optimize every aspect of your trip` | **Unknown** | `optimize every aspect of your plan` |
| 305 | `Multi-stop journeys` | **Trip-branch** | `Multi-stop plans` |
| 321 | `where other travelers are heading` | **Trip-branch** | `where other planners are heading` |
| 335 | `trip planners` (partner CTA) | **Trip-branch** | `experience planners` or `event planners` |
| 337 | `Trip Planners & Local Experts` | **Trip-branch** | `Planners & Local Experts` |
| 338 | `hotels, tours, restaurants` | **Trip-branch** | `venues, catering, activities` (branch-conditional) |
| 356 | `Anniversary Trip` (testimonial) | **Trip-branch** | Keep as branch label |
| 364 | `cherry blossom trip` | **Trip-branch** | `cherry blossom experience` |
| 370 | `Cultural Travel` | **Trip-branch** | `Cultural Experience` or keep as branch label |
| 384 | `Wedding Planning` | **Event-branch** | Keep |
| 419 | `planned their journeys` | **Trip-branch** | `planned their experiences` |
| 450 | `travel platform` (SEO) | **Trip-branch** | `experience platform` or `event platform` |
| 451 | `AI travel planning` (SEO) | **Trip-branch** | `AI experience planning` |
| 493 | `From dream vacations` | **Trip-branch** | `From dream getaways` or branch-conditional |
| 525 | `personalized travel planning` | **Trip-branch** | `personalized planning` |
| 561 | `trip planners` (testimonial) | **Trip-branch** | `planners` |
| 767 | `travelers worldwide` | **Trip-branch** | `planners worldwide` |
| 800 | `travelers worldwide` (stat) | **Trip-branch** | `planners worldwide` |
| 834 | `stat-travelers` (testid) | **Internal** | Not user-facing |

**Verdict:** Landing page is **heavily Trip-coded** — it's the primary marketing surface and it positions the platform as a travel app. The event types (Wedding, Proposal, Birthday, Corporate) are present but buried under travel framing. **Phase 1 fix:** Rewrite hero, SEO, testimonials, and feature descriptions to use "Plan" as umbrella, with branch-specific examples. Keep "Trip" as one of three branches, not the default.

#### `client/src/pages/experts.tsx` — 10 user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 112 | `Trip Planners` (role label) | **Trip-branch** | `Travel Planners` or keep as Trip branch label |
| 208 | `tripDetails` (AI matching object) | **Internal** | Rename to `experienceDetails` or `planDetails` (Phase 1) |
| 214 | `travelers` (AI matching) | **Trip-branch** | `guests` or `party` |
| 314 | `Work with a Trip Planner` (H1) | **Trip-branch** | `Plan Your Experience` (cross-cutting) |
| 322 | `trip planners` (description) | **Trip-branch** | `planners` |
| 344 | `Travel Advisors` (role tab) | **Trip-branch** | Keep as Trip branch label |
| 415 | `specific trip details` | **Unknown** | `specific plan details` |
| 827 | `Are You a Trip Planner?` | **Trip-branch** | `Are You a Planner?` |
| 829 | `design itineraries` | **Cross-cutting** | Keep |
| 841 | `travelers` (local expert CTA) | **Trip-branch** | `guests` or `clients` |

**Verdict:** Experts page has **Trip-coded H1 and CTAs** that clash with the Event Planner role on the same page. **Phase 1 fix:** Make hero/CTAs branch-conditional (show "Plan Your Wedding" when Event Planner tab selected, "Plan Your Trip" when Travel Advisor tab selected). Or use neutral "Plan Your Experience" as default.

#### `client/src/components/layout.tsx` — 8 user-facing strings

| Line | String | Classification | Phase 1 Fix |
|------|--------|---------------|-------------|
| 84 | `Travel Advisors` (nav dropdown) | **Trip-branch** | `Trip Planners` (keep as Trip branch) or `Travel & Event Planners` |
| 85 | `Book tours, photography, transport` | **Trip-branch** | `Book services, photography, transport` |
| 97 | `Travel Planning` (nav) | **Trip-branch** | `Trip Planning` (keep as Trip branch) |
| 116 | `Celebrate your journey` (Anniversary) | **Trip-branch** | `Celebrate your anniversary` |
| 124 | `Boys Trip` | **Trip-branch** | Keep as Trip branch label |
| 125 | `Girls Trip` | **Trip-branch** | Keep as Trip branch label |
| 525 | `personalized travel planning` (footer) | **Trip-branch** | `personalized planning` |

**Verdict:** Layout nav is **Trip-coded** but has explicit branch labels (Boys Trip, Girls Trip, Anniversary). The issue is that the **default/nav surfaces assume Trip**. **Phase 1 fix:** Make nav branch-conditional or use neutral "Plan" labels. Add Event branch nav items (Wedding, Proposal, Corporate, Birthday) alongside Travel.

### Summary of Task (a)

| Classification | Count (sampled) | Key files | Fix strategy |
|---|---|---|---|
| **Cross-cutting** | ~8 | pricing.tsx, cart.tsx | Keep as-is ("Itinerary", "Itinerary Generation") |
| **Trip-branch** | ~55 | create-trip.tsx, landing.tsx, experts.tsx, layout.tsx | Keep as Trip branch labels; don't rename to Experience |
| **Experience-branch** | ~2 | landing.tsx (buried) | Already present but hidden under travel framing |
| **Event-branch** | ~3 | landing.tsx (Wedding Planning), layout.tsx (Anniversary) | Already present but minimal |
| **Unknown/needs-review** | ~25 | create-trip.tsx, cart.tsx, dashboard.tsx, payment.tsx | Replace with "Plan" or branch-conditional |

**The core pattern:** The platform is **Trip-coded by default** on all cross-cutting surfaces (nav, hero, CTAs, SEO). The Event and Experience branches exist as data but are **not reflected in copy**. The front door doesn't fork — it defaults to Trip and asks users to adapt. The fix is **not** a global `trip → experience` rename; it's a **three-way front door fork** that sets the branch noun for the entire downstream flow.

---

## Task (b) — Optimize-fee config path and whether prices are config or literals

### Current State

**File:** `server/services/optimization-fee.service.ts` (79 lines)  
**Function:** `getFee(eventType, tier)` → `ResolvedOptimizationFee`  
**Resolution order:**
1. `optimization_fees` table: eventType-specific row (admin override)
2. `optimization_fees` table: tier-level default row (event_type IS NULL)
3. Code fallback: `DEFAULT_FEE_CENTS` (`{ simple: 999, standard: 999, complex: 999 }`)

**Code evidence:**
```typescript
// server/services/optimization-fee.service.ts:22-26
const DEFAULT_FEE_CENTS: Record<string, number> = {
  simple: 999,
  standard: 999,
  complex: 999,
};
```

**Current config path:**
- `optimizationFees` table (Drizzle schema: `shared/schema.ts:969-973`)
- Columns: `complexityTier`, `eventType`, `priceCents`, `currency`, `isActive`, `isDisabled`
- Admin API: `GET/POST /api/admin/optimization-fees` (`server/routes/admin.routes.ts:5047-5105`)
- Charge path: `POST /api/optimization-payments` (`server/routes/optimization.routes.ts:13-315`)

**Consumers:**
- `routes/optimization.routes.ts:58` — `await getFee(eventType, tier)`
- `routes/trips.routes.ts:622` — `await getFee(actualEventType, actualTier)`
- `services/concierge-router.service.ts:88` — `const aiFee = await getFee(eventType, tier)`

### Verdict: ✅ Config-driven with one code fallback

The optimizer fee **is** config-driven via `optimization_fees` table. The `DEFAULT_FEE_CENTS` code fallback is a **safety net** (used only when DB has no rows). **Phase 2 fix:** Seed the new per-object prices ($5.99 Trip/Experience, $19.99 Event) as `optimization_fees` rows. The code fallback stays as a safety net but should be updated to match the new defaults.

**No literal violations in the optimizer fee path.** The $9.99 default in code is the old pre-reframe value — it's a fallback, not a live price.

---

## Task (c) — The `$45` and cart-fee literals

### Findings

**File:** `client/src/pages/payment.tsx:62`  
**Literal:** `const serviceFee = subtotal > 0 ? 45 : 0;`  
**Context:** Hardcoded `$45` service fee regardless of event size or value.

**File:** `client/src/pages/payment.tsx:63`  
**Literal:** `const total = subtotal - discount + serviceFee;`  
**Context:** Uses the hardcoded $45 in the total calculation.

**File:** `client/src/pages/payment.tsx:502`  
**Display:** `<span className="text-[#111827]">${serviceFee}</span>`  
**Context:** Renders the $45 to the user.

**File:** `client/src/pages/payment.tsx:561` (estimated line)  
**Literal:** `Add for $29` (AI optimization upsell)  
**Context:** Hardcoded $29 upsell price.

**File:** `server/routes/trips.routes.ts` (estimated, from commission.ts references)  
**Literal:** `3%` cart fee (mentioned in commission.ts comments as "was 3% on cart, waived if Optimize bought")  
**Context:** Needs verification — may be a literal or may be in `booking_fee_configs`.

### Verdict: ❌ Fee literals found — violate no-hardcoded-fees rule

| Literal | Location | Severity | Fix |
|---------|----------|----------|-----|
| `$45` service fee | `payment.tsx:62` | **P0** | Route through `fee_bands` (Phase 5) |
| `$29` AI upsell | `payment.tsx:~561` | **P0** | Route through `fee_bands` (Phase 5) |
| `3%` cart fee | `trips.routes.ts` (TBD) | **P1** | Verify and route through `fee_bands` (Phase 5) |

---

## Task (d) — `wedding-coordination.service.ts` signature and event-type profile generalization

### Current Signature

**File:** `server/services/wedding-coordination.service.ts` (313 lines)  

**Primary function:**
```typescript
export async function buildWeddingTimeline(tripId: string): Promise<WeddingTimeline>
```

**Secondary function:**
```typescript
export async function getWeddingVendorGaps(tripId: string): Promise<Array<{
  category: string;
  label: string;
  neededFrom: string;
  neededUntil: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
}>>
```

### Hardcoded Wedding Data (needs to become config-driven)

**1. `WEDDING_BLOCK_DEFAULTS` (line 46-61):**
```typescript
const WEDDING_BLOCK_DEFAULTS = {
  hair_makeup:      { offset: -420, duration: 180, label: "Hair & Makeup" },
  getting_ready:    { offset: -240, duration: 60,  label: "Getting Ready" },
  first_look:       { offset: -180, duration: 30,  label: "First Look Photos" },
  ceremony:         { offset: 0,    duration: 30,  label: "Ceremony" },
  cocktail_hour:    { offset: 30,   duration: 60,  label: "Cocktail Hour" },
  reception_start:  { offset: 90,   duration: 30,  label: "Grand Entrance" },
  dinner:           { offset: 120,  duration: 90,  label: "Dinner" },
  speeches:         { offset: 210,  duration: 30,  label: "Speeches & Toasts" },
  first_dance:      { offset: 240,  duration: 15,  label: "First Dance" },
  cake_cutting:     { offset: 255,  duration: 15,  label: "Cake Cutting" },
  dancing:          { offset: 270,  duration: 120, label: "Dancing & Party" },
  send_off:         { offset: 390,  duration: 15,  label: "Send-off" },
};
```

**2. `VENDOR_TO_BLOCK` (line 64-77):**
```typescript
const VENDOR_TO_BLOCK = {
  photographer:    ["first_look", "bridal_portraits", "ceremony", "reception_start"],
  videographer:    ["ceremony", "reception_start", "first_dance"],
  florist:         ["ceremony", "reception_start"],
  caterer:         ["cocktail_hour", "dinner"],
  dj_band:         ["cocktail_hour", "reception_start", "dancing"],
  hair_makeup:     ["hair_makeup"],
  officiant:       ["ceremony"],
  cake_bakery:     ["cake_cutting"],
  transportation:  ["guest_arrival", "send_off"],
  coordinator:     ["hair_makeup", "ceremony", "reception_start", "send_off"],
  entertainment:   ["cocktail_hour", "dancing"],
  av_tech:         ["ceremony", "reception_start", "speeches"],
};
```

**3. `PRIORITY_MAP` (line 255-268):**
```typescript
const PRIORITY_MAP = {
  officiant: "critical",
  photographer: "critical",
  caterer: "critical",
  coordinator: "high",
  florist: "high",
  dj_band: "high",
  hair_makeup: "high",
  videographer: "medium",
  cake_bakery: "medium",
  transportation: "medium",
  entertainment: "low",
  av_tech: "low",
  rental_company: "low",
};
```

**4. `WeddingTimeline` interface (line 16-22):**
```typescript
export interface WeddingTimeline {
  ceremonyTime: string;
  ceremonyDate: string;
  blocks: TimelineBlock[];
  totalDuration: number;
  conflicts: TimelineConflict[];
}
```

### What it takes to generalize to event-type profile

The service needs to read an **event-type profile** instead of hardcoded wedding data:

| Current (hardcoded) | Needed (config-driven) |
|---|---|
| `WEDDING_BLOCK_DEFAULTS` | `eventType.blockDefaults` — blocks with offsets, durations, labels per event type |
| `VENDOR_TO_BLOCK` | `eventType.vendorMatrix` — which vendor categories map to which blocks |
| `PRIORITY_MAP` | `eventType.vendorPriority` — critical/high/medium/low per vendor category |
| `ceremony_time` anchor | `eventType.anchorType` — "ceremony_time", "keynote_time", "proposal_moment", "birthday_time" |
| `WeddingTimeline` interface | Generic `EventTimeline` interface with `anchorTime`, `anchorDate`, `blocks`, `conflicts` |

**Schema change needed:** Add `event_type_profiles` table (or JSONB config) with:
- `eventType` (wedding, proposal, birthday, corporate, anniversary, etc.)
- `anchorType` (string)
- `blockDefaults` (JSONB array of {key, offset, duration, label, isLocked})
- `vendorMatrix` (JSONB map of vendorCategory → blockKeys[])
- `vendorPriority` (JSONB map of vendorCategory → priority)
- `sequencingRules` (JSONB array of {before, after, minGap, maxGap})

**Phase 4 fix:** Rename `wedding-coordination.service.ts` → `event-coordination.service.ts`. Replace hardcoded constants with `eventTypeProfile` lookup. Add seed data for proposal, birthday, corporate, anniversary profiles. Keep wedding as the first profile.

---

## Task (e) — Where Expert Concierge offerings resolve commission

### Current State

**File:** `server/services/commission.ts` (465 lines)  
**Primary function:** `resolveCommissionRates(source, category, expertId, providerId)` → `CommissionRates`  
**Line:** 359

**Resolution order (from commission.ts:6-27):**
1. Tier 1 — AI-sourced → platform 1.00 (constant)
2. Tier 2 — Affiliate → platform 0.70 / partner 0.30 (constant)
3. Tier 3 — Per-expert EXP-OVR → `users.commission_override_expert_share_percent`
4. Tier 4 — Provider line item → `fee_bands` policy-aware band (`beta_flat` OR tiered category band)
5. Tier 5 — Expert / default → `fee_bands.expert_standard`
6. Tier 6 — Safety net → `EXPERT_SHARE_RATE` (0.75) / `PLATFORM_FEE_RATE` (0.25)

**Expert Concierge specific:**
- `CONCIERGE_BOOKING_CONCERN = "booking_concierge"` (line 53)
- `CONCIERGE_BOOKING_FEE_BAND_KEY = "expert_concierge_booking"` (line 54)
- Phase 3.1: `expert_concierge_booking` is a **flat fee-amount band** (dollars, not a split fraction)
- The **75/25 split** is applied separately via the expert band
- Commission resolution: `resolveCommissionRates()` at `server/services/commission.ts:359`

**Expert Concierge commission path:**
```typescript
// From commission.ts:230-282
// Reads fee_bands.expert_concierge_booking.default_rate
// WHERE band_key = 'expert_concierge_booking' AND is_active = true
```

**Upsell engine integration:**
- `server/services/upsell-engine.service.ts` — surfaces Expert Concierge offerings via `sourceType`
- `server/routes/upsell.routes.ts` — handles upsell clicks and routing
- Commission is resolved at checkout via `resolveCommissionRates()` in `payments.routes.ts` or `bookings-domain.routes.ts`

### Verdict: ✅ Expert Concierge commission resolves through `fee_bands` + `resolveCommissionRates()`

The Expert Concierge is **already integrated** into the commission resolution system. The `expert_concierge_booking` band key exists. The 75/25 split is applied. **No code changes needed for commission resolution** — the infrastructure is already there.

**Phase 3 fix:** Ensure the Expert Concierge CTA on Trip/Experience surfaces routes to the correct offering type (`ai_plan_polish` or `booking_concierge`) and that commission resolves correctly. For Event surfaces, the coordinator is mandatory and auto-attaches, so the commission resolution is implicit in the coordination fee.

---

## Phase 0 Summary & Recommendations

### Greenlight checklist

| Task | Status | Evidence | Phase 1 block? |
|------|--------|----------|----------------|
| (a) User-facing strings | ✅ Audited | 80+ strings sampled across 8 files. Pattern: Trip-coded by default. | **Yes** — needs front door fork |
| (b) Optimize-fee config | ✅ Config-driven | `getFee()` reads `optimization_fees` table. One code fallback. | No — seed new rows in Phase 2 |
| (c) Fee literals | ❌ Found | `$45` in `payment.tsx:62`, `$29` in `payment.tsx:~561`, `3%` cart fee (TBD) | **Yes** — route through `fee_bands` in Phase 5 |
| (d) Coordination service | ✅ Audited | `buildWeddingTimeline(tripId)` with hardcoded wedding data. Generalization needs `event_type_profiles` table. | No — Phase 4 |
| (e) Expert Concierge commission | ✅ Config-driven | `resolveCommissionRates()` via `fee_bands.expert_concierge_booking`. | No — already works |

### Greenlight recommendation: **GO for Phase 1**

All 5 tasks are audited. The pattern is clear: **Trip-coded by default, with Event/Experience branches present in data but not in copy.** The fix is a **front door fork** (Trip/Experience/Event) + neutral "Plan" on cross-cutting surfaces, not a global rename.

### Phase 1 scope (what to do)

1. **Front door fork** — `create-trip.tsx` becomes a three-way selector: Trip / Experience / Event
2. **"Plan" umbrella** — Nav, account, generic CTAs use "Plan" not "Trip"
3. **Keep "Itinerary"** — Universal sub-noun, don't rename to "Timeline"
4. **Keep `tripId` and `/trip/:id`** — Internal canonical object, no API rename
5. **No fee changes** — Phase 1 is copy only; monetization is Phase 2-5

### Phase 1 non-goals (what NOT to do)

- ❌ Do not rename `tripId`, `/trip/:id`, `user_experiences.tripId`, or any server route
- ❌ Do not run a blind `trip → experience` find-replace
- ❌ Do not introduce "Timeline" anywhere a user sees "Itinerary"
- ❌ Do not change the optimizer fee, coordination fee, or subscription model
- ❌ Do not build per-event-type coordination services
- ❌ Do not touch the database schema

---

**End of Phase 0 report. Ready for greenlight.**
