# TC-3b — the ride recommender and the trip profile overlay

Ledger `2026-10-11-tc3b-ride-recommender` (R433). TC-3 brief rev 1, lane TC-3b. Decision-maker
rulings 1–4, Oct 11, 2026. Migrations 370 and 372 are HELD for Leon's approval comments on the PR.

## Phase 0 (read-only) — what the code already had

| Question | Finding |
|---|---|
| Slack per leg | No function returned it. `unreachableStops` (`shared/leg-reachability.ts`) measured each leg's gap but kept only the legs that did not fit. Its stop-departure rule is now exported as `departure` and shared by the recommender. |
| The leg that "decides last admission" | None: FD-3's `after_last_admission` checks an item's start, not a leg. Ruling 1 settles it: every leg INTO a stop with a stored `last_admission` fact (`feasibilityFactsForTrip`) is deciding. |
| Where a day's legs meet the catalog | The plan card's day assembly (`server/routes/plancard.routes.ts`, beside `localTeaser` and `feasibility`). Legs come from `tripLegsShown` (the `planGetsRoutedLegs` gate); routed means `legIsRouted`. |
| Ride catalog reads | By id only. Added `listMarketRides` (`server/services/ride-catalog.service.ts`): market = `resolveMarketSlug(provider_services.city)`, boarding/exit = first/last located route point, departures by the ONE rule `departuresForDate`, which `rideDepartures` now calls too. |
| The two profile read sites | Optimize (`server/itinerary-optimizer.ts`) and leg mode scoring (`server/services/trip-transport-legs.service.ts`). Both now call `getTravelerProfileForTrip`. |
| Free draft | `saveGeneratedItinerarySnapshot` writes no `provider_service_id`, so it cannot insert a ride (pinned by RR8). |

## Rulings (decision-maker, Oct 11, 2026)

1. Every leg arriving at a stop with a stored `last_admission` fact is deciding — no suggestion on it, flagged or not.
2. `rideTeaser` on free plans only, straight-line corridors with the same walking radius and window, no Maps call;
   paid plans get the suggestion and no teaser.
3. `offered` once per trip × leg × service (unique key on the new table), written when the plan card first serves
   it; `accepted` from the ride route; `skipped` from the new owner-only dismiss route, which also writes the corridor
   to the trip overlay so a skipped corridor never re-offers this trip.
4. Height, booking window and mobility filters now; `notes.filters` (passes / payment / luggageMaxCm) as held data
   migration 372, derived only from the seeded `fact_sources` entries.

Walking range 1,200 m; 400 m for limited mobility.

## What landed

| Piece | Where |
|---|---|
| Pure core: corridor fit, hard filters, soft ranking, one per corridor, ≤3 per day, return-pair bonus, teaser | `shared/ride-recommender.ts` |
| Server half: corridors from routed legs (paid) or located pairs (free), deciding set, overlay, `offered` | `server/services/ride-recommender.service.ts` |
| Plan card day keys `rideSuggestions` (paid) / `rideTeaser` (free), owner only | `server/routes/plancard.routes.ts`; types in `shared/trip-plan.ts` |
| `transport_option_events` (migration 370) and its one writer | `shared/schema.ts`; `server/services/transport-option-events.service.ts` |
| Dismiss: `POST /api/trips/:tripId/ride-suggestions/dismiss` | `server/routes/trips.routes.ts` |
| `accepted` on ride insert (the insert now returns its corridor) | `server/routes/trips.routes.ts`; `server/services/ride-item.service.ts` |
| Trip overlay: `PUT /api/trips/:tripId/profile-overlay`; rules; DB writers; §19 strip on the general rails | `shared/trip-profile-overlay.ts`; `server/services/trip-profile-overlay.service.ts`; `server/storage.ts` |
| Overlay merged at both profile read sites | `getTravelerProfileForTrip` (`server/services/traveler-profile.service.ts`) |
| `notes.filters` for the five seeded rides (migration 372), cited in `fact_sources."notes.filters"` | `server/migrations/372_ride_notes_filters.sql` |

## Stated limits

- Booking lead time: `service_transport_facts.booking_window_days` is the MINIMUM number of days ahead a ride must be
  booked (decision-maker ruling 1, Oct 11, 2026 — confirmed). Every seeded ride has it NULL, so it filters nothing
  today.
- Wheelchair (ruling 2, held): no ride states accessibility, so a wheelchair overlay hides every ride, and TC-3b does
  not change that. The next sidecar migration adds `service_transport_facts.wheelchair_accessible` (true / false /
  unknown) together with `price_cents` / `currency`, from operator statements only. Once that field exists, `unknown`
  renders the ride with an "accessibility not confirmed" line and never hides it.
- Occasion fit (ruling 3, held): recorded on every `transport_option_events` row, not used in ranking. It is revisited
  as a soft ranking input after 30 days of offered / accepted / skipped data exist.
- Walk minutes are straight-line at 80 m/min, not routed.
- Eizan has no seeded departures, so it is never offered.
- Pass, payment and luggage filtering waits for a later lane that reads 372's `notes.filters`.
- No UI. TC-3c draws "A better way there" on the LegRow and the swap card (Arashiyama only).

## TC-3c minimal (stacked PR) — "A better way there"

Ledger `2026-10-11-tc3c-better-way-line`. Under a routed leg, `RideSwapLine` (`client/src/components/plan/RideSwapLine.tsx`,
mounted by `useSlipLegs`) draws the server's suggestion for exactly that pair and opens the swap card. Swap = the
existing ride route; "Not this time" = the dismiss. Copy: `client/src/lib/ride-suggestions.ts`. "Arashiyama only"
holds by data (only Sagano and Hozugawa have departures), so no client-side corridor rule was added.
