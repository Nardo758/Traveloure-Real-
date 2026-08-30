# Central Content System — Audit (combined findings)

**Date:** 2026-07-24  ·  **Type:** Read-only — no code or data changed.
**Sources combined:** (A) **live-DB pass** (automated queries + smoke tests against the workspace DB) and
(B) **static-analysis pass** (code/schema trace on `origin/main`). Where the two agree it's marked ✅ both; where only
one pass could see it, the source is noted. This supersedes both single-pass drafts.

> **The one-sentence finding:** the "central content system" is real and its gates mostly work, but it is **starved and
> parallel-bypassed** — `content_placement_rules` is empty, all 9 central products are untagged, the resolver returns
> `0` on every surface, 3 of 5 surfaces don't even mount, and the real affiliate money flows through **7 separate
> parallel stacks** that never touch the central store. Plus a **latent P0**: the fix everyone will reach for first
> (populate placement rules) opens an approval-gate bypass unless a one-line gate is added first.

---

## 1. Scorecard (reconciled)

| # | Dimension | Status | Verdict |
|---|-----------|--------|---------|
| 1 | **All affiliates present** | 🔴 BROKEN | 7 live affiliate/partner stacks; only 3 manual partners / 9 products reach the central DB. Every real-money network is parallel-only. |
| 2 | **Structured properly** | 🟡 GAPS | `content_placement_rules` **empty (0 rows)**; 248 registry rows, none ruled; ~43% of registry types can't route to any surface; enum(17) ⟂ surface-map(10). |
| 3 | **Location / availability tagging** | 🔴 BROKEN | 100% of active affiliate products have null city/country/location; **0** Kyoto-tagged items in the central store (§12 wedge). |
| 4 | **Content flowing to surfaces** | 🔴 BROKEN | `GET /api/content/discover` returns `{"items":[],"total":0}` for **every** surface; and only **2 of 5** surfaces even have a live consumer mounted. |

---

## 2. The §16 question — is the catalog feed folded into the central system?

**No — and it's bigger than "the 14 Travelpayouts networks."** There are **7 distinct affiliate/partner stacks** running
in parallel; **none** write to `affiliate_partners`/`affiliate_products` or carry `content_placement_rules`, so the central
resolver never sees them. *(Inventory from the live-DB pass; the static pass independently confirmed the Travelpayouts +
catalog-cache subset.)*

| # | Integration | Server endpoints | Commission tracking | In central DB? |
|---|---|---|---|---|
| 1 | **Travelpayouts catalog** (19–20 networks) | `/api/catalog/*` (flights, nomad, transfers, cars, esim, tiqets, wegotrip, viator-feed, ground-transport, hotels-look, agoda, booking, activities-gyg, klook, insurance, bus, airport-transfers, luggage-storage, rentalcars) | ✅ reconciliation svc | ❌ parallel (live passthrough) |
| 2 | **Viator (direct API)** | `/api/viator/activities,/availability,/destinations` | ✅ | ❌ parallel |
| 3 | **Fever Events (Impact.com)** | `/api/fever/status,/events` | ✅ | ❌ parallel |
| 4 | **Amadeus** | `/api/amadeus/*` (10 endpoints) | ❌ data-API | ❌ parallel |
| 5 | **SerpAPI** | `/api/serp/template-search,track-click,inquiry,partnerships` | ⚠️ click-only | ❌ parallel |
| 6 | **12Go** | widget embed only (no server route) | ❌ widget | ❌ parallel |
| 7 | **Partnerize** | `server/services/partnerize/` | ✅ commission-pull | ❌ parallel |
| — | **Catalog cache** (static pass) | `/api/catalog/search` → `experienceCatalogService` reads `activityCache/feverEventCache/hotelCache/poiCache/restaurantCache` | — | ❌ separate store |

**What's actually in the central DB** (live pass): 3 manual partners — **Musement, Klook, 12Go Asia** — 3 products each
(**9 total, 0 null affiliate_url, all `approved`**). Note the "Klook" central partner and `/api/catalog/klook`
(Travelpayouts) are **two unreconciled Klook systems**.

**Verdict: GAP — the §16 filed follow-up is confirmed un-built**, and its true scope is *7 parallel stacks*, not one
catalog move. Do **not** build a third content home in the interim (§16). This is architectural debt by design, but it is
the direct answer to "does the central system have all the affiliates?" — **no, it has ~9 hand-entered products.**

---

## 3. Root-cause chain — why the resolver returns 0 everywhere

Four independent failures compound; fixing any one alone still yields an empty feed:

```
content_placement_rules EMPTY (0 rows)        ─┐
  → resolver placement phase yields nothing    │
affiliate_products ALL untagged (9/9 null loc) ─┼─→ /api/content/discover = {"items":[],"total":0}
  → ILIKE fallback yields nothing              │      on every surface, city or no city
3 of 5 surfaces have no mounted consumer       ─┘   (even if items existed, nothing would render them)
+ LATENT: the placement-path read skips the approval gate (§5 G-SEC) — opens the moment rules are added
```

---

## 4. Structure + flow detail

**content_registry** (live pass): 248 rows, **0 with a placement rule**. `service` 139 (routable), `trip` 54, `booking` 30,
`review` 13, `itinerary` 5, `chat_message` 5, `template` 2 → **~57% routable, ~43% unroutable**.

**Enum ⟂ surface-map drift** (both passes): `contentTypeEnum` = 17 values (`schema.ts:4350`); `CONTENT_TYPES` = 10
(`content-surface-map.ts:9`). Registered-but-unroutable: `trip, itinerary, review, chat_message, booking, custom_venue,
contract, tip, provider_profile` (several are legitimately internal-only — chat/booking/contract — but it's silent, not
documented).

**Surface wiring** (static pass — the routing layer the smoke test can't see): only **`travelpulse-discover`**
(`discover.tsx:1118`) and **`experience-template`** (`experience-template.tsx:2573`) have a live mounted consumer via the
single real consumer `CuratedContentSection` (`curated-content-section.tsx:403`). The other three are dead:
- **`experience-discovery`** — page orphaned; `/discover-experiences` → `/discover` redirect (`App.tsx:414-415`).
- **`spontaneous`** — page redirect-orphaned (`App.tsx:425-426`) **and** its consumer omits `surface=` entirely (`spontaneous-discovery.tsx:480`), so its placement path could never fire even if mounted.
- **`itinerary`** — no client sends `surface=itinerary`; `/itinerary/:id` → `/trip` (`App.tsx:474-475`); `TripDetails` doesn't use `CuratedContentSection`.

So even after §3's data starvation is fixed, **3 of 5 surfaces still render nothing** until they're wired or retired.

---

## 5. Verified gap table (severity-ranked, deduplicated across both passes)

| # | Sev | Dim | Finding | Evidence | Fix (one line) | Governance |
|---|---|---|---|---|---|---|
| **G-SEC** | 🔴 **P0 latent** | flow/integrity | **Approval-gate BYPASS on the placement path.** `getAffiliateProductsByIds` gates only `isActive`, not partner `approvalStatus='approved'` (sibling location-path gates correctly). Harmless *today* only because 0 placement rules exist — **becomes a live leak the instant G3 populates rules.** Same missing gate on `/api/content/affiliate-redirect`. *(static pass; live pass reported the gate "present" because it saw the location path.)* | `content-query.service.ts:390-397` vs `:414-417`; `content.routes.ts:7194,7443` | Add `EXISTS(… approvalStatus='approved')` to `getAffiliateProductsByIds` + gate the redirect — **before G3.** | D1a / migration-121 |
| **G1** | 🔴 **P0** | affiliates | **§16: 7 parallel stacks, ~9 central products.** Every real-money network bypasses the central store. | §2 above | Design a catalog→`affiliate_products` ingestion (city/country at scrape time). **Not** a third home. | §16 filed — design job |
| **G2** | 🔴 **P0** | flow | **`content_placement_rules` empty** → resolver returns 0 for all surfaces. | live: `SELECT count(*)…` = 0 | Auto-index the 9 products + 141 routable registry rows; seed on ingest. **Do G-SEC first.** | admin tooling |
| **G3** | 🔴 **P0** | tagging | **100% of active affiliate products untagged** (null city/country/location) → ILIKE never matches. | live: total=9, untagged=9 | Real tagging pass on Musement/Klook/12Go; enforce non-null location at ingest. **No fabrication (§13).** | §13 |
| **G4** | 🟠 **P1** | flow | **3 of 5 surfaces have no mounted consumer** (`experience-discovery`, `spontaneous`, `itinerary`). | `App.tsx:414-415,425-426,474-475`; `spontaneous-discovery.tsx:480` | Decide per surface: wire into `/discover` or retire from the map. | §9/§10 |
| **G5** | 🟠 **P1** | affiliates | **Fever/Impact, Viator-direct, SerpAPI, 12Go, Partnerize** each tracked/embedded but absent from `affiliate_partners`. | §2 table | Classify each: central-register vs document-as-data-API vs widget-attribution. | decision per stack |
| **G6** | 🟠 **P1** | structure | **248/248 registry rows unruled**; ~43% carry unroutable types. | live counts | Auto-index routable rows; formally mark internal-only types. | architecture |
| **G7** | 🟡 **P2** | affiliates | **Origin-label divergence.** Central discover normalizer emits `source:"Affiliate Partner"`, not canonical `"Paid partner"`. (A correct `"Paid partner"` path exists elsewhere → two label paths, reconcile.) | `content.routes.ts:7243` vs `content-origin.ts:42` | Import `CONTENT_ORIGIN_TRAVELER_LABEL`; single source. | §16 disclosure |
| **G8** | 🟡 **P2** | affiliates | **Untracked outbound fallback** — raw `window.open(item.affiliate_url)` on redirect failure (no `affiliate_clicks`). | `curated-content-section.tsx:213-214` | Route fallback through the tracked redirect, or drop it. | §16 |
| **G9** | 🟡 **P2** | structure | **Enum(17) ⟂ surface-map(10)**; 8–9 types unroutable, silent. | `schema.ts:4350` / `content-surface-map.ts:9` | Document internal-only types; add surfaceable ones. | doc-first |
| **G10** | 🟡 **P2** | structure | **Auto-index silently skips off-TravelPulse-city inventory** (`if(!cityData) continue`, no log). | `admin.routes.ts:5280-5288` | Log skipped counts / add a no-city bucket. | §13 no silent caps |

---

## 6. What PASSES (on the record)

- **Central pipeline is coherent**: `registerAffiliateProduct` dedups + versions cleanly (`storage.ts:4062-4135`); tracking numbers/statuses well-formed.
- **Location/ILIKE read path IS gated** on migration-121 (`content-query.service.ts:414-417`); endpoint reads gate on `approvedOnly=!isAdmin`. (The bypass is *only* the placement-id path — G-SEC.)
- **Agent-booking rail is §16-compliant**: all 12 Travelpayouts cards use `useAgentBooking` → `POST /api/affiliate-booking-requests`; server strips `affiliateUrl` (`content.routes.ts:6538-6539`); no raw `window.open` in the card set.
- **`travelpulse-discover` + `experience-template` are fully live-wired**; cart's `/api/upsell/*` is a deliberately separate pipeline, not a gap.

---

## 7. Recommended sequencing (for decision-maker ratification — nothing built yet)

1. **G-SEC first** (P0, tiny, decision-independent) — add the approval gate to `getAffiliateProductsByIds` + the redirect. **This must land before G2**, or populating placement rules opens the leak.
2. **G2 + G3 together** — tag the 9 products, then auto-index them + the 141 routable registry rows. This is what actually makes the resolver return items.
3. **G4** — decide the 3 dark surfaces (wire vs retire) before authoring more content against them.
4. **G7–G10** — a small content-hygiene batch (label, tracked-outbound, docs, logging).
5. **G1 + G5 (§16)** — the big architectural decision: a ratified design for unifying the parallel stacks into central ingestion. Explicitly *not* mechanical, *not* a third home.

---

## 8. Evidence appendix

**Live-DB queries** (run against the workspace DB):
```sql
SELECT name, source, approval_status, is_active, COUNT(apd.id) active_products,
       COUNT(apd.id) FILTER (WHERE apd.affiliate_url IS NULL) null_url
FROM affiliate_partners ap LEFT JOIN affiliate_products apd ON apd.partner_id = ap.id GROUP BY ap.id;
-- 3 rows (Musement/Klook/12Go Asia), 3 products each, 0 null_url

SELECT content_source, COUNT(*) FROM content_placement_rules GROUP BY 1;               -- 0 rows
SELECT content_type, COUNT(*) FROM content_registry GROUP BY 1 ORDER BY 2 DESC;        -- 248 total
SELECT COUNT(*) total, COUNT(*) FILTER (WHERE city IS NULL AND country IS NULL
       AND location IS NULL) untagged FROM affiliate_products WHERE is_active;          -- 9 / 9
-- GET /api/content/discover?surface=<any>[&city=Kyoto] → {"items":[],"total":0}  (all 5 surfaces)
```

**Static-analysis anchors** (code on `origin/main`): resolver `content.routes.ts:7122`; gated location read
`content-query.service.ts:414-417`; **un**gated id read `:390-397`; single consumer `curated-content-section.tsx:403`;
surface redirects `App.tsx:414-415,425-426,474-475`; origin label `content.routes.ts:7243`; card rail
`content.routes.ts:6538-6539`.
