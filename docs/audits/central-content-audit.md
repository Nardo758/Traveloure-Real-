# Central Content System Audit
**Date:** 2026-07-24  
**Type:** Read-only findings — no code or data changed  
**Auditor:** Main agent (automated DB queries + static analysis)  
**v2:** Corrected — initial draft missed Fever Events, Viator direct API, Amadeus, SerpAPI, Partnerize, and 4 additional catalog endpoints.

---

## Scorecard

| # | Dimension | Status | Verdict |
|---|-----------|--------|---------|
| 1 | **Affiliates present** | 🔴 BROKEN | 7 live affiliate/partner integrations; only 3 manual partners / 9 products reach the central DB; every real-money network is parallel-only |
| 2 | **Structured properly** | 🟡 GAPS | `content_placement_rules` table is **empty** (0 rows); 248 registry rows have no rule; 43% of registry content types can never route to a surface |
| 3 | **Location + availability tagging** | 🔴 BROKEN | 100% of active affiliate products have null city/country/location; zero Kyoto-tagged items anywhere in the central system |
| 4 | **Content flowing to site surfaces** | 🔴 BROKEN | `GET /api/content/discover` returns `{"items":[],"total":0}` for every surface, with or without a city filter |

---

## §16 Question — Is the /api/catalog Travelpayouts feed folded in?

**No — and the gap is larger than previously reported.** There are **7 distinct affiliate/partner systems** running in parallel. None of them write to `affiliate_partners` or `affiliate_products`. The central resolver sits unused while every product surface is served directly from partner APIs.

---

## Part 1 — Complete Affiliate/Partner Inventory

### All live integrations

| # | Integration | Server endpoints | Client consumer | Commission tracking | Central DB? |
|---|---|---|---|---|---|
| 1 | **Travelpayouts catalog** (19 endpoints) | `/api/catalog/flights`, `nomad`, `transfers`, `cars`, `esim`, `tiqets`, `wegotrip`, `viator-feed`, `ground-transport`, `hotels-look`, `agoda`, `booking`, `activities-gyg`, `klook`, `insurance`, `bus`, `airport-transfers`, `luggage-storage`, `rentalcars` | `TravelpayoutsSection.tsx`, `experience-template.tsx`, `itinerary.tsx` | ✅ `affiliate-reconciliation.service.ts` | ❌ Parallel-only |
| 2 | **Viator (direct API)** | `/api/viator/activities`, `/availability`, `/destinations` | `activity-search.tsx` | ✅ `affiliate-reconciliation.service.ts` | ❌ Parallel-only |
| 3 | **Fever Events (Impact.com)** | `/api/fever/status`, `/api/fever/events` | `fever-events-section.tsx` | ✅ `affiliate-reconciliation.service.ts` | ❌ Parallel-only |
| 4 | **Amadeus** | `/api/amadeus/locations`, `flights`, `hotels`, `pois`, `pois/:id`, `activities`, `activities/:id`, `transfers`, `safety`, `safety/:id` | `amadeus-pois.tsx`, `amadeus-safety.tsx`, `amadeus-transfers.tsx`, `flight-search.tsx`, `hotel-search.tsx` | ❌ No commission | ❌ Parallel-only |
| 5 | **SerpAPI** | `/api/serp/template-search`, `track-click`, `inquiry`, `partnerships` | `experience-template.tsx` (venue search) | ⚠️ Click tracking only (`track-click`) | ❌ Parallel-only |
| 6 | **12Go** | No server route — widget embed only | `TwelveGoWidget.tsx`, `TransportHub.tsx`, `MultiDayPassCard.tsx` | ❌ Widget-based (no server-side tracking) | ❌ Parallel-only |
| 7 | **Partnerize** | `server/services/partnerize/` | None (commission-pull only) | ✅ `affiliate-reconciliation.service.ts` | ❌ Parallel-only |

### What is actually in the central DB

| Partner | Source | Approval | Active | Products | Active Products | Null affiliate_url |
|---|---|---|---|---|---|---|
| Musement | manual | approved | ✅ | 3 | 3 | 0 |
| Klook | manual | approved | ✅ | 3 | 3 | 0 |
| 12Go Asia | manual | approved | ✅ | 3 | 3 | 0 |
| **Total** | | | | **9** | **9** | **0** |

No partners with `approval_status = 'submitted'`. The manual "Klook" central partner (3 products) and `/api/catalog/klook` (Travelpayouts) are two separate, unreconciled systems.

### Why the original audit missed Fever, Viator direct, Amadeus, SerpAPI, Partnerize

The audit brief listed 14 `/api/catalog/*` Travelpayouts networks as the affiliate inventory. The codebase has **7 distinct integration stacks** — the catalog feed is one of them. The others are registered under `/api/fever/*`, `/api/viator/*`, `/api/amadeus/*`, `/api/serp/*`, widget embeds, and a commission-pull service. None appear in `affiliate_partners`.

---

## Part 2 — Structural Integrity

### content_placement_rules

```
Total rows: 0  (table is empty)
Orphan rules (source → affiliate_products): 0  (vacuously true)
Orphan rules (source → content_registry): 0  (vacuously true)
```

The placement-rule table was never populated. The resolver's placement-rule phase always produces zero results, falling through to the ILIKE fallback — which also returns nothing (see Part 3).

### content_registry — 248 rows, 0 with a placement rule

| content_type | Count | Routable to a surface? | Notes |
|---|---|---|---|
| service | 139 | ✅ | In `SURFACE_DEFAULT_CONTENT_TYPES` for 4/5 surfaces |
| trip | 54 | ❌ | No surface mapping |
| booking | 30 | ❌ | No surface mapping |
| review | 13 | ❌ | No surface mapping |
| itinerary | 5 | ❌ | No surface mapping (even the `itinerary` surface expects `experience`/`service`) |
| chat_message | 5 | ❌ | No surface mapping |
| template | 2 | ✅ | In surface map |
| **Total** | **248** | 141 routable (57%), 107 unroutable (43%) | |

### contentTypeEnum dead zones (17 enum values, 8 unroutable)

Values with **no** entry in `SURFACE_DEFAULT_CONTENT_TYPES` or `TAB_CONTENT_TYPE_MAP`:  
`trip`, `itinerary`, `review`, `chat_message`, `expert_profile`, `provider_profile`, `booking`, `vendor`, `custom_venue`, `contract`, `tip`, `other`

---

## Part 3 — Location + Availability Tagging

### Active affiliate products location coverage

```
total_active : 9
untagged     : 9   (city=null, country=null, location=null)
has_city     : 0
has_country  : 0
has_location : 0
```

All 9 active affiliate products in the central system have null location. The ILIKE fallback (`WHERE city ILIKE $city OR country ILIKE $city OR location ILIKE $city`) returns 0 for any geographic query.

### Kyoto inventory — central system

| Table | Kyoto-tagged rows |
|---|---|
| affiliate_products | 0 |
| content_placement_rules | 0 (table empty) |

Any Kyoto content displayed on the platform today comes exclusively from the parallel API feeds — not from the central content stack. The §12 Kyoto wedge has zero central affiliate inventory.

> **§13 respected:** no fabrication recommended. Null is the honest state; the fix is a real tagging pass.

---

## Part 4 — Content Flow

### Resolver smoke test (`GET /api/content/discover`)

| Surface | With city=Kyoto | No city filter |
|---|---|---|
| travelpulse-discover | `{"items":[],"total":0}` 🔴 | `{"items":[],"total":0}` 🔴 |
| experience-discovery | `{"items":[],"total":0}` 🔴 | `{"items":[],"total":0}` 🔴 |
| spontaneous | `{"items":[],"total":0}` 🔴 | `{"items":[],"total":0}` 🔴 |
| experience-template | `{"items":[],"total":0}` 🔴 | `{"items":[],"total":0}` 🔴 |
| itinerary | `{"items":[],"total":0}` 🔴 | `{"items":[],"total":0}` 🔴 |

Root cause chain: empty `content_placement_rules` → ILIKE fallback → zero location-tagged `affiliate_products` → 0 items.

### Consumer map — what each surface actually renders

| Surface / page | Central resolver used? | Parallel feeds used | Net result for traveler |
|---|---|---|---|
| `discover.tsx` | ⚠️ Wired (`CuratedContentSection` → `/api/content/discover`) | None confirmed | Sees 0 central items |
| `experience-template.tsx` | ⚠️ Wired (`CuratedContentSection`) | `/api/catalog/booking`, `esim`, `tiqets`, `wegotrip`, `viator-feed`, `activities-gyg`, `klook` + Amadeus + SerpAPI | Parallel feeds work; central returns 0 |
| `itinerary.tsx` | ❌ Not wired | `/api/catalog/booking`, `esim`, `tiqets`, `wegotrip`, `viator-feed`, `activities-gyg`, `klook` | Parallel feeds only |
| `spontaneous-discovery.tsx` | ❌ Not confirmed | Grok live intel | No central consumer confirmed |
| `fever-events-section.tsx` | ❌ Not wired | `/api/fever/events` | Fever parallel only |
| `activity-search.tsx` | ❌ Not wired | `/api/viator/activities` | Viator direct only |
| `amadeus-*.tsx` | ❌ Not wired | `/api/amadeus/*` | Amadeus parallel only |

### Approval gate & origin labeling — confirmed present

- `approval_status = 'approved'` gate: ✅ `content.routes.ts` ~line 1948  
- `affiliateLabel: "Paid partner"`: ✅ `content.routes.ts` ~line 264  
- These gates work correctly but are currently unreachable since 0 items are served.

---

## Gap Table

| # | Dimension | Severity | Finding | Affected area | Proposed fix (one line) | Governance |
|---|---|---|---|---|---|---|
| G1 | Affiliates | **P0** | §16 open: 19 Travelpayouts catalog networks are parallel-only | `affiliate_partners`, `affiliate_products`, all surfaces | Build ingestion pipeline: sync `/api/catalog/*` responses into `affiliate_products` with `city`/`country` at scrape time | §16 — new PR |
| G2 | Affiliates | **P0** | Fever Events (Impact.com) not in central system — has commission tracking but no `affiliate_partners` row | `affiliate_partners`, `fever-events-section.tsx` | Create Fever `affiliate_partners` row + sync events into `affiliate_products`; wire `fever-events-section` to central resolver | New PR |
| G3 | Flow | **P0** | `content_placement_rules` is empty — resolver always returns 0 items for all 5 surfaces | All surfaces | Populate placement rules via admin auto-index for the 9 existing manual products; add seed for any new ingested products | New PR |
| G4 | Tagging | **P0** | 100% of active `affiliate_products` have null city/country/location — ILIKE fallback can never match | `affiliate_products` | Run tagging pass on Musement/Klook/12Go Asia; enforce non-null location at ingest time going forward | New PR (no fabrication) |
| G5 | Affiliates | **P1** | Viator direct API (`/api/viator/*`) not in central system — separate from Travelpayouts `viator-feed` | `affiliate_partners`, `activity-search.tsx` | Create Viator `affiliate_partners` row; decide whether to merge with catalog `viator-feed` or keep separate | Architecture decision first |
| G6 | Affiliates | **P1** | Amadeus has 10 endpoints and 5 client components but no central registration or affiliate tracking | `affiliate_partners` (or document as data-API) | Classify explicitly: if Amadeus earns commission, add to `affiliate_partners`; if data-only, document as non-affiliate | Decision required |
| G7 | Affiliates | **P1** | SerpAPI click tracking (`/api/serp/track-click`) doesn't feed `affiliate_products` or `content_placement_rules` | `affiliate_partners`, SerpAPI route | Wire SerpAPI venue results into central if they carry affiliate links; else document as search-only | Decision required |
| G8 | Affiliates | **P1** | 12Go widget is click-based with no server-side tracking — commission attribution gap | `TwelveGoWidget.tsx` | Add server-side click endpoint or confirm widget handles attribution; create `affiliate_partners` row for 12Go | New PR |
| G9 | Structure | **P1** | 248 of 248 `content_registry` rows have no placement rule | All surfaces | Run admin auto-index for the 141 routable rows (service=139, template=2) | Admin tooling PR |
| G10 | Affiliates | **P1** | Manual "Klook" central partner (3 products) and `/api/catalog/klook` are two unreconciled systems | `affiliate_partners` | After G1 ingestion pipeline, deduplicate or namespace clearly | Part of G1 PR |
| G11 | Structure | **P1** | 107 `content_registry` rows carry unroutable types (trip, booking, review, chat_message, itinerary) | `content_registry`, surface maps | Extend `SURFACE_DEFAULT_CONTENT_TYPES` for trip/itinerary, or formally mark these as internal-only | Architecture decision |
| G12 | Tagging | **P1** | Zero Kyoto affiliate inventory in central system (§12 wedge) | `affiliate_products` | After G4 tagging pass, verify Kyoto coverage; add Kyoto to any location seed | Part of G4 PR |
| G13 | Flow | **P1** | `spontaneous` surface defined in `PLATFORM_SURFACES` but no confirmed consumer calling `?surface=spontaneous` | `spontaneous-discovery.tsx` | Verify / wire `spontaneous-discovery.tsx` to call `/api/content/discover?surface=spontaneous` | Verify first |
| G14 | Affiliates | **P2** | Partnerize commission tracking runs but no Partnerize network is registered as an `affiliate_partners` row | `affiliate_partners` | Identify which Partnerize network(s) are active; create matching `affiliate_partners` rows | Investigation first |
| G15 | Structure | **P2** | 9 of 17 `contentTypeEnum` values are dead (no surface mapping) | `contentTypeEnum` | Document which types are internal-only vs candidates for future surfacing | Documentation PR |

---

## Evidence Queries

```sql
-- affiliate_partners (live DB)
SELECT name, source, approval_status, is_active,
       COUNT(apd.id) active_products,
       COUNT(apd.id) FILTER (WHERE apd.affiliate_url IS NULL) null_url
FROM affiliate_partners ap
LEFT JOIN affiliate_products apd ON apd.partner_id = ap.id
GROUP BY ap.id;
-- Result: 3 rows (Musement/Klook/12Go Asia), 3 products each, 0 null_url

-- Placement rules
SELECT content_source, COUNT(*) FROM content_placement_rules GROUP BY content_source;
-- Result: 0 rows (table empty)

-- Registry content types
SELECT content_type, COUNT(*) FROM content_registry GROUP BY content_type ORDER BY 2 DESC;
-- Result: service(139), trip(54), booking(30), review(13), chat_message(5), itinerary(5), template(2)

-- Location coverage
SELECT COUNT(*) total,
       COUNT(*) FILTER (WHERE city IS NULL AND country IS NULL AND location IS NULL) untagged
FROM affiliate_products WHERE is_active = true;
-- Result: total=9, untagged=9

-- Resolver smoke (all 5 surfaces, with and without city=Kyoto)
GET /api/content/discover?surface=<any>&city=Kyoto → {"items":[],"total":0}
GET /api/content/discover?surface=<any>           → {"items":[],"total":0}
```

---

## Recommended PRs (priority order)

| Priority | PRs | Unblocks |
|---|---|---|
| **P0** | G1 (catalog ingestion) + G4 (location tagging) | Resolver can match geographic queries |
| **P0** | G2 (Fever in central) + G3 (populate placement rules) | Resolver serves first real items |
| **P1** | G5 (Viator decision) + G6 (Amadeus classification) + G7 (SerpAPI decision) | Partner inventory complete |
| **P1** | G8 (12Go server tracking) + G9 (auto-index registry) + G10 (Klook dedup) | Commission attribution closed |
| **P1** | G11 (surface map extensions) + G12 (Kyoto) + G13 (spontaneous wiring) | All 5 surfaces serving content |
| **P2** | G14 (Partnerize rows) + G15 (enum cleanup) | Housekeeping |
