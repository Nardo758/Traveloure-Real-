# §16 Catalog Unification — Design (P7)

**Date:** 2026-07-24 · **Status:** design for ratification. **Not built** — this is the plan for folding the 7 parallel
affiliate stacks into the central content system, ratified as in-scope on 2026-07-24. Per §16: *not mechanical, and not a
third content home.*

## Problem

Today there are **three disconnected content pipelines** (see `central-content-audit.md`): the central store
(`content_registry` + `affiliate_products` + `content_placement_rules` → `/api/content/discover`, fed only by the DB
scraper), the **20-network Travelpayouts** live passthrough (`/api/catalog/*`), and the **`*Cache`** store behind
`/api/catalog/search`. Seven affiliate stacks (Travelpayouts, Viator-direct, Fever/Impact, Amadeus, SerpAPI, 12Go,
Partnerize) never write `affiliate_products`, so they can't be placement-ruled, admin-curated, origin-labelled, or
surfaced by the central resolver. The central feed has ~9 hand-entered products.

## Design principles

1. **One central store, not a third home.** Everything normalizes into `affiliate_products` (+ `affiliate_partners`).
   Do NOT add a fourth table or a parallel "catalog registry."
2. **Ingest, don't proxy-at-render.** The live `/api/catalog/*` endpoints proxy external APIs per request. Unification
   means a **sync job** writes normalized rows into `affiliate_products`; the central resolver then reads DB rows. Keep
   the live endpoints during transition (don't break live surfaces) — retire them per-network only once the DB path is proven.
3. **Tag at ingest (P1 columns).** Every ingested row gets `city`/`country`/`coordinates` + `availability_status` +
   `booking_type` set at write time — the P1 schema exists for exactly this. **Never fabricate** (§13): a row with no
   resolvable location is written with NULL location (and won't surface until tagged), not a guessed city.
4. **Partner-gated (D1a / migration 121).** Each source is one `affiliate_partners` row; products inherit the partner's
   `approval_status`. New partners are born `submitted` → admin approves once → all their products surface. The G-SEC
   gate (already landed) then holds on both read paths.
5. **Classify by source, once.** `booking_type` is set from the source at ingest (see table), so the CTA engine renders
   the right button everywhere with no per-surface logic.

## Per-stack classification (the real decisions)

| Stack | Register as partner? | booking_type default | Ingest mechanism | Notes |
|---|---|---|---|---|
| **Travelpayouts** (20 networks) | Yes — one partner per network (or one "Travelpayouts" partner with `sub_category`=network) | `affiliate_bookable` (agent rail) | scheduled sync per network by city (Kyoto-first, §12) | dedup vs the manual "Klook"/"12Go" central rows (below) |
| **Viator (direct)** | Yes | `affiliate_bookable` | sync | reconcile with Travelpayouts `viator-feed` — pick ONE Viator path, mark the other inactive |
| **Fever (Impact.com)** | Yes | `affiliate_bookable` | sync events → `affiliate_products` (category=event) | already commission-tracked; the P4 Fever CTA migration already routes its buttons to the rail |
| **Amadeus** | **No — data API, not affiliate** | n/a | none (leave as live search) | flights/hotels/POIs are a data source, not a commissionable partner; document as non-affiliate. If a specific Amadeus product IS bookable in-platform → `in_platform_bookable` on those rows only |
| **SerpAPI** | Decide at ingest | `informational` unless the venue carries a real affiliate link | none / on-demand | venue search results are mostly informational; only rows with an affiliate link become `affiliate_bookable` |
| **12Go** | Yes | `affiliate_bookable` | manual/widget → create partner + products | widget has no server tracking today; a server ingest gives it tracking |
| **Partnerize** | Yes (already `source='partnerize'`) | `affiliate_bookable` | existing partnerize-sync writes partners; extend to write products | commission-pull already exists |

## Build phases (each its own PR, Kyoto-scoped per §12)

- **U1 — Partner rows. ✅ LANDED.** `catalog-ingest.service.ts` `ensureCatalogPartner` lazily creates the
  network's `affiliate_partners` row (born `submitted`, D1a; `source='travelpayouts'`) on first ingest —
  no startup cost, idempotent (dedup on name+source). Amadeus/SerpAPI are classified as data/informational
  in the per-stack table above (not registered as commissionable partners).
- **U2 — One ingest adapter. ✅ LANDED (3 networks wired).** `catalog-ingest.service.ts`:
  `ingestNetwork(networkKey, city)` key-gates on the Travelpayouts token (§13 — no token ⇒ `ready:false`,
  zero writes), fetches via the existing per-network service, and `upsertCatalogItem` normalizes each item
  into `affiliate_products` — **tag-at-ingest** (city/country/coordinates from the item; NULL if
  unresolvable, no guessed city), `booking_type='affiliate_bookable'` (the CTA classifier), **dedup on
  `(partner_id, external_id)`** (§15 idempotent — re-run updates in place) — then mirrors into
  `content_registry` via `registerAffiliateProduct`. Networks wired: **Tiqets, GetYourGuide, Klook**
  (all Kyoto-capable). Admin trigger: `POST /api/admin/catalog/ingest` (`{city, network?}`, adminApiGuard).
  **Live fetch is deploy-only** (the agent proxy 403s the external APIs); the DB upsert half is provable in
  the workspace. Once ingested + auto-indexed, the rows ride the P0–P6 spine automatically (approved gate,
  origin grouping, CTA engine).
- **U3 — Fan out** the remaining Travelpayouts networks + Fever + Viator-direct (same adapter; add entries to
  `CATALOG_NETWORKS`). Key-gated + spend-capped, Kyoto-first.
- **U4 — Retire the parallel path per-network** only after its DB rows are proven live: switch the client
  surface from `/api/catalog/<net>` to the central feed, then deprecate the live endpoint (no outage).
- **U5 — Dedup + reconciliation.** The Klook central partner vs Travelpayouts Klook, Viator-direct vs
  viator-feed — one canonical path each; the other marked inactive.

## Constraints (from the governance scan — do not violate)

- The **upsell engine** (`/api/upsell/*`) is a separate pipeline — unification does NOT fold it in.
- Ingestion runs **live only at deploy** (the agent proxy 403s the external APIs) — same as DMO ingestion; local runs are no-ops.
- Preserve the **content_impressions attribution chain** and the **feed-composition disclosure labels**.
- **Kyoto-first (§12)** — seed all-market partner *definitions* is inert, but only ingest Kyoto inventory now.

## What's already in place for this

- **P1 columns** (`availability_status`, `available_from/to`, `booking_type`) — the ingest write targets.
- **shared/content-cta.ts** — the classifier vocab + CTA rules the ingested `booking_type` feeds.
- **G-SEC gate** (landed) — so newly-ingested-but-unapproved partners can't leak.
- **auto-index** (+ the P6 skip logging) — turns ingested+tagged rows into placement rules.
- **Origin grouping** (P5) — ingested affiliate rows render under "Paid partners" automatically.

So U2's adapter is the one genuinely new build; the rest of the central plumbing is already done by P0–P6.
