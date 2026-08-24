# Operation Trailhead — T1 Eight-Market Slot Inventory (Phase-0, READ-ONLY)

**Lane:** `lane/trailhead-t1` · **Status:** HARD STOP — matrix + tier proposal + surfacing map for Leon's rulings. Nothing scraped, published, or flipped; `DMO_INGEST_ENABLED` untouched.
**Method:** three parallel read-only census sweeps (template/slot, holdings, surfacing), synthesized here. Every claim carries a `file:line`.

---

## 0. Executive summary — three findings that reframe the dispatch (each is a ruling request)

The dispatch's mental model is "walk template SLOTS → per-category/market/neighborhood targets → diff against holdings." The code does not match that model in three load-bearing ways. None is a blocker; each is a decision only you can make before T2.

**F1 — There is no "slot" table; template requirements and market/neighborhood binding live in three separate places, in two disjoint taxonomies.**
- Category requirement = `template_category_matrix` (`template_key × category_key × strength ∈ {REQ,REC,OPT}`), **market-agnostic** (`shared/schema.ts:7312-7322`; seeded `server/migrations/035_phase1_seed_template_matrix.sql:12-145`).
- Market binding = `service_offering_types.market_scoped text[]` (NULL = universal) (`shared/schema.ts:7338-7352`).
- Neighborhood binding = `neighborhood_coverage_target` (`shared/schema.ts:3564-3572`).
- These compose **at query time** (`server/services/upsell-query.service.ts:170-203`), never as a stored "template-instantiated-for-market" row.
- **The taxonomy split is the sharp edge:** template requirements are in `service_categories.category_key` space (`accommodation, dining_venue, tour_guide, event_coordinator…`), but content holdings + `KYOTO_CONTENT_PLAN` are in `dmoContentTypeEnum` space (`attraction, venue, restaurant, event, destination…` — `shared/schema.ts:7806`). There is **no crosswalk between them in code.** "Slot-derived targets" therefore cannot be computed by a direct count — it needs a category bridge first. **Ruling requested (R-T1-a):** approve a fixed crosswalk (proposed in §T1.3) as the derivation basis, or rule the target basis differently.

**F2 — Template authoring is NOT the gap. Per-market instantiation DATA is.** 7 template keys + 24 experience types exist and are market-agnostic, so every market already "has" every template. What only Kyoto has: an editorial content plan (`KYOTO_CONTENT_PLAN`, 57 items) and neighborhood rows. The other seven markets have market-scoped offerings but **no content targets and no neighborhoods** (`server/seeds/city-neighborhoods.seed.ts` seeds Kyoto but not Edinburgh/Porto/Bogotá/Cartagena/Mumbai/Goa/Jaipur). So the T1 "derived-targets table" is really **new per-market target data to author**, not a walk of existing slots. **Ruling requested (R-T1-b):** the tier targets in §T1.4 (per-market, per-category numbers) — approve, edit, or defer per market.

**F3 — Scraped DMO content has NO traveler surface today (the T4 scope bomb).** `dmo_extracted_places`/`dmo_raw_content` are read only by expert-workspace + admin routes. `discover_page_visible` is written `false` on every ingest and **read by nothing** (`server/content/scrapers/DMOCrawler.ts:510`, `server/services/dmo-ingestion.service.ts:294`; no SELECT filters on it anywhere in `server/`). Both discover engines read `provider_services`/`expert_templates`/`travel_pulse_*` only. **Consequence for sequencing:** Stages 1–3 will produce content that is expert-usable (via the DMO Library) but **invisible to travelers** until T4 builds a traveler read-rail + an inventory-class column that does not yet exist on places. This does not block ignition, but it means T4 is a build, not a wiring. Flagged now so it is priced into the plan, not discovered at T4.

---

## T1.1 — Template census

**Two parallel template systems + a market-scoped offering catalog (no unified slot):**
- **`template_category_matrix`** (`shared/schema.ts:7312`) — 7 keys: `travel, wedding, proposal, date_night, birthday, corporate, custom` (`035_phase1_seed_template_matrix.sql:12-145`). Fields: `templateKey, categoryKey, strength(REQ|REC|OPT)`. Market-agnostic.
- **`experience_types`** (`server/seed-experience-types.ts:5-367`) — 24 types; logistics metadata only (paymentFlowType, complexity, group size), no market/category requirement.
- **`experience_template_steps/tabs/filters`** (`shared/schema.ts:1716`, `:3750-3820`) — wizard UI facets, not content requirements.
- **`service_offering_types.market_scoped`** (`shared/schema.ts:7347`) — the only market binding; all 8 markets carry ≥1 scoped offering (`038_phase2_seed_service_offering_types.sql:113-124`).

**Slot analog fields (the closest structure, `template_category_matrix`):** `categoryKey` + `strength` **only** — no market, neighborhood, party-size, or delivery on the "slot." Those are typed on other tables.

**Market coverage of the eight targets:**
| | Templates (agnostic) | Market-scoped offering | Neighborhoods | Content target plan |
|---|:--:|:--:|:--:|:--:|
| Kyoto | ✓ | ✓ (3) | ✓ | ✓ (KYOTO_CONTENT_PLAN) |
| Edinburgh | ✓ | ✓ (2) | ✗ | ✗ |
| Porto | ✓ | ✓ (2) | ✗ | ✗ |
| Bogotá | ✓ | ✓ (2) | ✗ | ✗ |
| Cartagena | ✓ | ✓ (1) | ✗ | ✗ |
| Mumbai | ✓ | ✓ (1) | ✗ | ✗ |
| Goa | ✓ | ✓ (1) | ✗ | ✗ |
| Jaipur | ✓ | ✓ (2) | ✗ | ✗ |

**Neighborhood gap:** `city-neighborhoods.seed.ts` seeds 14 cities but of the eight only **Kyoto**. Seven markets need neighborhood rows before the neighborhood-hint / `neighborhood_coverage_target` mechanism can bind (relevant to the inherited neighborhood-demand-map deliverable).

---

## T1.2 — Holdings census (schema + runnable SQL; live counts need the DB)

**Critical structural fact:** `dmo_extracted_places` is a thin child (`shared/schema.ts:7917-7941`) — **no market, category, or status column of its own.** All three are on the parent `dmo_raw_content` via `dmo_content_id` FK (`:7919`). Every count JOINs to the parent.
- **Market** = free-text `dmo_raw_content.city` (`:7849`), exact-match, **accent-sensitive** (`Bogotá` carries the accent — normalize with `unaccent`).
- **Category** = `dmo_raw_content.content_type` ∈ `dmoContentTypeEnum` (`:7806`): `destination, attraction, venue, event, restaurant, itinerary, photo, statistic, transport, other`.
- **Born-hidden gate** = `expert_workspace_visible` (born `false`, `:7890`) + `status` enum (`:7807`); published = `status='published'` (± `discover_page_visible`).
- **Stays are NOT in this pipeline** — `dmoContentTypeEnum` has no accommodation type; property content is `affiliate_products`/`provider_services`, a different substrate (bears on the inherited property-coverage deliverable).

**Counting SQL (run on the real DB — hand-off to Leon/Replit):**
```sql
-- Market × category × published/born-hidden, extracted places (child → parent join)
SELECT p.city AS market, p.content_type AS category,
       CASE WHEN p.status='published' THEN 'published' ELSE 'born_hidden' END AS state,
       count(*) AS n
FROM dmo_extracted_places ep JOIN dmo_raw_content p ON p.id = ep.dmo_content_id
WHERE unaccent(lower(p.city)) IN
      ('kyoto','goa','mumbai','jaipur','edinburgh','porto','bogota','cartagena')
GROUP BY p.city, p.content_type, state ORDER BY 1,2,3;
```
(Parent-holdings and affiliate_products variants captured in the census; `CREATE EXTENSION IF NOT EXISTS unaccent;` if absent.) **Expected shape:** Kyoto carries the heritage seed (`server/seeds/dmo-kyoto-heritage.seed.ts`); the other seven expected ≈0 until ignition — the counts confirm the "single digits per market" baseline the brief opens with.

**`KYOTO_CONTENT_PLAN`** (`server/services/content-gap.service.ts:46-96`) — the only per-market plan:

| content_type | label | target |
|---|---|--:|
| attraction | Attractions & heritage | 15 |
| venue | Event & wedding venues | 12 |
| restaurant | Dining & receptions | 12 |
| event | Seasonal & cultural events | 10 |
| destination | Neighborhoods & areas | 8 |
| **total** | | **57** |

---

## T1.3 — The matrix (market × category → demand · holdings · source coverage)

**Category axis** = the five `dmoContentTypeEnum` types the scraper actually fills, which are exactly the `KYOTO_CONTENT_PLAN` categories. **Proposed crosswalk (F1 ruling R-T1-a)** from template `category_key` requirements → content `content_type`:
`accommodation → [affiliate rung, not DMO]` · `dining_venue/private_chef/caterer → restaurant` · `tour_guide/activity_provider → attraction` · `event_coordinator/entertainment/florist → venue` · `(dated) → event` · `(area/neighborhood) → destination`.

**Demand (targets).** Kyoto = the live plan; the other seven have no plan → shown as the §T1.4 tier target (proposal, not yet ruled). **Holdings** = `run SQL` (no DB in Phase-0). **Source coverage** = anchor registry (`docs/planning/TRAILHEAD_ANCHOR_SOURCE_REGISTRY_v1.md`).

### Demand targets (per category)
| Market | attraction | venue | restaurant | event | destination | basis |
|---|--:|--:|--:|--:|--:|---|
| **Kyoto** | 15 | 12 | 12 | 10 | 8 | live `KYOTO_CONTENT_PLAN` |
| Edinburgh | T1 | T1 | T1 | T1 | T1 | §T1.4 proposal |
| Porto | T1/T2 | T1/T2 | T1/T2 | T1/T2 | T1/T2 | §T1.4 proposal |
| Bogotá | T2 | T2 | T2 | T2 | T2 | §T1.4 proposal |
| Cartagena | T2 | T1(venue) | T2 | T2 | T2 | wedding-lean (registry) |
| Mumbai | T2 | T2 | T2 | T2 | T2 | §T1.4 proposal |
| Goa | T2 | T1(venue) | T2 | T2 | T2 | wedding-lean (registry) |
| Jaipur | T2 | T1(venue) | T2 | T2 | T2 | wedding-lean (registry) |

*(T1 = launch-depth, T2 = browsable-minimum; the venue-lean markets are the destination-wedding cities the registry flags — Cartagena/Goa/Jaipur — where the events/venue category earns launch depth even at Tier 2 elsewhere. All assignments are proposals for your ruling.)*

### Source coverage (anchor registry → per category)
| Category | Cross-market rail | Per-market DMO / operator anchors |
|---|---|---|
| attraction | Viator/GYG/Tiqets/Klook (AFF-TP), UNESCO, Wikivoyage | teamLab+temples (Kyoto); Edinburgh Castle/HES; Lello/lodges (Porto); Oro/Botero/Monserrate (Bogotá); San Felipe (Cartagena); Gateway/Elephanta (Mumbai); Old Goa; Amber/City Palace (Jaipur) |
| venue | (mostly SCRAPE-facts + stay-AFF for wedding resorts) | walled-city casas (Cartagena); resort clusters (Goa); heritage hotels/Rambagh (Jaipur); WOW (Porto) |
| restaurant | (SCRAPE-facts; little OTA) | DMO/city sources per market; Gurunavi (Kyoto) |
| event | Fever (Impact), Go City, festival operators, BookMyShow (Mumbai, pending T0) | Festivals (Edinburgh Fringe/EIF/Tattoo); JLF (Jaipur); city event calendars → `travel_pulse_calendar_events` |
| destination | DMO sites, Wikivoyage/Wikimedia, OSM (OPEN) | every market's city/national DMO (registry) |

**Source-coverage verdict:** every market × category has at least an OPEN or OTA-rung source; **no cell is source-dark.** The gate on ignition is target rulings + the D3 cost cap, not source availability.

---

## T1.4 — Tier proposal (config-shaped; browsable-minimum defined per category)

**Tier 1 — launch-depth** = the Kyoto profile (15/12/12/10/8 = 57). Used for the wedge + any market you rule launch-critical.
**Tier 2 — browsable-minimum** = the floor at which a market's discover surface is not embarrassing (enough per category that a template can be filled without obvious holes), proposed:

| content_type | Tier 2 min | rationale |
|---|--:|---|
| attraction | 8 | fills the "top things" shelf + a wedding/travel template's REQ activity slots |
| venue | 4 | enough for the events/wedding template to render options (raise to 8 for wedding-lean markets) |
| restaurant | 6 | a dining shelf that isn't 2 rows |
| event | 4 | seasonal spotlight substrate (R33) needs a few dated anchors |
| destination | 4 | neighborhood orientation; also seeds the neighborhood gap (F2) |
| **total** | **26** | ~½ the Kyoto launch depth |

**Recommended assignment (your ruling, R-T1-b):** Kyoto **Tier 1** (wedge, first — already has plan+neighborhoods+seed). One **second Tier-1 wedge** recommended to prove the loop cross-market — I'd propose **Edinburgh** (strongest source coverage: HES + festivals + Tiqets/GYG, all English-language, AFF-TP live). Remaining six **Tier 2**, with the venue category lifted to 8 for the three wedding-lean markets (Cartagena/Goa/Jaipur). Everything is editable per market.

**Tavily query-volume estimate (for the D3 cost-cap conversation).** The pipeline issues discovery queries per category until the target is met; `KYOTO_CONTENT_PLAN` carries `discoveryQueries` per category (typically 2–3 each). Estimate, **queries** (not dollars — the ceiling is your config):
- Tier 1 market ≈ 5 categories × ~3 queries × a ~1.5 re-query factor ≈ **~22 discovery queries** per market per full pass.
- Tier 2 market ≈ **~12 discovery queries** per market per pass.
- **First full ignition, recommended slate** (Kyoto T1 + Edinburgh T1 + six T2) ≈ 2×22 + 6×12 ≈ **~116 discovery queries**. Kyoto-only first batch (T2 dispatch's "Kyoto first") ≈ **~22 queries**.
These are pass-counts for the cost ceiling; the actual `$`/query and the cap live in the D3 env-flag+key+ceiling config, set by you.

---

## T1.5 — Surfacing prior-art map ("how content reaches the site today")

| Rail | Reads | DMO? | file:line |
|---|---|:--:|---|
| `GET /api/discover` → `unifiedSearch` | `provider_services` (active+approved) + `expert_templates` | ✗ | `content.routes.ts:2461`, `storage.ts:3197-3213` |
| `GET /api/discover/location/:city` → `LocationViewService` | `city_neighborhoods`, `travel_pulse_hidden_gems`, `provider_services`, `expert_templates`, Fever/TravelPulse | ✗ | `location-view.service.ts:21` |
| `TrendingCities` → `/api/travelpulse/cities` | `travel_pulse_cities` | ✗ | `TrendingCities.tsx:48`, `travelpulse.service.ts:573` |
| Expert **DMO Library** (workspace tab) | `dmo_raw_content` where `expert_workspace_visible=true`, child `dmo_extracted_places` | ✓ (expert-only) | `workspace.tsx:2402`, `expert-workspace.routes.ts:234,250` |
| Admin intake | `dmo_raw_content`/places, all states | ✓ (admin-only) | `admin.routes.ts:1546,1559` |
| `travel_pulse_calendar_events` readers | R33 spotlight, TravelPulse calendar surface, itinerary optimizer | n/a | `demand-onepager.service.ts:87`, `travelpulse.service.ts:341`, `itinerary-optimizer.ts:592` |

**GAPS NAMED (the T4 build list):**
1. **No traveler read of DMO content** — neither discover engine SELECTs `dmo_extracted_places`/`dmo_raw_content`.
2. **`discover_page_visible` gate has no consumer** — written `false` on every ingest, queried nowhere.
3. **`published_at`/`published_by`** on `dmo_raw_content` exist but nothing filters on them.
4. **DMO content is trapped expert-side** — usable in an expert's itinerary, no independent traveler rail.
5. **No inventory-class column on places** — `provider_services.sourceType` (`platform_provider|affiliate`, `schema.ts:603`) has no analog on `dmo_extracted_places`; Stage-4's "typed `external` from birth" needs a new column.
6. **`travel_pulse_calendar_events` never joins DMO places** — dated events and scraped places meet nowhere (both key on free-text city).

---

## Rulings requested at this HARD STOP (gate T2 ignition)
- **R-T1-a (taxonomy crosswalk):** approve the §T1.3 `category_key → content_type` crosswalk as the target-derivation basis, or specify another.
- **R-T1-b (per-market targets):** approve/edit the §T1.4 tier assignments + Tier-2 browsable-minimum numbers (config-shaped). Confirm Kyoto-first; rule the second Tier-1 wedge (Edinburgh proposed).
- **R-T1-c (cost cap):** set the D3 Tavily ceiling against the §T1.4 query estimates (~22 queries Kyoto-only first batch).
- **R-T1-d (F2 target-gap disposition):** the seven markets need authored targets + neighborhoods before their pages fill — approve authoring them as part of T2, or stage them behind Kyoto.
- **R-T1-e (F3 T4 scope):** acknowledge that scraped content has no traveler rail today — T4 is a build (traveler read-path + inventory-class column), to be spec'd against this map. Does not block ignition; must be priced.

**Not done here (correctly):** no scraping, no `DMO_INGEST_ENABLED` flip, no new tables, no template authoring, no publishing, no affiliate placement, no surfacing design (that ruling is yours per §T1.5).
