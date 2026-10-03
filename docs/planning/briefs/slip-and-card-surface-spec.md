# Trip Slip & Trip Card — Surface Spec v1.2 (ratified)

**Written 2026-10-03 by the principal architect for Leon Dixon; rulings ratified by Leon the same day.** Companion canvas: "Trip Slip Redesign" (Design artifact, 11 artboards). Sources: smoke tests 4 and 5 on production builds 7bdc221 / f01311a; Track A's component inventory of `client/src/` at f01311a; `UNIFIED_PLANNING_FLOW_SPEC_v2`, `UPSELL_ENGINE_AND_SERVICE_TAXONOMY_SPEC`, `TRANSPORT_COMMERCE_LAYER_BUILD`, `SELECTION_CONTROL_MODEL_SPEC_v2`, `EXPERT_WORKSPACE_SPEC`, content sourcing brief 2026-09-29, handoff pack 2026-09-27 (§M anchor-centric building, §N run records).

**Purpose.** Specify the two traveler surfaces once, so they are built once: the Trip Slip (`/plans/:tripId`, planning) and the Trip Card (`/trip/:id`, living with the plan), plus the Experiences entry that configures the slip and the expert/concierge handoff that shares it. Every group (Trip, Moment, Celebration, Hosted event, Group travel) uses the same surfaces; a per-group manifest changes vocabulary, anchor, time unit and tools. Nothing in this spec adds a planning surface.

---

## 1. Rulings (all ratified 2026-10-03 unless marked existing)

| # | Ruling |
|---|---|
| R-a | Lodging is optional; recommended after the draft, never asked before it (2026-10-02) |
| R-b | The template page is the **entry**; the slip is the **only** planning surface; Browse is a map layer on the slip; `cart_items` is checkout-only |
| R-c | One `ItemRow` (edit / read+booking modes), one `DayBlock`, one `LegRow`, one `ExpertNote` |
| R-d | One map component with two layers (plan, supply); versions are a toggle on it |
| R-e | Transport is post-optimization — **except the airport ↔ lodging legs** (R-i) (existing rule, amended) |
| R-f | Free optimizer preview shows findings and deltas, never the rearranged plan (existing, G4) |
| R-g | Social-proof copy only from real outcome counts ≥ 20 plans and ≥ 40% share (admin-configurable); otherwise expert-endorsement or template-rule phrasing |
| R-h | Public content never prints Google-restricted travel-time values; in-plan display is allowed (existing) |
| R-i | Airport ↔ lodging legs are computed as soon as a flight anchor and a lodging anchor both exist; the only `LegRow` on a draft |
| R-j | Flight data: schedule API queried by flight number (AeroAPI or AeroDataBox; key in deployment config; one lookup per flight entered, cached on the anchor, daily cap); search stays on Travelpayouts; booking-in-name waits for a booking API (Duffel / Kiwi) and bookings; **no scraping** of Google Flights or any site |
| R-k | Places lookups stay at `PLACES_LOOKUPS_PER_DRAFT = 12` for the beta |
| R-l | The optimizer fee stays visible on the lead card; per-item checkout buttons do not appear on a draft |
| R-m | "Ask a local about this" shows on every item before any expert is live; it opens the expert door |
| R-n | Handoff: the expert **accepts** the match (admin override only); expert is paid on **traveler approval**, not on deliver; expert changes are **always suggestions** the traveler accepts, with one-tap "accept all" for full service |
| R-o | Lodging in the anchor panel ranks by plan-fit first; **within a plan-fit band, platform-listed stays rank above affiliate stays**; revenue never moves a stay out of its band; platform stays carry a "Traveloure stay" badge and book on-platform at the `accommodation` band; affiliate stays book through the concierge in the traveler's name or deep-link |
| R-p | Facts from `official` license-class sources with `public_ok` set at the terms check (hours, closure, ticketing_rule, transit, event) may appear on public pages with "from <source> · checked <date>" and a link; descriptions and tips stay plan-only until expert-verified; editorial and partner sources stay plan-only until verified (PR #1249, migration 341) |

---

## 2. The surfaces

### 2.1 Experiences entry — `/experiences`
"What are you planning?" → five groups, each line naming its anchor; Show/Festival featured on top using seeded `city_events`. Then Where · When · Who → the slip opens empty. `experience-template.tsx` (3,728 lines; three features that can never open; a map mounted three times; its own cart) is retired in stages (§10). Selection controls survive as the Browse layer's filters.

### 2.2 Trip Slip — `/plans/:tripId`
States: **empty** → **drafted** → **compare** → **optimized** → **with expert** (§12) → **finalized** (Trip Card born; slip reopenable).

Layout, phone-first: header (name · dates · day count · party · AI-draft disclosure with facts-checked count) → tools tray (manifest chips; "Getting there" first for Trips) → optimizer lead (§8) → anchor panel (only while the anchor is open and the plan meets the group's threshold) → Days / Map switch → `DayBlock` list (first day expanded) → sticky Share / Finalize. Desktop: tray and optimizer lead become the right column.

### 2.3 Slip map
`MapControlCenter`, one instance, two layers. **Plan layer:** numbered stops for the selected day, straight connectors (routed when A8 is on), anchor marker always visible, neighbourhood shading while the lodging panel is open, moved/dropped marks under a version. **Browse layer:** hosts, providers, partner inventory around the plan; Add writes `itinerary_items`. Draft/A/B/C toggle redraws the day. Bottom sheet lists the day's stops, selection synced.

### 2.4 Versions
4a choose: three cards, one badge each only where the metric wins, per-day change summary, Adopt all / By day. 4b phone compare: day selector; A/B/C snap-scrolling columns; identical days collapse to "same as draft"; Take this day; pick strip; Apply. 4c desktop: four columns A / B / C / **Your plan**; **the day is the draggable unit across versions** (times, legs, facts travel with it); stops reorder only inside a day in Your plan and that day re-times itself within the free re-run window; a stop dragged in from a version is a swap-in that triggers the same re-time. Adopt never deletes the draft; runs are immutable (§N).

### 2.5 Trip Card — `/trip/:id`
Renders the `trip_finals` snapshot read-only plus the live overlay. Hero · provenance ("Finalized Oct 3 · built from Version A, run 1 · planned with [expert] · hours re-checked Nov 8 · 3 of 24 booked") · Reopen · day strip with **Today** first · map thumbnail with Navigate · today's `ItemRow`s in read mode with booking state and host/expert notes · `LegRow`s live · Tonight/Tomorrow slot (§7.4) · bookings list. No planning controls.

### 2.6 Public surfaces (Discover, city pages, gem cards, blog)
Read only `isPublishable` content: platform listings and hosts, gems, expert-verified nuggets, seeded events, TravelPulse signals, blog posts, and — under R-p — official-source facts with attribution. Today only the blog's event posts render `place_facts`; city pages and gem cards rendering publishable facts with the same attribution helper is a registered follow-up, not part of the §10 order.

---

## 3. Component contracts (one renderer each)

**`ItemRow`** — props: item, facts (address/hours/location with `checkedAt`), mode `edit | read`, role `traveler | expert`, bookingState, routing (`own | with_expert`), expertNote?, suggestion?, upsell?. Edit: time · title · place line (ward/area unless a Google-checked address exists) · facts line verbatim ("Wed · Open 24 hours · Google Maps · checked 2 Oct") · optional second facts line for ticketing / transit / closure facts with their source ("Timed entry · sells out ~1 week ahead · from <source> · checked 3 Oct") · expert note · pending suggestion (accept / decline) · ⋯ (Swap · Move · Remove · Ask a local about this · Find a host · Book this for me). Read: same minus ⋯, plus booking chip (No booking needed / Booking · [host] / Booked · confirmation / Awaiting host) and Message host. Replaces `SlipItemRow`, `ActivitiesSection` rows, workstation `ItemsEditorPanel` rows, the `SlipItemTools` second copy.

**`DayBlock`** — header (weekday · date · N stops · areas · hours on K · notes count · "with [expert]" when routed) · `ItemRow`s with `LegRow`s between them once legs exist (airport legs from the start) · Add / Swap. Collapsible. Moments render one block with hours as the unit.

**`LegRow`** — between two rows: mode icon · duration (in-plan only) · "leave by" · mode swap (persists `userSelectedMode`) · Book this leg → per-leg options (platform private first when it fits route/time/party, affiliate fill). Draft: thin connector only, except airport legs.

**`AnchorRow`** — a fixed point in the day (flight, reservation, venue, ticketed show): time · title · "Anchor · fixed · from <tool>"; immovable in drags and re-times.

**`ToolsTray`** — chips from `shared/group-manifest.ts` (§4); each opens a sheet mounting the existing tool. The rail stops mounting them all.

**`AnchorPanel`** (was WhereToStayPanel) — anchor-type aware; ranking computed once per draft and stored; reason line only when it distinguishes; own inventory only, ordered per R-o; "Hotels coming soon" when none; Compare · I've got it sorted · Skip. The legacy inline lodging card is removed.

**`OptimizerLead`** — §8. **`SupplySlot`** — a generic item renders as a slot with "Find a host" (Browse filtered by category and day, expert-endorsed first). **`ExpertNote`** — one implementation, under the item it concerns, author + neighbourhood, "Ask a follow-up" → `ItemComments`. **`UpsellLine`** — §7.2. **`TonightSlot`** — §7.4. **`HandoffBanner`** — §12.

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

---

## 5. Flights and transport

**Flights are anchors, not products.** "Getting there": enter a flight number and date → schedule API (R-j) → `temporal_anchors` `flight_arrival` / `flight_departure` with buffers → `AnchorRow` on day 1 / last day. Searching and pricing flights stays on Travelpayouts (`FlightPriceGrid`, deep-link, affiliate margin). Booking in the traveler's name waits for a booking API; the concierge books by hand until then. No live flight status on the card until the same API is polled on travel day (phase 2).

**Airport ↔ lodging legs (R-i):** computed when both anchors exist; platform private car first when it fits party size, then rail/affiliate transfer; bookable from the draft; re-surfaced at T-3 days.

**All other legs:** after optimization, `transport_legs` server-side → `LegRow`s; mode swap; Book this leg; finalize → `activate-transport`; checkout last-mile row ≤ 2 items, never blocking. Booking is concierge-style (bill first, book in name); affiliate legs deep-link or agent booking request.

**Dependency:** `findTransportProviders` / `findAffiliateTransportOptions` state to be confirmed by Track A before build step 9.

---

## 6. Place facts and index-site content

Address only from a Google-checked fact, else ward/area. Hours with weekday and "checked <date>"; T-3-days re-check job refreshes them. Client refetches when lookups land; "checking hours…" meanwhile. Allocator: cap 12, named-first round-robin; if a day's first attached lookup has no hours fact, that day's next named item is tried next. On attach, the item title takes Google's `displayName`.

Registry (index-site) content surfaces only as facts on items, by need: `stop.hours`/`closure` on the facts line; `stop.ticketing` on the second facts line and as an `OptimizerLead` finding; `transport.*` on `LegRow`s and Moment's "Getting home"; `event` as an `AnchorRow` or the events strip; `neighbourhood` as the one-liner under each `AnchorPanel` option; `practicalities` on the Trip Card's arrival day; `dining` on dining items. Every fact renders with source and "checked <date>", links out, never exceeds the quote cap, and ranks by origin (platform-native → verified → Places → crawled → traveler note). The free path reads cache + Places; fresh registry fetches happen inside paid runs and expert actions.

---

## 7. Upsell

### 7.1 Principles
Relevance dominates; revenue reorders only within a band (cap 15%); expert endorsement raises relevance; transport suppressed until optimization except airport legs; ≤ 1 `UpsellLine` per item, ≤ 2 in the `TonightSlot`, ≤ 1 push per plan per 48 h; attribution stamp on every impression; never a modal, never on the map, never on the slip mid-trip.

### 7.2 Selection-based — `UpsellLine`
Trigger: a selection event (item added, option chosen, version adopted, leg booked) with ctx `{ group, templateKey, item category, day/time, party composition (adults/children/mobility from Travel party), anchor, stage }`. Render: one dismissible line under the selected row — `<phrase>: <service> · from <price> · Add`. Phrases (R-g): counted social proof ("Travelers with kids usually add an evening sitter here") only above threshold — **off at launch, lights up as outcomes accrue**; expert endorsement ("A Gion local recommends…") wherever an expert exists; template rule ("Evening plans with children usually need a sitter") now. Never "most people" without the count. Data: `inventoryForContext` → eligibility → scoring → blend → cap; nightly co-occurrence rollup keyed by (group, item category, party class, time band) → service category, counts only.

### 7.3 Needed and missing
Party composition into engine ctx; the co-occurrence job and table; confirm `expertEndorsedKeys` write-back is wired.

### 7.4 On trip — `TonightSlot` (`plancard_ontrip`)
Bottom of today's `DayBlock` on the card; ≤ 2 candidates by trigger: empty evening, cancellation/weather (expert on call), arrival day (transfer), day before departure, a stop with a host. Concierge tasks are a button on the day, per-task fee. Push morning-of, ≤ 1 per 48 h.

---

## 8. Optimizer preview — `OptimizerLead`

Replaces the score blurb. "What Optimize found in this draft" — computable now without A8: stops reached after closing / before opening (draft times vs stored hours), timed-entry conflicts with anchors, days that cross the city more than once (straight-line, "est."), km of walking saved by re-sequencing, days over the pace preference. With A8: minutes in transit saved. Cost delta only when ≥ 1 priced item exists; otherwise omitted, never estimated. Up to three findings with counts · one delta line · fee and CTA (visible, R-l) · "three versions built around where you stay". After payment the same card shows the realised before→after delta.

---

## 9. Data flow slip → card, and jobs

Finalize writes `trip_finals`: items with facts and `checkedAt`, anchors, legs, per-day `{run_id, variant}`, expert notes, `advisorId` + request id. Versioned; Reopen → slip; refinalize appends. Jobs (registry, engineer's domain): `facts-recheck` at T-3 days per trip; `cooccurrence-rollup` nightly; `flight-status` on travel day (phase 2); all heartbeat-stamped via the external cron path. Instrumentation (handoff Part 4 events) gains: `upsell_line_shown/added/dismissed`, `tonight_slot_shown/acted`, `preview_shown` with findings counts, `leg_booked` with source, `handoff_requested/accepted/suggestion_accepted/approved`.

---

## 10. Consolidation and build order

| Keep (one) | Delete / retire |
|---|---|
| `ItemRow` | `SlipItemRow`, row rendering in `ActivitiesSection`, workstation `ItemsEditorPanel` rows, `SlipItemTools` duplicate form |
| `DayBlock` | per-surface day grouping (slip, card `DaySelector`, workstation) |
| `ExpertNote` | `ExpertNoteBlock` + inline block in `ActivitiesSection` |
| `MapControlCenter` (2 layers) | `ExperienceMap` ×3, `LeafletPlanMap`, `ProposalComparisonMap` |
| `AnchorPanel` | legacy inline lodging card; `SlipLodgingEntry` as a separate surface |
| `ToolsTray` + manifest | rail mounting every logistics component |
| Experiences entry | `experience-template.tsx` planning features, dead Sheets/dialogs, template cart UI |
| checkout basket | `cart_items` as a planning store |
| one expert door, one `expert_requests` route | template page's four expert surfaces; `HireExpertDialog` and `FinalizeBookingModal` request paths; 5-stage status pill |

Order (each a PR with a gate; Track A owns; ledger row per PR):
1. `ItemRow` + `DayBlock` + `ExpertNote` + `AnchorRow` on the slip; card unchanged → visual-parity test against the smoke-5 plan.
2. `ToolsTray` + `group-manifest.ts`; rail stops mounting tools; "Getting there" with the schedule API behind `FLIGHT_LOOKUP_ENABLED`.
3. `AnchorPanel` consolidation (completes the smoke-5 lane); R-o ordering; airport `LegRow` (R-i).
4. `OptimizerLead` with the computable findings.
5. Map layers + versions toggle; retire the other maps. 4c desktop drag-and-drop (day unit).
6. Trip Card on the same rows; provenance; Today-first; `facts-recheck` job (engineer registers it).
7. Handoff (§12): expert-accept, suggestions, approval-paid; Workstation mounts the slip's rows; one request route.
8. Experiences entry; retire template planning features; Browse layer takes selection controls; `cart_items` checkout-only.
9. `LegRow` + per-leg booking once transport resolvers exist (state confirmed first).
10. `UpsellLine`, `TonightSlot`, co-occurrence job, party composition in ctx.

Registered follow-ups outside this order: city pages and gem cards rendering publishable facts (§2.6); flight status on travel day.

---

## 11. Ratification record
R-b, R-c, R-d, R-k, R-g threshold, R-l, R-m, R-n ratified per recommendation; R-i ratified; R-j ratified as "schedule API, no scraping"; R-o ratified ("platform lodging leads within plan-fit band"); R-p ratified and built in PR #1249 — Leon, 2026-10-03.

---

## 12. Handoff to an expert or concierge

**Model: the slip doesn't move, the pen does.** One plan; handoff changes who holds the pen on which items; the traveler watches the same slip throughout. No copy, no separate expert plan, no bundle to merge back.

| Step | Traveler's slip | Expert / concierge | State and money |
|---|---|---|---|
| 1 Ask — "Hand off to a local expert" (slip) or "Book this for me" (item, leg, or whole plan) | Chooser: *Polish my plan* · *Book these for me* · *Plan it all*; scope = items ticked; fee shown before confirming | — | one `expert_requests` row with scope; fee band resolved; **traveler billed now** |
| 2 Match | `HandoffBanner`: "Finding your Kyoto local · usually within N hours" | Routing proposes; **expert accepts** in their inbox; admin override only | `trip_expert_advisors` on accept; scoped items `routing_status: with_expert` |
| 3 Work | Scoped rows show the pen and "with [expert]"; unrouted items stay editable. Expert changes arrive as **suggestions on the row** (accept / decline; "accept all" for full service). Per-item thread + one trip thread | Workstation = the slip's `DayBlock`/`ItemRow` in edit mode with role expert, plus the expert's tools (gaps from `validate-schedule`, energy, anchors), run history read-only | draft → in_review; suggestions are `expert_suggestions`, never direct writes |
| 4 Book (concierge scope) | Row chip: "Booking · [host]" → "Booked · confirmation" | Books in the traveler's name via the item's path (platform listing, affiliate booking request, or by hand); records confirmation on the item | traveler billed per booking before it is made; platform fee per band; an affiliate booking in the traveler's name is not a self-referred conversion |
| 5 Deliver | "Your plan is ready" + summary; Approve / Request changes (existing approval banner). Approve returns the pen on every scoped item | Marks delivered; blocked while a suggestion is open or an in-scope item is unbooked | **expert paid on approval**; delivered is terminal; a new ask is a new request |
| 6 Finalize | Trip Card born with the expert's notes, bookings and "Planned with [expert] · [neighbourhood]" in provenance | Card read-only; on-trip messages route to them if they accepted on-trip support (own fee) | `trip_finals.advisorId`, request id |

The traveler never loses: edits on unrouted items; paid optimizer runs (expert reads, cannot re-run); the ability to withdraw the request (fee by stage, same tiers as cancellations). This closes the audit's P1 gaps: silent "Send to expert", stranded routing, deliver-pays-without-return, finalize promising a booking the machine can't make.
