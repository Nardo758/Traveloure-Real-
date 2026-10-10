# P0 — legs baseline (Kyoto)

Ledger `2026-10-10-p0-legs-baseline` (R417). Decision-maker rulings, Oct 10, 2026.

## Evidence (production, read-only, Replit, Oct 10, 2026)

- `TRAVEL_TIME_SERVICE_ENABLED` is **absent** in production: the routing engine has never run there.
- Kyoto, last 30 days: **9 legs**, all `(legacy)` confirmed (8 `driving`, 1 `taxi`); **0 engine legs**.
- 141 consecutive located stop pairs, **132 with no leg**.
- All 19 Kyoto trips carry `market_slug='kyoto'` — the slug was not the cause; aliases (ruling 5) are hardening.

So every `drive` a traveler saw came from the legacy pre-engine writer (`computeSingleLeg`, which writes
"driving" on every leg), and the gaps are pairs no writer ever routed.

## Rulings and what landed

1. **Bridge unlocated stops.** `desiredPlanLegs` connects consecutive LOCATED stops within a day; each
   adjacent pair with an unlocated end is still reported as `missing_coordinates`. A→(B unlocated)→C gets A→C.
   The slip draws the bridge in the slot before C (`slipLegBetween`).
2. **Transit `no_route` → drive once, labelled.** `routeWithTransitFallback` (`server/services/routing/route-memo.ts`,
   ONE helper for the plan writer and the version legs). The row stores `alternative_modes[0].reason =
   'transit_unavailable'` and reads "No transit found — drive shown". Transit and drive both without a
   route ⇒ the pair has no leg and the prior leg is deleted (E8); the pair is a "no route found" marker,
   counted on the FD-3 day line (`DayFeasibility.noRoute`, from the ONE `planLegGapsByDay`). The fallback
   drive keeps the DESIRED (transit) leg key so an unchanged pair is not re-asked every run, and it is
   never seeded into the run memo as a transit answer.
3. **Departure anchor.** No time of day ⇒ a fixed local **10:00** on the trip day (never server-now). The
   hour bucket is unchanged ("no time ⇒ own bucket"), so route keys and N1–N4/E14 stand. A **past-dated
   day** is never routed: no call, nothing recomputed, nothing deleted (plan writer and version legs).
4. **Legacy writer retired on routed plans.** `activate-transport` and `generateTripTransportLegs` write
   NOTHING on a routed plan when the engine is off (`engineOff: true` on the route's answer); the
   variant-path code is deleted (§18c). The legacy writer serves non-qualifying plans only.
5. **Market-slug aliases** (`server/config/market-aliases.config.ts`): a second pass of normalised
   whole-word containment of a market's key, city name or alias; `notIf` words veto (another Porto, another
   Cartagena); two markets ⇒ NULL. Operating markets only.
6. **Re-check counts missing pairs, never writes legs** (`LegRecheckResult.missing`, jobs' `legsMissing`,
   each present only when > 0).
7. **Confirmed legacy legs re-routed on the first engine run.** A confirmed `source IS NULL` trip leg on a
   pair the plan still has, on a day not over, is routed (the expert's own `user_selected_mode` kept as the
   mode, else the engine's default). The new row is an engine leg that keeps `confirmed`, the expert's
   stamp, tip and pickup; the legacy row is superseded — `proposal_status` NULL (hidden from every trip
   reader) and `origin='superseded'` — never deleted; the mode change is logged in `itinerary_changes`.
   A pair with no route keeps its legacy leg. A confirmed ENGINE leg is never recomputed or removed by
   the diff.

## The flag (config, not code)

`TRAVEL_TIME_SERVICE_ENABLED=1` turns the engine on. **Leon sets it in Deployments after the deploy that
carries P0 — not before.** Until then routed plans show no machine legs (ruling 4); that is honest (§13),
and nothing is written.

## First run in production

The engine never runs on the flag flip itself. A plan is routed when something triggers it: an item
edit (2 s debounce), activate-transport, Optimize/apply, or Finalize — and only on a plan that earns routed
legs (`planGetsRoutedLegs`) with **chosen dates**. A plan with placeholder dates writes **nothing**
(`dates_not_confirmed`, E15; E11 for a free plan).

Expected call volume, upper bound for all 19 Kyoto trips if every one qualified and were triggered the same
day: 141 located pairs (+ up to two stay legs per day where a stay is located) → at most one transit call per
pair, plus one drive call for each transit `no_route`, plus the 9 legacy re-routes. That is under ~350
Routes calls in the worst case — well inside the transit cap (`MAPS_ROUTES_TRANSIT_DAILY_CAP`, 2,000/day).
Walk legs (≤ 1.2 km) go to `routes_mode`, drive fallbacks to `routes_drive`, each under its own cap. A cap
hit answers `paused` and leaves legs as last computed.

## Held — needs data or ruling

- **E9/E10 — SANCTIONED (decision-maker, Oct 10, 2026).** Before: a confirmed leg is never recomputed.
  After: a confirmed engine leg (`source` set) is never recomputed; a confirmed legacy leg (`source IS
  NULL`) is re-routed once on the plan's first engine run, stays confirmed with the expert's
  stamp/tip/pickup, and the legacy row is hidden. Recorded as the LD 63 amendment.
- **Follow-up (held): `superseded_at`.** `origin='superseded'` is accepted for P0 (no migration, nothing
  else reads it), but `origin` is a provenance field, not lifecycle. When the next `transport_legs`
  migration happens anyway, add a nullable `superseded_at` and move this marker there.
