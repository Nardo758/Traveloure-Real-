# Workstation location resolution + map surface — build spec

**Decision-maker approved Aug 8 2026.** Branch: `claude/sync-local-repo-2j7ghv`. Two parts, in order.
Verify: tsc ≤ 190, check-money-endpoints / check-omit-schema-ratchet / check-unmounted-routers all
exit 0, `npx vite build` green. Read CLAUDE.md first.

## Part A — shared location resolver
The build's location chip and item locations are free-typed strings today. Build:
1. Places autocomplete on the workspace location field and `InlineAddItemForm`
   (client/src/pages/expert/workspace.tsx), resolving to canonical place name + lat/lng.
2. Items added via DMO/custom get coordinates auto-populated where the source carries them,
   else geocoded SERVER-SIDE. Check for an existing GOOGLE/PLACES key env var first
   (`google-places-photos.service.ts` is photo-only but may share one). Never expose an
   unrestricted key client-side. If no key exists, STOP and ask the decision-maker for one.
3. Write into the EXISTING `itinerary_items.latitude/longitude/city` columns — no schema change.
4. **No fabrication** (§6b / migration-129 posture): a place that fails to geocode stays
   coordinate-less — never a guessed centroid.
5. This resolver is SHARED: it also feeds the segmentation engine's city resolution
   (`optimizer-segmentation-bridge.service.ts` reads `item.location`) and the future per-segment
   transport/geocoding scoping (`docs/findings/TRIP_SEGMENTS_B_CONSEQUENCE_MAP.md`). One
   resolver, not three.

## Part B — map surface in the Workstation
A map view toggle beside the list view in workspace.tsx's center pane:
- Items as pins, colored/grouped by `dayNumber`; pin click focuses the list item and vice versa;
  fit bounds to the focused day.
- Items without coordinates appear in a visible "not on map" tray — never a guessed pin.
- Key handling: Google Maps JS needs a referrer-restricted client key (VITE_ var). If none is
  available, implement with Leaflet + OSM tiles (keyless) and mark the Google swap point — the
  decision-maker prefers Google when a key is provided.

## Invariant that must not break
The Workstation and the traveler Slip share ONE canonical store (`trips` + `itinerary_items`).
The map reads the SAME rows the list reads — no parallel data, no private format.
