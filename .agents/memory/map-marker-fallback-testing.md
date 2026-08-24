---
name: MapMarker fallback-mode testing
description: How to verify Google Maps pins when VITE_GOOGLE_MAPS_MAP_ID is unset, plus known env blockers
---

## Fallback mode changes what's in the DOM
When `VITE_GOOGLE_MAPS_MAP_ID` is unset, the shared MapMarker wrapper renders standard `google.maps.Marker` (default red pin). The custom pin children — including all `data-testid="map-pin-*"` elements — are **not rendered** (they are AdvancedMarker children only). InfoWindows are separate components and keep their testids.

**How to apply:** in browser tests, locate fallback pins via `.gm-style [title="<activity name>"]` (Marker `title` prop), never via `map-pin-*` testids.

## ItineraryMapView is orphaned
`client/src/components/itinerary/ItineraryMapView.tsx` (day map with expert drag-to-reorder) has **no consumer** — nothing imports it, so the drag-to-reorder path is unreachable from any page. The workspace "Map preview" collapsed section is action buttons only, not a live map.

## Environment blockers (as of Aug 2026)
- **Google Maps key has no billing**: console shows `BillingNotEnabledMapError` and the "This page can't load Google Maps correctly." overlay on some surfaces (trip page Map View, picker). Maps render degraded; marker clicks/InfoWindows unreliable until the user enables billing on the key's Google Cloud project.
- **Public dev domain 502**: `.replit` had external port 80 mapped to 23636 (mockup sandbox proxy port); remapped 5000→80 but the domain still returned 502 (platform-side forwarding). Local `127.0.0.1:5000` works.
- **OIDC local login**: replitAuth builds callback from `req.hostname`; dev now uses `http://<host>:$PORT/api/callback` for 127.0.0.1/localhost so testers can log in locally.
