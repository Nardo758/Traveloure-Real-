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
  where the DB can answer cheaply — `approvedLodgingWithCoords`, `dmoContentVisible`, and
  `dmoSourceKit` (see "Content source kit" below). A check the query can't answer straightforwardly
  is omitted (`null`) in the response, never guessed at.

## Content source kit

The decision-maker's ratified content-source map defines four tiers: **Tier 1** government/DMO,
**Tier 2** open data, **Tier 3** primary venue/registries, **Tier 4** events (incl. social). A
market's "source kit" is the set of `dmo_sources` registry rows (`server/seeds/dmo-sources.seed.ts`,
upserted at boot from `server/index.ts`) that cover it — a row counts for a market if
`dmo_sources.market` equals the market's slug, equals its `country` (lowercased,
spaces→underscored — e.g. `"Japan"` → `"japan"`), or equals the global catch-all `"global"`.

**The full kit, per market, is seven registrations:**

1. National tourism board (Tier 1) — e.g. JNTO for Japan, VisitBritain for the UK. **Registry row
   today.**
2. Regional/prefectural board (Tier 1) — e.g. Tourism Queensland, Kyoto Prefecture. **Registry row
   today** (where seeded).
3. City DMO + tourist information center (Tier 1) — e.g. Go Tokyo, Turisme de Barcelona, Visit
   Lisboa, Paris je t'aime, Osaka Convention & Tourism Bureau. **Registry row today.**
4. Open-data portal (Tier 2) — city/national statistics or GIS open-data portal, e.g. Paris Open
   Data, NYC Open Data, Barcelona Open Data (Open Data BCN). **Registry row today.**
5. Wikidata / OpenStreetMap pull (Tier 2) — structured entity data (Wikidata, CC0) and POI geometry
   (OpenStreetMap via Overpass, ODbL). **Registry row today**; note the Overpass POI pull
   (`dmo-global-osm-overpass`) is a distinct use from the market_geography water/parks/roads extract
   this doc already documents above — both carry the same ODbL attribution requirement.
6. Heritage register + national parks (Tier 3) — e.g. Historic England, Agency for Cultural Affairs
   (Japan), Ministry of the Environment national parks (Japan). **Registry row today.**
7. Event calendar with a refresh cadence (Tier 4) — festival/event listings that need periodic
   re-scraping or an API poll, not a one-time pull. **Registry row for the source definition is not
   sufficient by itself here** — an event calendar additionally needs a working refresh cadence
   (a scheduled scrape/poll job), which is ingestion-adapter work, not registry seeding. The Tier 4
   `dmo-global-youtube` row (destination-guide video metadata) is the current example of a registry
   row that predates its adapter: it is seeded and `isActive`, but `notes` on the row says so
   explicitly (`adapter = youtube-ingestion.service`) — it does nothing until that adapter exists.

**Registry row vs. working ingestion — do not conflate the two.** `dmoSourceKit`'s count (and the
admin page's "Sources" badge) reflects registry rows only — it says a source *definition* exists and
is active, exactly like `geographyReady`/`neighborhoodsSeeded` say a row exists. It does **not** mean
content from that source has been ingested, reviewed, or is visible anywhere — that is what
`dmoContentVisible` (a completely separate check, against `dmo_raw_content`) tracks. A market can be
`dmoSourceKit: { ok: true }` with `dmoContentVisible: { ok: false }` — the kit is registered, nothing
has been pulled through it yet. ok threshold: **≥ 3** active matching rows (a market with only its
`market: "global"`-inherited sources plus one local row is not meaningfully kitted out yet).

**Facts vs. expression — the licensing line (CLAUDE.md §13).** Government/registry *facts*
(a landmark's coordinates, a park's designation, a heritage listing's boundary) are not copyrightable
in most jurisdictions; the *expression* around them (a DMO's photography, written copy, curated
descriptions) usually is and is what `attributionRequired`/`attributionText` on `dmo_sources` govern.
`dmo_sources` has no `license` column — Tier 2 open-data licensing detail (CC0, ODbL, "unknown — not
confirmed, do not assume permissive") is recorded in each row's `notes` field instead of a schema
change, consistent with this file's file-ownership boundary for this change (only
`server/seeds/dmo-sources.seed.ts` was touched, not `shared/schema.ts`).

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
