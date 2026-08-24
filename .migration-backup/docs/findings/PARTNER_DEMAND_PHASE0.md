# Partner Demand Data — Phase 0 read-only audit (findings)

**Baseline:** `audited@8d7b581` (`main`, 2026-08-17). The four audit-target files
(`server/routes.ts`, `shared/schema.ts`, `server/storage.ts`,
`client/src/pages/expert/analytics.tsx`) were verified byte-identical between the audit
checkout and `origin/main`, so every `file:line` below is valid against the baseline.
Corrections to dispatch assumptions: `routes.ts` is **11,708 lines** (not ~18.5k); the
funnel/CLV/benchmark fabrications live in `/api/expert/analytics/dashboard` (`routes.ts:7106`),
the seasonal block in `/api/expert/market-intelligence` (`routes.ts:7240`).

**Limitation:** the read-only audit ran in the cloud lane session with **no `DATABASE_URL`**, so
"populated in practice" determinations are deferred to the R7 dev-DB pass (`r7-db-pass.sql`,
Items Q1–Q8). Code-level determinations (schema existence, write-path liveness, DOES-NOT-EXIST)
are firm.

---

## 0.1 Capture-completeness

| Field | Verdict | Evidence |
|---|---|---|
| Origin market (traveler home) | EXISTS at search grain; absent on trips | `search_analytics.origin_country/origin_city` (`schema.ts:6190-6191`), IP `ip_country/ip_city` (`:6201-6202`). Not on `trips` — `trips.destination` (`:93`, notNull) is the *destination*. |
| Rollup "market" key (destination) | EXISTS but UNNORMALIZED | `trips.destination` (`:93`, notNull free-text varchar(255)) — needs mapping to the 8 slugs (`market_geography.market`, `:3471`). |
| Party size | EXISTS (overlapping); real-vs-default DEFERRED | `trips.number_of_travelers` (`:99`, default 1), `adults/kids` (`:100-101`), `travelers` (`:106`); `search_analytics.travelers` (`:6193`); `service_bookings.party_size` (`:1474`). Default-1 masks "never asked" — Q2. |
| Lead time (request vs travel) | EXISTS AND POPULATED (derivable) | `trips.created_at` (`:141`, defaultNow) vs `trips.start_date` (`:91`, notNull). |
| Slip-item add/remove events w/ stage | add EXISTS; stage-history + removal DO NOT EXIST | ADD: `itinerary_items.created_at` (`:4090`) + `origin` (`:4074`) + `suggested_by` (`:4064`). STAGE-over-time: no (0.4). REMOVE: **no soft-delete anywhere** (grep `deletedAt/isDeleted/removedAt` = 0); removal is a hard DELETE — no trail. |
| Requested-but-unavailable windows | EXISTS (write-path live); population + coverage DEFERRED | `search_analytics` (`:6183`): `destination`, `travel_dates` (`:6192`), **`results_count`** (`:6196` — a zero-result search *is* the signal), `converted_to_booking` (`:6198`). Writer live: `content-query.service.ts:807`; client `discover.tsx:563 trackSearchEvent`. Unverified: whether `results_count` is set and whether *provider-service* searches are logged (Q1/Q1b). |

## 0.2 Availability canonical source

- **`provider_availability_schedule`** (`schema.ts:5767`) — LIVE. Weekly-recurring; full CRUD
  `storage.ts:6300-6325`; read by `provider-matching.service.ts:67` + `experts-query.service.ts:117`.
  Sibling `provider_blackout_dates` (`:5787`).
- **`provider_availability`** (`schema.ts:7093`) — ORPHAN (only non-test ref is its own def).
- **Recommendation (R1 ratified):** canonical = `provider_availability_schedule` (+ blackouts);
  `vendor_availability_slots` is bookable truth; `provider_availability` presumed dead pending Q4.
  Demand-not-met (slip-grain) = requested window ∩ no bookable slot.

## 0.3 Fabrication inventory (removed in Phase 1)

Expert dashboard (`routes.ts:7106`): synthetic funnel (`:7156` ×3.5, `:7158` ×0.85; client `analytics.tsx:465`);
hardcoded `responseTime` (`:7174`); CLV (`:7193-7197` ×1.8 / repeatRate 35 / 1.8; client `:169/:601/:605/:609`);
**plus the fabricated benchmark targets** `"55%"`/`"4.5"`/`"$350"` (`:7177/:7182/:7187` — dispatch-missed, killed under R4).
Market-intelligence (`routes.ts:7240`): `seasonalDemandByMarket` table + match + fallback (`:7303-7326`; client `:571/:1039`);
no-match fallbacks (`:7268-7270/:7284-7286/:7297-7299`).
Money-source note: both dashboards read the deprecated `provider_services.total_revenue` counter (`storage.ts:3025`) at
`routes.ts:7121/7143/7555/7591`, not `fee_ledger` (`schema.ts:6817`) — Phase 2 money blocks must move.

## 0.4 routingStatus event trail — current-state only; transitions log REQUIRED

`itinerary_items.routing_status` (`schema.ts:4088`, index `:4100`) is written in-place at 4 writers
(`routing.routes.ts:212`, `booking-actions.ts:268`, `item-routing.service.ts:62/127`) — `updated_at` = last
transition only. No transitions table (`lead_routing_logs` `:7196` is a per-decision assignment snapshot, not
item stage history). ⇒ time-in-stage/stall NOT derivable. R2 adds append-only `itinerary_item_events`
(same-transaction); R3 adds sibling `expert_assignment_events`.

## 0.5 Grok-era travelPulse consumers — cross-lane dependency

`market-intelligence` reads `travelPulseTrending/Cities/HappeningNow` directly (`routes.ts:7251-7253`). Phase 1
deletes only the seasonal block + fallbacks; the **travelPulse reads belong to trend-lane Item F** and are untouched.
Other consumers (not this lane): `trips.routes.ts:861`, `itinerary-optimizer.ts:573`. Whether Item F covers
`routes.ts:7240` is unknowable from this repo — dependency recorded.

## 0.6 Pre-existing analytics tables (R6 Phase 2 gate)

Ten tables need a LIVE/STALE/DEAD trace before `partner_demand_rollup` (Q5): `demand_signals` (`:6243` — has
`no_results_count`), `service_requests` (`:6263` — explicit traveler capture), `provider_performance_metrics`
(`:6290`), `market_intelligence` (`:6309`), `pricing_intelligence` (`:6323`), `activity_booking_analytics` (`:6341`),
`activity_demand_trends` (`:6380`), `trip_analytics_enhanced` (`:6409`), `service_gap_analysis` (`:5667`),
`seasonal_opportunities` (`:5689`).

**CORRECTION (post-Phase-0 review — the ELEVENTH table).** The Phase 0 keyword sweep grepped
`analytic|insight|metric` and missed the `demand` pipeline. `demand_signal_events` (`schema.ts:8456`,
migration 189) is a **ratified Aug 9 2026 build, §13-honest**: append-only, single writer `logDemandSignal()`
(`demand.routes.ts:55`, fire-and-forget), kinds gated by `DEMAND_SIGNAL_EVENT_KINDS`
(`stay_anchor_miss`/`no_stay_flag`/`places_fallthrough`); read by `GET /api/me/demand-signals` and the Business
Advisor (`GET/POST /api/me/business-advisor`, rendered `performance.tsx:688 DemandTab`). Unlike the ten, it is
demonstrably live with a disciplined writer — **substrate candidate** (volume/coverage via Q8/Q8b). Additive to
the Q5 trace, not a substitute. Locked-Decision-1 reconciliation (`demand_signal_events` adopt-as-substrate vs
sibling tables) is the FIRST section of the Phase 2 dispatch, and must address the write-semantics tension
(fire-and-forget vs the same-transaction discipline R2 requires).

---

## HARD STOP — questions for Leon (R7 verdict table gates Phase 2)

1. **0.2 ruling:** confirmed R1 — `provider_availability_schedule` canonical; `provider_availability` drop pending Q4.
2. **0.1 gaps:** demand-not-met hinges on `search_analytics.results_count` being populated + covering
   provider-service searches (Q1/Q1b) — DB pass required. Removal-signal + time-in-stage need the R2 events log.
3. **DB pass:** commissioned (R7 script, Q1–Q8), read-only dev DB.
4. **Eleventh table:** `demand_signal_events` reconciliation opens Phase 2 (adopt-as-substrate vs sibling).
