# R7 DB PASS — Partner Demand Data · read-only dev-DB audit

Run 2026-08-17 on Replit dev DB (`psql $DATABASE_URL -f r7-db-pass.sql`), script pre-validated against schema.ts@8d7b581. Zero errors — no schema drift vs push-canonical. Verbatim output follows.

```
Pager usage is off.
Timing is off.
================ Q1a — search_analytics population ================
 total_rows | earliest | latest | has_results_count | zero_result_searches | has_origin_country | has_ip_country | has_travel_dates | has_travelers | converted 
------------+----------+--------+-------------------+----------------------+--------------------+----------------+------------------+---------------+-----------
          0 |          |        |                 0 |                    0 |                  0 |              0 |                0 |             0 |         0
(1 row)

================ Q1b — search_type coverage (does 'service' appear?) ================
 search_type | n | has_rc | zero_rc 
-------------+---+--------+---------
(0 rows)

================ Q1c — destination free-text shape (top 40) ================
 destination | n 
-------------+---
(0 rows)

================ Q1d — recency (live now vs historical residue) ================
 month | n 
-------+---
(0 rows)

================ Q2 — trips party size: real vs default-masked ================
 total_trips | all_defaults_suspect | has_explicit_travelers | nt_moved | adults_moved | kids_moved 
-------------+----------------------+------------------------+----------+--------------+------------
         217 |                   94 |                     52 |       75 |            1 |          0
(1 row)

================ Q2b — cross-field disagreement (travelers vs number_of_travelers) ================
 disagree 
----------
       19
(1 row)

================ Q3 — trips.destination normalization difficulty (top 50) ================
        destination        | n  
---------------------------+----
 kyoto, japan              | 47
 lisbon                    | 43
 kyoto                     | 25
 san francisco             | 24
 paris, france             | 17
 barcelona, spain          | 16
 tokyo, japan              |  9
 lisbon, portugal          |  6
 new york                  |  6
 westchester ny            |  2
 barcelona                 |  1
 california, usa           |  1
 maui & big island, hawaii |  1
 budapest                  |  1
 nigeria                   |  1
 rome                      |  1
 prague                    |  1
 bali                      |  1
 amsterdam                 |  1
 l                         |  1
 unknown                   |  1
 krakow                    |  1
 bali, indonesia           |  1
 paris                     |  1
 tokyo                     |  1
 osaka, japan              |  1
 nara,                     |  1
 ci test destination       |  1
 london                    |  1
 tampa                     |  1
 osaka                     |  1
 california                |  1
(32 rows)

================ Q3b — naive match rate vs the 8 market slugs ================
 total | matches_a_market 
-------+------------------
   217 |               72
(1 row)

================ Q4 — availability table row counts (orphan check) ================
               t                | count 
--------------------------------+-------
 provider_availability          |     0
 provider_availability_schedule |    25
 provider_blackout_dates        |     5
 vendor_availability_slots      |   149
(4 rows)

================ Q4b — provider_availability ownership (test residue vs real) ================
 provider_id | email | n 
-------------+-------+---
(0 rows)

================ Q5 — the ten pre-existing analytics tables (LIVE/STALE/DEAD) ================
              t               | n | earliest | latest 
------------------------------+---+----------+--------
 demand_signals               | 0 |          | 
 service_requests             | 0 |          | 
 provider_performance_metrics | 0 |          | 
 market_intelligence          | 0 |          | 
 pricing_intelligence         | 0 |          | 
 activity_booking_analytics   | 0 |          | 
 activity_demand_trends       | 0 |          | 
 trip_analytics_enhanced      | 0 |          | 
 service_gap_analysis         | 0 |          | 
 seasonal_opportunities       | 0 |          | 
(10 rows)

================ Q5b — service_requests status distribution (worked vs abandoned queue) ================
 status | n 
--------+---
(0 rows)

================ Q6a — itinerary_items volume by routing_status ================
   routing_status   |  n  
--------------------+-----
 in_planning        | 466
 purchased          |  42
 ready_for_checkout |  26
 with_expert        |   9
(4 rows)

================ Q6b — trips per mapped market (10-floor reality check) ================
 destination  | trips 
--------------+-------
 kyoto, japan |    47
 kyoto        |    25
(2 rows)

================ Q6c — fee_ledger depth (money-block backfill span) ================
 n | earliest | latest 
---+----------+--------
 0 |          | 
(1 row)

================ Q6d — test-account contamination in trips ================
 total_trips | test_account_trips 
-------------+--------------------
         217 |                 74
(1 row)

================ Q7 — schema-drift spot-check (ORM default == DB default?) ================
    table_name    |     column_name     |          column_default          | is_nullable 
------------------+---------------------+----------------------------------+-------------
 itinerary_items  | routing_status      | 'in_planning'::character varying | NO
 search_analytics | results_count       |                                  | YES
 trips            | adults              | 2                                | YES
 trips            | kids                | 0                                | YES
 trips            | number_of_travelers | 1                                | YES
(5 rows)

================ Q8 — demand_signal_events volume + kind distribution (the ELEVENTH table) ================
       kind       | n |          earliest          |           latest           
------------------+---+----------------------------+----------------------------
 no_stay_flag     | 1 | 2026-08-11 16:12:18.343712 | 2026-08-11 16:12:18.343712
 stay_anchor_miss | 1 | 2026-08-11 16:12:17.468132 | 2026-08-11 16:12:17.468132
(2 rows)

================ Q8b — demand_signal_events market coverage ================
 market | n 
--------+---
 Kyoto  | 2
(1 row)

================ R7 DB PASS COMPLETE ================
```

---

## Item B — interpretation + verdict table

Script ran clean top-to-bottom (zero errors) ⇒ **no schema drift vs push-canonical** (Q7 confirms: `routing_status` default `in_planning`/NOT NULL, `results_count` no-default/nullable, `adults`/`kids`/`number_of_travelers` defaults 2/0/1 — all match the ORM).

**Per-query reads:**

- **Q1 — `search_analytics` is DEAD (0 rows).** The write path exists in code (`content-query.service.ts:807`, client `trackSearchEvent`) but has **never produced a row** — so `results_count` is moot and `search_type` never even reaches `'service'`. R5's `unmet_demand_search` signal has **zero data**; the write path is dark in practice. → FOLLOWUPS: trace why `trackSearchEvent` → insert never fires.
- **Q2 — party size is materially broken.** 94/217 trips (**43%**) sit at the exact default triple with no explicit `travelers` — unusable (can't tell "2 adults" from never-asked). Only 52 (24%) carry explicit `travelers`; `adults`/`kids` are essentially never moved (1/0 rows), and Q2b shows **19 trips where `travelers` ≠ `number_of_travelers`** — the three-overlapping-fields problem is real and writers disagree. → **R8 explicit-capture is P1.**
- **Q3 — `trips.destination` is noisy free-text; the target markets and the actual demand diverge.** 33% (72/217) match a market slug, and **all 72 are Kyoto** (`kyoto, japan` 47 + `kyoto` 25). The other 7 markets (edinburgh/porto/bogotá/cartagena/mumbai/goa/jaipur) have **zero** trips. Meanwhile the 2nd–5th biggest destination clusters — **Lisbon 49, San Francisco 24, Paris 18, Barcelona 17** — are NOT in the 8-market set, alongside junk (`l`, `unknown`, `nara,`, `ci test destination`). → R8 normalization needed; separately, flag to Leon that real demand concentrates outside 6 of the 8 chosen markets.
- **Q4 — `provider_availability` is a confirmed ORPHAN (0 rows, no owners).** Live source `provider_availability_schedule` (25) + `provider_blackout_dates` (5); `vendor_availability_slots` (149) is bookable truth. → **DROP `provider_availability`** (R1 verify-then-delete; no escalation — no real rows).
- **Q5 — all ten pre-existing analytics tables are DEAD (0 rows each).** `service_requests` also 0 (Q5b). → R6: none are live substrates, so `partner_demand_rollup` collides with nothing; each is Grok-era scaffolding to sunset (confirm each generator is removed first — the dark-writer-resuming risk). `service_requests` (a real designed capture, migration 123, never used by a traveler) → FOLLOWUPS to surface it in the traveler flow, not build-new.
- **Q6a — slip substrate exists.** `itinerary_items`: in_planning 466, purchased 42, ready_for_checkout 26, with_expert 9 (543 total); no `removed` state (hard-delete confirmed). Enough volume for a point-in-time slip funnel.
- **Q6b/Q6d — the 10-floor is NOT safely cleared by any market.** Kyoto is the only market with volume (72 naive), but 74/217 trips (**34%**) are test accounts (`@traveloure.test`) and the seeds are **Kyoto-centric**, so an unknown-but-likely-large share of those 72 are test data. **After exclusion, whether even Kyoto clears 10 real trips is unproven** — needs one cross-tab (`destination ~ kyoto AND email NOT LIKE '%@traveloure.test'`). The other 7 markets are 0 regardless.
- **Q6c — `fee_ledger` is EMPTY (0 rows).** The money blocks (channel economics 3.3) have **no history to backfill**; §-3 money reads are correct-by-design but have nothing to read yet.
- **Q8 — `demand_signal_events` is live but nascent.** 2 rows total (`no_stay_flag` 1, `stay_anchor_miss` 1), both Kyoto, both Aug 11; `places_fallthrough` 0. The disciplined writer works but has produced almost nothing, and its kinds are advisory — not the demand-not-met signals R5 needs.

### Verdict table

| Question | Verdict |
|---|---|
| **3.1 viable — which R5 signals are live?** | **PARTIAL.** `unmet_demand_slip` (hero) is computable **today** point-in-time (466 in_planning items ∩ 149 slots); **time-in-stage + removal need R2**. `unmet_demand_request` (`service_requests`) = **0 rows → not live** (FOLLOWUPS: surface capture). `unmet_demand_search` (`search_analytics`) = **0 rows → not live** (FOLLOWUPS: dark write path). *Failed conditions: request-grain and search-grain have no data.* |
| **Party-size usable today / R8 priority** | **~43% default-masked, 24% explicit, 19 cross-field disagreements → P1.** R8 explicit nullable capture is the highest-value schema change for the sellable asset. |
| **`provider_availability` drop or escalate** | **DROP** — 0 rows, no owners (R1 verify-then-delete). |
| **Ten-table dispositions incl. `demand_signals` generator** | **ALL TEN DEAD (0 rows).** Sunset each after confirming its generator is removed (dark-writer risk). `service_requests` → FOLLOWUPS (surface in traveler flow), not build-new. |
| **Any market clears the 10-floor today** | **NOT PROVEN.** Only Kyoto has volume (72 naive); with 34% Kyoto-concentrated test contamination, real-non-test Kyoto is unproven and may approach/fall below 10 — needs the destination×test cross-tab. All 7 other markets = 0. |
| **Test-exclusion predicate needed** | **YES** — 34% (`74/217`) contamination. R9 shared predicate is mandatory, not optional. |
| **Schema drift** | **NONE** — Q7 clean; script ran error-free. |

### A2 recommendation (adopt-substrate vs sibling) — evidence for Leon's ruling

The evidence points to **(b) sibling-tables**, with the rollup as the single computation layer:
- **No rich substrate to adopt.** `demand_signal_events` has **2 rows** of advisory kinds; the ten legacy tables are all dead. Adopting it as *the* canonical lifecycle stream buys no existing data — it's near-greenfield either way.
- **The write disciplines are genuinely opposite (A3).** `logDemandSignal()` is fire-and-forget by design (a lost advisory signal must never fail the host request); R2 lifecycle events must be **same-transaction** (a lost transition breaks funnel integrity). Forcing both into one table means one kind-class silently weakens its guarantee.
- **L6 is preserved at the rollup layer regardless** — `partner_demand_rollup` reads all sources (slip events, availability, `demand_signal_events`, fee_ledger) and computes each figure **once** there; no demand number is computed in two places.

**This is Leon's call, not the agent's** — recommendation only. If (a) adopt-as-substrate is chosen, the design must show one table carrying both write disciplines (transactional insert path alongside the fire-and-forget helper, per kind-class) without weakening either.

**HARD STOP:** this verdict table gates the Phase 2 dispatch (rollup schema, R2/R3 event trails, R8 capture, R6 sunsets). No Phase 2 schema work begins until Leon reviews it and rules A2(a)/(b).


---

## Q9 — destination × test-account cross-tab (Phase 2A step 5, run 2026-08-18)

Script: `q9.sql` (read-only; test predicate mirrors R9's `isRealAccountSql`, NULL-email-is-real per §13). Zero errors.

```
================ Q9a — market_slug × account-type cross-tab (ALL trips) ================
 market_slug | total_trips | real_trips | test_trips 
-------------+-------------+------------+------------
 (unmapped)  |         145 |         90 |         55
 kyoto       |          72 |         53 |         19
(2 rows)


================ Q9b — KYOTO 10-floor VERDICT (raw destination, backfill-independent) ========
 kyoto_total | test_acct | real_acct | authoring_trips | real_traveler_trips | clears_10_floor 
-------------+-----------+-----------+-----------------+---------------------+-----------------
          72 |        19 |        53 |              24 |                  29 | t
(1 row)


================ Q9c — cross-check: does migration 241 market_slug agree with raw kyoto? ======
 backfill_kyoto | raw_kyoto 
----------------+-----------
             72 |        72
(1 row)

```

**Verdict row: Kyoto clears 10-floor with real trips: YES (n=29)** — real_traveler_trips = 29 (72 raw kyoto − 19 test-account − 24 expert-authoring), keyed on real_traveler_trips per the lane's design note (authoring listings are expert inventory, not traveler demand; on the raw R7-Q6b framing it would be real_acct = 53, also YES).

Q9c cross-check: backfill_kyoto = raw_kyoto = 72 — migration 241's resolver/backfill validated against raw destination text, no backfill bug.
