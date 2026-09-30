# Golden path — Trips, Kyoto (vertical slice, Part 1)

> **Target:** ten real Kyoto travelers using the Trips slice in November 2026.

**Status:** DESIGN ONLY. HARD STOP after this part — no code, no migration, no data change until ratified.
**Build order:** superseded by Track A (Part 3, not yet written). The product map is the TARGET architecture; this
document names what the slice needs from it and in what order a traveler meets it.
**Code base:** `origin/main` @ `c99acfa8b`. The product map's own `path:line` citations are on `da3174289`; where the
code has moved since, this document says so (see "Where the map and the code disagree", end of Appendix B).
**Sources:**
- `docs/planning/trip-slip-product-map.md` — §B2 groups, §C modules (C1 BASIC B1–B7, C2 STANDARD S1–S9, C3 ADVANCED
  A1–A8), §E compare options, §F optimized versions, §I rulings, §K information levels, §L ingredient inventory.
- `docs/planning/kyoto-supply-reality-check.md` (branch `origin/claude/kyoto-supply-check`, Part 5) — local numbers
  only; the production census is pending.
- `CLAUDE.md` Locked Decisions 30, 33, 41, 42 (D2, D8, D9, D18), 45, 56, and the §13 honesty posture.
- The vertical-slice brief (`docs/planning/briefs/vertical-slice.md`) is **not on this checkout**; its intent is
  restated in the target line above and in the step order below.

**Levels** are §K's three depths: **GLANCE**, **PLAN**, **DETAIL** (K1 rules bind every step; K2 = plan-level fields,
K3 = item fields, K4 = detail views, K5 = the single-custom-venue anchor rule). **Markers:** **EXISTS** (seen in code,
file named) · **PARTIAL** · **NOT BUILT** (nothing in code; never implied otherwise).

**The traveler:** signed in, five days in Kyoto in November, no hotel booked, two or three in mind. Occasion `travel`
(Trips group, §B2 step 3: `range` + no guests ⇒ anchor = hotel, lodging needed). Phone first: every step is described
at 375px before desktop.

---

## Prerequisites (Track A step 0 candidates)

Decision-maker ruling (Sep 27, 2026): **do not wait for the production census.** Each supply gap below is a named
prerequisite, labelled **pending production census**. The local numbers are Part 5's development-database run and are
not production supply.

### P-1. Supply (all pending production census)

| # | Prerequisite | Why the path needs it | Local (dev DB, Part 5) | Instrument |
|---|---|---|---|---|
| P-1a | **Kyoto hotels in `hotel_cache` with coordinates** | `loadRankedAnchors` (`server/services/anchor-candidates.ts`) is the only hotel source the anchor scorer reads (`hotel_cache.city ILIKE '%<first comma-segment of destination>%'`, limit 60). No rows ⇒ step 2 has nothing to offer from the catalog. | **0** | `scripts/report-kyoto-supply.cjs` "Hotel anchor candidates" |
| P-1b | **The cache is actually refreshed for Kyoto** | The only live writer is the Booking.com refresh (`server/services/cache-scheduler.service.ts` `refreshBookingComHotels`; Kyoto is in `SEED_DESTINATIONS`) → `booking-com.service.ts` `upsertHotelsToCache`. It needs `BOOKING_COM_AFFILIATE_ID` / `BOOKING_COM_API_KEY` (operator secrets). The Amadeus writer (`cache.service.ts` `cacheHotels`) has no caller (Amadeus dropped, ledger row 34). | — | Operator check: secrets set; a refresh log line naming Kyoto |
| P-1c | **One bookable Kyoto listing** for the one booking and the one cancellation: live (`active` + `approved`), a price, a future open slot, a cancellation **tier**, and a mode that resolves to `instant` | Checkout refuses a listing whose `resolveBookingMode` (`shared/schema.ts`) answers `request` (409 `listing_requires_request`, ledger `2026-09-25-checkout-request-mode`). Production measured 64 of 67 active listings at `platform_default` ⇒ `request` (ledger `2026-09-11-oc-a1-ratified`). With no tier, a cancellation refunds on the flexible default — honest, but not the path we want to prove. | 0 with a future slot; 0 with a tier; 0 stays (`can_anchor` 0) | census "Live field coverage" |
| P-1d | **Day-plan supply** (tours, dining, activities) with coordinates | Plan-fit (step 3) and gaps (step 5) need located items. Local live Kyoto supply is mostly celebration vendors. | 28 live, 27 at `neighborhood_centroid`, 0 `exact` | census "Listings by category" |
| P-1e | **Experts** (optional to this path) | Only if a Kyoto traveler asks a local to check the plan (A8). Not on the self-serve golden path. | 4 approved, 2 with a handle, 1 verified neighbourhood | census "Expert applications" |

**Production fact already known (Part 5):** `service_bookings` has **zero rows** on production, so every booking step
below is unexercised there.

**If P-1a/P-1b stay empty,** Part 5 names the two routes: refresh the cache from the hotel provider, or let the traveler
add a hotel as a `custom` option (§E2 `source_kind = custom`, typed title + location). Step 2 below keeps `custom` as
the fallback, so the path does not depend on the cache — but plan-fit (step 3) then needs a located pin the traveler
confirmed (LD 22 posture: never geocoded by guess).

### P-2. NOT BUILT modules the path depends on

| # | Module (§C) | Needed by | What exists instead |
|---|---|---|---|
| P-2a | **S1 Compare options** — `plan_option_sets` / `plan_options` + six rails (§E2, approved R124 `2026-09-26-plan-option-tables`) | Steps 2, 3, 4, 7 | Nothing. `grep plan_option_sets` finds no table, route or client. |
| P-2b | **S2 Anchor** as a slip module (anchor question, anchor pin, travel-time labels) | Steps 2, 3 | `BuildAroundDialog.tsx` + `GET /api/trips/:id/anchor-candidates`, reachable only from Optimize |
| P-2c | **R126 held slot** in the free draft (`2026-09-26-open-sets-not-non-empty`) | Step 4 | Draft runs only on a bare-empty slip (`ai-draft-eligibility.pure.ts`); no held-slot input exists |
| P-2d | **B4 Completeness** and **S3 Suggestions** (engine on the slip) | Step 5 | Browse services, saved places, the add rail |
| P-2e | **A1 delta (§F2):** option picks per version (`metadata.optionId`), earned badges (R128), `POST …/adopt-stops` | Step 6 | Three versions + baseline, apply-to-trip, adopt-stop (one) |
| P-2f | **B7 open-set refusal** (R125 `2026-09-26-finalize-refuses-open-sets`) and **S5 Bookings section on the slip** | Step 7 | `FinalizeBookingModal`; cancel lives on My Bookings |
| P-2g | **Optimizer run records** (Part 2 N, pending) | Step 8 | `lastComparisonId` — one link to the latest board |
| P-2h | **`experienceGroupFor`** + module frame (map step 1) | Every step (group decides which modules draw) | None; the slip draws every zone for every plan |

**Ordering consequence, stated once because it shapes the whole slice:** today the only way to hold three hotels on a
plan is three `itinerary_items`. Three items make the slip non-empty, and the free draft is then refused (409
`slip_has_items`, LD 41 (b)). So **steps 2 → 4 in this order are only possible once S1 lands** — an open option set does
not make the slip non-empty (R126). Without S1 the traveler must draft first and add hotels after, which loses "built
outward from the hotel set".

---

## The path

### Step 1 — Entry and the occasion

- **Traveler (375px):** taps "Plan a trip" on the home hero (or a Kyoto city card). The one planning modal opens full
  screen: Occasion → Where → When → Who (step 5 hidden — `travel` has `default_schedule` off). Picks **Travel**, types
  "Kyoto, Japan", sets five dates, skips Who or states two adults, finishes with **"Plan it myself"** or **"Plan with
  AI"**. Lands on `/plans/:tripId`. Header at GLANCE: "Kyoto · Nov 12–17 · 2 travelers", the occasion's own name, the
  time zone.
- **Module:** B1 Plan header (the mint behind it is LD 33's one modal, not a §C module).
- **Level:** GLANCE (K2: title, occasion name, dates, time zone, party).
- **Today — EXISTS:** `client/src/components/trip/plan-modal.tsx` (test ids `plan-modal`, `option-occasion-<slug>`,
  `input-etp-destination`, `input-etp-start-date`, `planning-option-myself|ai`); door/step logic
  `client/src/lib/plan-steps.ts` (`resolvePlanSteps`); opener `client/src/contexts/PlanningContext.tsx`; mint
  `client/src/lib/trip-slip.ts` (`mintTripSlip`). A city card passes `{ city, country }` (LD 42 D14). `ai` mints first,
  then drafts into the plan (LD 42 D5, amended `2026-09-24-rc1-finish-mints`).
- **Gap — NOT BUILT:** `trips.experience_type_id` is not declared (LD 42 D1; still absent from `shared/schema.ts`), so
  the slip resolves the occasion through the lossy `event_type = vacation` lookup; `vacation` resolves to the Trips
  group only through R132's group-level rule, which is not built (P-2h). The group is internal and never rendered (R127).
- **Server truth:** `POST /api/trips` → `storage.createTrip`. `trips.timezone` is server-derived to `Asia/Tokyo` via
  `resolveTripTimezone` (Kyoto is in `MARKET_TIMEZONES`, LD 30); `market_slug` = `kyoto` (LD 42 D12);
  `dates_confirmed_at` is stamped because the traveler chose the dates (`datesChosenByTraveler`, LD 30 amendment).
  §13: an untouched Who step saves NULL, never "2"; the header then says nothing about party size.
- **Money:** none.

### Step 2 — The anchor question, and adding 2–3 hotels

- **Traveler (375px):** the Trips lead zone (§D: "Day list with the hotel anchor") opens with one question card:
  **"Where are you staying?"** Three answers: *I've booked* (one hotel → the anchor), *I'm deciding* (open a comparison),
  *Not sure yet* (dismiss for now). "I'm deciding" opens a sheet listing Kyoto hotels from the catalog (name,
  neighbourhood if stated, rating if stated) plus "Add one that isn't listed". The traveler ticks up to three; the card
  collapses to one line at GLANCE: **"Where you'll stay · 3 to compare"**.
- **Module:** S2 Anchor & travel time (the question) + S1 Compare options (the set; §J `travel` compare default =
  `accommodation`).
- **Level:** GLANCE (K2 Trips row "the hotel anchor's name"; K2 "Open option sets — 2 choices to make"), PLAN (the slot
  shows its set), DETAIL (the compare view, step 3).
- **Today — PARTIAL:** hotel candidates exist only inside Optimize: `client/src/components/plancard/BuildAroundDialog.tsx`
  → `GET /api/trips/:id/anchor-candidates` (`server/routes/trips.routes.ts`) → `loadRankedAnchors`. A separate hotel
  search component reads `hotel_cache` (`client/src/components/hotel-search.tsx` → `GET /api/cache/hotels`,
  `server/routes/content.routes.ts`), mounted on the experience-template page only.
- **Gap — NOT BUILT:** the question card (no "Where are you staying?" string anywhere in `client/`, `server/`,
  `shared/`); `plan_option_sets` / `plan_options` and `POST /api/trips/:tripId/option-sets`, `…/options` (P-2a);
  **a `hotel_cache` source kind** — §E2's `source_kind` set is `incumbent | listing | affiliate | saved_place | custom`,
  and `hotel_cache` is none of them (it is not `affiliate_products`, and K3 notes items have no FK to it). See Appendix B
  Q3.
- **Server truth:** the option's title, coordinates and any price are server-copied from the source row (§E2 admission,
  §14); the client sends an id. `price_snapshot` is display only and never charged. A `hotel_cache` row carries no price
  at all ⇒ price is **omitted**, never "$0" (K1 rule 1). An open set is not an item: it never reaches the cart, the
  optimizer baseline or the free-draft count (§E1, R126). A hotel from `hotel_cache` is partner inventory (Booking.com);
  its URL never reaches the client (§16).
- **Money:** none. Adding and comparing is free (§C S1).

### Step 3 — Plan-fit per hotel, and how it reads on a phone

- **Traveler (375px):** each hotel in the set is one stacked card (no side-by-side table under 640px): name, then one
  fit line — **"est. 14 min walk (median) to 6 of 9 located stops"** — then rating and neighbourhood when stated. Tap
  opens DETAIL: stops within a 15-minute walk, how many stops are unlocated and excluded, and the "straight-line
  estimate" label. Swipe between the three. On desktop the same cards sit in three columns.
- **Before any items exist** (right after step 2) every hotel is unscorable. The card says **"Add a few things to your
  days to see how each hotel fits"** — never "0 min", never a rank.
- **Module:** S2 (fit derivation) inside S1's compare view (§E4 `accommodation` row).
- **Level:** PLAN (one fit line per option), DETAIL (K4 compare view; §E4 attributes).
- **Today — PARTIAL:** the scorer exists and is §13-honest: `server/services/anchor-scoring.ts` `scoreAnchor` returns
  `medianMeters` (null when no located stop), `within15MinCount`, `estMedianWalkMinutes`, `locatedStops`/`totalStops`;
  unscorable anchors sink, never score 0. `BuildAroundDialog` renders "N min median" with the tooltip "Estimated walking
  time from straight-line distance at 80 m/min" and the empty line "No hotels scored near your stops yet".
- **Gap — NOT BUILT:** scoring a traveler's *chosen* options (today it ranks the whole `hotel_cache` slice for the
  Optimize pin); the compare view (§E4); a travel-time matrix (brief phase 2) — until it exists every figure is
  straight-line and labelled **"est."**.
- **Server truth:** one server derivation per option (the client computes nothing, §E4). Unlocated stops are excluded
  and counted ("6 of 9 located"), never guessed (LD 22). No transit claim: Kyoto's buses and the Keihan/Karasuma lines
  are not modelled, so the line says "walk (est.)", not "travel time". Neighbourhood-centroid pins (Part 5: all local
  listings) make the estimate coarser; DETAIL says the pin is approximate (`location_precision`).
- **Money:** none.

### Step 4 — The free first draft, built outward from the open hotel set

- **Traveler (375px):** the Build card (below the day list on a phone once map step 1 lands — today it stacks above,
  `SlipView.tsx` `order-1 lg:order-2`) offers **"Draft it with AI"**. Five days fill with a sketch: morning, afternoon,
  evening per day, each item tagged "AI draft". No hotel item is added — the "Where you'll stay" slot stays open with its
  three options untouched. The fit lines from step 3 now have stops to score against and update.
- **Module:** B5 First draft (+ R126 held slot).
- **Level:** PLAN (days and items, K3 common row fields; origin chip "AI draft", LD 42 D23).
- **Today — EXISTS for the empty-slip draft:** `slip-action-draft-ai` (`SlipRail.tsx`) → `slipBuildAiAction`
  (`client/src/lib/slip-rail.ts`) → `POST /api/ai/generate-itinerary` (`server/routes/content.routes.ts`); server
  refusal `slip_has_items` (`server/services/ai-draft-eligibility.pure.ts`, bare count of `itinerary_items`). Items born
  `origin='ai'`.
- **Gap — NOT BUILT:** the held slot (the generator has no input for "a slot the set holds; do not fill this
  category") and any use of the set's hotel locations to shape the days (P-2c). **Tension to rule (Appendix B Q2):**
  LD 41 (c) says the sketch has "no anchor"; R126 says the draft builds *around* open sets but never chooses. "Outward
  from the hotel set" needs a sentence saying whether the set's located hotels may be passed as a geography hint.
- **Server truth:** the draft never picks, closes or chooses a set (R126); a test pins that the set stays `open` with
  its options untouched. "Empty" stays the bare item count (R126). The draft may run a cheaper model tier; no surface
  names the engine (LD 41 (c)); the call writes `ai_cost_tracking`.
- **Money:** free (LD 41 (b)). The only free AI write.

### Step 5 — Gaps and suggestions fill the days

- **Traveler (375px):** GLANCE line under the header: **"2 of 3 essentials"** (accommodation open, the others covered).
  Each day with a thin afternoon shows a gap card ("Day 3 afternoon is open") with **See options**, listing Kyoto
  listings, saved places and partner activities in that category, each with Add to plan. Sticky day chips (Day 1 … Day 5)
  jump between days; an item's menu has "Move to day…".
- **Module:** B4 Completeness, S3 Suggestions, S4 Move & jump to day, B2 Days & items.
- **Level:** GLANCE (K2 "N of M essentials"), PLAN (per-day gap cards; item rows), DETAIL (K3 activity/dining fields).
- **Today — PARTIAL:** add / edit / delete / reorder on the slip (`POST /api/trips/:tripId/itinerary-items`, owner
  only per LD 42 D16); "Browse services" (`slip-browse-services`) into the marketplace with the plan's id; saved places
  in the plan's city (`SlipSavedPlaces.tsx`, LD 55); Ask AI (`AskAiDrawer.tsx`, paid, S8).
- **Gap — NOT BUILT:** B4 (the REQ set for `travel` is `accommodation` only under R137 — see Appendix B Q5); S3 (the
  upsell engine is not mounted on the slip); S4 (edit form has no day field); a supply read per market × category (§L2
  "absent").
- **Server truth:** the open accommodation set counts as the one open essential until chosen. A category with no Kyoto
  supply says one sentence naming market and category ("No food tours listed in Kyoto yet"), never "0 results" (§L2
  empty-supply rule). Suggestions write nothing until the traveler presses Add (brief H-Q2). K3: duration, meeting point
  and end time are omitted where the row does not state them — never "Duration needed" (K1 violation list).
- **Money:** free to add. Ask AI (S8) is a paid task charged on apply, shown via `aiTask { coveredByTripPass,
  priceCents }` before apply (LD 45 (3)) — off the golden path.

### Step 6 — The paid run: one version per hotel, badges, adopt whole or part

- **Traveler (375px):** the Build card shows the free preview first (score, weakest dimension, "decides 1 comparison"),
  then the fee — or "Included in your Trip Pass" — then **Optimize**. After paying, the board (`/itinerary-comparison/:id`)
  shows "Your plan" plus up to three versions, **one per hotel in the open set**, each headed by its hotel and a badge
  only when its metric actually wins ("Lowest cost", "Least travel", "Best rated"). On a phone: one version per screen,
  swipe; a sticky footer offers **Adopt this plan** or per-stop **Add this stop**; "Adopt Day 2" selects that day's stops.
- **Module:** S7 Optimize preview, A1 Three optimized versions.
- **Level:** GLANCE (optimized badge on the slip), DETAIL (the board, K4).
- **Today — EXISTS:** preview `GET /api/optimization-preview` and fee `GET /api/optimization-fee` rendered in
  `SlipRail.tsx` (`slip-optimize-preview`, `slip-optimize-preview-fee`, `slip-action-optimize`); Trip Pass card
  (`slip-rail-trip-pass`); run gate `resolveOptimizerRunAuthorization` (`server/services/optimizer-run-authorization.ts`:
  Trip Pass → 24h free re-run → recorded payment → verified PaymentIntent); `generateOptimizedItineraries`
  (`server/itinerary-optimizer.ts`) builds baseline + three versions, **each around its own anchor** (`chosenAnchors[i]`;
  a pinned anchor is repeated for all three); board `client/src/pages/itinerary-comparison.tsx`; apply-to-trip and
  adopt-stop (`server/routes/plancard.routes.ts`; `button-adopt-stop-<id>`), adopt-stop's write gate fixed
  (`2026-09-26-adopt-stop-write-access`).
- **Gap — NOT BUILT:** feeding the open set to the run (§F2 (2)); **one version per hotel** — the per-version anchor slot
  already exists, the delta is filling it from the set's options instead of `pickAutoAnchors`; `metadata.optionId` per
  version; earned badges (R128); `POST /api/itinerary-comparisons/:id/adopt-stops` (R-A); adopting a version that
  chose a hotel also chooses the set (§F2 (3)). **Tension to rule (Appendix B Q1):** R128's three fixed objectives vs
  "one version per hotel".
- **Server truth:** review-first, no undo (LD 42 D18). Protected work (purchased, expert) is fixed (LD 42 D3). A version
  that picks no hotel leaves the set undecided in that version and says so — never a fourth hotel (§F2 (2)). Badges are
  checked after generation against stored metrics; Best fit claims no personalization (R128). Straight-line distances
  in the prompt are labelled "estimate, not routed" (already so in `itinerary-optimizer.ts`).
- **Money:** LD 41 (a): the pass covers the run; the fee is server-derived from `fee_bands` and shown before pay;
  a covered run writes the `fee_ledger` pair netting to zero (`2026-09-25-tolls-fee-ledger`). A rebuild after adding a
  new hotel inside 24h is a free re-run — **default yes**, the open question recorded in Part 2 N.

### Step 7 — Choose the hotel, Finalize, checkout with the fee visible, one booking, one cancellation

- **Traveler (375px):**
  1. **Choose.** In the "Where you'll stay" set, taps **Choose** on one hotel (or adopted a version that chose it). The
     set closes; the chosen hotel becomes one stay item with its nights.
  2. **Finalize.** Finish card → **Finalize plan**. The chooser asks once who books (LD 42 D2): *I'll book these*.
  3. **Checkout.** The staged line (one Kyoto activity from P-1c) shows the traveler service fee **before** checkout on
     the slip and in the cart; with a Trip Pass the fee shows struck through as waived. Pay with card or wallet.
  4. **The hotel** is partner inventory: it goes through the booking-agent rail ("our booking agent will handle this"),
     never a raw outbound link (§16). Its state reads "prepared, awaiting purchase" until a confirmation exists (LD 44 (e)).
  5. **Cancel.** From the booking (My Bookings today; the slip's Bookings section once built) → **Cancel** → the preview
     states the refund and the policy tier; confirm; the item reads "Refunded", never "Booked".
- **Module:** S1 choose (§E3), B7 Finish, S5 Bookings.
- **Level:** GLANCE (Finish card, fee line), DETAIL (fee breakdown, cancellation terms, K3 accommodation row).
- **Today — EXISTS:** Finish card actions `slip-action-finalize-plan`, `slip-action-go-to-checkout`;
  `FinalizeBookingModal.tsx` (`finalize-modal`, `finalize-option-myself`); `finalizeTrip`
  (`server/services/trip-finalize.service.ts`); routing → `ready_for_checkout` → cart projection
  (`cart-projection.service.ts`, LD 39); **fee before checkout (R144, `2026-09-27-service-fee-before-checkout`)** —
  `slip-traveler-fee-preview` (`SlipRail.tsx`) and `text-traveler-fee-preview` (`client/src/pages/cart.tsx`), both from
  `GET /api/cart` `travelerFeePreview` built by `server/services/traveler-fee-preview.service.ts`; Trip Pass waiver per
  line (R148); `POST /api/checkout` claim → authorize → promote (§15b/§15c); `CancelBookingDialog.tsx`
  (`button-cancel-booking-<id>`) reading `GET /api/bookings/:id/cancel-preview`, preview = refund (R166); refunded item
  never "Booked" (R145, `trip-plan.service.ts`).
- **Gap — NOT BUILT:** choose (`POST …/option-sets/:setId/choose`); Finalize refusal while a set is open (R125); the S5
  Bookings section on the slip (cancel is off-slip); a hotel option → stay item → booking-agent request path does not
  exist end to end (the agent rail takes an `affiliate_products` reference, `hotel_cache` is not one — Appendix B Q3).
- **Server truth:** choose is one atomic conditional (`… WHERE status='open'`, §15); an unchosen option can never be
  bought (§E3 money guards). Amount from the cart row, actor from the session (§14); `price_basis` NULL on an in-person
  listing charges per booking, not per person (LD 56). Cancellation quotes the tier pinned on
  `offering_contract_snapshot` (LD 50); no tier ⇒ the flexible default, and the preview says which record answered.
- **Money:** fee visible before pay (R144); Trip Pass waiver (R148); idempotent checkout (§15); one Stripe refund on
  cancel under the refund rail's key. The hotel mints no platform PaymentIntent (LD 43 (c)).

### Step 8 — A month later

See the next section; module B7/S5 (read-only on the Trip Card), A1 (history), level GLANCE on Home, DETAIL on the card.

---

## Step → module → level

| # | Step | Modules (§C) | Level (§K) | Status |
|---|---|---|---|---|
| 1 | Entry, occasion | B1 (LD 33 modal) | GLANCE (K2) | EXISTS; group resolution NOT BUILT |
| 2 | Where are you staying? + 2–3 hotels | S2, S1 | GLANCE · PLAN · DETAIL | NOT BUILT (candidates exist inside Optimize) |
| 3 | Plan-fit per hotel | S2 in S1 (§E4) | PLAN · DETAIL (K4) | PARTIAL (scorer exists) |
| 4 | Free draft around the set | B5 + R126 | PLAN (K3) | EXISTS on empty slip; held slot NOT BUILT |
| 5 | Gaps and suggestions | B4, S3, S4, B2 | GLANCE · PLAN · DETAIL | PARTIAL (add/browse/saved exist) |
| 6 | Paid run, badges, adopt | S7, A1 | GLANCE · DETAIL | EXISTS (3 versions); §F2 delta NOT BUILT |
| 7 | Choose, finalize, checkout, book, cancel | S1, B7, S5 | GLANCE · DETAIL | PARTIAL (checkout, fee, cancel exist) |
| 8 | A month later | B7/S5 read-only, A1 history | GLANCE · DETAIL | Trip Card EXISTS; run history NOT BUILT |

---

## What the traveler sees a month later

- **Home (GLANCE).** `GET /api/me/upcoming` (`server/services/upcoming.service.ts`, LD 45 (8)) lists the trip start and
  the handover (start − 48h) nearest first. A countdown renders only with `trips.timezone` set **and** confirmed dates
  (`shared/plan-timing.ts`, LD 30) — both true on this path. The cancelled booking is not on the axis.
- **Trip Card (`/trip/:id`, DETAIL) — EXISTS (LD 45 (6)).** `client/src/pages/trip-details.tsx` renders the full-stage
  `PlanCard` and a 320px rail (`TripCardRail.tsx`: Booking agent · Your expert · Suggestion slot · Back to planning); the
  same `AskAiDrawer` mounts post-final (`trip-card-rail-ask-ai`). It shows the finalized version; the hotel's agent
  request reads by its LD 44 stage; the cancelled activity reads "Refunded" (R145). A pre-final plan gets a notice
  pointing to the slip (LD 42 D8), not a second editor. On a phone the rail stacks under the card.
- **Run history — NOT BUILT.** The slip and card carry one `lastComparisonId` (`PlanCard.tsx`) linking the latest board.
  `GET /api/itinerary-comparisons` lists a user's comparisons but its only client caller is the experience-template
  page; there is no per-plan list, no record of which version was adopted beyond the `variant_applied` diary row, and no
  record of the run basis per comparison (LD 41 (a) states the basis is not pinned per comparison). **Optimizer run
  records are Part 2 N (pending).** Until then the card shows "Optimized" and one link, and claims no history.
- **Honesty checks on the card:** no "Duration needed" (K1 violation, fix scope of map step 1); stays show nights only
  where `check_in`/`check_out` are emitted (K3 says they are not emitted today — PARTIAL).

---

## Appendix A — Playwright acceptance outline

**File:** `playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts` (beside `j1-golden-path.spec.ts`, whose
disposable-DB and Stripe test-mode discipline it copies). **Rule (ledger `2026-09-27-e2e-helpers-confirm-effect`,
R170):** every step asserts a network response **and** a DOM element, and every helper returns only after confirming
its effect — never a timer. Note `fillPlanModalToFinish` still carries two `settle-ok` waits; this spec uses it only up
to the finish row it confirms by probing.

**Helpers reused:** `e2e/supply-demand/lib/ui.ts` (`actAndAwait`, `ok2xx`, `appears`, `testid`),
`e2e/supply-demand/lib/flows.ts` (`fillPlanModalToFinish`, `clickPlanFinish`, `futureDateRange`),
`e2e/supply-demand/lib/db.ts` (`q`, `feeBand`), `playwright/tests/journeys/_journey-helpers.ts`
(`assertDisposableDb`, `registerUser`, `confirmPaymentIntentTestMode`, `assertCheckoutAccepted`, `rows`, `scalar`).
**Fixtures (seeded read-only-asserted, never written by the test into app tables):** ≥3 Kyoto `hotel_cache` rows with
coordinates; one instant-mode Kyoto listing with price, future slot and a `moderate` tier (P-1c).

`test.fixme` = cannot pass until the named NOT BUILT piece lands.

```ts
test.describe("1 · entry and occasion", () => {
  // open modal from hero; fillPlanModalToFinish(page, "Kyoto, Japan", { occasionSlug: "travel", lenDays: 5 })
  // clickPlanFinish(page, "myself") inside actAndAwait({ method: "POST", path: /^\/api\/trips$/ }) → 2xx
  // DB: trips.timezone = 'Asia/Tokyo', market_slug = 'kyoto', dates_confirmed_at IS NOT NULL
  // DOM: URL /plans/:tripId; header shows "Kyoto" and the occasion name
});
test.describe("2 · where are you staying", () => {
  test.fixme(true, "NOT BUILT: anchor question card + plan_option_sets rails (S1/S2)");
  // actAndAwait POST /api/trips/:id/option-sets → 201; POST …/options ×3 → 201; 4th → 409 (cap 3)
  // DB: one set status='open', 3 plan_options; itinerary_items count still 0
  // DOM: GLANCE line "3 to compare"; each option shows no price when the source states none
});
test.describe("3 · plan-fit per hotel", () => {
  test.fixme(true, "NOT BUILT: compare view (§E4) scoring chosen options");
  // before draft: every option shows the "add a few things" line, no minutes
  // after step 4: response carries medianMeters|null per option; DOM line contains "est." and "of N located"
  // viewport 375×812: cards stack (no horizontal scroll: scrollWidth <= clientWidth)
});
test.describe("4 · free draft around the set", () => {
  // TODAY-PASSABLE variant (no set): click slip-action-draft-ai → POST /api/ai/generate-itinerary 2xx;
  //   DB: items with origin='ai' > 0; DOM: an "AI draft" origin chip
  test.fixme(true, "NOT BUILT: R126 held slot — with an open set the draft must succeed and leave the set open");
  // DB: set status still 'open', options unchanged, no accommodation item added by the draft
});
test.describe("5 · gaps and suggestions", () => {
  test.fixme(true, "NOT BUILT: B4 completeness + S3 slip suggestions + S4 move-to-day");
  // DOM: "N of M essentials"; See options → add → POST /api/trips/:id/itinerary-items 201 → row appears in that day
  // negative: a category with no Kyoto supply renders one sentence naming Kyoto, never "0"
});
test.describe("6 · paid run", () => {
  // TODAY-PASSABLE: GET /api/optimization-preview 2xx + slip-optimize-preview visible; GET /api/optimization-fee 2xx
  //   and slip-optimize-preview-fee text equals the fee_bands-derived amount (feeBand); pay in test mode;
  //   POST /api/itinerary-comparisons 2xx; board shows card-variant-* ×(1 baseline + ≤3)
  //   adopt one stop: button-adopt-stop-* → POST …/adopt-stop 2xx; DB: one new in_planning item
  test.fixme(true, "NOT BUILT: one version per hotel + earned badges + adopt-stops (§F2)");
  // each version's metadata names a distinct optionId; a badge renders only on the metric winner
});
test.describe("7 · choose, finalize, checkout, book, cancel", () => {
  test.fixme(true, "NOT BUILT: choose rail + Finalize refusal while a set is open (R125)");
  // Finalize with open set → 409 open_option_sets; choose → set 'chosen', one stay item
  // TODAY-PASSABLE: route listing item → ready_for_checkout; slip-traveler-fee-preview visible with the
  //   GET /api/cart travelerFeePreview amount; POST /api/checkout via assertCheckoutAccepted;
  //   confirmPaymentIntentTestMode; DB: one service_bookings row 'confirmed', item 'purchased'
  //   cancel: button-cancel-booking-* → GET cancel-preview; confirm → POST cancel 2xx;
  //   DB: refund row amount = preview amount (R166); DOM: item not "Booked" (R145)
});
test.describe("8 · a month later", () => {
  // TODAY-PASSABLE: GET /api/me/upcoming contains the trip start; /trip/:id shows trip-card-rail and the
  //   finalized version; the refunded activity reads refunded
  test.fixme(true, "NOT BUILT: per-plan run history (Part 2 N)");
});
```

---

## Appendix B — Open questions (each with a proposed default)

1. **"One version per hotel" vs R128's three fixed objectives.** R128 ratified Best value / Least travel / Best fit;
   the brief asks for one version per hotel. **Default:** when a Trips plan runs with an open `accommodation` set of 2–3
   located options, each version is pinned to one option (the per-version anchor slot already exists); R128's badges
   are still earned by metric across those versions, and the fixed objectives apply when no such set is open.
2. **The draft "outward from the hotel set" vs LD 41 (c) "no anchor".** **Default:** the draft receives the set's
   located hotels as a geography hint only — no anchor label, no metrics, no choice between them — which keeps LD 41 (c)'s
   sketch line and R126's never-choose line. Needs a decision-maker sentence because LD 41 (c) says "no anchor".
3. **`hotel_cache` as an option source.** §E2's `source_kind` has no value for it and items have no FK to it; the anchor
   loader reads nothing else. **Default:** amend §E2 before its migration lands (it is unbuilt, so this is cheap): add
   `source_kind = 'partner_hotel'` with a nullable `hotel_cache_id` (FK SET NULL), server-copied title/coords/rating, no
   price. Booking a chosen partner hotel goes through the §16 booking-agent rail.
4. **Where the anchor question is asked.** In the modal it would be a sixth step (LD 33 fixes five). **Default:** on the
   slip, as the Trips lead zone (§D), after the mint — no LD 33 amendment.
5. **Is `accommodation` the only REQ for `travel`?** R137 makes it REQ; §J lists nothing else, so B4 reads "0 of 1" →
   "1 of 1" and adds little for a Trips plan. **Default:** accept for the slice; B4 on Trips shows the accommodation line
   only, and day gaps come from S3's per-day gap cards, not from REQ.
6. **Stale cache rows.** `loadRankedAnchors` does not filter `hotel_cache.expires_at`; the census counts "not expired".
   **Default:** keep showing expired rows (they supply only name, pin and rating, never price) and show nothing that
   claims freshness.
7. **Rebuild around a newly added hotel inside 24h.** Default **yes** (free re-run) — referenced, owned by Part 2 N.
   Note LD 41's recorded limit: the free re-run is decided per user, not per plan.

### Where the map and the code disagree (found while writing this)

- **Map §L2 / §L3 say the service fee is not disclosed before checkout.** On `main` it is: R144 landed
  (`slip-traveler-fee-preview`, `text-traveler-fee-preview`, `traveler-fee-preview.service.ts`). R143 (payer reads the
  plancard) and R145 (refunded item never "Booked") also landed after the map's base commit `da3174289`.
- **Map §E2 vs the anchor loader:** the only hotel source the loader reads (`hotel_cache`) cannot be a §E2 option
  (Q3). §E4's `accommodation` attributes cite `provider_services` columns; for Kyoto's likely supply (cache rows) price,
  cancellation and neighbourhood are **not stated** and would all render omitted.
- **Map §L1 S2 "anchor candidates — feeds Optimize only"** matches the code; the map's C2 S2 row reads as if the dialog
  were a slip anchor module. It is not one yet.
- **Part 5's "`city ILIKE '%kyoto%'`"** is right in effect: the code matches `%<first comma-segment of the
  destination>%`, so "Kyoto, Japan" matches, and a destination spelled "Kyōto" would not.

*HARD STOP — Part 1 ends here. Design only; no code until ratified.*
