# L27 — Visually mapping the plan being built (Fable-designed, Jul 30 2026)

Reported by the decision-maker: *"the Workspace building surface doesn't allow the user to visually map the
plans they are building"* — Expert and Service Provider consoles. Ground truth: the L27 phase-0 audit.

## The finding that reshapes this: the renderer already exists, and the blocker is not the map

`client/src/components/itinerary/ItineraryMapView.tsx` (442 lines) was built **specifically for an expert
editor** — numbered ordered pins, mode-styled connectors between consecutive stops, ghost pins showing an
item's pre-move position, and `isExpertMode` **draggable markers whose drop reorders the day**. It has **zero
consumers**. It was written and never wired.

Meanwhile the Workstation's one map (`workspace.tsx:2274`) is a **discovery** surface — it pins *search
results* with "+ Day N" actions and never pins what is already on the plan. And the embedded PlanCard's map
view is switched off at `PlanCard.tsx:969` on the strength of a comment at `:943-944` claiming *"the builder
has its own Map tab (same MapControlCenter)"* — **that Map tab never shipped**; the Workstation's tabs are
`add · gaps · distribute`. The gap is literally written down in the codebase as a deferral to something that
does not exist.

**So the missing work is mostly not "build a map." It is (1) capture coordinates, (2) wire the existing
renderer, (3) be honest about coverage.**

## THE REAL BLOCKER — no add path writes coordinates (fix this first, it is cheap and it is the whole ballgame)

- **Platform-services add (`workspace.tsx:1519-1540`) DISCARDS `result.location.lat/lng`** — the very
  coordinates it just used to draw the pin the expert clicked. Free, accurate coordinates, thrown away.
- **DMO add (`dmo-picker-modal.tsx:121-127`) stores `item.neighborhood` as the location** — a neighborhood
  *name*, so several stops in one neighborhood geocode to the **same centroid**.
- **Custom add** has a free-text location that may be blank → never pinned.
- Coordinates therefore arrive only later, as a side effect of `resolveMissingItemCoordinates` during
  plancard assembly, capped at **12 per request**, so the same map changes between reloads with no user action.

**Phase 1 = pass the coordinates through at every add path that already has them** (platform-services
first — it is a few lines), and carry DMO coordinates when the DMO row has real ones rather than a
neighborhood name. No map work. This alone makes every downstream spatial feature honest.

## §13 HAZARD — a sparse plan map is WORSE than no plan map

A map showing 3 of 9 stops **reads as a compact day** when the real day zigzags. That is a fabricated
impression built from real data — exactly the class §13 forbids. **Hard requirement: the plan map must state
its own coverage** ("6 of 9 stops located · 3 need a location") and must never silently draw a partial route.
Items lacking coordinates get an explicit, actionable list — today *nothing* anywhere tells an expert which
items are unlocated.

## Phase 2 — wire the plan map (expert)

Reuse `ItineraryMapView`, do not write a third renderer. Required corrections while wiring:
- **Join legs to activities by `fromActivityId`/`toActivityId`**, not by the name/location string equality with
  positional fallback that `MapControlCenter.tsx:91-92` uses — that join is fragile precisely when the plan is
  being actively edited, which is this surface's whole purpose.
- **Delete `ItineraryMapView`'s duplicated mode-style registry** (`:44-96`) in favour of the single
  `lib/transport-modes.ts` (already filed in the transport-mode taxonomy audit). Wiring it as-is ships the
  divergence into the console.
- **Fix the stale comment** at `PlanCard.tsx:943-944` — leaving it means the next auditor re-litigates this.
- Its own error boundary (a Maps billing/key failure must not blank the builder — the §17 P1 precedent), and
  note the page will then mount a **second** map with no shared `APIProvider`; consider hoisting one.
- Straight-line connectors are the honest limit: `transport_legs` stores **no geometry** and legs are haversine
  (`transport-leg-calculator.ts:146`). Real polylines are fetched by `routes.service.ts` but never persisted.
  A straight line **understates** a bad route, so the map must not be sold as a routing check.
- **Reuse, don't rebuild:** `smart-sequencing.service.ts:870-905` already computes nearest-neighbour spatial
  clustering server-side — the numeric "is this a zigzag?" answer exists and its endpoint has zero callers.

## RATIFIED (decision-maker, Jul 30 2026): the BUILD map draws proposed legs too

Traveler surfaces show **confirmed legs only** (ratified §18 L4). At build time the expert is exactly the
person who should see and confirm machine proposals. **Fable recommends: draw `proposed` legs too, visually
distinct (dashed/muted) and labelled, with confirmed legs solid** — so the map doubles as the confirm surface.
This deliberately differs from the traveler rule; it needs a yes/no because it is a §13-shaped choice about
showing machine guesses.

## Provider console — a DIFFERENT problem, smaller

The provider need is **placing and verifying one location**, not mapping a multi-stop plan. Today every
provider location field is free text with no map, pin, or geocode: `meetingPoint` is a **Textarea**
(`ServiceForm.tsx:1528`), plus `serviceArea`, `pickupAddress`, and property `location`. Migration 129's
`latitude`/`longitude`/`city`/`location_precision` columns are written **only** by that migration's
neighborhood-centroid backfill and read by **nothing** — `location_precision` has zero app references, and
`/api/search/experiences` hardcodes `location: null` for platform inventory (`content.routes.ts:5749`), which
is why provider inventory never pins on the expert's browse map even when it has centroid coordinates.
**Phase 3 = a single-point picker (map pin + confirm) writing real `latitude`/`longitude` and
`location_precision='exact'`, plus a reader so platform inventory finally pins.** This is a write-path build,
not a renderer build — and it makes the expert's discovery map better as a side effect.

## Sequence
1. **P1 coordinate capture** (Sonnet) — no map, biggest payoff, unblocks everything.
2. **P2 expert plan map** (Sonnet) — wire `ItineraryMapView` + coverage honesty + the three corrections.
3. **P3 provider location picker** (Opus — it adds a write path to a money-adjacent catalog row).
Cost note: Maps spend is currently unguarded (no `express-rate-limit` anywhere in `server/`; `/api/geocode`
and `/api/search/experiences` are unauthenticated billable proxies). Worth a guard before adding map surfaces.
