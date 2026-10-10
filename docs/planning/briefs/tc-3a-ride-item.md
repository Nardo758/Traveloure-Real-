# TC-3a — the ride as a plan item

Ledger `2026-10-11-tc3a-ride-item` (R?, numbered at merge). TC-3 brief rev 1 (decision-maker, Oct 10, 2026), lane TC-3a.
Migration 368 is HELD for "Migration 368 SQL approved — Leon". Migration 369 (the seed) waits on Chrome's official reads.

## The rules every TC-3 part inherits
1. Swap, don't list — one "better way there" per leg, two or three per day.
2. Only on legs with slack, never the leg that decides last admission.
3. Out-one-way-back-another is a ranking bonus, not a constraint.
4. Fit by occasion and party.
5. The local's timing note is the product — local tier.
6. Arrivals and departures count.
7. Always show extra minutes and money from operator data.
8. Rank by fit and acceptance, never by commission.

Profile rule: hard filters (mobility, kids' height, luggage day, passes held, booking lead time, payment
constraints) decide what is possible and hide what fails; soft ranking (budget, occasion, pace, scenic preference)
only reorders. Kids/mobility are trip-level, opt-in, never inferred, never copied to the account profile without an
explicit ask, never used for nudges or marketing.

## What TC-3a builds (and nothing of 3b/3c)

| Piece | Where |
|---|---|
| Exit pin columns `itinerary_items.exit_latitude/exit_longitude` | migration 368; `shared/schema.ts` (itinerary_items) |
| Exit pin is server-only | `insertItineraryItemSchema` omits it; `stripItineraryItemRoutingFields` strips it |
| Engine routes the leg after a ride from its exit | `PlanStop.exitPoint`, `DesiredLeg.origin` (`server/services/routing/plan-legs.ts`); loaded in `loadPlanLegContext`; used by the plan writer, leg options and the P0 re-route |
| `superseded_at` / `superseded_by_item_id` on `transport_legs` | migration 368; P0's `origin='superseded'` moved over (held follow-up closed) |
| `service_transport_facts` (one row per catalog ride; `official_source` required) | migration 368; `shared/schema.ts` |
| Ride insert — catalog-only, owner-only, born locked, schedule from the catalog, supersedes the confirmed A→C leg | `server/services/ride-item.service.ts`; `POST /api/trips/:tripId/rides` (`trips.routes.ts`) |
| Ride removal restores exactly the legs it superseded | `storage.deleteItineraryItem` (same transaction) |
| A locked ride survives snapshot re-apply and proposal apply | existing `itineraryItemRebuildDeletable` (proven by R6) |

## Migration 369 — the seed (NOT in this PR)
Sagano Romantic Train, Hozugawa river boat, Eizan Kirara. Official sites are unreachable from the build
container, so every field comes from Chrome's official reads. Per row, the read must give:

- Official page URL (becomes `official_source`, required)
- Boarding and exit stations/piers with coordinates (OpenStreetMap, attribution recorded)
- Departures (times; season/day pattern) and running duration
- Operating calendar and closures (dates or weekdays)
- Weather/cancellation rule and what the traveler should do instead (routed fallback mode)
- Luggage rule, party limits, booking window (days ahead), payment constraints
- Pass validity (JR Pass / Kansai pass accepted or not)
- Price per seat or per vehicle, in yen

Anything the read does not confirm stays NULL; a row is seeded INACTIVE and goes live only once it is verified.

## Brief amendments (decision-maker, Oct 10, 2026)
- **`superseded_by_item_id` — KEPT.** Restore must be exact: removing a ride brings back exactly the legs that
  ride superseded, and a leg the engine superseded (P0 ruling 7, ride link NULL) never comes back on an
  unrelated ride's removal.
- **L8/E9 re-pointed from `origin='superseded'` to `superseded_at` — SANCTIONED** (the marker move was in the brief).
- **Queue:** TC-3a lands as R428, after SS-2 D. The 369 seed and the "Traveloure Transport" operator account
  follow in their own PR once Chrome's official reads land.

## Held — needs data or ruling
- "Migration 368 SQL approved — Leon" on the PR.
- Chrome official reads for 369 (checklist above) — a separate PR.
