# Finding: Transport-mode taxonomy is divergent across the client

**Status:** open — needs its own audit + brief (do NOT fold into the PlanCard
per-leg mode build; that pass was styling-only).
**Surfaced by:** PLANCARD_TRANSPORT_BY_LEG_BUILD Phase 4 (mode-config
consolidation). Phase 4 consolidated *styling only*; this finding is what it
deliberately left alone.

## Summary

There is no single transport-mode identifier vocabulary on the client. There are
(at least) **three divergent identifier sets**, two of which are persisted or
bound to a backend API contract — so they cannot be collapsed without a data
migration and/or backend coordination. A naive "one mode list" refactor would
corrupt persisted `transport_legs.userSelectedMode` values and/or break the
`/api/transport-packages/generate` request contract.

What Phase 4 *did* safely centralize (styling only): per-mode color, icon, and
map polyline stroke + the canonical display id list, now in
`client/src/lib/transport-modes.ts`. All styling lookups fall back gracefully for
unknown/foreign ids (neutral color, Footprints icon, default gray stroke), so the
divergent ids below still render cleanly today.

## The three identifier taxonomies

### 1. Display / styling vocabulary (canonical, now centralized)
`walk, train, taxi, car, bus, shuttle, ferry, bicycle`
- `client/src/lib/transport-modes.ts` — single source (TRANSPORT_MODES registry).
- Consumers: `plancard-types.tsx` (re-export), `MapControlCenter.tsx`,
  `TransportSection.tsx`, `itinerary-view.tsx` (`AVAILABLE_MODES`).

### 2. Persisted PATCH vocabulary — `ENHANCED_MODES`
`private_driver, rental_car, rideshare, taxi, transit, train, bus, walk, bike, ferry`
- **`client/src/components/itinerary/DayTransportPanel.tsx:33`** — definition.
- Used at `DayTransportPanel.tsx:297` (builds the picker) and sent as
  `selectedMode` to `PATCH /api/transport-legs/:legId/mode`
  (**`DayTransportPanel.tsx:310`**) → **persisted** to
  `transport_legs.userSelectedMode`.
- Risk: these ids (`private_driver`, `rideshare`, `transit`, `bike`, …) already
  live in the database. Renaming/merging requires a data migration.

### 3. Package-generation API vocabulary — `TRANSPORT_MODES` (local)
`private_car, rideshare, public_transit, shuttle, walking`
- **`client/src/components/trip-transport-planner.tsx:146`** — definition.
- Drives `MODE_DURATION_MULTIPLIER` (cost/duration math) and is sent as `mode`
  to `POST /api/transport-packages/generate`
  (**`trip-transport-planner.tsx:467` / `:495`**).
- Risk: bound to the server's expected request shape. Renaming requires backend
  coordination.

## Also divergent: a 6th polyline styler (not in the original Phase 4 list)

- **`client/src/components/itinerary/ItineraryMapView.tsx:44`** —
  `getModePolylineStyle(mode)` with its *own* groupings and weights
  (e.g. walk strokeWeight 2 vs 3; `transit`/`train`/`bus`/`tram` all share one
  blue stroke; handles `tram`). Because its visuals and taxonomy differ from the
  centralized styler, it was left untouched to avoid a behavior change. Folding
  it in should happen alongside the taxonomy decision above.

## Recommended next step (separate brief)

1. Decide the canonical transport-mode vocabulary (likely a superset with
   explicit aliases).
2. Add a normalization/alias layer (foreign id → canonical id) used at the
   persistence and API boundaries.
3. Backfill `transport_legs.userSelectedMode` and align
   `/api/transport-packages/generate` to the canonical set.
4. Then point `ENHANCED_MODES`, `trip-transport-planner.TRANSPORT_MODES`, and
   `ItineraryMapView.getModePolylineStyle` at the shared registry.

This is analogous to the route-defrag / auth findings: a deliberate, owned
change, not a drive-by refactor.
