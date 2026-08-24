# Ready-Made Trips detail consistency

## Purpose

Make the Ready-Made Trips marketplace and its detail pages read as one consistent product:

- Use the approved Ready-Made Trips slogan in the marketplace masthead.
- Restore the application’s global navigation on every Ready-Made Trip detail page.
- Give image-backed and image-less listings the same stable hero composition.

## Marketplace masthead

On `/ready-made`, replace the current Ready-Made Trips deck with:

> Guided itineraries crafted by verified experts — buy the plan and travel it your way.

## Detail-page navigation

`/ready-made/:id` must render inside the shared application layout so it receives the same global navigation as the rest of the public marketplace.

The page’s private compact header (logo, “Ready Made Trips” label, and language menu) will be removed to avoid rendering two navigation systems.

## Hero treatment

Every Ready-Made Trip detail page will use the same two-column hero frame:

- **Left:** the listing’s real cover image when one exists. If none exists, render a branded destination fallback with the market name. The fallback must not reuse another listing’s image or invent itinerary/map data.
- **Right:** the existing route-preview map and purchase lock message.

The format-specific neighborhood strip remains unchanged. The route preview remains a teaser and does not expose private stops.

## Explicitly out of scope

- No changes to listing data, cover-image records, maps, itinerary content, or purchase data.
- No changes to checkout, cloning, pricing, or access rules.
- No changes to template-product routes or terminology outside the approved Ready-Made masthead slogan.

## Verification

- Field Guide build succeeds.
- `/ready-made` shows the exact approved slogan.
- Both an image-backed and image-less Ready-Made Trip show global navigation and the same two-column hero geometry.
- A listing with no image shows the truthful destination fallback rather than an empty or map-only header.
- Existing route-preview and purchase controls remain visible and functional.