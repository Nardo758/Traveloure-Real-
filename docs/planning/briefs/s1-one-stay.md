# S1 — one stay on the plan (brief, rev 1)

Ledger `2026-10-09-s1-one-stay` (numbered at merge). Decision-maker rulings of Oct 9, 2026. This file is the brief:
the two definitions, the six rulings, the Phase 0 findings they were made against, and what the server half built.

## Definitions

- **S1 — "one stay on the plan".** The plan's Where-to-stay surface shows ONE stay, picked by Optimize's routed
  drive-time and reachability against the plan's located stops. **Never by price or commission.**
- **9a-ii — self-hosted OSRM as a `RoutingAdapter` provider for walk and drive.** Approved Oct 9, 2026, queued in
  Logistics after the board PRs. **When 9a-ii is live, S1's prune and budget are removed** (rulings 1–2 below are
  temporary because Google bills per element; a self-hosted router does not).

## Rulings (decision-maker, Oct 9, 2026)

1. **Score.** One Route Matrix request per hotel → every located stop on the plan's dates. Keep "closest on most
   days, then least total time".
2. **Budget counts ELEMENTS** (what Google bills and the cap measures).
   - **Free:** the top 3 hotels by straight line within the top neighbourhoods.
   - **Paid** (`planGetsRoutedLegs` true): hotels in the plan's neighbourhoods, in straight-line order, scored until
     150 elements are spent. The pick comes only from scored hotels, and the payload carries scored/total.
   - The calls count against `MAPS_ROUTE_MATRIX_DAILY_CAP` like any other call.
3. **Storage:** migration 359, additive and nullable — `ALTER TABLE trips ADD COLUMN IF NOT EXISTS stay_pick jsonb;` —
   holding `{hotelId, scoredCount, candidateCount, stopsHash, computedAt, tier}`. APPROVED by the founder,
   Oct 9, 2026.
   - **Compute** at Optimize finish, Trip Pass purchase, handoff accept, and on the post-debounce stops refetch when
     `stopsHash` changes. **Never on read.**
   - A re-score replaces the pick and sets a `changed` flag that the card reads once.
4. **Tier test:** `planGetsRoutedLegs` replaces `hasPaidOptimizerRun`.
5. **Rank-input test:** no price or commission field is reachable from the scorer, on either tier.
6. **Lane split:** this lane builds the server half and the payload. The card belongs to the Conformance lane's
   Compare PR: its copy, "scored N of M nearby", "View on hotel's site" (to the hotel's own domain), and the swap via
   "Add places I'm considering". This lane does not touch `SlipView`/`SlipRail`.

## Phase 0 findings (read-only, on `main` at `d1b9720`, R383)

- **Neighbourhoods** are ranked and cut to the top 3 (`WHERE_TO_STAY_TOP`, `shared/where-to-stay.ts:75`). The
  ranker is `rankStayNeighborhoods`: most days closest, then least total straight-line distance.
- **Hotels** are bucketed into their nearest neighbourhood and cut to 3 each by straight line to the centroid
  (`hotelsByNeighborhood`, `shared/where-to-stay.ts:226`). **No hotel was ever scored by routed time.**
- **The paid matrix path** ranked neighbourhoods from the launch-city travel-time matrix only after a PAID
  optimizer run (`hasPaidOptimizerRun`, `server/services/where-to-stay.service.ts`). That test missed Trip Pass,
  handoff and Ready Made plans.
- **The paid predicate already exists:** `planGetsRoutedLegs` (`shared/plan-routed-legs.ts`), loaded by
  `tripGetsRoutedLegs`. It is true for a finished Optimize run, an active Trip Pass, an accepted / delivered /
  approved handoff, or a Ready Made copy.
- **The matrix caller:** `route_matrix` in `shared/maps-billing.ts`. Its cap counts ELEMENTS
  (`MAPS_ROUTE_MATRIX_DAILY_CAP`, default 10,000). `gatedRouteMatrixFetch()` already sends a request through the
  gate with its element count and throws when refused.
- **The hotel inventory** (`cityHotels`): platform accommodation listings, `hotel_cache` and affiliate lodging,
  located rows only. It selects no price or commission column.
- **Triggers that already exist:** Trip Pass grant (`trip-entitlement.service.ts`) and handoff accept
  (`handoff.service.ts`) both queue the debounced leg recompute (`plan-legs-queue.ts`). Optimize runs start in
  the background in `server/routes.ts`, at both the create and the regenerate entry points.

## What was built (server half)

| Piece | Where |
|---|---|
| Pure rules: candidate shape (5 keys, no money field), allowlist projector, straight-line order, free top 3, element budget (whole hotels only), the ONE ranker (reachability → closest days → total → name), stops fingerprint, stored-pick reader and `changed` rule | `shared/stay-pick.ts` |
| The ONE writer of `trips.stay_pick`: loads the stops on the plan's dates; candidates in the plan's neighbourhoods (each stop's nearest centroid); one DRIVE matrix request per hotel through `gatedRouteMatrixFetch`; stops on a refused or failed call; ranks the scored; writes. Serialised per plan in-process. | `server/services/stay-pick.service.ts` |
| Read: `stay` block on `GET /api/trips/:tripId/where-to-stay`; tier from `tripGetsRoutedLegs` (ruling 4); no Maps call | `server/services/where-to-stay.service.ts`, type in `shared/where-to-stay.ts` |
| The card's one read: `POST /api/trips/:tripId/stay-pick/seen` (owner or managing assistant; one 404 otherwise) | `server/routes/plan-option-sets.routes.ts` |
| Triggers | `server/routes.ts` (both Optimize entry points), `trip-entitlement.service.ts`, `handoff.service.ts`, `routing/plan-legs-queue.ts` |
| Migration 359 (approved Oct 9, 2026) and its declaration | `server/migrations/359_trips_stay_pick.sql`, `shared/schema.ts` (omitted from `insertTripSchema`, stripped in `storage.updateTrip`) |

### The payload (for the Conformance lane's Compare PR)

`GET /api/trips/:tripId/where-to-stay` gains `stay` on an eligible view:

```ts
type WhereToStayStay =
  | { tier: "straight_line"; hotels: StayHotel[] }            // free plan: up to 3
  | {
      tier: "routed";                                         // planGetsRoutedLegs
      pick: StayHotel | null;                                 // null before any pick, or the hotel left our inventory
      scoredCount: number | null;                             // "scored N …"
      candidateCount: number | null;                          // "… of M nearby"
      changed: boolean;                                       // show once, then POST …/stay-pick/seen
      computedAt: string | null;
    };
// StayHotel = { kind: "platform" | "hotel_cache" | "affiliate"; id; name; starRating; photo? } — no coordinates, no price.
```

**FU-S1-2 (ledger `2026-10-09-fu-s1-2-stay-link`):** each `StayHotel` in `stay` may carry
`stayLink: { kind: "own" | "google" | "maps"; url: string }` — the card's ONE link. On the list it is `own` (the
provider's site) or `maps` ("View on Google Maps", built with no API call). When the PICKED stay's card is opened,
call `GET /api/trips/:tripId/stay-pick/link` → `{ stayLink }`: the hotel's own site where Google knows one ("View on
hotel's site"), else Google Maps. `google` and `maps` must be drawn with the "Google Maps" attribution. Absent ⇒ no link.

Binding the pick uses the EXISTING `POST /api/trips/:tripId/where-to-stay` `{ kind: "stay_here", hotel: { kind, id } }`.

## Interpretations taken (said here so they can be overruled)

- **"The plan's neighbourhoods"** means the neighbourhood nearest each located stop. A city with no neighbourhood
  rows has none to filter by, so every located hotel in the city is a candidate. They are still in straight-line
  order and still under the budget.
- **Straight-line order** is the same ranker over metres: the closest days by straight line, then total distance.
- **A hotel is scored whole or not at all.** A half-scored hotel would be ranked on a subset of the stops, so
  scoring stops at the first hotel whose stops no longer fit the budget. Example: 7 stops → 21 hotels = 147 elements.
- **Reachability first.** A hotel with an unreachable stop ranks behind every fully reachable one.
- **`hotelKind` is stored beside `hotelId`.** Ids are only unique within a kind (platform, `hotel_cache`,
  affiliate), so this extends the ruled shape by one field.
- **Nothing scored keeps the earlier pick** (a cap-paused day never erases an answer). Its `stopsHash` stays old,
  so the next trigger tries again.
- **The free list uses the same date filter** as the paid scorer: stops on the plan's dates only.

## Recorded, not fixed

- **Cost record — FIXED by FU-S1-1 (ledger `2026-10-09-fu-s1-1-stay-pick-cost`):** each stay-pick request now
  records its dollars on its own `route_matrix` gate row (`metadata.purpose = 'stay_pick'`, `ref` = the plan) at the
  Essentials list price, and its elements still count against `MAPS_ROUTE_MATRIX_DAILY_CAP`.
- **Cross-instance overlap:** two server instances can score the same plan at once. Each run stays inside the
  budget, and the later write wins.
- **The debounced trigger** runs only while `TRAVEL_TIME_SERVICE_ENABLED` is on (the queue's own switch). The other
  three triggers do not depend on it.
- **Wider matrix ranking:** ruling 4 also widens the neighbourhood ranking's matrix path from "paid run" to every
  `planGetsRoutedLegs` plan (Trip Pass, handoff, Ready Made).

## Removal condition

When 9a-ii is live, delete `STAY_PICK_ELEMENT_BUDGET`, `planStayScoring` and the straight-line prune: every
candidate is scored through the self-hosted adapter, and `scoredCount` equals `candidateCount`.
