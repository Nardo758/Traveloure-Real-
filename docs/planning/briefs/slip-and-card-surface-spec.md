# Trip Slip & Trip Card — Surface Spec v1.3.6 (ratified)

**v1.2 written 2026-10-03 by the principal architect for Leon Dixon; rulings ratified by Leon the same day. v1.3 written 2026-10-04 after build steps 1–5; v1.3.1 the same day with Track A's four code-vs-spec corrections; v1.3.2 with the ruling that free drafts get no logistics; v1.3.3 with Ready Made Trips, the free Trip Card, the price ladder (§15), stamps, success gates (§16) and seasonal drafting; v1.3.4 with Track A's state corrections against main 80df9a0 (R295); v1.3.5 reconciles the Lane 1 work plan (Expert console × Ready Made Trips): its rulings R-ax–R-bs are adopted with their numbers, the architect's R-ax–R-bc of v1.3.3 are renumbered R-bt–R-by, corrections R-bp/R-bq/R-br applied, migration state through 350; v1.3.6 with Track A's four state corrections (config names, field mask, R-ac and step 6 built) (PRs #1250–#1266, R277–R294) and smoke tests 6–10; adds the tools inventory (§3a), the proposal kit (§13), the logistics engine (§14), the rulings R-q onward, and the smoke-test rulings folded into §5, §6 and §8.** Companion canvas: "Trip Slip Redesign" (Design artifact, 11 artboards). Sources: smoke tests 4–10 on production builds 7bdc221 → 97221c1; Track A's component inventory; `UNIFIED_PLANNING_FLOW_SPEC_v2`, `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC`, `TRANSPORT_COMMERCE_LAYER_BUILD`, `SELECTION_CONTROL_MODEL_SPEC_v2`, `EXPERT_WORKSPACE_SPEC`, content sourcing brief 2026-09-29, handoff pack 2026-09-27 (§M anchor-centric building, §N run records), proposal kit review 2026-10-03.

**Purpose.** Specify the two traveler surfaces once, so they are built once: the Trip Slip (`/plans/:tripId`, planning) and the Trip Card (`/trip/:id`, living with the plan), plus the Experiences entry that configures the slip and the expert/concierge handoff that shares it. Every group (Trip, Moment, Celebration, Hosted event, Group travel) uses the same surfaces; a per-group manifest changes vocabulary, anchor, time unit and tools. Nothing in this spec adds a planning surface.

**This document is self-contained.** Track A cannot see Project attachments; everything a build step needs is in here or in the step's brief.

---

## 1. Rulings

Ratified 2026-10-03 unless dated otherwise. Rulings marked *built* are on production at 97221c1.

| # | Ruling | State |
|---|---|---|
| R-a | Lodging is optional; recommended after the draft, never required before it (2026-10-02). Setting it before the draft must never block the draft (R-ao) | built |
| R-b | The template page is the **entry**; the slip is the **only** planning surface; Browse is a map layer on the slip; `cart_items` is checkout-only | step 8 |
| R-c | One `ItemRow` (edit / read+booking modes), one `DayBlock`, one `LegRow`, one `ExpertNote` | built |
| R-d | One map component with two layers (plan, supply); versions are a toggle on it. Two renderers inside it: Google first, Leaflet/OSM as automatic fallback (2026-10-04) | built |
| R-e | Transport is post-optimization — except the airport ↔ lodging legs (R-i). **Logistics is paid value (2026-10-04):** the routing engine's legs appear with Optimize, Trip Pass or an expert handoff, never on a free draft; a plan finalized without optimizing carries airport legs only and an "Add travel times · Optimize" line | standing |
| R-f | Free optimizer preview shows findings and deltas, never the rearranged plan (existing, G4) | built |
| R-g | Social-proof copy only from real outcome counts ≥ 20 plans and ≥ 40% share (admin-configurable); otherwise expert-endorsement or template-rule phrasing. Never "most people" without the count | step 10 |
| R-h | Public content never prints Google-restricted travel-time values; in-plan display is allowed (existing) | standing |
| R-i | Airport ↔ lodging legs are computed as soon as a flight anchor and a lodging anchor both exist; the only bookable `LegRow` on a draft. Buffers: arrival 120 min international / 60 domestic after landing; departure 150 / 90 before take-off; unknown origin → international. **The anchor-conflict rule measures against the buffered times, not the flight times** (2026-10-04, S10-1) | built; S10 PR |
| R-j | Flight data: schedule API queried by flight number (AeroDataBox via RapidAPI; `FLIGHT_LOOKUP_API_KEY` in deployment config; one lookup per flight entered, cached on the anchor, daily cap; failed calls cost 0); search stays on Travelpayouts; booking-in-name waits for a booking API; **no scraping** of Google Flights or any site | built |
| R-k | Places lookups: `PLACES_LOOKUPS_PER_DRAFT = 12` for the beta | built |
| R-l | The optimizer fee stays visible on the lead card; per-item checkout buttons do not appear on a draft (= R-z) | built |
| R-m | "Ask a local about this" shows on every item before any expert is live; it opens the expert door; with no expert live it **records interest** ("Question saved · we'll tell you when a Kyoto local joins") and persists on the item (R-r, R-al) | built |
| R-n | Handoff: the expert **accepts** the match (admin override only); expert is paid on **traveler approval**, not on deliver; expert changes are **always suggestions** the traveler accepts, with one-tap "accept all" for full service | step 7 |
| R-o | Lodging in the anchor panel ranks by plan-fit first; within a plan-fit band platform-listed stays rank above affiliate stays; revenue never moves a stay out of its band; "Traveloure stay" badge; platform stays book at the `accommodation` band; affiliate stays book through the concierge in the traveler's name or deep-link | built |
| R-p | Facts from `official` license-class sources with `public_ok` set at the terms check (hours, closure, ticketing_rule, transit, event) may appear on public pages with "from <source> · checked <date>" and a link; descriptions and tips stay plan-only until expert-verified (PR #1249, migration 341) | built |
| R-q | Handoff money: **authorize at Ask, capture on accept**; no expert accepts within 24 h → concierge fallback offered; hold released at 48 h if nothing accepted | step 7 |
| R-s | Delivered plans **auto-approve after 7 days**; two rounds of "request changes" included, further rounds are a new ask | step 7 |
| R-t | Withdrawal fees by stage, same tiers as cancellations (none before accept; band-defined after) | step 7 |
| R-u | The Places cap counts **cache misses only**; the place-ID cache is shared across plans (30-day TTL); the allocator guarantees ≥ 2 named stops per day get a lookup before any third | built |
| R-v | Hours facts are labelled with the weekday and "checked <date>"; findings built on stale facts are shown with the caveat "based on current hours · re-checked 3 days before your trip" | built |
| R-w | **Server-side sanitising of AI text**: no brands, hotel names, platforms or booking sites in drafted titles; a venue-less item becomes a `SupplySlot`; **a title naming a festival/matsuri/event with no R-p event fact covering the trip dates is reduced to its non-event fallback or a `SupplySlot`** (2026-10-04, S9-8) | built |
| R-x | Neighbourhood one-liner under each anchor option: registry `neighbourhood` fact, else the neighbourhood spine's description | built |
| R-y | Zero inventory collapses the anchor panel to one line ("Hotels coming soon"); never a placeholder listing — a bookable row in production is a real provider | built |
| R-z | No per-item checkout on drafts (restates R-l) | built |
| R-aa | Placeholder arrival/departure `AnchorRow`s exist from the empty state; every drafting path (free draft, Plus occasion drafts, the trip generate route) places nothing before arrival + buffer or after departure − buffer and never produces a duplicate airport row; an AI arrival/departure item is adopted as the travel row (step-2 addendum behaviour, kept). **Anchor and travel rows carry our titles ("Arrival in Kyoto" / "Departure from Kyoto"), never the model's** (2026-10-04, S10-4). A stop starting after take-off counts as a conflict in both the amber line and `timed_entry_conflict` | built: our titles, amber line, free-draft buffer drop; **step 6:** buffer drop on Plus occasion drafts and the trip generate route, after-take-off case in `timed_entry_conflict` |
| R-ab | Every surface step ships with a parity test against the stored smoke-6 fixture (`server/__tests__/fixtures/smoke6-plancard.json`) | built |
| R-ac | Free re-run after a paid optimization = **3 day re-times within 24 h** (`OPTIMIZER_FREE_RETIMES`, default 3), same version, smart-sequencing only (no model call); the fourth states the fee and routes into the paid run — no per-day charge point. Trip Pass covers 5 full runs per trip (`TRIP_PASS_RUNS_PER_TRIP`, R296); the unlimited 24-hour re-run is removed for everyone | built (R292, R296) |
| R-ad | T-3 days: the facts re-check that finds a conflict pushes once and shows a banner on the Trip Card ("Swap" / "Ask [expert]") | built (R296; job registered #1283) |
| R-ah | Locked items ("Keep this", `itinerary_items.locked_at`, migration 342): the optimizer, re-times and redrafts leave them in place; "Kept · Optimize and redrafts leave it in place" with Unlock | built |
| R-al | Ask-a-local questions persist on the item across reloads ("Question saved") | built |
| R-am | Destructive edits (Swap, Remove) get a 10-second inline Undo that restores item, facts line and lock state | built |
| R-ao | Anchor rows (lodging, flights, airport legs) are **not items**: the draft gate, the "Draft it with AI" control and the draft rebuild count and touch non-anchor items only (2026-10-04, S9-1) | built (R291) |
| R-ap | **`ItemSheet`** (built R296): tapping a photo, the title, or ⋯ → Details opens the stop's detail sheet (photo with attribution, all facts with sources, expert notes, Ask a local, Book) — the one "more info" surface; no separate place page from the slip | step 6 |
| R-aq | **Photos are facts** (built R296/R297) — origin, licence, attribution stored with the image reference. Sources in order: ours (listings, experts) → Wikimedia Commons (CC, cached, attributed) → Google Place Photo (live only, capped, never stored) → none. No stock, no AI images. One image per day on the slip (the day's first located stop); thumbnails on the Trip Card's today rows and on option cards; none on item rows, versions or the map | step 6 |
| R-ar | **Routing engine** (§14): computed, cached, deterministic travel between every pair of consecutive stops; legs render on optimized, Trip Pass and expert-held plans and on their Trip Cards, with provenance; free drafts keep thin connectors (R-e) | step 9a |
| R-as | **No scraped transport sources.** Transport data enters only through the routing API, official feeds (GTFS, operator APIs), affiliate APIs and our listings, each registered with `public_ok`, attribution and a checked date; a scraped price is never bookable and never shown | standing |
| R-at | Routing compute discipline: debounced per plan change, changed legs only, cache-first by (origin place ID, destination place ID, mode, hour bucket) shared across plans; per-caller switches, daily caps and recorded costs by name as built in R299 (R-bq) | caps built (R299); engine step 9a |
| R-au | Provider pickup/drop-off are **listing fields** (pickup offered, zones, meeting point, stations/hotels served, drop-off); an extraction pass proposes them from the provider's package text; **the provider confirms before they go live**; rendered "as described by the host" | engineer/Content lane, starts now |
| R-av | The optimizer consumes the routing engine's legs instead of estimating; findings `city_crossing` and `walking_saved_km` drop "est." once legs exist | step 9b |
| R-aw | Legs are re-checked at T-3 by the facts-recheck job and once on each trip day for the Trip Card; a changed leg surfaces as a banner finding, never a silent rewrite | step 9b / 6 |
| R-bt | **Ready Made Trips (architect's framing; detail in Lane 1's R-ba–R-bf):** a purchased copy opens on the slip as *drafted* with provenance, the author's confirmed legs, tips and stamps; the included revision is a prepaid §12 handoff with suggestions — the author has no write access once step 7 ships (transitional grant: see §12); payout by the `ready_made_trip` band, which follows the expert band (R-bc) | data built (R300–R311); UI and suggestions step 7 |
| R-bu | **Free Trip Card:** Navigate on every row is a Google Maps directions deep link (no API call); on Finalize a free plan shows its free findings once more as the prompt ("2 stops may not be reachable in time · Add travel times"); no routed legs without R-e | step 6 |
| R-bv | **Price ladder** (§15): every paid tier listed once with what it includes, where it is offered and whom it is for; amounts come from fee bands by name; Trip Pass must beat two Optimize runs; the R-ac cap is set in the ladder | step 6 (ruling) |
| R-bw | **Local-verified stamps** (zero-expert launch): an expert's "confirm this fact" produces the `ExpertNote` default "checked by a Kyoto local · <date> · <tip>" and sets R-p's expert-verified state, which publishes the fact to city pages, gem cards and Ready Made Trips; the only expert surfaces required before experts earn money are Ask a local (interest) and stamps | step 7 (small lane; can precede handoff) |
| R-bx | **Success gates per step** (§16): each build step names the outcome that counts as working, measured from `feedback_events` and the instrumentation events, alongside its parity test | standing |
| R-by | **Seasonal facts into drafting:** `city_events` and season facts (best season, closures by month) go into the drafting prompt with the trip dates, so out-of-season events are not proposed in the first place; R-w stays as the backstop | step 6 (drafting consistency) |

**Lane 1 — Expert console × Ready Made Trips (work plan 2026-10-04; its numbering R-ax … R-bs is kept; R300–R311 merged 2026-10-04 as #1285, migrations 347/349/350 approved by Leon):**

| # | Ruling | State |
|---|---|---|
| R-ax | **Leg gate:** a Ready Made Trip can't be submitted or approved unless every consecutive pair of geocoded stops on every day has a confirmed `transport_legs` row with a mode or a pickup ref; the public teaser counts confirmed legs only | built (R304) |
| R-ay | **Author's tip:** `transport_legs.author_tip` ≤140 chars, "Author's pick: {mode} · {tip}", cloned with the leg, never rewritten by the engine; in the author's own words, not translated | built (R302) |
| R-az | **Via host pickup:** `transport_legs.pickup_provider_service_id` selectable only when the listing's pickup is provider-confirmed (R-au; `pickup_confirmed_at`, migration 348 reserved); rendered "as described by the host" | columns built; confirmation L1-7 pending |
| R-ba | **Copy keeps picks:** the purchase copy carries confirmed legs (`origin='author_pick'`) and anchors by day offset; day 1's first and the last day's last leg are re-routed when the buyer sets a stay (`origin='rerouted_for_stay'`) | built (R306–R308) |
| R-bb | **Leg re-check** at T-3 and day-of sets `leg_check_status`; the author's pick stays visible until the buyer changes it (extends R-aw) | L1-5 pending |
| R-bc | **RMT take rate = expert band (25% beta)**, one admin setting drives both, rate snapshotted on the purchase; no traveler fee on an RMT purchase in beta (admin toggle); bookings from the copy carry the traveler fee | ratified by Leon 2026-10-04; L1-8 pending (migration 352) |
| R-bd | **Included revision = prepaid §12 handoff**, author's changes as `expert_suggestions`; `request-revision` stops granting a write-status advisor row. **Transitional:** until step 7, R300/R310 restrict leg writes to the owner and existing write-status advisors — a tightening of the legacy grant, not a new one; step 7 (L2-2) removes the grant | step 7 |
| R-be | **Provenance:** "from {author}'s Ready Made Trip" on the slip header and the Trip Card, from `trips.source_ready_made_trip_id` / `purchases.by-clone`; the `ConciergeCard` line stays | data built (R301); UI L2-6 |
| R-bf | **Local-verified stamps on legs and stops:** "Legs checked by {author} · {date}" from `checked_by/checked_at`; bulk verify writes `last_verified_at`; after 90 days the stamp re-labels "last checked {date}" (never hidden) and the author is reminded | L1-11 pending |
| R-bg | **Template anchors** are day offsets from the build's synthetic start; the copy re-materialises them against the buyer's dates; re-date shifts anchors | built (R306) |
| R-bh | **Workstation surface** = `DayBlock`/`ItemRow` role expert + `MapControlCenter` with `onAddCandidate`; `ItemsEditorPanel`, `CanvasMapSection`, `LeafletPlanMap` standalone removed in step 7 | step 7 (= §10 step 7) |
| R-bi | **Readiness checklist:** one server read of blocking (gate + legs) and advisory lines with jump-to ids; only blocking lines stop submit | built (R305) |
| R-bj | **Expert inbox:** Ask-a-local questions reach `/expert/inbox` → Questions; on an RMT copy the author is the default local and the **first answer is included in the purchase**; later questions follow R-q | built (R309, migration 349); free-first-answer rule 2026-10-04 |
| R-bk | **Performance is private:** per-listing views, sales, net, concerns and aggregated feedback codes to the author and admins only | L1-14 pending |
| R-bl | **Supply recommendations** from venue-less stops go to admin, never auto-listed; census gaps shown to experts as counts | L1-15 pending (migration for `supply_recommendations`) |
| R-bm | **Clone and adapt:** own builds freely; a client plan only with the client's recorded consent naming the expert *and* a code-owned scrub (route only survives) | ratified by Leon 2026-10-04; L1-12/L1-20 pending (migration 353) |
| R-bn | **Seasonal notes:** per-item `season_note` (cloned) + listing `best_season`; the copy shows overlapping `city_events` | L1-16 pending |
| R-bo | **`/api/expert-workspace/scrape-jobs` gated** behind `EXPERT_SCRAPE_JOBS_ENABLED` (off in production), admin-only, registry `public_ok` non-transport sources only when on | built (#1269, R298); ratified by Leon |
| R-bp | **Correction:** the leg table is `transport_legs` (no `plan_legs`); `LegRow.userSelectedMode` = `transport_legs.user_selected_mode`; it is the only leg source — item-level transport fields are read-only legacy and leave the clone allowlist (R-bs) | applied in §3, §14 |
| R-bq | **Correction, superseded by R299:** the engine switch is `TRAVEL_TIME_SERVICE_ENABLED` (tiers Google Routes → matrix → straight-line "est."); the per-caller switches and caps are the R299 names (`MAPS_ROUTES_DRIVE/MODE/TRANSIT_ENABLED`, `MAPS_ROUTE_MATRIX_ENABLED`, their `_DAILY_CAP` and `_COST_CENTS`); the spec's `ROUTES_*` names are withdrawn | applied in §14 |
| R-br | **Correction:** workstation `ItemsEditorPanel` rows are not done; pending step 7 (R-bh) | applied in §10 |
| R-bs | see R-bp | — |

Open questions from the plan, ruled 2026-10-04: an RMT copy is a paid plan under R-e (legs show); tips and season notes stay in the author's words; staleness re-labels, never hides; the first Ask-a-local answer on a copy is included, later ones per R-q; the spec adopts the code's config names (R-bq); the three `EXPERT_WORKSPACE_SPEC*.md` copies are retired, superseded by §12 and the work plan.

Proposal-kit rulings R-ae … R-an are in §13.

---

## 2. The surfaces

### 2.1 Experiences entry — `/experiences`
"What are you planning?" → five groups, each line naming its anchor; Show/Festival featured on top using seeded `city_events`. Then Where · When · Who → the slip opens empty. `experience-template.tsx` is retired in stages (§10); two of its three map mounts are already gone (step 5). Selection controls survive as the Browse layer's filters.

### 2.2 Trip Slip — `/plans/:tripId`
States: **empty** → **drafted** → **compare** → **optimized** → **with expert** (§12) → **finalized** (Trip Card born; slip reopenable).

Layout, phone-first: header (name · dates · day count · party · "Staying at <stay>" once set · timezone line) → tools tray (manifest chips; "Getting there" first for Trips) → `OptimizerLead` (§8; directly under the tray at every width) → `FeedbackTap` after a draft (§9) → anchor panel (only while the anchor is open and the plan meets the group's threshold) → List / Map switch → `DayBlock` list (first day expanded) → sticky Share / Finalize. Desktop: tray and optimizer lead become the right column. Day headers carry weekday · date · N stops · hours on K — **no ward names**.

### 2.3 Slip map
`MapControlCenter`, one instance, two layers, two renderers (built, step 5). **Plan layer:** numbered stops for the selected day, straight connectors (routed once §14 legs exist), anchor marker whenever the stay has coordinates, neighbourhood shading whenever the stay has coordinates (step 6; today only while the `AnchorPanel` is open), moved stops gold under a version. **Browse layer:** listings and partner places with their own coordinates as pins; hosts without coordinates in the bottom sheet only — never a guessed pin; "Find a host" on a venue-less item opens Browse filtered to its category. Draft / A / B / C toggle redraws the day. Renderer: Google when a key is present and the script loads; Leaflet/OSM on no key, load failure, 10 s timeout or quota/auth error, once per page load, with a "Map by OpenStreetMap" notice; tiles from `MAP_FALLBACK_TILE_URL` (deployment config; public OSM tiles with a logged warning when absent).

### 2.4 Versions
Built (step 5, R292). The board shows the latest run's three versions, labelled with the run date; "Your plan" is the live plan; older runs stay stored. Days are diffed by `source_item_id` (migration 343); runs made before it fall back to listing-then-title and the board says "matched by name" — also shown wherever two stops in a day share a title. Badges are relative labels only ("least travel", "most time at stops", "earliest evenings"), computed from stored stops, no minute values; no badge where times are missing. 4a choose: three cards, Adopt all / By day. 4b phone: day selector; A/B/C snap-scrolling columns; identical days collapse to "same as draft"; Take this day; pick strip; Apply. 4c desktop: four columns A / B / C / Your plan; **the day is the draggable unit** by a handle on its header; stops reorder only inside a day in Your plan and that day re-times itself within the free window (R-ac); a stop dragged in from a version is a swap-in to the end of the day, then re-timed. Apply-days (`{day, variantId}[]`) replaces only those days, never deletes the draft, leaves the run untouched, writes `source_run_id` / `source_variant_id` on adopted items. Route: for every plan, `/itinerary-comparison` renders the versions board (S10-2); with no run it shows Draft only with the Optimize card as its CTA. A comparison with no plan behind it (the guest cart before a plan exists) keeps the legacy screen until guest trips (G2) land; it retires with G2.

### 2.5 Trip Card — `/trip/:id`
Renders the `trip_finals` snapshot read-only plus the live overlay. Hero (day photo per R-aq) · provenance ("Finalized Oct 3 · built from Version A, run 1 · planned with [expert] · hours re-checked Nov 8 · 3 of 24 booked") · Reopen · day strip with **Today** first · map thumbnail with Navigate · today's `ItemRow`s in read mode with thumbnails, booking state and host/expert notes · `LegRow`s live · T-3 conflict banner (R-ad) · Tonight/Tomorrow slot (§7.4) · bookings list. No planning controls.

### 2.6 Public surfaces (Discover, city pages, gem cards, blog)
Read only `isPublishable` content: platform listings and hosts, gems, expert-verified nuggets, seeded events, TravelPulse signals, blog posts, and — under R-p — official-source facts with attribution. Never travel-time values (R-h), never Google photos. City pages and gem cards rendering publishable facts is a registered follow-up outside §10.

---

## 3. Component contracts (one renderer each)

**`ItemRow`** — props: item, facts (address/hours/location with `checkedAt`), mode `edit | read`, role `traveler | expert`, bookingState, routing (`own | with_expert`), expertNote?, suggestion?, upsell?, photo? (card rows only). Edit: time · title · place line (Google's `addressComponents` area once a lookup resolves — the AI's area is a placeholder until then — else ward/area) · facts line verbatim, one format ("Wed · Open 24 hours · Google Maps · checked 4 Oct", date in the plan's timezone) · optional second facts line for ticketing / transit / closure facts with source · lock state ("Kept · …" with Unlock) · saved question · expert note · pending suggestion · ⋯ (Swap · Move · Remove · Keep this · Ask a local about this · Find a host · Set as where you're staying (lodging-type items; confirms a replacement when a stay exists) · Details · Book this for me). A time edit re-sorts the day and refetches findings (S10-5). Read: same minus ⋯, plus booking chip and Message host.

**`DayBlock`** — header (weekday · date · N stops · hours on K · notes count · "with [expert]" when routed; no wards) · optional day photo (slip: first located stop) · `ItemRow`s with `LegRow`s between them · Add / Swap · collapsible. Moments render one block with hours as the unit.

**`LegRow`** — between two rows on optimized, Trip Pass and expert-held plans: mode icon · duration and line/fare when the routing source returns them · provenance ("Google · checked 4 Oct") · "leave by" · "via host pickup" when R-au covers it · mode swap (persists `userSelectedMode`) · Book this leg only where a real bookable option exists (platform private car first when it fits route/time/party, affiliate fill). Free drafts: thin connector only, except airport legs (Train · Book · Airport transfer · Book; private car only when a listing exists — R-y).

**`AnchorRow`** — a fixed point in the day (flight, reservation, venue, ticketed show): time · our title · "Anchor · fixed · from <tool>" · flight line ("MM024 · lands KIX 13:10 · from lookup") · amber conflict line counting the day's stops outside the buffered window, no minutes. Immovable in drags and re-times.

**`ToolsTray`** — chips from `shared/group-manifest.ts` (§4); each opens a sheet mounting the existing tool; "coming soon" chips disabled.

**`AnchorPanel`** — anchor-type aware; ranking computed once per draft and stored (`where_to_stay` jsonb, migration 340); reason line only when it distinguishes; own inventory only, ordered per R-o; one line with zero inventory (R-y); chooser always offers three options — Change where I'm staying · I'm deciding — compare places · I've got lodging sorted; Skip is the sheet's dismiss, not an option. A typed stay gets the same ID-only search + Details lookup as items, storing coordinates and area (S10-3).

**`OptimizerLead`** — §8. **`SupplySlot`** — a venue-less item renders as a slot with "Find a host" (Browse filtered by category and day, expert-endorsed first). **`ExpertNote`** — one implementation, under the item it concerns, author + neighbourhood, "Ask a follow-up". **`ItemSheet`** — R-ap. **`FeedbackTap`** — §9. **`UpsellLine`** — §7.2. **`TonightSlot`** — §7.4. **`HandoffBanner`** — §12.

### 3a. Tools inventory (where each tool lives, state at 97221c1)

| Where | Tool | Groups | State | Step |
|---|---|---|---|---|
| Item ⋯ | Swap · Move · Remove · Build my days around this | all | live | 1 |
| Item ⋯ | Ask a local about this (records interest until a local is live) | all | live | 1 |
| Item ⋯ | Keep this / Unlock (R-ah) · Undo 10 s (R-am) | all | live | 3, smoke-7 |
| Item ⋯ | Find a host (venue-less items, any type) | all | live | 5 |
| Item ⋯ | Set as where you're staying (lodging-type items) | Trip, Group | S10 PR | — |
| Item ⋯ | Details → `ItemSheet` | all | planned | 6 |
| Item ⋯ | Book this for me | all | planned | 7 |
| Day | Add to this day · Swap a stop · Collapse/expand | all | live | 1 |
| Tray | Getting there (flight → anchor, live lookup) | Trip, Group | live | 2 |
| Tray | Where to stay (`AnchorPanel`) | Trip | live | 3 |
| Tray | Travel party | Trip, Group | live (rail) | 2 |
| Tray | Getting around (mode preferences) | Trip | disabled chip | 9 |
| Tray | Pace (EnergyBudget) | Trip | live | 2 |
| Tray | The reservation · Timing check | Moment | exists | 2 |
| Tray | Getting home | Moment | planned | 9 |
| Tray | The venue · Guests · Vendors · Budget | Celebration, Event | exists | 2 |
| Tray | Run of show · Arrivals & split groups | Event (Moment kit) | exists | 2 / §13 |
| Tray | Shared lodging · Who's coming · Split activities · Who pays what | Group travel | exists / disabled chips | 2, 3 |
| Plan | Draft it with AI (free; anchors never block it) | all | live | — |
| Plan | Optimize → three versions · versions board · apply by day · desktop day drag · 3 free re-times | all | live | 4, 5 |
| Plan | Compare versions link (once a run exists) | all | S10 PR | — |
| Plan | Hand off to a local (chooser, scope, fee) | all | exists; redesign | 7 |
| Plan | Share link · PDF · Calendar · Finalize / Reopen | all | live | — / 6 |
| Plan | Feedback tap (post-draft) | all | live | R293 |
| Map | Day chips · plan/Browse layers · version toggle · Google/Leaflet | all | live | 5 |
| Trip Card | Today-first · Navigate · Book a ride · Message host · T-3 banner | all | planned | 6, 9 |
| Trip Card | Tonight / Tomorrow slot | all | planned | 10 |

---

## 4. Group manifest (`shared/group-manifest.ts`)

| Group | Eyebrow | Anchor question | Time unit | Tools tray | Anchor panel threshold |
|---|---|---|---|---|---|
| Trip | Your plan · Trip | Where are you staying? | days | Getting there · Where to stay · Travel party · Getting around · Pace | plan ≥ 2 days |
| Moment | Your plan · Moment | What's the reservation? | hours | The reservation · Timing check · Getting home | always |
| Celebration | Your plan · Celebration | Where's it happening? | one day, hours | The venue · Guests · Vendors · Budget | always |
| Hosted event | Your plan · Event | Where's the venue? | run of show | Run of show · Guest invites · Vendor contracts · Arrivals & split groups | always |
| Group travel | Your plan · Group | Where is everyone staying? | days | Getting there · Shared lodging · Who's coming · Split activities · Who pays what | plan ≥ 2 days |
| Show / Festival (occasion) | — | Which night(s)? (ticket = anchor) | parent's | + The show · Getting back late | parent's |

Feedback chips use the group's time unit ("Days too packed" / "Hours too packed").

---

## 5. Flights and transport

**Flights are anchors, not products.** "Getting there": flight number and date → schedule lookup (R-j) → `temporal_anchors` `flight_arrival` / `flight_departure` with buffers (R-i) → `AnchorRow`s with our titles (R-aa). Searching and pricing flights stays on Travelpayouts; booking in the traveler's name waits for a booking API; the concierge books by hand until then. Live flight status on travel day is phase 2.

**Airport ↔ lodging legs (R-i):** computed when both anchors exist; platform private car first when it fits party size and a listing exists for the city (an approved, active `private_transportation` listing with the city set exactly — a census item, never a placeholder), then rail / affiliate transfer; bookable from the draft; re-surfaced at T-3.

**Drafting rules around anchors (R-aa, R-an):** nothing before arrival + buffer; nothing past departure − buffer; no duplicate airport rows — an AI arrival/departure item is adopted as the travel row with our title; meal items drafted in their windows (breakfast before 09:30, lunch 11:30–14:30, dinner from 17:30); a Moment's day is light and never the arrival or departure day.

**All other legs:** §14, on paid or expert-held plans only (R-e). On free drafts non-airport legs are thin connectors, before and after the routing engine lands.

---

## 6. Place facts, photos and index-site content

**Lookup:** ID-only Text Search (free) → Place Details by ID (`PLACES_DETAILS_COST_CENTS = 2`; Atmosphere tier only for dining `reservable`, `PLACES_DETAILS_ATMOSPHERE_COST_CENTS = 2.5`); field mask `displayName, location, formattedAddress, shortFormattedAddress, addressComponents, regularOpeningHours, photos, id, types, googleMapsUri` (`photos` and `addressComponents` change no tier); `languageCode=en`; area from `addressComponents` (never the Japanese `formattedAddress`); on attach the item title takes Google's `displayName` and **Google's area replaces the AI's** (S9-7). Cache by place ID, 30 days, shared across plans; the cap counts misses only; ≥ 2 named stops per day (R-u). Hours with weekday and "checked <date>" in the plan's timezone (S9-6); "checking hours…" meanwhile; a pin without hours is still located (located ≠ has hours). Never store Google photos or copy Places points onto item rows.

**Photos (R-aq):** a photo is a fact. `place_photos` reference: source (`ours | wikimedia | google_live`), licence, attribution text, URL or asset id, `checkedAt`. Wikimedia lookups by place name + coordinates, cached; Google Place Photo fetched live per render, capped by the same daily config pattern, never persisted. Tap → `ItemSheet`.

**Registry (index-site) content** surfaces only as facts on items, by need: `stop.hours`/`closure` on the facts line; `stop.ticketing` on the second facts line and as an `OptimizerLead` finding; `transport.*` on `LegRow`s and Moment's "Getting home"; `event` as an `AnchorRow`, the events strip, or the R-w event check; `neighbourhood` as the one-liner under each `AnchorPanel` option (R-x); `practicalities` on the Trip Card's arrival day; `dining` on dining items. Every fact renders with source and "checked <date>", links out, never exceeds the quote cap, and ranks by origin (platform-native → verified → Places → crawled → traveler note). Public pages get only R-p facts. Source activation: `CONTENT_SOURCE_ACTIVATOR_USER_IDS`; Kyoto index sources with `public_ok` are a census item.

---

## 7. Upsell

### 7.1 Principles
Relevance dominates; revenue reorders only within a band (cap 15%); expert endorsement raises relevance; transport upsell only on legs with a bookable option; ≤ 1 `UpsellLine` per item, ≤ 2 in the `TonightSlot`, ≤ 1 push per plan per 48 h; attribution stamp on every impression; never a modal, never on the map, never on the slip mid-trip.

### 7.2 Selection-based — `UpsellLine`
Trigger: a selection event (item added, option chosen, version adopted, leg booked) with ctx `{ group, templateKey, item category, day/time, party composition, anchor, stage }`. Render: one dismissible line under the selected row — `<phrase>: <service> · from <price> · Add`. Phrases (R-g): counted social proof only above threshold — off at launch; expert endorsement wherever an expert exists; template rule now. Data: `inventoryForContext` → eligibility → scoring → blend → cap; nightly co-occurrence rollup keyed by (group, item category, party class, time band) → service category, counts only.

### 7.3 Needed and missing
Party composition into engine ctx; the co-occurrence job and table; confirm `expertEndorsedKeys` write-back is wired.

### 7.4 On trip — `TonightSlot` (`plancard_ontrip`)
Bottom of today's `DayBlock` on the card; ≤ 2 candidates by trigger: empty evening, cancellation/weather, arrival day (transfer), day before departure, a stop with a host. Concierge tasks are a button on the day, per-task fee. Push morning-of, ≤ 1 per 48 h.

---

## 8. Optimizer preview — `OptimizerLead`

Built (step 4). "What Optimize found in this draft": findings `closed_on_arrival` (draft time before open or at/after close; caveat line per R-v), `timed_entry_conflict` (against buffered anchors — R-i), `city_crossing` (straight-line, "est." until R-av), `walking_saved_km` (≥ 1 km, "est."), `pace_over`. Up to three findings with counts · cost delta only when ≥ 1 priced item exists · fee and CTA (R-l) · "three versions built around where you stay" · free re-run line (R-ac). No score. **Empty state:** "Draft first — Optimize works on a drafted plan", Optimize disabled. Sits directly under the tools tray at every width. Findings refetch after any time edit. After payment the same card shows the realised before→after delta. **Later:** `closing_soon` soft finding (a stop reached under 45 min before closing) once hours are week-specific.

---

## 9. Data flow, jobs, feedback

**Finalize** writes `trip_finals`: items with facts and `checkedAt`, photos references, anchors, legs, per-day `{source_run_id, source_variant_id}`, expert notes, `advisorId` + request id. Versioned; Reopen → slip; refinalize appends.

**Jobs** (registry, engineer's domain, heartbeat-stamped): `facts-recheck` at T-3 per trip (hours, closures, legs — R-ad, R-aw); `cooccurrence-rollup` nightly; `routing-recheck` on each trip day (R-aw); `flight-status` on travel day (phase 2).

**Feedback (`feedback_events`, migration 345, R293):** one row per plan × moment × user (a second tap updates; `dismissed` is a code); `surface`, `moment`, `code`, `text` (≤ 500, only with `other`), `group_key`, `city`, `build_sha` server-filled; `POST/DELETE /api/plans/:id/feedback`; admin read `/admin/feedback` by city × group × moment × code. Moments: `post_draft` (live: fits · too_packed · too_light · wrong_areas · wrong_stops · other) · `post_optimize` (step 5+: least_travel · best_mornings · kept_favourites · other) · `post_handoff` (step 7: helped · some · no) · `post_trip` (step 6, T+1: great · fine · rough + text). Free text is never rendered publicly.

**Migrations on main:** 340 (`where_to_stay`, `facts_lookup` jsonb), 341 (`content_sources.public_ok`), 342 (`itinerary_items.locked_at`), 343 (`source_item_id`, `source_run_id`, `source_variant_id`), 344 (`plan_day_retimes`), 345 (`feedback_events`), 346 (`place_photos`), 347 (`transport_legs` authoring columns), 349 (`expert_question_answers`), 350 (`transport_legs.coord_source`); 348 reserved (L1-7 pickup confirmation); 351 rejected (triggers) and the number retired; 352 (rate snapshot) and 353 (reuse consent) held. Rule, clarified 2026-10-04: a column added to an existing table is nullable with no DEFAULT / CHECK / index / FK; a new table may declare NOT NULL on identity columns and carries only its primary key; **no functions, triggers, `CREATE OR REPLACE` or `DO` blocks in any migration** (2026-10-04, migration 351 rejected); data migrations insert-if-missing or prove rows exist; registry order governs apply order, so a reserved number left unused is harmless; SQL in the PR body, applied twice, held for the founder's ruling.

**Instrumentation** gains: `upsell_line_shown/added/dismissed`, `tonight_slot_shown/acted`, `preview_shown` with findings counts, `leg_booked` with source, `handoff_requested/accepted/suggestion_accepted/approved`, `feedback_tapped`.

---

## 10. Consolidation and build order

| Keep (one) | Delete / retire | State |
|---|---|---|
| `ItemRow` | `SlipItemRow`, row rendering in `ActivitiesSection`, `SlipItemTools` duplicate form (done); workstation `ItemsEditorPanel` rows (step 7, R-bh) | slip done; workstation step 7 |
| `DayBlock` | per-surface day grouping (slip, card `DaySelector`, workstation) | slip done; card step 6 |
| `ExpertNote` | `ExpertNoteBlock` + inline block | done |
| `MapControlCenter` (2 layers, 2 renderers) | `ProposalComparisonMap` (done), `ExperienceMap` ×2 of 3 (done; desktop panel step 8), Workstation inline map (step 7); `LeafletPlanMap` **kept** as the fallback renderer inside it | mostly done |
| `AnchorPanel` | legacy inline lodging card; `SlipLodgingEntry` | done |
| `ToolsTray` + manifest | rail mounting every logistics component | done |
| versions board | legacy `/itinerary-comparison` cart page (plan case: S10 PR; no-plan guest case: with G2) | S10 PR / G2 |
| Experiences entry | `experience-template.tsx` planning features, dead Sheets/dialogs, template cart UI | step 8 |
| checkout basket | `cart_items` as a planning store | step 8 |
| one expert door, one `expert_requests` route | template page's four expert surfaces; `HireExpertDialog` and `FinalizeBookingModal` request paths; 5-stage status pill | step 7 |

**Order** (each a PR with a gate; Track A owns; ledger row per PR; smoke-test fix PRs interleave and take the next R-number):
1. ✔ `ItemRow` + `DayBlock` + `ExpertNote` + `AnchorRow` (R277–R285).
2. ✔ `ToolsTray` + manifest; "Getting there" behind `FLIGHT_LOOKUP_ENABLED`.
3. ✔ `AnchorPanel` consolidation; R-o; airport `LegRow`; R-u.
4. ✔ `OptimizerLead` (R290).
5. ✔ Map layers + renderers + versions toggle + board + apply-days + re-times; Find-a-host fix (R292). Smoke 9/10 lanes R291, R294, R295.
6. ✔ (R296/R297, #1283; finalize smoke pending as smoke 11) Trip Card on the same rows: provenance, Today-first, T-3 banner (R-ad), photos + `ItemSheet` (R-ap, R-aq), `post_trip` feedback moment; `facts-recheck` job registered by the engineer; cap ruling on 24-hour re-runs; drafting consistency — buffer drop on all drafting paths, the after-take-off case in `timed_entry_conflict` (R-aa), seasonal facts in the prompt (R-by); Navigate deep links and the free-finalize findings line (R-bu); **finalize smoke**: the first smoke test that finalizes a plan, covering the known "Your Trip Card is ready" vs "Not final yet" mismatch.
7. Handoff (§12): expert-accept, R-q money, suggestions, R-s approval, R-t withdrawal; Ready Made Trips on the handoff model (R-bt); local-verified stamps (R-bw, may ship first); Workstation mounts `MapControlCenter` with `onAddCandidate` for role expert and retires its inline map; one request route; `post_handoff` feedback.
8. Experiences entry; retire template planning features and the last `ExperienceMap`; Browse layer takes selection controls; `cart_items` checkout-only.
9. Logistics (§14): 9a `LegRow`s on optimized / Trip Pass / expert-held plans from the routing engine (engineer builds the engine in parallel from step 6; Track A wires `LegRow`); 9b optimizer consumes legs, T-3/day-of re-checks; 9c per-leg options and booking, provider pickup (R-au) on legs, Getting around / Getting home tools.
10. `UpsellLine`, `TonightSlot`, co-occurrence job, party composition in ctx.

Before the proposal-kit lane: one smoke test on a Moment plan and one on a Celebration plan, so "exists" in §3a is verified for a second and third group. Registered follow-ups outside this order: city pages and gem cards rendering publishable facts (§2.6); flight status on travel day; proposal kit (§13) after step 5 as a Moment-group lane; official/affiliate transport feeds in the registry (R-as) as sources are signed.

---

## 11. Ratification record

2026-10-03: R-b, R-c, R-d, R-k, R-g threshold, R-l, R-m, R-n ratified per recommendation; R-i ratified; R-j ratified as "schedule API, no scraping"; R-o ratified; R-p ratified and built (#1249); R-q … R-ad, R-ah, R-al, R-am, R-aq ratified ("ok, lets go with your recommendations"; photos "yes"; ItemSheet "yes"). 2026-10-04: R-d renderer fallback ("I want it as a fall back"); migration rule clarification; R-ao, R-ap; R-ar … R-aw ratified in the logistics discussion ("ok"), then amended: "free drafts shouldn't get the logistics" — legs are paid/expert value, R-e restored; S9 and S10 rulings folded into R-i, R-aa, R-w, §6, §8.

---

## 12. Handoff to an expert or concierge

**Model: the slip doesn't move, the pen does.** One plan; handoff changes who holds the pen on which items; the traveler watches the same slip throughout. No copy, no separate expert plan, no bundle to merge back.

| Step | Traveler's slip | Expert / concierge | State and money |
|---|---|---|---|
| 1 Ask — "Hand off to a local expert" (slip) or "Book this for me" (item, leg, or whole plan) | Chooser: *Polish my plan* · *Book these for me* · *Plan it all*; scope = items ticked; fee shown before confirming | — | one `expert_requests` row with scope; fee band resolved; **authorized now, captured on accept** (R-q) |
| 2 Match | `HandoffBanner`: "Finding your Kyoto local · usually within N hours"; at 24 h: concierge fallback offered; at 48 h: hold released | Routing proposes; **expert accepts** in their inbox; admin override only | `trip_expert_advisors` on accept; scoped items `routing_status: with_expert` |
| 3 Work | Scoped rows show the pen and "with [expert]"; unrouted items stay editable. Expert changes arrive as **suggestions on the row** (accept / decline; "accept all" for full service). Per-item thread + one trip thread | Workstation = the slip's `DayBlock`/`ItemRow` in edit mode with role expert, the slip's map with Add to Day N, plus the expert's tools (gaps from `validate-schedule`, energy, anchors), run history read-only | draft → in_review; suggestions are `expert_suggestions`, never direct writes |
| 4 Book (concierge scope) | Row chip: "Booking · [host]" → "Booked · confirmation" | Books in the traveler's name via the item's path (platform listing, affiliate booking request, or by hand); records confirmation on the item | traveler billed per booking before it is made; platform fee per band; an affiliate booking in the traveler's name is not a self-referred conversion |
| 5 Deliver | "Your plan is ready" + summary; Approve / Request changes (two rounds included); **auto-approves after 7 days** (R-s). Approve returns the pen on every scoped item | Marks delivered; blocked while a suggestion is open or an in-scope item is unbooked | **expert paid on approval**; delivered is terminal; a new ask is a new request |
| 6 Finalize | Trip Card born with the expert's notes, bookings and "Planned with [expert] · [neighbourhood]" in provenance | Card read-only; on-trip messages route to them if they accepted on-trip support (own fee) | `trip_finals.advisorId`, request id |

The traveler never loses: edits on unrouted items; paid optimizer runs (expert reads, cannot re-run); the ability to withdraw the request (R-t). **Transitional (until step 7):** write-status advisor rows granted by the legacy `request-revision` path can still write legs on a Ready Made copy (R300/R310 restrict this to owner + those advisors); step 7 converts the grant to suggestions (R-bd, L2-2) and no new grants are issued once it ships. Trust: expert changes on the Workstation go through the same `ItemRow` with role expert; nothing is written to the plan without the traveler's accept.

---

## 13. Proposal kit (Moment group) — rulings R-ae … R-an

The kit is a Moment-group lane after step 5; it reuses the surfaces above and adds no planning surface.

| # | Title | Ruling | Scope | When | Notes |
|---|---|---|---|---|---|
| R-ae | Proposal trip type | ratified (kit) | Moment | kit | three skippable intake questions; one Moment item; "a special moment" is the Moment anchor on any group (anniversaries, honeymoons) |
| R-af | The Moment card | ratified (kit) | Moment | kit | an `AnchorRow` with a backup; facts line per R-v; weather line within 10 days |
| R-ag | Backup spot and rain plan | ratified, pending source | Moment | kit, after a forecast source | commercial-licensed forecast (Open-Meteo paid tier or equivalent); key in deployment config by name; 10-day window |
| R-ah | Locked items ("Keep this") | ratified — **general** | all | built (342) | optimizer, re-times and redrafts respect locks |
| R-ai | Secrecy mode | ratified | Moment | kit, after share links | server-side projection by viewer role; API response and page source never carry the Moment; the Moment day's location hidden on the shared map and card |
| R-aj | Moment add-ons (interest only) | ratified (kit) | Moment | kit | `UpsellLine`s in interest-only mode; interest feeds recruiting priorities (photographers first) |
| R-ak | Run of show | ratified (kit) | Moment | kit | reuses the Event manifest's tool |
| R-al | Ask-a-local prompts on the Moment | ratified; persistence general | all / Moment | built (persistence); kit (prompts) | "Question saved" survives reload |
| R-am | Undo for destructive edits | ratified — **general** | all | built | 10 s inline Undo restores item, facts line and lock state |
| R-an | Proposal-aware drafting rules | ratified (kit); airport-row rule general | Moment / all | built (R-aa); kit | light Moment day; not on arrival/departure day; no duplicate airport rows |

---

## 14. Logistics — routing engine and logistics sources (R-ar … R-aw)

**Why core:** smoke 9 and 10 showed the gaps — stops that land on time but can't be reached, a departure buffer measured against the wrong time, airport legs with no minutes. The plan needs travel between stops during planning, not only after optimization.

**Two things, different rules.**

**14.1 Routing engine (computed, live, deterministic — R-ar, R-at, R-av).** `RoutingAdapter` interface, Google Routes as the first implementation (transit, walk, drive, with departure time); per-market plugs (NAVITIME / Jorudan for Japan rail detail and IC fares) behind the same interface when they earn their contract. For each pair of consecutive stops (and anchor ↔ first/last stop) it returns mode options with duration, line, fare when the source gives one, and provenance. Cache by (origin place ID, destination place ID, mode, hour bucket), shared across plans; a leg is computed once per city pair and reused. It runs at Optimize (the paid run computes every leg of each version), then on every change to an optimized, Trip Pass or expert-held plan — debounced, changed legs only (an edit touches at most two legs and one day's buffers), cache-first. It feeds: `LegRow`s on those plans ("18 min · walk", "24 min · Keihan line · ¥220 · Google · checked 4 Oct"; "via host pickup" under R-au; minutes in-plan only, R-h), the buffer check on `AnchorRow`s (real transit time to the airport once legs exist; the fixed buffer before), the paid `OptimizerLead` delta ("2 legs don't fit"), the optimizer's versions (R-av), and the Trip Card's live legs. **Free drafts get none of it** (R-e): the free `OptimizerLead` keeps its straight-line "est." findings as the reason to optimize. Config by name (R-bq, as built in R299): engine switch `TRAVEL_TIME_SERVICE_ENABLED`; per-caller `MAPS_ROUTES_DRIVE_ENABLED` / `MAPS_ROUTES_MODE_ENABLED` / `MAPS_ROUTES_TRANSIT_ENABLED` / `MAPS_ROUTE_MATRIX_ENABLED` / `MAPS_GEOCODE_ENABLED` / `MAPS_PLACES_TEXT_SEARCH_ENABLED`, each with `MAPS_*_DAILY_CAP` and a recorded cost `MAPS_*_USD_PER_1000` (the matrix keeps `TRAVEL_MATRIX_PRO_PRICE_PER_1000`); drive bills at Routes Essentials ($5/1,000, traffic-unaware), transit at Essentials, matrix transit elements at Pro ($10/1,000). Legs live in `transport_legs` (R-bp). Failed calls cost 0 and leave the connector thin. **Pricing is to be verified before the cap is set** — Routes is billed per request on a tiered basis; a settled 5-day plan is ~20 legs.

**14.2 Logistics sources (collected, confirmed — R-as, R-au, R-aw).** Transport data enters only through: the routing API; official feeds (GTFS, operator timetables and APIs — JR, Keihan, Hankyu, airport shuttle operators); affiliate APIs (Klook / Viator transfers); our own listings. Each is a registry source with licence class, `public_ok`, attribution and a checked date, like index sources. **No scraping**, no "where terms allow"; a scraped price is never bookable and never shown. Provider pickup/drop-off are listing fields proposed by an extraction pass over the provider's package text and **confirmed by the provider** before they go live, rendered "as described by the host"; a confirmed pickup turns a leg from "Book" into "your tea-ceremony host picks you up at Granvia". Freshness: legs re-checked at T-3 with the facts job and once on each trip day for the card; a changed leg is a banner finding.

**14.3 Where it shows.** Free slip: thin connectors, airport legs, straight-line findings. Optimize: real leg times build the three versions and `LegRow`s appear on the plan (the paid part); Trip Pass and expert handoff unlock the same. Trip Card: the plan's legs plus day-of re-check and "leave by"; finalized without optimizing → airport legs and an "Add travel times · Optimize" line. Fees: a booked transfer is a provider booking under the existing bands; no prices in item rows.

**14.4 Build.** Engineer builds the engine server-side from step 6 in parallel with Track A's steps 6–8: adapter, cache table (migration, held for ruling), `transport_legs` compute (R-bp), the registry entries for the first official/affiliate sources. Track A wires `LegRow`s on paid and expert-held plans (9a), optimizer consumption and re-checks (9b), options and booking (9c). The provider-field extraction and confirmation UI is a Content & Signals / engineer lane that starts now. Risks to hold: routing cost (cache + changed-legs-only + cap), trust in extracted fields (confirmation + label), and supply gaps the engine will expose (fill them — the private-car census item is the first).

---

## 15. Price ladder (R-bv)

Amounts are fee bands resolved by name; the figures below are the beta values travelers see today and are not literals for code.

| Tier | Includes | Offered where | For whom | Band |
|---|---|---|---|---|
| Free | draft, edits, locks, undo, Ask a local (interest), airport legs, straight-line findings, Finalize, Trip Card with Navigate deep links (R-bu), share / PDF / calendar | always | everyone | — |
| Ask AI task ($2.99 beta) | one AI task applied to the plan, charged on apply | rail, after a draft | a specific change without a full run | `ai_task` |
| Optimize ($5.99 beta) | three versions, versions board, apply by day, routed legs on the plan and card (R-e), 3 day re-times in 24 h (R-ac) | `OptimizerLead`, after a draft; again from the board | one plan, one run | `optimizer_run` |
| Trip Pass ($19 beta) | **per trip:** Optimize runs up to the cap (below), AI tasks included, service fee waived on bookings, routed legs, re-times unlimited within the 24 h rule | rail; offered after a first Optimize or a second AI task | a traveler iterating on one trip | `trip_pass` |
| Handoff — Polish / Book / Plan it all | §12; authorize at Ask, capture on accept | slip, item, leg | anyone wanting a local | `expert_*` bands |
| Concierge bookings | per booking, in the traveler's name | rows, legs, card | on-trip and pre-trip | `concierge_booking` + provider band |
| Ready Made Trip | the author's plan as a drafted copy with confirmed legs + one prepaid Polish revision + first Ask-a-local answer (R-bt, R-ba, R-bd, R-bj) | marketplace | buyers | `ready_made_trip` follows the expert band (25% beta, R-bc); no traveler fee on the purchase in beta (admin toggle); bookings from the copy carry the traveler fee |

**R-ac cap, for the founder's ruling with step 6** — options: (a) Trip Pass = 5 full Optimize runs per trip, re-times unlimited within the rule; (b) 3 runs per trip-day; (c) unlimited runs but a 2-hour cooldown. Recommendation: **(a)** — it beats two Optimize purchases on price, bounds model cost at ≤ 5 model runs per pass, and is explainable on the card ("4 runs left"). Trip Pass must always include at least two runs or it loses to buying Optimize twice.

---

## 16. Success gates per step (R-bx)

Measured weekly per city and group from `feedback_events` and the instrumentation events; thresholds are starting points for the founder to tune, not launch blockers.

| Step | Working means | Signal |
|---|---|---|
| 1–3 | drafts are kept, not abandoned | ≥ 60% of drafts edited after draft (lock, swap, add) |
| 4 | the preview earns the run | `preview_shown` → Optimize ≥ 8% of drafted plans with ≥ 1 finding |
| 5 | versions get used | ≥ 70% of paid runs adopt ≥ 1 day; `post_optimize` "other" ≤ 25% |
| 6 | plans become trips | ≥ 30% of drafted plans finalized; `post_trip` great+fine ≥ 70%; zero "ready vs not final" mismatches |
| 7 | handoffs complete | expert accept within 24 h ≥ 80%; approval (incl. auto) ≥ 90%; withdrawals ≤ 10% |
| 8 | entry converts | Experiences entry → drafted plan ≥ 40% |
| 9 | legs are trusted | leg mode swaps ≤ 20%; T-3 leg changes acted on ≥ 50% |
| 10 | upsell is welcome | `upsell_line_added` ≥ 5% of impressions; dismiss ≤ 60% |
| R-bw | stamps are seen | stamped facts on public pages; stamped stops kept in drafts above unstamped |
