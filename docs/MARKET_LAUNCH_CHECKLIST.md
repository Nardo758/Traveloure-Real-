# Market Launch Checklist

Internal reference for standing up a new launch market end-to-end. Companion to the "Add market"
admin flow (`/admin/markets`, `server/routes/admin-markets.routes.ts`) — CLAUDE.md's market
geography ruling (migration 186, Aug 9 2026). The admin page's "Manual launch steps" panel
hardcodes a summary of this document; this file is the canonical text — update both together.

## Automated by "Add market"

These run server-side when an admin submits the Add-market form (`POST /api/admin/markets`).

- **Geography extract + store.** Server-side Overpass query (`server/services/market-extract.service.ts`,
  ported from `scripts/generate-market-geography.ts`) for water/parks/primary-roads inside the
  submitted bbox, length-ranked and capped (water 20 / parks 25 / roads 35 kept, min lengths
  0.4/0.35/0.8 km), stored in `market_geography`. **ODbL attribution is required wherever this
  layer renders** — "© OpenStreetMap contributors" — already wired into the teaser map and Social
  Kit route frame; carry it into any new surface that renders this data (§13 in CLAUDE.md).
- **Neighborhoods seed** (optional, `seedNeighborhoods` checkbox). Server-side Overpass query for
  named `suburb`/`neighbourhood`/`quarter` place nodes inside the same bbox, inserted into
  `city_neighborhoods` (`ON CONFLICT (city, country, slug) DO NOTHING`). **Review caveat: OSM place-node
  coverage varies wildly by city** — some markets have dense, well-named neighborhood tagging;
  others have almost none. A thin result means the manual step below is not optional, not that the
  extract failed.
- **The checklist API.** `GET /api/admin/markets` reports, per market: `geographyReady` (a row
  exists with a non-zero way count), `neighborhoodsSeeded` (count ≥ 1, with the count shown), and —
  where the DB can answer cheaply — `approvedLodgingWithCoords` and `dmoContentVisible`. A check the
  query can't answer straightforwardly is omitted (`null`) in the response, never guessed at.

## Manual before launch

These are judgment calls the automation deliberately does not make.

1. **Review + tune neighborhoods.** Rename/merge OSM's raw place-node names into the vocabulary
   travelers actually use, set sensible `radiusKm` per neighborhood (the extract writes the schema
   default; it does not estimate an area), and mark the 1–2 flagship neighborhoods `isFeatured`.
2. **Recruit local experts for lead-slots.** `city_neighborhoods.leadExpertTarget` defaults to 1 per
   neighborhood (`expert_neighborhoods`, one `is_lead=true` enforced at the DB level). A newly
   seeded market has zero experts assigned — this is a recruiting/ops task, not something the
   extract can do.
3. **Approved lodging + services with real coordinates.** The Advisor's stay-anchor and the
   platform-first booking rail (CLAUDE.md §16 — no raw affiliate outbound) both need
   `provider_services` rows in this market that are `approvalStatus='approved'`, `status='active'`,
   and carry real `latitude`/`longitude`. The checklist's `approvedLodgingWithCoords` count is the
   automatable half of this; getting the count above zero is a supply/onboarding task.
4. **DMO/research content ingested and admin-approved.** `dmo_raw_content` rows for the city need to
   reach `expertWorkspaceVisible=true` (admin-approved) before they show up in the expert workspace.
   The checklist's `dmoContentVisible` count tracks this; ingestion + review is manual.
5. **QA pass** across every surface that touches this market's geography or content before
   announcing the launch:
   - Ready-Made teaser SVG (`GET /api/ready-made/:id/teaser-map.svg`) renders the new layer, not a
     blank/plain-ground fallback.
   - Social Kit route frame (`SocialKitCard.tsx`) picks up the geography via
     `useMarketGeography` — check both the loading state (route-only, no layer) and the loaded state.
   - Expert workspace map (owned by the expert-workspace surface, not this checklist's automation)
     renders sensibly for the new bbox.
   - Advisor stay-anchor label resolves to a real neighborhood/city name, not a raw coordinate.
6. **Google API key sanity note.** If this market's surfaces use a browser-side Google key
   (Places/geocoding autocomplete, not this layer), confirm billing/quota is provisioned for the new
   market's expected traffic before launch — a quota trip reads to users as a broken form, not a
   billing problem.

## Explicitly NOT per-market

Do not duplicate these per market — they are global platform config, and a market launch should
never touch them:

- **Fee bands** (CLAUDE.md §8) — `fee_bands` is global config, not scoped per market. A market
  launch is never a reason to add a market-specific fee literal.
- **Service templates** (`service_templates`, `CANONICAL_TEMPLATES`) — the seed catalog is global;
  a new market draws from the same canonical delivery-method vocabulary (CLAUDE.md §3), it does not
  get its own template set.
- **Places/geocoding provider config** — the Google key and its quota (see the sanity note above)
  are platform-wide, not provisioned per market.
