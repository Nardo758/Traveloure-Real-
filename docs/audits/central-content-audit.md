# Central Content System Audit
**Date:** 2026-07-24  
**Type:** Read-only findings — no code or data changed  
**Auditor:** Main agent (automated DB queries + static analysis)

---

## Scorecard

| # | Dimension | Status | Verdict |
|---|-----------|--------|---------|
| 1 | **Affiliates present** | 🔴 BROKEN | Only 3 manual partners / 9 products in central DB; all 14–15 Travelpayouts catalog networks are parallel-only, not folded in |
| 2 | **Structured properly** | 🟡 GAPS | `content_placement_rules` table is **empty** (0 rows); 248 registry rows have no rule; 43 % of registry content types can never route to a surface |
| 3 | **Location + availability tagging** | 🔴 BROKEN | 100 % of active affiliate products have null city / country / location; zero Kyoto-tagged items anywhere in central system |
| 4 | **Content flowing to site surfaces** | 🔴 BROKEN | `GET /api/content/discover` returns `{"items":[],"total":0}` for every surface, with or without a city filter |

---

## §16 Question — Is the /api/catalog Travelpayouts feed folded in?

**No.** The `/api/catalog/*` system and the central content system (`affiliate_partners` / `affiliate_products` / `content_placement_rules`) are two entirely independent stacks with no data bridge between them.

| Layer | What it does | Connected to central? |
|---|---|---|
| `/api/catalog/flights` → `nomad` (15 endpoints) | Travelpayouts real-time proxy; returns live data directly to client | ❌ No |
| `affiliate_partners` (3 rows) | Manually entered: Musement, Klook, 12Go Asia | ✅ In central DB |
| `affiliate_products` (9 rows) | 3 products per manual partner | ✅ In central DB, but untagged |
| `content_placement_rules` (0 rows) | Empty | — |

**Coverage impact:** The parallel feed powers real product display on `experience-template.tsx` and `itinerary.tsx` via direct `/api/catalog/*` calls. The central resolver (`/api/content/discover`) sits in the middle of this pipeline with zero data and is effectively a dead endpoint today.

---

## Part 1 — Affiliate Coverage

### Partners in central DB

| Partner | Source | Approval | Active | Products | Active Products | Null affiliate_url |
|---------|--------|----------|--------|----------|-----------------|-------------------|
| Musement | manual | approved | ✅ | 3 | 3 | 0 |
| Klook | manual | approved | ✅ | 3 | 3 | 0 |
| 12Go Asia | manual | approved | ✅ | 3 | 3 | 0 |
| **Total** | | | | **9** | **9** | **0** |

No partners with `approval_status = 'submitted'` (the invisible-on-public-reads risk from migration 121 is not currently triggered — but the gate exists for future partners).

### /api/catalog/* networks vs central system

| Network (endpoint) | Central-fed | Status |
|---|---|---|
| flights | ❌ | Parallel-only |
| hotels-look | ❌ | Parallel-only |
| agoda | ❌ | Parallel-only |
| booking | ❌ | Parallel-only |
| activities-gyg | ❌ | Parallel-only |
| klook *(catalog)* | ❌ | Parallel-only *(different from manual "Klook" partner)* |
| viator-feed | ❌ | Parallel-only |
| tiqets | ❌ | Parallel-only |
| wegotrip | ❌ | Parallel-only |
| cars | ❌ | Parallel-only |
| transfers | ❌ | Parallel-only |
| esim | ❌ | Parallel-only |
| insurance | ❌ | Parallel-only |
| ground-transport | ❌ | Parallel-only |
| nomad | ❌ | Parallel-only |
| Musement *(manual)* | ✅ | Central — 3 products |
| Klook *(manual)* | ✅ | Central — 3 products |
| 12Go Asia *(manual)* | ✅ | Central — 3 products |

**Summary:** 0 of 15 Travelpayouts catalog networks feed the central system. The 3 manual partners account for the entire affiliate inventory in the central DB (9 products).

---

## Part 2 — Structural Integrity

### content_placement_rules

```
Total rows: 0 (table is empty)
Orphan rules (source_id → affiliate_products): 0 (vacuously true)
Orphan rules (source_id → content_registry): 0 (vacuously true)
```

The placement-rule table was never populated. The resolver's placement-rule lookup phase produces no results for any query, falling through to the pulse + ILIKE fallback — which also returns nothing because affiliate products are untagged (see Part 3).

### content_registry

```
Total rows: 248
Rows with no placement rule: 248 (100%)
```

**By content_type:**

| content_type | Count | Routable to a surface? |
|---|---|---|
| service | 139 | ✅ Yes — SURFACE_DEFAULT_CONTENT_TYPES for 4/5 surfaces |
| trip | 54 | ❌ No — not in any SURFACE_DEFAULT or TAB map |
| booking | 30 | ❌ No |
| review | 13 | ❌ No |
| itinerary | 5 | ❌ No |
| chat_message | 5 | ❌ No |
| template | 2 | ✅ Yes |
| **Total** | **248** | 141 routable (57%), 107 unroutable (43%) |

### contentTypeEnum vs surface maps

`contentTypeEnum` defines 17 values. Cross-referencing against `SURFACE_DEFAULT_CONTENT_TYPES` and `TAB_CONTENT_TYPE_MAP`:

| contentTypeEnum value | In surface map? |
|---|---|
| experience | ✅ |
| template | ✅ |
| service | ✅ |
| media | ✅ |
| affiliate_product | ✅ *(via affiliate_products table, not registry)* |
| trip | ❌ — dead type |
| itinerary | ❌ — dead type |
| review | ❌ — dead type |
| chat_message | ❌ — dead type |
| expert_profile | ❌ — dead type |
| provider_profile | ❌ — dead type |
| booking | ❌ — dead type |
| vendor | ❌ — dead type |
| custom_venue | ❌ — dead type |
| contract | ❌ — dead type |
| tip | ❌ — dead type |
| other | ❌ — dead type |

8 of 17 enum values (47%) cannot route to any platform surface. 107 of 248 registry rows carry one of these dead types and will never be served by the resolver regardless of placement rules.

---

## Part 3 — Location + Availability Tagging

### Affiliate products location coverage

```sql
-- Active affiliate_products (9 rows)
total_active : 9
untagged     : 9  (city=null, country=null, location=null — ALL 9)
has_city     : 0
has_country  : 0
has_location : 0
```

**Every active affiliate product in the central system has null location data.** The resolver's ILIKE fallback (`WHERE city ILIKE $city OR country ILIKE $city OR location ILIKE $city`) will return 0 results for any geographic query — including Kyoto.

### Kyoto inventory

| Table | Kyoto-tagged rows |
|---|---|
| affiliate_products | 0 |
| content_placement_rules | 0 (table empty) |
| content_registry | not queried (resolver uses placement rules to reach registry) |

The §12 Kyoto wedge has zero affiliate inventory in the central system. Any Kyoto results displayed on the platform today come exclusively from the parallel `/api/catalog/*` live proxy — not from the central content stack.

> **§13 note respected:** No fabrication recommended. Location data is null; the fix is a real tagging pass on the 3 manual partners' 9 products, plus any future ingestion pipeline that populates `city`/`country` at scrape time.

---

## Part 4 — Content Flow

### Resolver smoke test (`GET /api/content/discover`)

| Surface | City=Kyoto | No city filter | Result |
|---|---|---|---|
| travelpulse-discover | `{"items":[],"total":0}` | `{"items":[],"total":0}` | 🔴 Dead |
| experience-discovery | `{"items":[],"total":0}` | `{"items":[],"total":0}` | 🔴 Dead |
| spontaneous | `{"items":[],"total":0}` | `{"items":[],"total":0}` | 🔴 Dead |
| experience-template | `{"items":[],"total":0}` | `{"items":[],"total":0}` | 🔴 Dead |
| itinerary | `{"items":[],"total":0}` | `{"items":[],"total":0}` | 🔴 Dead |

The resolver returns empty for every surface regardless of query. Root cause chain: empty `content_placement_rules` → ILIKE fallback → zero location-tagged `affiliate_products` → 0 items.

### Consumer wiring

| Consumer | API used | Renders central content? |
|---|---|---|
| `curated-content-section.tsx` | `/api/content/discover` | ⚠️ Wired correctly, but gets 0 items |
| `discover.tsx` | → `CuratedContentSection` | ⚠️ Wired, shows empty |
| `experience-template.tsx` | `/api/catalog/*` (direct) + `CuratedContentSection` | Parallel feed works; central returns 0 |
| `itinerary.tsx` | `/api/catalog/booking`, `esim`, `tiqets`, `wegotrip`, `viator-feed`, `activities-gyg`, `klook` | Parallel feed only |
| `spontaneous-discovery.tsx` | *(not hitting `/api/content/discover`)* | No central consumer |
| `UpsellSlot.tsx` | *(component exists, wiring not confirmed)* | Needs verification |

**Backend-without-a-surface traps:** The resolver is wired to consumers but the pipeline is empty — this is a data gap, not a code gap.  
**Surface-without-a-backend trap:** `spontaneous` surface is defined in `PLATFORM_SURFACES` but no consumer confirmed calling `/api/content/discover?surface=spontaneous` at runtime.

### Approval gate & origin labeling

✅ Confirmed present in `content.routes.ts`:
- Line ~1948: `approval_status = 'approved'` gate — unapproved partners' products excluded from public reads
- Line ~264: `affiliateLabel: "Paid partner"` — origin disclosure applied

---

## Gap Table

| # | Dimension | Severity | Finding | Affected surface/table | Proposed fix (one line) | Governance |
|---|---|---|---|---|---|---|
| G1 | Affiliates | **P0** | 15 Travelpayouts catalog networks are parallel-only — §16 "fold in" gap still open | All surfaces; `affiliate_partners`, `affiliate_products` | Build an ingestion pipeline that syncs /api/catalog/* responses into `affiliate_products` rows at startup/cron | §16 — new PR, normal CLAUDE.md governance |
| G2 | Flow | **P0** | `content_placement_rules` is empty — resolver always returns 0 items | All 5 surfaces | Populate placement rules via admin auto-index or seed script for the 9 existing manual products | New PR |
| G3 | Tagging | **P0** | 100% of active affiliate products have null city/country/location — ILIKE fallback can never match | All surfaces; `affiliate_products` | Run a tagging pass on Musement/Klook/12Go Asia products; enforce non-null location at ingest time going forward | New PR — no fabrication, real tagging only |
| G4 | Structure | **P1** | 248 of 248 content_registry rows have no placement rule | All surfaces | Run admin auto-index for routable content types (service=139, template=2) | Admin tooling PR |
| G5 | Structure | **P1** | 107 registry rows carry unroutable content types (trip, booking, review, chat_message, itinerary) — can never reach a surface | `content_registry` | Either extend SURFACE_DEFAULT_CONTENT_TYPES to cover trip/itinerary, or treat these as internal-only and document explicitly | Architecture decision before PR |
| G6 | Flow | **P1** | `spontaneous` surface defined in PLATFORM_SURFACES but no confirmed client consumer calling `?surface=spontaneous` | `spontaneous-discovery.tsx` | Verify / wire `spontaneous-discovery.tsx` to call `/api/content/discover?surface=spontaneous` | Verify first, PR if gap confirmed |
| G7 | Affiliates | **P1** | Manual "Klook" central partner (3 products) and `/api/catalog/klook` (Travelpayouts) are two separate systems with no reconciliation | `affiliate_partners`, `affiliate_products` | Decide canonical source; after G1 ingestion, deduplicate or clearly namespace | Architectural decision |
| G8 | Structure | **P2** | 9 of 17 contentTypeEnum values are dead (no surface mapping) — creates confusion and inflates enum | `contentTypeEnum`, `content_registry` | Document which types are internal-only (review, booking, chat_message, contract, tip) vs candidates for future surfacing | Documentation PR |
| G9 | Tagging | **P2** | Zero Kyoto inventory in central system (§12 wedge) | `affiliate_products`, placement rules | After G3 tagging pass, verify Kyoto coverage explicitly; add Kyoto to any location seed | Part of G3 PR |
| G10 | Flow | **P2** | `UpsellSlot.tsx` listed as a consumer in CLAUDE.md §16 but its API call was not confirmed in this audit | `UpsellSlot.tsx` | Verify component actually calls `/api/content/discover` or document it as placeholder | Investigation task |

---

## Evidence Queries

```sql
-- Affiliate partners
SELECT name, source, approval_status, is_active,
       COUNT(apd.id) active_products,
       COUNT(apd.id) FILTER (WHERE apd.affiliate_url IS NULL) null_url_products
FROM affiliate_partners ap
LEFT JOIN affiliate_products apd ON apd.partner_id = ap.id
GROUP BY ap.id;
-- Result: 3 rows (Musement/Klook/12Go Asia), 3 products each, 0 null_url

-- Placement rules
SELECT content_source, COUNT(*) FROM content_placement_rules GROUP BY content_source;
-- Result: 0 rows

-- Registry coverage
SELECT content_type, COUNT(*) FROM content_registry GROUP BY content_type ORDER BY 2 DESC;
-- Result: service(139), trip(54), booking(30), review(13), chat_message(5), itinerary(5), template(2)

-- Location coverage
SELECT COUNT(*) total, COUNT(*) FILTER (WHERE city IS NULL AND country IS NULL AND location IS NULL) untagged
FROM affiliate_products WHERE is_active = true;
-- Result: total=9, untagged=9

-- Resolver smoke test (all surfaces, with and without city)
GET /api/content/discover?surface=<any>&city=Kyoto → {"items":[],"total":0}
GET /api/content/discover?surface=<any>           → {"items":[],"total":0}
```

---

## Recommended Next PRs (priority order)

1. **G1 + G3** — Travelpayouts ingestion pipeline + location tagging (P0 · §16 close)
2. **G2** — Populate `content_placement_rules` for existing 9 products (P0 · unblocks resolver)
3. **G4** — Admin auto-index for 141 routable registry rows (P1)
4. **G5 decision** — Architecture: extend surface maps or formally mark internal types (P1)
5. **G6** — Confirm/wire `spontaneous` consumer (P1)
6. **G7 + G8 + G9 + G10** — Cleanup and documentation (P2)
