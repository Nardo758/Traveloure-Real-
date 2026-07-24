# Central Content System — Remediation Plan

**Date:** 2026-07-24 · **Status:** proposal for decision-maker ratification. Nothing built yet.
**Basis:** `docs/audits/central-content-audit.md` (combined audit) + two follow-up scans (action-button rules;
content-governance rules). Everything here is read-only findings + a sequenced plan.

---

## RATIFIED DECISIONS (decision-maker, 2026-07-24)

1. **Availability tagging = normalized status _plus_ optional date-range.** Add BOTH: an
   `availability_status` enum (`available | seasonal | limited | sold_out`, NULL=unknown, §13) **and** optional
   `available_from` / `available_to` date columns. Null stays null — never fabricated.
2. **Dark surfaces — audited (verdicts below, evidence-backed).**
   - **`experience-discovery` → RETIRE.** Page is fully orphaned (no importer, only the `/discover-experiences`→
     `/discover` redirect); docs treat it as already-consolidated (`PHASE_2_CLOSEOUT.md`); its unique catalog-browse
     survives live in `TravelpayoutsSection`/`fever-events-section`. Remove from `PLATFORM_SURFACES` + both
     `SURFACE_DEFAULT_*` maps + the `admin/content-mapping` icon map; delete `pages/experience-discovery.tsx`; keep
     the redirect for bookmark continuity.
   - **`spontaneous` → KEEP, do NOT delete — it's a Phase-3 wire, not dead.** UNSAFE to retire: a **live landing
     "Live Intel" CTA** (`landing.tsx:94`) points at `/spontaneous`, there's an explicit **Phase-3 roadmap commitment**
     (`PHASE_2_CLOSEOUT.md`, `PHASE_4_RUNBOOK.md`) to reuse `SpontaneousDiscovery`'s time-window engine in the
     discover-location happening-now strip, and its `/api/spontaneous/quick-search` engine is unique. Leave the
     component + redirect as-is; the real WIRE (mount in `discover-location` + pass `surface="spontaneous"`) is
     **deferred to Phase 3, out of scope for this effort.**
   - **`itinerary` → RETIRE the surface-map entry, KEEP the route redirect.** No consumer sends `surface=itinerary`
     and `TripDetails` renders no `CuratedContentSection`, so the *content surface* is dead — remove it from the maps.
     But the `/itinerary/:id`→`/trip` redirect is **load-bearing** (many live PlanCard/HeroSection links) — keep it.
     *Optional additive:* wire `CuratedContentSection surface="itinerary"` into the TripDetails itinerary tab for
     curated add-ons (a taste call, not required). Separate cleanup: `pages/itinerary.tsx` is dead (imported at
     `App.tsx:115`, never routed).
3. **CTA rule table = approved WITH two edits** (see the revised table in ④):
   - **(a)** Affiliate/partner content with **booking intent → the agent rail** (`/api/affiliate-booking-requests`),
     never an off-site "Book" button. **Purely informational** affiliate content → a non-booking **"View details"**
     via the tracked redirect (no "Book" wording); remove the untracked `window.open` fallback.
   - **(b)** Affiliate/partner content that is **genuinely in-platform-bookable → add-to-cart**; **affiliate-link-only
     → agent rail** (Amadeus add-to-cart hotels are the documented in-platform-bookable case, kept).
   - **New requirement this creates:** the CTA engine needs an **item-level classification** —
     `in_platform_bookable` (→cart) · `affiliate_bookable` (→agent rail) · `informational` (→tracked "View").
     This classifier is a design input for P4 (and P1 tagging can carry the flag).
4. **§16 unification = IN SCOPE NOW (P7).** Design the catalog→`affiliate_products` ingestion for the 7 parallel
   stacks as part of this effort (not deferred). Still a real design job — not mechanical, not a third content home.

> **Framing.** The content system isn't broken by one bug — it's **starved, parallel-bypassed, and rule-scattered**.
> The fixes fall into three buckets: **(A) unstarve** the central feed (tag → index → gate), **(B) unify** the scattered
> action-button + origin logic behind one rule source, **(C) reconcile** the parallel stacks (the big §16 design job).
> A hard ordering constraint runs through it: **the approval-gate fix (G-SEC) must land before anything populates
> placement rules**, or we open a live leak.

---

## The 6 asks → what each needs

### ① Content has proper LOCATION + AVAILABILITY tagging

**State:** all 9 central `affiliate_products` have null city/country/location; `content_registry` location lives loosely in
`metadata.{city|location|destination}`; `provider_services` already got real coords (migration 129, neighborhood centroids).
The scraper *already collects* city/country (`affiliate-scraper.service.ts:420-422`) — the live rows are null only because they
were hand-entered without it.

**Fix:**
1. **Backfill the 9 live products** with real city/country (admin-entered or derived from the productUrl/name where honest — **no fabrication, §13**; null stays null if unknown).
2. **Enforce at write:** zod-require `city`+`country` on the `affiliate_products` insert path; keep the scraper's existing capture.
3. **Define "availability" first (decision needed):** `affiliate_products.availability` is a free-text varchar today. Decide whether "availability tagging" means (a) a normalized status (in-stock / seasonal / sold-out), (b) date-range availability, or (c) just non-null free text. Then enforce it the same way. **This is a schema/semantics decision, not a mechanical fix.**
4. Normalize `content_registry` location onto a consistent key (pick `metadata.city`; the auto-indexer reads `city|location|destination` — tighten to one).

**Guards:** never fabricate (§13); the location backfill mirrors migration-129's centroid-or-null discipline.

---

### ② Content BEHAVES correctly on each surface

**State:** only **2 of 5** `PLATFORM_SURFACES` have a mounted consumer (`travelpulse-discover`, `experience-template`).
`experience-discovery` (page orphaned, `/discover-experiences`→`/discover`), `spontaneous` (orphaned **and** omits the
`surface=` param), `itinerary` (no consumer at all) render nothing. And even the live ones return 0 because of ①+③.

**Fix (RATIFIED per the surface audit — see Ratified Decisions #2):**
- **`experience-discovery` → RETIRE** the surface + maps + orphaned page; keep the redirect.
- **`spontaneous` → KEEP** (component + redirect); the WIRE is a Phase-3 item, **out of scope here** (live landing CTA + roadmap dependency make deletion unsafe).
- **`itinerary` → RETIRE the surface-map entry**, keep the load-bearing route redirect; optionally wire curated add-ons into TripDetails (taste call).
- **Behavior contract** stays governed by `SURFACE_DEFAULT_CONTENT_TYPES` + `TAB_CONTENT_TYPE_MAP`; don't fold the **upsell** rail (`/api/upsell/*`) in — it's a separate, intentional pipeline (constraint below).

---

### ③ Content is PUSHED to the proper feeds/pages

**State:** `content_placement_rules` is **empty (0 rows)** → the resolver's placement phase always yields nothing; the ILIKE
fallback also yields nothing because of ①. The push mechanism (`auto-index`) exists but was never run and silently skips
off-TravelPulse-city inventory.

**Fix (strict order):**
1. **G-SEC first** — add the `EXISTS(… approvalStatus='approved')` gate to `getAffiliateProductsByIds` (`content-query.service.ts:390-397`) and to `/api/content/affiliate-redirect` (`content.routes.ts:7444`). *(P0, tiny, decision-independent — and it must precede step 2.)*
2. **Tag (①) then run `auto-index`** to populate placement rules for the 9 products + 141 routable registry rows.
3. **Fix `auto-index` silent skip** (`admin.routes.ts:5288`) — log/bucket off-city inventory (§13 no-silent-caps).
4. **Standardize package feed ordering** — `unifiedSearch` (`storage.ts:1750`) omits the `averageRating` tier that the recommender + upsell-query both apply; align all three to `featured→salesCount→rating→recency`.

---

### ④ Each content piece has the RIGHT action button per its rules

**State:** **no central CTA rule engine** — button logic is hardcoded per component. §16 (agent-booking rail) is applied
correctly in only **2 of ~8** affiliate surfaces (the 10 Travelpayouts cards via `useAgentBooking`, and `unified-result-card`
hand-rolled). **≥6 surfaces still funnel-leak** with raw `window.open(affiliateUrl)`:
`fever-events-section.tsx:281`, `experience-discovery.tsx:473`, `spontaneous-discovery.tsx:430`,
`travelpulse/CityDetailView.tsx:557`, the 12Go/transport components (`affiliate-transport-products.tsx:96,191`,
`TwelveGoTransport.tsx:76`, `trip-transport-planner.tsx:617,1033`), and raw-`externalUrl` transport-leg branches.
`CuratedCard`'s affiliate branch is tracked (allowed) but has an **untracked raw fallback** (`curated-content-section.tsx:213-214`).

**Fix:**
1. **Ratify the canonical CTA rule table** (decision needed), e.g.:
   | Content origin/type | Correct CTA | Endpoint |
   |---|---|---|
   | Platform `provider_service` | "Book" | `/services/:id` → cart → `/api/checkout` |
   | Ready-Made Trip (`expert_template`) | "Buy this itinerary" | 2-step Stripe purchase |
   | Affiliate/partner (Fever, Viator, Travelpayouts, catalog, 12Go, transport) | **agent rail** "Request booking" | `POST /api/affiliate-booking-requests` |
   | Curated registry, non-affiliate, priced | "Book Now" | `/api/content/checkout` |
   | Curated informational (has affiliate_url, no booking) | tracked "View" | `/api/content/affiliate-redirect` (records click) |
   | Coordination/event Full | "Plan with coordinator" | coordination engagement |
2. **Build one shared CTA resolver** (extend `useAgentBooking` into a `useContentCTA(item)` that maps origin→button+action) and migrate all 6+ scattered surfaces onto it. Remove every raw `window.open(affiliateUrl)`; remove the CuratedCard untracked fallback.
3. **Preserve the impression→click attribution chain** (constraint below) through the card refactor.

---

### ⑤ Content GROUPED by platform-generated vs external

**State:** the taxonomy exists (`shared/content-origin.ts`: platform / affiliate / sourced, traveler labels `""` /
`"Paid partner"` / `""`) but is **unused by the feed**. The discover normalizer emits a divergent hardcoded
`source:"Affiliate Partner"` (`content.routes.ts:7243`), and `CuratedContentSection` renders one flat grid with no
platform-vs-external split.

**Fix:**
1. Wire `contentOriginFor()` + `CONTENT_ORIGIN_TRAVELER_LABEL` into the discover normalizer (replaces the hardcoded label — closes G7).
2. In `CuratedContentSection`, **group into sections** — "From Traveloure" (platform) vs "Paid partners" (affiliate), with the "Paid partner" disclosure badge from the feed-composition config (`feed_rec_affiliate_label`, the disclosure contract).
3. `sourced` (DMO) never renders to travelers — keep it out of the traveler feed (constraint).

---

### ⑥ Other rules/behaviors found (item-6 scan) — CONSTRAINTS + extra bugs

**Must-not-violate constraints** (any content fix has to respect these):
- **Upsell dominance contract** (`upsell-engine.service.ts:199-220`) — relevance strictly dominates revenue above the band; revenue may only tie-break within a relevance band. *Display order ≠ recommendation quality.* No ranking change may let revenue promote a worse-fitting item.
- **Upsell engine is a SEPARATE pipeline** (`/api/upsell/*`, `UpsellSlot.tsx:93-98`) — do **not** fold it into `/api/content/discover`.
- **content_impressions attribution chain** (`use-impression-tracker.ts` + migration-116 dedup) — a card refactor (item ④) must keep passing `sessionId` and attaching `sourceImpressionId` to click/add events, or the impression→click chain severs (already broke once).
- **F2 gates on the upsell engine's two indirect reads** (`loadCoveringInventory`, `resolveEndorsedKeysFromProviders`) — a submitted listing must never become covering inventory or an endorsement boost.
- **Demand feedback loop** (`recordFunnelEventAsSignal`, `recordNoResultsSignal`) — feed/search behavior writes `service_demand_signals` the recommender + wanted-slot cards consume; don't silently change funnel-event emission.
- **DMO intake gate** (`expert_workspace_visible` born-hidden, migration 118) + "DMO is never a traveler surface" — raw scraped content transforms into a trip first.
- **destination_events born-pending**, **expert_templates content-gate** (`redactTemplateContent` — every public template read routes through it), **provider_services born-submitted gate**, **content_registry sidecar** (`content_versions`/`content_flags`/`content_analytics`/`content_invoices` FK the unique `TRV-` number), **single-USD currency** — all constraints.

**Extra bugs the scan surfaced (fold into the hygiene batch):**
- **Package ordering divergence** — `unifiedSearch` omits `averageRating` (= ③.4).
- **`getPlatformStats` `"4.9"` avgRating fallback** (`content-query.service.ts:486`) — a latent §13 display-fabrication (same class PR #177 fixed elsewhere); return honest "New" on zero reviews.
- **Enum(17) ⟂ surface-map(10)** drift + **TAB_CONTENT_TYPE_MAP** as a third routing map — document internal-only types.

---

## Sequenced execution (each phase its own PR; ★ = needs decision-maker ratification first)

| Phase | Scope | Asks | Gate |
|---|---|---|---|
| **P0 — G-SEC** | Approval gate on `getAffiliateProductsByIds` + affiliate-redirect | ③ | none — land immediately, **before P2** |
| **P1 — Tagging** | Backfill 9 products + require city/country at write; ★ define "availability" semantics | ① | ★ availability decision |
| **P2 — Push** | Run/fix `auto-index`; standardize package ordering | ③ | after P0+P1 |
| **P3 — Surfaces** | RETIRE experience-discovery (+ orphaned page) + itinerary map-entry; KEEP spontaneous (Phase-3) + itinerary redirect | ② | ratified |
| **P4 — CTA engine** | `useContentCTA(item)` resolver keyed on the new `in_platform_bookable`/`affiliate_bookable`/`informational` classifier; migrate 6+ surfaces to agent rail; kill raw `window.open`; relabel informational to "View"; keep impression chain | ④ | ratified (classifier is P1/P4 design input) |
| **P5 — Origin grouping** | Wire `contentOriginFor` + grouped "From Traveloure / Paid partners" sections + fix label | ⑤ | after P4 (shared cards) |
| **P6 — Hygiene** | `getPlatformStats` 4.9 fix, enum/map docs, auto-index logging, dead `pages/itinerary.tsx` | ⑥ | anytime |
| **P7 — §16 unification** | Design catalog→`affiliate_products` ingestion for the 7 parallel stacks (IN SCOPE) | ①③ | design job — not mechanical, not a 3rd home |

**All four decisions ratified (see Ratified Decisions).** Availability = status+date-range; surfaces = retire-2/keep-spontaneous;
CTA = approved with the bookable-classifier edits; §16 = in scope now.

**Safe to start immediately (decision-independent):** P0 (G-SEC) and P6 (hygiene).
