# Step 9c — Phase 0 (Logistics session, read-only)

> Written 2026-10-07 by the Logistics session for `docs/planning/briefs/step-9-brief.md` rev 1, section
> "9c — per-leg options and booking, provider pickup, tools". The architect added two items to scope:
> **the end-of-day `LogisticsRow` list retires when per-leg options land**, and **the cap VALUES (not the env
> keys) are reported on `/api/health` beside the switches**.
> Base: `main` @ `08ba001fb` (after step 9b, R362, and FU-9B-1, R363). FU-9B-1 added one line to `SlipView.tsx`
> at `:1796`; every `SlipView.tsx` reference below is at `08ba001fb`.
> **Nothing was built:** no product code, no migration. Where the code and the brief disagree, the code is
> right, and each case is marked **Brief ≠ code**. Production was not read.

**Migration:** none is needed if decisions D1–D8 go as recommended. The next free number is 358.
Migration 348 (the provider pickup confirmation, work plan L1-7) is **not in the registry**; see §3.

---

## 1. What a leg shows today, and what a tap does

### 1.1 The slip
- **Tapping a leg does nothing.** No leg row on the slip or the Trip Card has a handler.
- `LegRow` (`client/src/components/plan/LegRow.tsx`) dispatches on `kind` (`:332–339`):
  - **`kind: "routed"`, the slip between stops** (`RoutedLegRow`, `:321–355`).
    - Props are `legId, mode, route, timeZone`. It renders one `<p data-testid="slip-leg-routed-${id}">` holding the
      `routedLegLine` text.
    - The comment at `:319` says it is "Read-only here; per-leg options and booking are 9c".
    - It is mounted by `useSlipLegs` (`client/src/components/plan/useSlipLegs.tsx:22–40`) through the
      `renderLegBetween` prop (`SlipView.tsx:1979`, `:1986–1990`, called `:2484–2486`). The render site is
      `client/src/pages/slip-view.tsx:35`, `:78`.
    - It draws only when `routedLegBetween` (`client/src/lib/slip-legs.ts:36–53`) finds a leg carrying
      engine `routed` facts.
  - **`kind: "stops"`, the expert variant** (`StopLegRow`, `:67–289`).
    - It has a mode `<select>` (`:175–186`, options `leg.candidateModes ?? legModeOptions(leg)` `:183`), the pickup
      select, tip, Confirm and Remove, all for `role === "expert"` only (`:171`).
    - It is mounted on `WorkstationDays.tsx:144` and `LegReviewDrawer.tsx:204`, **never on the slip**.
  - **No `kind`: the airport leg** (`AirportLegRow`, `:294–392`).
    - It shows chips per mode, plus owner-only Book controls (`:370–388`): `private_car` → a `<Link>` to the
      `private_transportation` browse; `rail`/`affiliate_transfer` → `onRequest`.
    - It is wired at `SlipView.tsx:1755–1799` and mounted at `:2479, :2487, :2552, :2593`.
    - `routedMinutes` is passed at `SlipView.tsx:1796` (FU-9B-1, R363).
- **`ItemSheet`** (`client/src/components/plan/ItemSheet.tsx`, 97 lines) is a **stop** sheet with no leg, transport
  or mode content.
  - Props `:19–35`; body `:44–92`.
  - It is mounted for a slip item at `SlipView.tsx:823–855` and on the Trip Card at `TripCardDays.tsx:362+`.
  - **Brief ≠ code:** the brief asks "what `ItemSheet` shows for a leg today". It shows nothing for a leg, and no leg
    opens it.

### 1.2 The Trip Card
- `TripCardDays.tsx` uses its own `LegLine` (`:84–106`, testid `card-leg-${id}`), not `LegRow`. It is a plain `<p>`
  with no handler, mounted via `cardLegAfter` (`:75–82`, `:353–355`).
- Its text equals the slip's routed line: `step9a-routed-legs.test.tsx` S5 pins that.
- The Trip Card shows no airport leg.

### 1.3 More than one mode per leg: nothing computes it
- **The column exists.** `transport_legs.alternative_modes` is jsonb, typed `{mode, durationMinutes, costUsd,
  energyCost, reason}[]` (`shared/schema.ts:8062–8068`).
- **Every writer stores at most ONE entry, and it is the leg's own mode.** The writers are:
  - the engine (`server/services/routing/plan-legs-engine.service.ts:236–270`, "The ONE alternative entry" `:254–255`,
    carrying `line, fare, legKey, hourBucket`)
  - `transport-leg-calculator.ts:326–328` (routed) and `:376` (`[]`)
  - `trip-transport-legs.service.ts:125`, `:181`
  - copies at `stay-reroute.service.ts:221`, `ready-made-clone-legs.ts:60`, `itinerary-optimizer.ts:2168`.
- **The readers take `[0]`.** `engineLegKey` (`plan-legs-engine.service.ts:64–66`) and `routedFactsOf`
  (`server/services/routing/plan-legs.ts:222–237`) both read the first entry.
- **The "options" the expert picker offers are synthesized, not routed.** `legModeOptions` (`shared/trip-plan.ts:861–872`)
  and the server's `legModeChoices` (`trip-transport-legs.service.ts:778–783`) return the union of the recommended mode,
  the alternatives, `CHAUFFEURED_MODES` and the current pick. They carry no durations.
- **The traveler's pick already has a rail.** It is `PATCH /api/trips/:tripId/transport-legs/:legId`
  (`server/routes/transport-legs.routes.ts:258`).
  - Gate: `authorizeTripLogistics(…, { requireWriteAccess: true })` at `:261–268`. It admits the owner, a write-status
    advisor, the managing EA, the author and an audit-logged admin (`server/utils/trip-logistics-auth.ts:36–77`).
  - The value must be in `legModeChoices` (`:284–286`). A non-author advisor is FILED as a suggestion (202, `:303–313`).
  - The engine keeps the pick across a recompute: `picked` (`plan-legs-engine.service.ts:185`) is fed as `selectedMode`
    (`:191`).
  - A second rail, `PATCH /api/transport-legs/:legId/mode` (`server/routes/trips.routes.ts:2293`), recomputes through
    the legacy calculator (`:2349`). 9c should not use it.

### 1.4 Tests that pin leg text or testids
- `client/src/components/plancard/__tests__/step9a-routed-legs.test.tsx`:
  - S2: the line "24 min · Keihan Main Line · ¥220 · Google · checked 4 Oct".
  - S3: the paused line once, and nothing on a free plan.
  - S4: `cardLegAfter`.
  - S5: card text = slip text.
- `client/src/components/plancard/__tests__/airport-leg.test.tsx` L4 (`:49–67`): airport line, mode order, Book link vs
  buttons, no `slip-leg-book-` for a reader.
- `client/src/components/plancard/__tests__/step9b-leave-by-refetch.test.tsx` V6: `slip-leg-airport-*-minutes`.
- `client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx` W5/W7: the expert `StopLegRow`.
- `server/__tests__/transport-leg-review.db.test.ts:145–150`: a source scan that `LegRow.tsx` imports
  `legModeOptions` and defines no local copy.
- `server/__tests__/routing-adapter-contract.test.ts` P2: the `routedLegLine` format.
- `playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts:1678–1683`: `slip-leg-routed-*` contains "Test routes ·
  checked", exactly 3 `slip-leg-routed-line-*`.
- `e2e/supply-demand/w1-kyoto-authoring.spec.ts:120–198`: the Workstation `leg-*` testids.

---

## 2. The end-of-day `LogisticsRow` list (added to scope)

- **Where it is.** `function LogisticsRow` is at `client/src/components/plancard/SlipView.tsx:1268–1293`, and it is
  defined and used **only in SlipView.tsx, a Track A file (L11)**. It is mounted unfiltered at the end of every slip
  DayBlock (`:2587–2589`):
  `{(day?.transports ?? []).map((leg) => (<LogisticsRow key={leg.id} leg={leg} />))}`.
- **What it shows.** Mode icon, `from → to · N min · $cost` (`:1279–1283`), "added by optimizer" when
  `suggestedBy === "ai"` (`:1285`), and a muted "logistics" pill (`:1287–1290`). It has no options and no actions.
  - The `$cost` is `costUsd`. Since the engine writes `costUsd: null`, routed legs show no `$`. But this is a price
    figure on a slip row, and R-h / R-ar want minutes only in-plan with fares only from the source.
- **Why it double-draws.** On a routed plan every engine leg appears **twice**: between its rows (§1.1) and again at
  day end. `client/src/lib/slip-legs.ts:5–6` records that: "the day-end list keeps it until 9c".
- **What it is the only render for.** It is the **only** slip render of a shown leg that carries no engine `routed`
  facts. On a non-routed plan `tripLegsShown` gives confirmed expert legs (`selectPlanLegs`, `plan-legs.ts:249–260`),
  and those draw nowhere else on the slip. **Retiring it without a replacement would hide an expert's confirmed legs
  on a free plan** (§13). The between-rows renderer must first draw those too.
- **Tests that pin it:**
  - `client/src/lib/__tests__/smoke8-fixes.test.ts` D1 (`:50–61`) source-scans the literal
    `{(day?.transports ?? []).map((leg) => (` and requires it to come **before** the departure
    `TravelAnchorPlaceholder`. Removing the map breaks D1, so it must be re-anchored, e.g. on the last
    `renderLegBetween` call or the day's last item.
  - No test pins `slip-logistics-${id}`, "added by optimizer" or the pill.
  - `playwright/tests/slip-rail-actions.spec.ts:252`'s `slip-logistics-section` count-0 is the old rail section, not
    this component.
- **Trip Card:** it has no end-of-day list (legs are between stops only via `LegLine`), so nothing retires there.

---

## 3. Provider pickup (L7)

- **The fields that exist** are `provider_services` columns (`shared/schema.ts` from `:1157`):
  - pickup offered: `pickupAvailable` `:1196`, `transportProvision` `:1249` (vocabulary `:1017–1022`), legacy
    `transportProvided` `:1209`, and `collectsAndDrops` `:1399` ("captured only; no transport resolver reads it yet"
    `:1398`)
  - zones: `pickupCoverageMode` `:1250` (radius | route) over `serviceRadius` `:1198` or `service_route_points`
    (`:11371–11383`), plus `pickupRadiusKm` `:1204`
  - meeting point: `meetingPoint` `:1195`, text only; the only pin is the listing's `latitude/longitude` `:1407–1410`
  - `pickupAddress` `:1197`
  - drop-off: `dropOffPoint` `:1225`
  - **stations / hotels served: no column and no jsonb key anywhere.**
- **Nothing is confirmed.**
  - There is no confirmation stamp on any of these. `legPickupRefusal` (`server/services/trip-transport-legs.service.ts:604–622`)
    therefore refuses **every** listing `pickup_not_provider_confirmed`. Its comment names the missing column as
    "work plan L1-7 (migration 348, P1)".
  - The route passes `pickupConfirmedAt: undefined` (`transport-legs.routes.ts:299`).
  - **Migration 348 does not exist.** The registry and `server/migrations/` jump 347 → 349.
  - The writers are the provider wizard only (`client/src/components/ServiceForm.tsx:221–259`, via
    `server/routes.ts:4099/4493`); no extraction pass writes them.
- **Consequence under L7:** "if the fields don't exist yet, 9c reads nothing and shows nothing". **9c renders no
  host-pickup line** until a confirmation column lands in the separate engineer/Content lane. The gate "a leg with a
  confirmed pickup renders the host line and no Book" is testable only against a fixture `pickupConfirmedAt`, through
  the existing `legPickupRefusal`.

---

## 4. The tools: Getting there / Getting around / Getting home

- **Manifest:** `shared/group-manifest.ts`.
  - Labels: `:46`, `:49`, `:53`.
  - Trip tools `["getting_there","where_to_stay","travel_party","getting_around","pace"]` `:90`.
  - Moment tools `["the_reservation","timing_check","getting_home"]` `:98`.
  - `manifestFor` `:151–160`, which falls back to Trip.
- **Registry:** `client/src/components/plan/ToolsTray.tsx`.
  - `getting_there` → `GettingThereSheet` (`:42–43`), **live**.
  - `getting_around`, `getting_home` → `return null` (`:71–79`, "No existing component — 'coming soon', never built
    here") → a disabled "coming soon" chip (`TOOL_COMING_SOON` `:21`, `:102–118`).
  - The tray is owner-only at `SlipView.tsx:2173–2194`.
- **What "Getting there" reads:** flight anchors only (`GettingThereSheet.tsx:215–220`), the flight lookup
  (`trips.routes.ts:1704`, `FLIGHT_LOOKUP_ENABLED` + key, `server/config/flight-lookup.config.ts:21–26`) and the
  anchor writes. Plan legs reach the flight only through `flightBufferWithLeg` (`shared/getting-there.ts:218–228`, 9b),
  on the slip.
- **What "Getting around" and "Getting home" would read.**
  - Getting around: the plan's shown legs (`tripLegsShown`, already on the plancard as `days[].transports`, with
    `routed` facts per leg). No new read.
  - **Getting home is a Moment tool.** A Moment has no stay and no departure flight, and nothing on the plan records
    where "home" is beyond `users.home_city` (a city, not a point). Routing it would mean geocoding a city or guessing.
    See D7.
- **Tests:**
  - `client/src/components/plancard/__tests__/tools-tray.test.tsx:43` (`NO_COMPONENT`) and T2 (`:62–69`) pin
    `getting_around`/`getting_home` as disabled "coming soon". Building either one amends T2 and the `NO_COMPONENT`
    set.
  - `shared/__tests__/group-manifest.test.ts` G2 (`:24–25`) pins the manifest labels. These are unchanged by building.

---

## 5. "Book this for me" and booking a transfer

There are four paths today. **None books a provider transfer against a leg.**

**A. Item "Book this for me" → handoff**
- It is `ItemRow.tsx:295`, wired at `SlipView.tsx:777`, `:839–850` → `openHandoffChooser({kind:"book", itemIds})`.
- It goes to `POST /api/trips/:tripId/handoff` (`server/routes/handoff.routes.ts:164–178`) → `askHandoff`
  (`server/services/handoff.service.ts:228`).
- That creates an `expert_requests` row plus a manual-capture hold, priced on `expert_review_book_flat` +
  `expert_review_book_percent` (`HANDOFF_FEE_TIER.book`, `shared/handoff.ts:32–36`; `fee-band-requirements.ts:104–105`),
  plus the traveler service fee.
- It creates **no `service_bookings` row**.
- `HandoffChooser.tsx:4` says it serves "an item, a leg, the whole plan", but no leg calls it (callers: `SlipView.tsx:777,845`,
  `FinalizeBookingModal.tsx:131`, `SlipRail.tsx:582`). The scope is `scope_item_ids`, which holds item ids, not leg ids.

**B. Booking Concierge purchase → `affiliate_booking_requests`**
- It is `createHandoffRequestsForBooking` (`server/services/concierge-handoff.service.ts:156`, called
  `payments.routes.ts:904`, `checkout-claim.service.ts:1185`), on the `expert_concierge_booking` band (LD 51).
- Only items with an `affiliateProductId` are handed off. A leg is never one.

**C. Airport leg Book**
- `rail`/`affiliate_transfer` → `POST /api/affiliate-booking-requests` with a 12Go `partnerRoute` (`SlipView.tsx:1767–1782`;
  server `content.routes.ts:7542`, `:7598–7663`). It is pooled, `price: null`, with no fee band and no `service_bookings` row.
- `private_car` → a Link to the `private_transportation` browse (`SlipView.tsx:1792`).

**D. Transport commerce (legacy variant legs)**
- It is `POST /api/transport-booking-options/:optionId/book` (`server/routes/transport-hub.routes.ts:325–389`), platform
  options with a listed price only.
- It goes through `createTransportBookingCheckout` (`server/services/stripe.service.ts:93–235`).
- That writes `service_bookings` with **`service_id` NULL** and `bookingDetails.bookingType = "transport"` (`:150–178`):
  the documented transport-commerce exception (CLAUDE.md; `shared/schema.ts:1725–1728`; `shared/no-item-booking.ts:50,60`).
- Fees: the traveler service fee only (`:129–145`), commission `booking_fee_configs.platform_transport_commission`
  (`transport-booking-options.service.ts:290–305`).
- Client: `TransportSection.tsx:244–262`, `TransportBookingCard.tsx:100`, mounted in PlanCard/CollapsedSections/
  itinerary-view, **not the slip**.
- `transport_booking_options` exist only on computed (optimizer variant) legs (`LegRow.tsx:13–18`), not on engine legs.

**Transfer supply**
- The listing category is `private_transportation` (`server/migrations/034_…sql:67–70`, `289_…sql:95,139,184–187`).
- Its offering types are `airport_driver`, `day_trip_driver`, `multiday_driver`, `luxury_chauffeur`, `late_night_driver`
  (`038_…sql:13–17`).
- There is no `airport_transfer` category key.

**Brief ≠ brief:** the build line says "Book this for me on a leg goes through the existing concierge booking path with
the existing bands", while the gate says "booking a transfer creates a provider booking under the existing band".
Path A (the concierge "Book this for me") never creates a provider booking. A provider booking on a transfer is the
ordinary checkout of a `private_transportation` listing (commission from `fee_bands`). See D4.

---

## 6. `/api/health` and the cap values (added to scope)

- **The handler** is `server/routes/content.routes.ts:368–393`, **public and unauthenticated**:
  `{ status, db, timestamp, build, flags, egress, migrations, trendScores }` (`:387`).
- **The Maps part today is booleans only.**
  - `healthFlags()` (`server/services/runtime-flags.ts:47–51`) emits `env[name] === "1"` for the six `MAPS_*_ENABLED`
    switches (`:24–29`) and `PLACE_FACTS_PLACES_ENABLED` (`:13`).
  - The comment at `:22–23` says "report configuration only, never credentials, caps, prices or a claim that a
    provider request succeeded".
- **Cap values live in the environment, with code defaults.**
  - `MAPS_CALLERS` (`shared/maps-billing.ts:59–169`) gives each caller `dailyCapEnv` + `defaultDailyCap`.
  - Defaults: `routes_drive` 500, `routes_mode` 500, `routes_transit` 300, `route_matrix` 10,000 elements, `geocode`
    1,000, `places_id_lookup` 5,000, `places_details` 1,000, `places_text_search` 300.
  - The effective value is `mapsCallerDailyCap(key)` (`server/config/maps-billing.config.ts:28–31`).
  - There is no table and no admin editor.
  - **Brief ≠ code:** L10 says "Caps stay as set unless the founder changes them on the admin screen". **No admin
    screen edits a Maps cap.**
- **Where caps are exposed today:** only `GET /internal/jobs/health` (`server/routes/internal.routes.ts:436–458`,
  behind `requireInternalSecret`). It reports `maps.callers[] = {caller, calls, failed, spendTenthsOfCent, dailyCap,
  enabled, costRecordedOn}` (`server/services/maps-billing/maps-billing.service.ts:95–133`).
- **Tests that pin the current posture:**
  - `server/services/__tests__/runtime-flags.test.ts` F2 (`:46–62`) asserts no env VALUE is echoed. At `:62` it
    asserts **`MAPS_ROUTES_DRIVE_DAILY_CAP` is absent: "caps are not health switches"**.
  - F1 (`:25–44`) lists every flag. F3 (`:98+`) requires the flags on every answer.
  - Adding caps amends F2's `:62` assertion, and the `:22–23` comment changes with it. See D6.
- **Also missing from health, for the record:** `TRAVEL_TIME_SERVICE_ENABLED` (the master routing switch,
  `server/config/travel-time.config.ts:16–18`, read by `routingAdapter()` `server/services/routing/index.ts:15–19`) and
  the day's paused state (`routingPausedToday()`, `maps-billing.service.ts:144–152`). Neither is in scope unless ruled.

---

## 7. Expected Maps calls for 9c (L10)

- **Options on tap (D1 as recommended):** at most **2 calls** the first time a leg's options open. These are the two
  modes the leg does not already hold, each through its own caller (`routes_drive`, `routes_mode` for walk,
  `routes_transit`).
  - They are stored on the plan's own leg row (LD 63 allows Google content there, never in a cache), so a re-open costs
    0.
  - An edit that recomputes the leg drops its options (the row is replaced), and the next tap pays again.
  - On a 20-leg plan where a traveler opens every leg: about 40 calls, spread across the three callers' caps (500 / 500 /
    300).
- **Options at Optimize (the alternative):** about 3× the current per-version cost, about 60 calls per version on a
  20-leg plan, whether anyone looks or not.
- **Getting around:** 0 calls (reads stored legs).
- **Host pickup:** 0 calls (reads listing fields).
- **Booking:** 0 Maps calls.

---

## 8. Decisions needed (each with a recommendation)

| # | Question | Recommendation |
|---|---|---|
| D1 | When are a leg's other modes computed? | **On tap**, lazily: ≤2 calls per leg, stored on the leg's own row in `alternative_modes` (the existing jsonb; entry 0 stays the leg's own mode, so `engineLegKey`/`routedFactsOf` are untouched). Never at Optimize, never on page load (L3). Only on a plan that `planGetsRoutedLegs`; a free plan's legs have no tap. |
| D2 | Which modes are the ≤3 options? | L4's candidate set: walk when the straight line is ≤ 1.2 km, transit where the market has coverage, drive. The leg's current mode is first (the default), and a mode the adapter cannot route is omitted, not shown as "unavailable". No chauffeured pseudo-modes (`legModeOptions` adds them for the expert picker; the traveler sheet does not). |
| D3 | How does the traveler choose one? | The existing `PATCH /api/trips/:tripId/transport-legs/:legId` `{userSelectedMode}`, which is already owner-admitted and already kept by the engine across recomputes. No new route. The sheet is a new component beside `LegRow` (not `ItemSheet`, which stays a stop sheet). |
| D4 | What does "Book" on a leg do, given that the brief's build line and gate disagree (§5)? | Two actions, as on the airport leg. **"Find a driver"** opens the `private_transportation` browse with the plan id, and checkout creates an ordinary provider booking on the existing commission band: this is the gate's "provider booking under the existing band". **"Book this for me"** opens the existing `HandoffChooser` (`kind:"book"`) scoped to the leg's two end items (`scope_item_ids` holds item ids, so no schema change) on the existing `expert_review_book_*` bands: this is the build line's "existing concierge path". Neither path adds a fee, and neither uses the null-`service_id` transport-commerce exception. |
| D5 | Retiring `LogisticsRow` touches `SlipView.tsx` (Track A, L11). Who does it, and what replaces its only job? | **Two steps.** (a) 9c widens the between-rows renderer (`useSlipLegs`/`slip-legs.ts`, Logistics-owned) to also draw a shown leg **without** routed facts (an expert's confirmed leg on a free plan) as a minutes-only line, so nothing loses its render. (b) **Track A** deletes the `LogisticsRow` map at `SlipView.tsx:2587–2589` and the component (`:1268–1293`), and re-anchors smoke8 D1 (`client/src/lib/__tests__/smoke8-fixes.test.ts:50–61`) on the last `renderLegBetween` call. This is filed as FU-9C-1 in the same PR's FOLLOWUPS, like FU-9B-1. If the architect prefers, 9c may make the deletion itself under an explicit L11 exception. |
| D6 | What do the cap values on `/api/health` look like? | Add `mapsCaps: { routes_drive: 500, routes_mode: 500, … }`: the **effective** integer from `mapsCallerDailyCap(key)` per `MAPS_CALLERS` key, beside `flags`. No env names, no spend, no cost (spend stays behind the secret on `/internal/jobs/health`). The comment at `runtime-flags.ts:22–23` is reworded to "switches and cap values, never credentials, prices, spend or a claim that a request succeeded". `runtime-flags.test.ts` F2 `:62` is amended (a sanctioned test edit) to assert the cap appears as a NUMBER under `mapsCaps` while the env VALUE string still never appears verbatim. Health is public: a cap is configuration rather than a secret, but if publishing it is unwanted, the alternative is the same block behind `requireInternalSecret` only. |
| D7 | Should Getting home be built? | **Getting around: yes.** It is a sheet listing each day's shown legs with the same `routedLegLine`, reading `days[].transports`, 0 calls; it amends `tools-tray.test.tsx` `NO_COMPONENT`/T2 for that key only. **Getting home: stays "coming soon".** A Moment has no stay or departure point, and `users.home_city` is a city, not a point, so routing it would be a guess (§13). It is filed as FU-9C-2, pending a home point. |
| D8 | Host pickup (L7) | **9c reads nothing and shows nothing**, because no confirmation column exists (§3) and migration 348 never landed. The renderer and test use `legPickupRefusal` with a fixture `pickupConfirmedAt`, so the line appears the day the column does, with no 9c change. "Stations/hotels served" have no field at all. |
| D9 | Should the Trip Card get options? | **No.** The card stays read-only (`LegLine`); options and booking live on the slip only. R-h: no fares on item rows on either surface. Fares appear only inside the leg sheet, in the source's currency (L6). |

---

## 9. Supply notes

- **Transfers:**
  - The only transfer supply is `private_transportation` listings (the five offering types above) and 12Go affiliate
    requests.
  - `platformCarFits` (`server/services/airport-leg.service.ts:13–36`) matches on party size, city and category only.
  - No listing carries a confirmed pickup, so "via host pickup" will be empty everywhere until L1-7 lands.
- **Transit coverage per market** (L4's "where the market has transit coverage") is not recorded anywhere as data.
  The engine's mode default reads the straight-line rule and the adapter's answer. A market where transit routes come
  back empty will simply offer walk/drive.
