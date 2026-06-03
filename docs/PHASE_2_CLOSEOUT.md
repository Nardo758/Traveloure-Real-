# Phase 2 closeout — IA split & consolidation

Closes Phase 2 of the v2 design spec
(`docs/DISCOVER_LOCATION_MARKETPLACE_DESIGN_SPEC_v2.md` §10).

## What shipped

### Routing & IA

| Route | Before | After |
|---|---|---|
| `/discover/location/:city?country=` | Did not exist | LocationView shell; fetches from `/api/discover/location/:city`. The destination Decision #5 commits to. |
| `/spontaneous` | Standalone page with city input + Live Intel UI | Redirects to `/discover`. Page component preserved in repo for Phase 3 reuse. |
| `/discover` hero | Had "Live Intel" button | Button retired; "Build a Trip from a Template" CTA remains. |
| `/browse` | Already redirecting → `/discover` (no change needed) | Same. |
| `/discover-experiences` | Already redirecting → `/discover` (no change needed) | Same. The spec's `?tab=packages` qualifier is obsolete since Phase 1a retired the Packages tab and the CTA banner now covers that flow. |

### Verification tooling

| Change | Why |
|---|---|
| `verify-phase-1b.ts` SKIP vs FAIL split | Source pool zero → SKIP (not a regression). Source pool nonzero but matched zero → FAIL (real broken backfill). User refinement; blanket SKIP-on-zero hid broken backfills, blanket FAIL false-alarmed sparse markets. |

### LocationView shell

`client/src/pages/discover-location.tsx` lands the **five-section IA** the
retirement plan (`docs/CITY_DETAIL_VIEW_RETIREMENT_PLAN.md`) corrected to
after the Media + AI Insights audit:

1. **Hero** — overview + happening-now strip + live-activity.
2. **Supply** — recommendations + featured providers (featured-sort guardrail).
3. **By Neighborhood** — gems + services rolled up by `city_neighborhoods` slug.
4. **Media** — videos grid + photo gallery, full surface.
5. **Insights** — the 9 AI subcards, full panel.
6. **Events** (bottom, may extract in Phase 6) — by-date view per §4.

Each section is wired to the orchestrator endpoint (Phase 1b-3) with
per-section `{ data, error }` envelopes. Phase 3 swaps each section's
placeholder for a real renderer — purely a rendering task at this point,
not a fetch task. The By-Neighborhood section already shows real data
when visiting `/discover/location/Kyoto` because Phase 1b-1 seeded
8 Kyoto neighborhoods.

## What Phase 2 explicitly did NOT do

- **CityDetailView still embedded by CityGrid + GlobalCalendar.** The
  retirement plan reserved the call-site swap for Phase 3's closing
  commit, after the new view absorbs the tabs' content. TODO marker
  on `CityDetailView.tsx` notes the upcoming retirement.
- **Section renderers are placeholders.** Each Phase 2 section shows
  what data it received and a "Phase 3 will render: X" line. No
  real cards, no real gallery, no real charts yet.
- **Two-top-level-views (by location / by date)** is the IA *concept*
  Phase 2 commits to; physical surfacing in the global nav is Phase 3
  alongside the renderer work.

## Open from Phase 2

None. Decision #5 was made before Phase 2 started; the `/spontaneous`
question was answered during Phase 2 (absorb, per-city, preserve route
as redirect). All §10 Phase 2 items checked.

## Phase 3 inherits

1. **Replace the six section placeholders** in
   `client/src/pages/discover-location.tsx` with real renderers.
   The data shape is fixed by the orchestrator's `LocationViewPayload`;
   no API surgery needed.
2. **Universal card pattern** (split-row ≥768 / stacked <768) per spec §2.
3. **Add-to-experience** action on supply cards — extend the existing
   "Add to trip" dialog to also target experience templates.
4. **Swap the CityGrid + GlobalCalendar embed sites** to render
   `DiscoverLocationPage` (or its components), per the retirement plan.
   Delete `CityDetailView.tsx` only after both embed sites verify and
   ship.
5. **Reuse SpontaneousDiscovery's primitives** (time-window picker,
   quick-search fetch) inside the Hero section's happening-now strip.
   The component is still in the repo for that reason; remove once
   absorbed.
6. **Add the global nav "By Location / By Date" surfacing** so the IA
   concept becomes visible in the chrome, not just in URLs.

## Phase 4 inherits

Spec §10 critical path: **Phase 3's neighborhood UI cannot ship until
Kyoto has data**. Today's verification confirmed Kyoto rolls up empty
(8 neighborhoods, 0 gems, 0 services). Phase 4 (blended network fill)
is now load-bearing for launch, not optional.

Phase 4 needs Phase 2 complete (it is) before starting.
