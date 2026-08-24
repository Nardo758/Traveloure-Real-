-- q9.sql — Partner Demand R7 / Q9: destination × test-account cross-tab.
--
-- Gates the Phase-4 verdict:
--   "Kyoto clears the 10-floor with REAL (non-test) trips: YES/NO (n=…)"
--
-- READ-ONLY. Run: psql "<DEV_DATABASE_URL>" -f q9.sql
--
-- Test-account predicate mirrors R9's isRealAccountSql (server/services/demand-test-exclusion.ts):
--   email ILIKE '%@traveloure.test'  ⇒ TEST account.
--   NULL / absent email              ⇒ treated as REAL (§13 — absence of a test marker is not
--                                       evidence of a test account; LEFT JOIN keeps guest/authoring
--                                       trips rather than silently dropping them).
--
-- Two market resolutions are shown ON PURPOSE:
--   • trips.market_slug  — the value migration 241 backfilled (= resolveMarketSlug output). Q9a/Q9c.
--   • raw destination    — split_part(destination, ',', 1) matched to 'kyoto', backfill-INDEPENDENT.
--     Q9b is the authoritative verdict source (does not trust the backfill); Q9c cross-checks that
--     the backfill agrees (kyoto market_slug count should equal the raw kyoto count == R7 Q6b's 72).

\echo '================ Q9a — market_slug × account-type cross-tab (ALL trips) ================'
SELECT
  COALESCE(t.market_slug, '(unmapped)')                                             AS market_slug,
  COUNT(*)                                                                           AS total_trips,
  COUNT(*) FILTER (WHERE u.email IS NULL OR u.email NOT ILIKE '%@traveloure.test')   AS real_trips,
  COUNT(*) FILTER (WHERE u.email ILIKE '%@traveloure.test')                          AS test_trips
FROM trips t
LEFT JOIN users u ON u.id = t.user_id
GROUP BY COALESCE(t.market_slug, '(unmapped)')
ORDER BY total_trips DESC;

\echo ''
\echo '================ Q9b — KYOTO 10-floor VERDICT (raw destination, backfill-independent) ========'
-- real_traveler_trips is the honest headline: a REAL account AND not a speculative authoring
-- listing (author_id IS NULL — ready-made authoring trips carry userId NULL + author_id set and
-- are expert-authored inventory, not traveler demand). The 10-floor keys on this column.
SELECT
  COUNT(*)                                                                           AS kyoto_total,
  COUNT(*) FILTER (WHERE u.email ILIKE '%@traveloure.test')                          AS test_acct,
  COUNT(*) FILTER (WHERE u.email IS NULL OR u.email NOT ILIKE '%@traveloure.test')   AS real_acct,
  COUNT(*) FILTER (WHERE t.author_id IS NOT NULL)                                    AS authoring_trips,
  COUNT(*) FILTER (WHERE (u.email IS NULL OR u.email NOT ILIKE '%@traveloure.test')
                     AND t.author_id IS NULL)                                        AS real_traveler_trips,
  (COUNT(*) FILTER (WHERE (u.email IS NULL OR u.email NOT ILIKE '%@traveloure.test')
                      AND t.author_id IS NULL) >= 10)                                AS clears_10_floor
FROM trips t
LEFT JOIN users u ON u.id = t.user_id
WHERE lower(trim(split_part(t.destination, ',', 1))) = 'kyoto';

\echo ''
\echo '================ Q9c — cross-check: does migration 241 market_slug agree with raw kyoto? ======'
-- If backfill_kyoto == raw_kyoto (both == R7 Q6b''s 72), the migration-241 resolver/backfill is
-- validated against the raw destination text. A mismatch is a backfill bug worth flagging.
SELECT
  (SELECT COUNT(*) FROM trips WHERE market_slug = 'kyoto')                                   AS backfill_kyoto,
  (SELECT COUNT(*) FROM trips WHERE lower(trim(split_part(destination, ',', 1))) = 'kyoto')  AS raw_kyoto;
