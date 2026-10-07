# Step 9a — Phase 0 (Logistics session, read-only)

> Written 2026-10-07 by the Logistics session for `docs/planning/briefs/step-9-brief.md` rev 1, section
> "9a — engine + LegRows on paid and expert-held plans". Base: `main` `5f90596` (R358). **Nothing was
> built:** no product code, no migration. `file:line` is at that base. Where the code and the brief
> disagree, the code is right; each case is marked **Brief ≠ code**. Production was not read.

**Migration:** 357 is free. The newest registered migration is 356 (`server/migrations/migration-files.ts`, end of
list), and the only open PR (#1225) carries no migration. The cache table (L2) is the only schema object 9a needs.

---

## 1. `TRAVEL_TIME_SERVICE_ENABLED` and the travel-time service as built (A8, R230)

- Switch: `server/config/travel-time.config.ts:16–18`. The Routes tier also needs `GOOGLE_MAPS_API_KEY` (`:20–22`).
  It is off by default and on only in the kyoto-slice CI job (`.github/workflows/kyoto-slice-gate.yml:124`).
- The rule is pure, in `shared/leg-resolution.ts:55–67` `resolveLeg`, with three tiers: Routes (exact legs only),
  then the A2 matrix (walk or transit), then a straight line labelled "est.". The I/O half is
  `server/services/travel-time.service.ts:32–42` `loadLegResolver`, which wires `getRouteForMode` as the Routes source
  (`:39`).
- `getRouteForMode` (`server/services/routes.service.ts:385–417`):
  - It returns `{ minutes, distanceMeters }` only.
  - Walk, cycle and transit use the `routes_mode` caller with mask `routes.duration,routes.distanceMeters`
    (`server/services/maps-billing/maps-requests.ts:166`).
  - Drive uses `routes_drive` (`routes.service.ts:390–392`).
  - It sends no departure time.
  - **Brief ≠ code (L1):** it returns no transit line, no fare and no provenance object.
- The one call that returns transit line names is `getTransitRoute` (`routes.service.ts:276–350`, caller
  `routes_transit`, departure defaults to now + 10 min at `:277`).
  - Its line names are in the parsed steps (`:223–233`).
  - Its mask (`:305–319`) does not ask for `routes.travelAdvisory.transitFare`, so **no fare exists anywhere today**.
  - R299 records that Routes bills by request features, not response fields (`shared/maps-billing.ts:91`). Adding the
    fare field should therefore keep the Essentials SKU. That is to be confirmed on the invoice.
- Callers of the service, all gated on the flag only:
  - Finalize: `server/routes/routing.routes.ts:571–573`.
  - `POST /api/trips/:tripId/activate-transport`: `server/routes.ts:13514–13518`.
  - A leg's mode switch: `server/services/trip-transport-legs.service.ts:157–176`.
  - Plan-fit: `server/services/plan-option-sets.service.ts:568`.
  - Where-to-stay: `server/services/where-to-stay.service.ts:362`.

## 2. Where Finalize writes legs, and what a leg row holds

- Finalize calls `activateTripTransport` (`trip-transport-legs.service.ts:148–150`), which is
  `generateTripTransportLegs(…, { via: "travel_time_service", propagateSchedule: false })` (`:299–466`).
- It walks `consecutiveStopPairs` (`:213–237`): consecutive items on the same day, in plan order. A stop with no real
  coordinate is skipped and reported as `missing_coordinates`, never bridged (§13).
- The default mode is `defaultLegMode` (`shared/travel-speeds.ts:59–61`): walk at or under `WITHIN_WALK_METERS` =
  1,200 m (`server/services/anchor-scoring.ts:71`), else transit.
  - **Brief ≠ code (L4):** there is no drive arm, and no "market has transit coverage" test. The nearest data is the
    per-market `availableModes` in `server/data/transport-profiles.ts` (for example Kyoto at `:29–43`), which name
    `train`/`bus`, not `transit`.
- **It rewrites every leg every time.** All existing `proposed` rows are deleted and the whole set is re-inserted in
  one transaction (`:335–345`, `:455–462`). Nothing is changed-legs-only (L3 b).
- Rows are born `proposed` (`:446`); `confirmed` rows are never touched (`:340–343`, `:371–375`).
- Where a resolved leg records its tier: `routeProvider` is `google_routes` | `travel_time_matrix` |
  `straight_line_est`, and the one `alternative_modes` entry's `reason` is `routes` | `matrix` | `est.` (`:103–141`).
  - **`route_provider` and `route_retrieved_at` are not columns.** The insert (`:422–447`) drops them.
  - The table has `calculated_at` (default now) and `checked_at`/`checked_by` (R-bf, which means the author confirmed
    the leg, not that the route was checked).
- `transport_legs` (`shared/schema.ts:8037–8106`) has from/to activity ids, names and coordinates, mode, minutes,
  distance, `alternative_modes` jsonb, `proposal_status`, pickup fields, `leg_check_status`/`leg_checked_at` (R-bb)
  and `coord_source`. **It has no place-ID, line, fare-currency, source or hour column.**

## 3. Is there a route cache?

- **No.** The only travel-time store is the A2 neighbourhood matrix (`travel_time_matrix`, `shared/schema.ts:4961`;
  refresh runs at `:4940`). `maps_export_cache` (`:8136`) holds Maps URLs, not routes.
- Route geometry is deliberately never stored, "Google's caching terms for route geometry"
  (`routes.service.ts:419–425`).
- **The L2 cache must hold duration, distance, line and fare only — never a polyline.**

## 4. Place IDs (the L2 cache key)

- A stop's Google place ID lives in `place_facts` (`place_ref_kind = 'place_id'`). It is read per item by
  `placeRefsForTrip` (`server/services/content-facts/place-facts.service.ts:553–577`) from unexpired facts only.
- `itinerary_items.google_place_id` exists (`shared/schema.ts:5723`), but no server path writes it. It is read only
  for the Maps link (`trip-plan.service.ts:407–409`) and copied by clones.
- Places is off unless `PLACE_FACTS_PLACES_ENABLED`, facts expire at 30 days, and an unnamed stop is never looked up
  (LD 57). **So many located stops have no place ID**: typed stops, expired facts, a stay that is a typed hotel. The
  stay's point is `stayPointForPlan` (`server/services/stay-reroute.service.ts:114–132`). Flight anchors carry
  `temporal_anchors.latitude/longitude` (`shared/schema.ts:5997–5998`); this lane did not establish which writer
  fills them for an airport.

## 5. Airport legs (step 3)

- These are pure helpers in `shared/airport-leg.ts:12–43`: modes (private car only when a listing fits, then train,
  then airport transfer), the line "KIX → Hotel Kanra", and **no minutes and no distance** (`:9–10`).
- Rendered by `LegRow`'s airport variant (`client/src/components/plan/LegRow.tsx:316–347`), mounted only by
  `SlipView.tsx` `renderAirportLeg` (`:1783–1798`). It is called at `:2472`, `:2477`, `:2542` and `:2583`, using
  `/api/trips/:id/anchors` and `/api/trips/:id/airport-leg` (`:1755`, `:1763`).
- The buffer check is a fixed buffer:
  - `FLIGHT_BUFFER_MIN` (`shared/getting-there.ts:50–53`): 120/60 minutes after arrival, 150/90 before departure.
  - `flightCutoffTime` (`:197–209`) and `flightTimeConflictLine` (`:215–240`).
  - The `OptimizerLead` twin is `anchorConflicts` (`shared/optimizer-lead.ts:194–233`).
  - Nothing reads a routed airport leg; none exists.

## 6. Maps billing callers (R299)

- The table is `shared/maps-billing.ts:59–169`. The gate is `server/services/maps-billing/maps-billing.core.ts:122–159`
  plus `maps-billing.service.ts:24–85`. Caps and costs are read in `server/config/maps-billing.config.ts:24–39`.
- The routing callers:

  | Caller | SKU | Default cap/day | Recorded cost |
  |---|---|---|---|
  | `routes_drive` | Essentials | 500 | $5 per 1,000 |
  | `routes_mode` | Essentials | 500 | $5 per 1,000 |
  | `routes_transit` | Essentials | 300 | $5 per 1,000 |
  | `route_matrix` | Pro, per element | 10,000 elements | $10 per 1,000 |

- **Brief ≠ code (R-at, "failed calls cost 0"):** a failed call is recorded at full cost.
  - `record()` prices `units` whatever `success` is (`maps-billing.service.ts:42`).
  - Both the failure return (`core.ts:153`) and a thrown call (`:156`) are recorded with `units` 1.
  - Failed calls also count toward the cap.
- **Brief ≠ code (L5):** a cap refusal is not visible to callers.
  - `gatedMapsCallOrNull` turns `cap_reached` into `null` plus a log line (`maps-billing.service.ts:74–85`).
  - So today "paused" and "no route" look the same.
  - Only `gatedMapsCall` (`:65–71`) returns `{ refused }`.
- **Health (L5):** `/internal/jobs/health` (`server/routes/internal.routes.ts:426–441`) reports job staleness only.
  `/api/health` reports the six `MAPS_*_ENABLED` switches as booleans (`server/services/runtime-flags.ts:22–29`). **No
  endpoint reports the day's spend per caller**, so L5's addition is needed.

## 7. `LegRow` today, and where the slip draws legs

- `LegRow` is `client/src/components/plan/LegRow.tsx:308`. Props are the union at `:305`; the stops props are at
  `:65–84` and the `StopLeg` shape at `:28–49`.
- What the stops variant renders (`:105–290`):
  - The mode label (no icon), "{N} min" (`:147–151`), "· {distance}" (`:153`), and the host pickup line "as described
    by the host" (`:155`).
  - "Author's pick" (`:166`) and "Checked {date}" (`:102`, `:167`).
  - Expert-only controls.
  - **No "est.", no line, no fare, no provenance "Google · checked", no "leave by", no thin-connector variant.**
- Where `LegRow` mounts:
  - Workstation days: `client/src/components/plan/WorkstationDays.tsx:137–170`. A leg goes between stops via
    `legBetween` (`client/src/lib/leg-review.ts:29`), else a gap line (`:82–85`).
  - Leg review drawer: `client/src/components/plan/LegReviewDrawer.tsx:204`.
  - Slip, airport variant only.
- **`DayBlock` makes no leg decision.** It takes `children` only (`client/src/components/plan/DayBlock.tsx:13–73`; its
  header `:7–8` says legs arrive "with step 3/9", placed by the caller).
- **The slip draws between-stop legs as a day-end list, not between rows:**
  - `(day?.transports ?? []).map(leg => <LogisticsRow/>)` at `SlipView.tsx:2577–2579`.
  - `LogisticsRow` is `:1268–1293`: mode icon, from → to, minutes, `$cost`.
  - The item loop that would host a `LegRow` is inline JSX in `SlipView.tsx` (`:2471–2583`).
  - **This is the L11 stop.** See decision 1.
- Trip Card:
  - `TripCardDays` draws its own `LegLine` (`client/src/components/plancard/TripCardDays.tsx:66–77`, testid
    `card-leg-{id}`), between stops at `:238`/`:293`. Minutes show only when `travelTimesShown`
    (`PlanCard.tsx:966`; `plancard.routes.ts:854` = the flag alone).
  - `ActivitiesSection` has a third renderer, `TransportConnector` (`:555`, `:1057`).
- Payload: `days[].transports` on the plancard (`server/routes/plancard.routes.ts:652`, `:814`), built at
  `server/services/trip-plan.service.ts:714–738` and `:978–998`.
  - It merges the selected (else first) variant's legs (`:717–728`) with trip-scoped legs, **confirmed only**
    (`:732–737`).

## 8. Tests that pin leg text, and tests that read the Track A files

- Leg text:
  - `client/src/components/plancard/__tests__/step7a-workstation-parity.test.tsx:152–186` (Author's pick, Checked, gap
    lines).
  - `.../airport-leg.test.tsx:44–66` (the airport line, mode order, Book).
  - `server/__tests__/transport-leg-review.db.test.ts:146` (reads `LegRow.tsx` as text).
  - `client/src/lib/__tests__/map-scene.test.ts:183–185` (the `showTravelMinutes` gate in source).
  - `e2e/supply-demand/w1-kyoto-authoring.spec.ts:120–197`.
  - `playwright/tests/slip-rail-actions.spec.ts:252` (`slip-logistics-section` count 0).
  - `playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts:1571–1617` (§7 A8: Finalize writes 2 legs, `reason`
    "est.", agrees with plan-fit).
- **No test asserts** "leave by", "Google ·", a line or a fare, `card-leg-`, or `transport-connector-`.
- **30 test files read `SlipView.tsx` and/or `SlipRail.tsx` as text**: 13 read SlipView only, 9 SlipRail only, 8 both.
  The list is in the session record. The brief's "≈29" is right to within one.

## 9. What Optimize computes between stops today

- `generateOptimizedItineraries` (`server/itinerary-optimizer.ts:844`) calls `calculateTransportLegs` once for the
  baseline (`:1213`) and once per AI variant (`:1904`). The prompt asks for 3 AI variants, so a run has 4 versions.
- `calculateTransportLegs` (`server/services/transport-leg-calculator.ts:144–178`) makes **one `routes_drive` call per
  same-day consecutive located pair** (`:270`).
  - Mode is hard-coded `"driving"` (`:297`), `alternativeModes: []` (`:300`), cost comes from the destination
    profile's per-km rate.
  - A null route drops the leg, with no fallback (`:274`).
  - The legs are **variant-scoped** (`persistTransportLegs`, `:367–380`).
- Geocoding: at most 12 per run (`itinerary-optimizer.ts:1485`).
- Under the brief's rules the current per-version legs are drive-only, which is wrong for Kyoto (transit/walk). The
  run never calls the travel-time service.
- **Apply-to-trip computes no legs** (`server/routes/plancard.routes.ts:69–354`). It inserts the variant's items as
  **new** item rows with no source link (`:217–236`), so the variant legs' `from_activity_id` no longer names a plan
  item. The slip then shows those legs as day-end `LogisticsRow`s, keyed to nothing on the plan.
- Preview findings (all straight line, pure):
  - `city_crossing`: `shared/optimizer-lead.ts:255–281`.
  - `walking_saved_km`: `:283–327`.
  - The "(est.)" text is hard-coded by finding kind in `findingLine` (`:361–364`), not driven by the `est` field
    (`:26`).
  - Assembled by `loadOptimizerFindings` (`server/services/optimizer-lead.service.ts:48–139`).
  - `leg_unreachable` already reads trip legs' minutes (`shared/leg-reachability.ts`, service `:122–127`).
- `facts-recheck` (`server/jobs/factsRecheck.ts`, daily, T-3 at `shared/facts-recheck.ts:9`) re-runs Places facts and
  findings only. Its header says "Legs join under R-aw in step 9" (`:12`). There is no `routing-recheck` job. (Both
  are 9b.)

## 10. Which plans count as "optimized / Trip Pass / expert-held" in code

**There is no shared predicate.** Every leg producer is gated on the flag alone, or on nothing.

**Optimized has three meanings in use:**
- **(a)** `itinerary_comparisons.optimized_at`, stamped on apply (`plancard.routes.ts:276–279`) and when generation is
  ready (`server/services/itinerary-generation-outcome.service.ts:35`). Surfaced as `lastOptimizedAt`
  (`plancard.routes.ts:822`).
- **(b)** The slip's `hasOptimized`, which is a `variant_applied` transition (`SlipView.tsx:1471`).
- **(c)** `optimizer_runs` (`shared/schema.ts:2327–2339`), written only when `OPTIMIZER_RUN_RECORDS_ENABLED=1`
  (`server/config/optimizer-runs.config.ts:7–9`; `server/routes.ts:702`).
  - Where-to-stay's private `hasPaidOptimizerRun` (`where-to-stay.service.ts:181–188`) reads (c) with basis `paid`
    only, so a Trip Pass run does not count there.
- Fallback record: `fee_ledger` rows with `source_type='optimizer_run'` (`server/services/fee-ledger.service.ts:806–817`).

**Trip Pass:**
- `tripHasPass` and `coversAction` (`server/services/trip-entitlement.service.ts:82–109`).
- No caller asks about legs.

**Expert-held:**
- `getTripHandoff` (`server/services/handoff.service.ts:92–102`).
- `HANDOFF_LIVE_STATUSES = proposed | unmatched | accepted | delivered` (`shared/handoff.ts:52`).
- `tripHasWriteAccessAdvisor` (`server/utils/trip-advisor.ts:146`) feeds `expertAssigned`
  (`plancard.routes.ts:799`).

**Ready Made copy:**
- Ruled a paid plan under R-e (spec `:93`). It is not encoded anywhere. The payload has `readyMadeSource`
  (`plancard.routes.ts:865`).

**R-e leak (Brief ≠ code, "Free drafts unchanged" is not true today):**
- With the flag off, `activate-transport` builds a comparison and an "ai" variant with routed drive legs for any owner
  (`server/routes.ts:13530–13588`).
- `buildTripPlan` then renders those variant legs on a free plan (`trip-plan.service.ts:716–728`).

**Trip-scoped engine legs are hidden from travelers:**
- They are born `proposed`, and the traveler read is confirmed-only (`trip-plan.service.ts:732–737`).
- `proposal_status` carries a DB CHECK (migration 154; schema comment `:8080–8083`), so a third value is a CHECK change
  and is out of bounds.

## 11. Where L3's edit trigger would hook

Item writes reach the plan through many paths:

| Path | Location |
|---|---|
| create | `server/routes.ts:13157` |
| patch | `server/routes/trips.routes.ts:3099` |
| delete | `trips.routes.ts:3305` |
| lock | `trips.routes.ts:3083` |
| reorder | `server/routes.ts:13401` |
| retime | `server/routes/versions.routes.ts:77` |
| apply-days | `versions.routes.ts:58` |
| apply-to-trip | `plancard.routes.ts:69` |
| item route | `server/routes/routing.routes.ts:138` |

Beyond those:
- Raw `itinerary_items` writes in 8 files.
- 29 `storage.create/update/deleteItineraryItem` call sites (`server/storage.ts:8032`, `:8070`, `:8090`).
- Handoff suggestion accepts, which replay storage writes (LD 62).
- AI proposal applies.

Debounce constraint: Autoscale keeps no in-process scheduler as an authority (LD 26). A 2 s in-process timer can die
with its instance, so the recompute has to heal itself. That is why it should diff by pair rather than rely on the
timer firing.

## 12. Expected Maps calls (L10)

**Assumed plan:** a settled 5-day Kyoto plan of about 20 legs (spec §14.1). That is about 15 stop pairs plus stay ↔
first and last stop, with about 70 % transit, 25 % walk and 5 % drive under L4.

**One Optimize run under L3 (a), cold cache:**
- 4 versions × about 20 legs = **up to about 80 requests**: about 56 `routes_transit`, about 20 `routes_mode`, about
  4 `routes_drive`. Recorded spend is about $0.40.
- The cache cuts this when versions share a pair in the same hour bucket. The bucket is often different once a version
  re-times, so the realistic figure is 40–80.
- Compare today's run: 4 × about 15 = **about 60 `routes_drive`**, with no stay legs.

**One edit under L3 (b):** at most 2 requests, 0 on a cache hit. A re-time that moves a stop's hour bucket re-asks its
two legs.

**Against the current caps:**
- `routes_transit` (300/day) runs out after **about 5 cold Optimize runs per day across the platform**.
- `routes_mode` (500) lasts about 25 runs.
- The founder should check the transit cap. This lane does not change cap values.

**Caller choice:** line names need the `routes_transit` request (steps); `routes_mode`'s mask has none. So transit
legs bill under `routes_transit` and walk legs under `routes_mode`.

---

## Not proven

- Production's flags were not read, so these are unknown: whether `OPTIMIZER_RUN_RECORDS_ENABLED`,
  `TRAVEL_TIME_SERVICE_ENABLED`, `PLACE_FACTS_PLACES_ENABLED` and the `MAPS_ROUTES_*` switches are on.
- Which writer fills `temporal_anchors.latitude/longitude` for a flight's airport.
- Whether Google bills a 4xx Routes response. The recommendation below records 0 for a failed call whatever the
  answer.
- Google's Routes service terms on caching duration/line/fare for 30 days. Geometry is excluded per the existing
  comment. This needs the same terms check a registry source gets (R-as) before the migration is ruled.

## Decisions the lane needs (not taken here)

1. **Slip mounting vs L11.** `LegRow` between slip stops needs an insertion point inside `SlipView.tsx`'s item JSX
   (`:2471–2583`), and the day-end `LogisticsRow` (`:2577–2579`) has to give way on qualifying plans.
   - (a) Track A adds one render prop from a new Logistics-owned hook, for example
     `renderLegBetween(dayNum, prevId, nextId)`, in the JSX only, leaving the calculation block untouched.
   - (b) Logistics edits `SlipView.tsx` under Track A's review.
   - (c) Slip legs wait; 9a ships the engine, the Trip Card and the Workstation only.
   - **Recommend (a).** It is the narrowest change to a Track A file, and the leg logic stays in Logistics files.
     Hard stop until Track A agrees.
2. **The one routed-legs predicate.** `planGetsRoutedLegs(tripId)`, server-side, read by the compute triggers, the leg
   read and the payload (§18 rule 1). Proposed membership:
   - a completed optimizer run of any basis (`optimizer_runs` plus the comparison's `optimized_at`, with `fee_ledger`
     `optimizer_run` rows as the fallback when run records are off); or
   - an active Trip Pass (`tripHasPass`); or
   - a handoff in `accepted` | `delivered`, **not** `proposed`/`unmatched` (no expert holds the plan yet); or
   - a Ready Made copy (spec `:93`).
   - **Recommend as listed.** Open question: does a withdrawn or approved handoff keep the legs? Recommend yes: once
     computed they stay, and recompute continues only while the plan still qualifies.
3. **Machine legs on a traveler surface vs the §18 L4 "confirmed only" read.**
   - (a) On a qualifying plan, the traveler read also returns engine legs whose tier is Routes, labelled with their
     provenance. An expert's confirm still overrides. Free plans stay confirmed-only.
   - (b) The engine writes `confirmed`.
   - **Recommend (a).** Option (b) breaks "the engine cannot self-confirm" (`trip-transport-legs.service.ts:14–16`),
     and a new status value is a CHECK change.
4. **The cache key when a stop has no place ID** (common, §4).
   - (a) No routed leg; it stays a thin connector.
   - (b) Key on `place:<id>` when known, else `pt:<lat,lng rounded to 5 dp>` from the stop's trusted coordinate, with
     the key kind recorded.
   - **Recommend (b)**, because otherwise most typed stops never route. It amends L2's key, so it is the
     architect's call.
5. **The R-e leak.** Flag-off `activate-transport` writes routed variant legs on free plans (`routes.ts:13530–13588`).
   **Recommend** closing it in 9a: refuse unless the plan qualifies under decision 2, and stop reading variant legs on
   the slip once trip-scoped legs exist.
6. **Optimize's per-version legs.** Today they are drive-only `routes_drive`, and after apply they no longer name plan
   items (§9). **Recommend:**
   - versions compute through the new adapter in the L4 default mode, through the cache;
   - apply-to-trip and apply-days then write the trip-scoped legs for the applied plan (cache hits, so near-zero new
     calls).
7. **Failed calls cost 0.** **Recommend:** the gate records 0 for `success: false` and for a thrown call, and still
   counts the request toward the cap. This touches R299's gate (shared code) and its pinned price test.
8. **The paused line (L5).** **Recommend:** the adapter uses `gatedMapsCall` so `cap_reached` is a distinct outcome,
   carried to the slip as `travelTimesPaused: true`. Add each routing caller's day spend and count to
   `/internal/jobs/health`.
9. **L4's drive arm.** **Recommend:** "transit coverage" is true when the market's transport profile lists any
   available rail, bus or transit mode (`server/data/transport-profiles.ts`), otherwise drive. That is one helper
   beside `defaultLegMode`, and the threshold stays `WITHIN_WALK_METERS`.
10. **Debounce home.** **Recommend:** one `enqueueLegRecompute(tripId)` called from the write paths in §11, with an
    in-process 2 s timer per trip. Recompute = diff consecutive pairs against existing legs by (from item, to item,
    mode, hour bucket) and resolve only the missing or changed ones. A lost timer self-heals on the next edit or at
    T-3 (9b). No new table.
11. **e2e provenance.** CI has no Routes key (A8's own negative space, ledger `2026-09-30-a8-travel-time-built`).
    **Recommend** a stub adapter behind an env switch, on only in the kyoto-slice job, on the `E2E_AI_STUB` pattern,
    so "legs appear with provenance" and "one edit → two legs change" are provable without Google.
