# Partner Demand 2C — Dead-table sunset dispositions

**Lane:** `lane/partner-demand-data` · **Ruling basis:** R6 (Phase 0), R7 verdict table
· **Audit SHA basis:** `1a0f31b2` (writer/reader trace, code-level, not row-count)
· **Ledger:** `2026-08-17-partner-demand-2c-sunset`

## The correction this pass makes

R7 measured **row counts** and reported all ten Q5 tables + `provider_availability` as **DEAD
(0 rows each)**, and the R7 verdict table read that as "sunset each after confirming the
generator is removed." A code-level **writer/reader trace** shows that **"0 rows" ≠ "safe to
drop":** several 0-row tables have **live readers** (a route SELECTs them; dropping breaks the
route) and two have **live writers** (a funnel/track handler INSERTs them; they are 0-row only
because the funnel is quiet, not because the writer is dead). This is the same row-count blind
spot that missed the `provider_availability` money-path writer (below).

**No dark-writer-resuming risk exists for any of these 11.** The only generator-shaped code
(`generateDemandSignals` / `refreshDemandSignalsForCity`, wired LIVE into `TravelPulseScheduler`)
writes **`service_demand_signals`** — a THIRD, different table not in this list. There are three
distinct "demand" tables and they must never be conflated:
| table | role | write status |
|---|---|---|
| `demand_signals` | aggregate search rollup | **read-only in code** (no writer) |
| `service_demand_signals` | funnel/search signal stream | **live generator** (not in scope) |
| `service_requests` | human-submitted "request a service" capture | **live writers** |

## Per-table dispositions

| # | table | writers | readers | verdict / disposition |
|---|---|---|---|---|
| 1 | `demand_signals` | none | **LIVE** — `getMarketDemandRows` (storage.ts:6685) via routes.ts:2407 | **KEEP.** No writer but a live route SELECTs it. Populated externally/manually. Dropping breaks the read. FOLLOWUP: decide whether to retire the reader or wire a writer — **not** a silent drop. |
| 2 | `service_requests` | **LIVE** — POST submit + admin UPDATE (service-requests.routes.ts:44/129) | LIVE admin queue | **KEEP-FOLLOWUP.** Real designed capture (migration 123), never surfaced to travelers. The R5 `unmet_demand_request` grade. FOLLOWUP: surface the capture in the traveler flow — build-none, wire-existing. |
| 3 | `provider_performance_metrics` | none | none | **DROP-SAFE (filed).** Zero refs outside schema.ts. |
| 4 | `market_intelligence` | none | none | **DROP-SAFE (filed).** Zero refs (the `getMarketIntelligence` method aggregates other tables — name collision). |
| 5 | `pricing_intelligence` | none | none | **DROP-SAFE (filed).** Zero refs. |
| 6 | `activity_booking_analytics` | **LIVE** — content-query.service.ts:822 via POST /api/track/funnel | **LIVE** — admin reports (admin-query.service.ts:1401-1531) | **KEEP.** Live writer AND readers; 0-row only because the funnel is quiet. Do NOT drop. |
| 7 | `activity_demand_trends` | none | none | **DROP-SAFE (filed).** Zero refs (the `getActivityTrendsReport` route reads `activity_booking_analytics`, not this). |
| 8 | `trip_analytics_enhanced` | **LIVE** — 4 writers (storage.ts:7323, content-query :827/:839, admin-query :1279) | **LIVE** | **KEEP.** Heavily live. Do NOT drop. |
| 9 | `service_gap_analysis` | none | **LIVE** — recommendation.service.ts:937/1443 via routes.ts:7401/7449 | **KEEP.** No writer, live readers; drop breaks provider-recommendations + market-intelligence routes. FOLLOWUP: confirm row provenance (seed/manual/external). |
| 10 | `seasonal_opportunities` | none | **LIVE** — recommendation.service.ts:1257, content-matching.service.ts:236 | **KEEP.** No writer, live readers; drop breaks seasonal-opportunity + market-intelligence routes. FOLLOWUP: confirm row provenance. |
| — | `provider_availability` | one **no-op** UPDATE (removed) | none | **DROPPED this pass** (migration 242) — see below. |

**Summary:** of the ten Q5 tables, **3 are DROP-SAFE** (`provider_performance_metrics`,
`pricing_intelligence`, `activity_demand_trends`) plus `market_intelligence` = **4 drop-safe**;
**6 are KEEP** (live readers and/or writers); `service_requests` is a KEEP-FOLLOWUP (surface it).
The four drop-safe tables are **FILED, not dropped here** — the explicit greenlight was for
`provider_availability` only, and the Phase-3 HARD STOP wants Leon to review the drop set. Filing
them with evidence (zero refs at `1a0f31b2`) is the disposition; executing the drop is a one-line
follow-up migration once ratified.

## `provider_availability` — DROPPED (migration 242)

R7 greenlit "DROP now, no escalation — no real rows." The trace found the row-count claim
**incomplete**: there was a **live raw `UPDATE provider_availability …`** on the
booking-confirmation (money) path (`booking.service.ts` `confirmBookingPayment`). Dropping the
table without removing that first would throw `relation "provider_availability" does not exist`
on **every booking confirmation**. Independently verified before touching it:
- **No insert path** anywhere (drizzle or raw) — the table is structurally 0-row on the live path,
  so the UPDATE matched nothing: a **proven no-op**.
- **No readers** — declared availability is `provider_availability_schedule` + blackouts; bookable
  truth is `vendor_availability_slots`; `expert-console.routes.ts` explicitly comments the table
  "deprecated/dead, never read here."

Executed as: (1) removed the no-op UPDATE (and its now-orphaned `partySize` local); (2) deleted the
`providerAvailability` declaration from `shared/schema.ts` (publish-trap — else the push recreates
it); (3) migration 242 `DROP TABLE IF EXISTS provider_availability`; (4) refreshed the stale
expert-console comment. Verify-then-delete (R1), writer removed first.

## FOLLOWUPS (filed, not this pass)

- **F-2C.a — search write-path dark** (Q1): `search_analytics` write path exists
  (`content-query.service.ts:807`, client `trackSearchEvent`) but has never produced a row. Trace
  why the insert never fires — the R5 `unmet_demand_search` signal has zero data until it does.
- **F-2C.b — surface `service_requests`** in the traveler flow (the R5 `unmet_demand_request`
  grade — a real capture with live writers, never reachable by a traveler).
- **F-2C.c — response-time computation** (originally masked by fabricated analytics, Phase 1).
- **F-2C.d — "sellable" A/B** experiment scaffolding.
- **F-2C.e — drop the 4 filed DROP-SAFE tables** once Leon ratifies the drop set (one migration).
- **F-2C.f — provenance of `service_gap_analysis` / `seasonal_opportunities` rows** (live readers,
  no in-repo writer — confirm seed/manual/external source before relying on them).
