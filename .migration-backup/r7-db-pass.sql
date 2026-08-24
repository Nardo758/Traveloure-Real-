-- ============================================================================
-- R7 DB PASS — Partner Demand Data · read-only dev-DB audit
-- Companion to Phase 0 findings (audited@8d7b581). READ-ONLY: every statement is
-- a SELECT. No writes, no DDL, no temp tables. Run on Replit dev where
-- DATABASE_URL is present:
--
--   psql "$DATABASE_URL" -f r7-db-pass.sql | tee r7-output.txt
--
-- Pre-validated against shared/schema.ts@8d7b581: every table/column below
-- exists. Therefore ANY error here is real schema drift vs push-canonical —
-- capture it verbatim as a finding (do NOT create the table).
-- ============================================================================
\pset pager off
\timing off

\echo '================ Q1a — search_analytics population ================'
SELECT
  count(*)                                            AS total_rows,
  min(created_at)                                     AS earliest,
  max(created_at)                                     AS latest,
  count(*) FILTER (WHERE results_count IS NOT NULL)   AS has_results_count,
  count(*) FILTER (WHERE results_count = 0)           AS zero_result_searches,
  count(*) FILTER (WHERE origin_country IS NOT NULL)  AS has_origin_country,
  count(*) FILTER (WHERE ip_country IS NOT NULL)      AS has_ip_country,
  count(*) FILTER (WHERE travel_dates IS NOT NULL)    AS has_travel_dates,
  count(*) FILTER (WHERE travelers IS NOT NULL)       AS has_travelers,
  count(*) FILTER (WHERE converted_to_booking = true) AS converted
FROM search_analytics;

\echo '================ Q1b — search_type coverage (does ''service'' appear?) ================'
SELECT search_type, count(*) AS n,
       count(*) FILTER (WHERE results_count IS NOT NULL) AS has_rc,
       count(*) FILTER (WHERE results_count = 0)         AS zero_rc
FROM search_analytics
GROUP BY search_type ORDER BY n DESC;

\echo '================ Q1c — destination free-text shape (top 40) ================'
SELECT lower(destination) AS destination, count(*) AS n
FROM search_analytics
WHERE destination IS NOT NULL
GROUP BY 1 ORDER BY n DESC LIMIT 40;

\echo '================ Q1d — recency (live now vs historical residue) ================'
SELECT date_trunc('month', created_at) AS month, count(*) AS n
FROM search_analytics GROUP BY 1 ORDER BY 1 DESC LIMIT 12;

\echo '================ Q2 — trips party size: real vs default-masked ================'
SELECT
  count(*) AS total_trips,
  count(*) FILTER (WHERE number_of_travelers = 1 AND adults = 2 AND kids = 0
                   AND travelers IS NULL)                          AS all_defaults_suspect,
  count(*) FILTER (WHERE travelers IS NOT NULL)                    AS has_explicit_travelers,
  count(*) FILTER (WHERE number_of_travelers IS DISTINCT FROM 1)   AS nt_moved,
  count(*) FILTER (WHERE adults IS DISTINCT FROM 2)                AS adults_moved,
  count(*) FILTER (WHERE kids IS DISTINCT FROM 0)                  AS kids_moved
FROM trips;

\echo '================ Q2b — cross-field disagreement (travelers vs number_of_travelers) ================'
SELECT count(*) AS disagree
FROM trips
WHERE travelers IS NOT NULL AND number_of_travelers IS NOT NULL
  AND travelers <> number_of_travelers;

\echo '================ Q3 — trips.destination normalization difficulty (top 50) ================'
SELECT lower(trim(destination)) AS destination, count(*) AS n
FROM trips GROUP BY 1 ORDER BY n DESC LIMIT 50;

\echo '================ Q3b — naive match rate vs the 8 market slugs ================'
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE lower(destination) ~ 'kyoto|edinburgh|porto|bogot|cartagena|mumbai|goa|jaipur') AS matches_a_market
FROM trips;

\echo '================ Q4 — availability table row counts (orphan check) ================'
SELECT 'provider_availability' AS t, count(*) FROM provider_availability
UNION ALL SELECT 'provider_availability_schedule', count(*) FROM provider_availability_schedule
UNION ALL SELECT 'provider_blackout_dates', count(*) FROM provider_blackout_dates
UNION ALL SELECT 'vendor_availability_slots', count(*) FROM vendor_availability_slots;

\echo '================ Q4b — provider_availability ownership (test residue vs real) ================'
SELECT pa.provider_id, u.email, count(*) AS n
FROM provider_availability pa LEFT JOIN users u ON u.id = pa.provider_id
GROUP BY 1,2 ORDER BY n DESC LIMIT 10;

\echo '================ Q5 — the ten pre-existing analytics tables (LIVE/STALE/DEAD) ================'
SELECT t, n, earliest, latest FROM (
  SELECT 'demand_signals' AS t, count(*) AS n, min(created_at) AS earliest, max(created_at) AS latest FROM demand_signals
  UNION ALL SELECT 'service_requests', count(*), min(created_at), max(created_at) FROM service_requests
  UNION ALL SELECT 'provider_performance_metrics', count(*), min(created_at), max(created_at) FROM provider_performance_metrics
  UNION ALL SELECT 'market_intelligence', count(*), min(created_at), max(created_at) FROM market_intelligence
  UNION ALL SELECT 'pricing_intelligence', count(*), min(created_at), max(created_at) FROM pricing_intelligence
  UNION ALL SELECT 'activity_booking_analytics', count(*), min(created_at), max(created_at) FROM activity_booking_analytics
  UNION ALL SELECT 'activity_demand_trends', count(*), min(created_at), max(created_at) FROM activity_demand_trends
  UNION ALL SELECT 'trip_analytics_enhanced', count(*), min(created_at), max(created_at) FROM trip_analytics_enhanced
  UNION ALL SELECT 'service_gap_analysis', count(*), min(created_at), max(created_at) FROM service_gap_analysis
  UNION ALL SELECT 'seasonal_opportunities', count(*), min(created_at), max(created_at) FROM seasonal_opportunities
) x ORDER BY n DESC;

\echo '================ Q5b — service_requests status distribution (worked vs abandoned queue) ================'
SELECT status, count(*) AS n FROM service_requests GROUP BY 1 ORDER BY n DESC;

\echo '================ Q6a — itinerary_items volume by routing_status ================'
SELECT routing_status, count(*) AS n FROM itinerary_items GROUP BY 1 ORDER BY n DESC;

\echo '================ Q6b — trips per mapped market (10-floor reality check) ================'
SELECT lower(destination) AS destination, count(*) AS trips
FROM trips
WHERE lower(destination) ~ 'kyoto|edinburgh|porto|bogot|cartagena|mumbai|goa|jaipur'
GROUP BY 1 ORDER BY trips DESC;

\echo '================ Q6c — fee_ledger depth (money-block backfill span) ================'
SELECT count(*) AS n, min(created_at) AS earliest, max(created_at) AS latest FROM fee_ledger;

\echo '================ Q6d — test-account contamination in trips ================'
SELECT
  count(*) AS total_trips,
  count(*) FILTER (WHERE u.email LIKE '%@traveloure.test') AS test_account_trips
FROM trips t LEFT JOIN users u ON u.id = t.user_id;

\echo '================ Q7 — schema-drift spot-check (ORM default == DB default?) ================'
SELECT table_name, column_name, column_default, is_nullable
FROM information_schema.columns
WHERE (table_name = 'itinerary_items' AND column_name = 'routing_status')
   OR (table_name = 'trips' AND column_name IN ('number_of_travelers','adults','kids'))
   OR (table_name = 'search_analytics' AND column_name = 'results_count')
ORDER BY table_name, column_name;

\echo '================ Q8 — demand_signal_events volume + kind distribution (the ELEVENTH table) ================'
-- The live, disciplined demand pipeline the Phase 0 audit missed (migration 189;
-- one writer, logDemandSignal(), fire-and-forget). Substrate candidate — see the
-- corrective note A1/A2.
SELECT kind, count(*) AS n, min(created_at) AS earliest, max(created_at) AS latest
FROM demand_signal_events GROUP BY kind ORDER BY n DESC;

\echo '================ Q8b — demand_signal_events market coverage ================'
SELECT market, count(*) AS n FROM demand_signal_events GROUP BY market ORDER BY n DESC LIMIT 12;

\echo '================ R7 DB PASS COMPLETE ================'
