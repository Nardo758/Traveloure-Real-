-- Migration 176: retire the three writerless Amadeus-era cache tables DELIBERATELY —
-- flight_cache, transfer_cache, safety_cache — following the migration-158 precedent
-- (service_demand_requests): a recorded decision, not an invisible deploy-push side effect.
--
-- WHY. Their single writer was the Amadeus service, dropped by DECISIONS.md ruling 34
-- (2026-08-05, upstream decommission). Audit (this lane, Aug 2026) confirmed per table:
--
--   flight_cache   — writer `cacheService.cacheFlights` has ZERO callers. The last route
--                    reader (GET /api/cache/flights) was deleted in PR #425 (flight-repoint).
--                    The remaining "readers" were a dead loop and observability of a
--                    permanently-empty table: cache-scheduler `refreshStaleFlights` listed
--                    routes from flight_cache and called `getFlightsWithCache`, which only
--                    re-read the same table (never wrote); `cleanupExpiredCache` deleted the
--                    24h-TTL rows daily, so the table converged to empty and stayed empty.
--                    Admin location-summary / /api/cache/status merely counted that emptiness.
--   transfer_cache — no writer anywhere; `searchTransfers` is stubbed to [] (ruling 34).
--                    Sole reader was the `type === "transfer"` branch of getCatalogItem,
--                    reachable only via GET /api/catalog/items/transfer/:id — an endpoint with
--                    zero client callers, and no search surface ever emits a transfer id.
--   safety_cache   — zero code references at all (searchSafety returns [], the "safety"
--                    getCatalogItem branch returns null without touching the table).
--
-- All of those dead code paths are deleted in the same commit as this migration, and the
-- three pgTable declarations are removed from shared/schema.ts in the same commit (the
-- deploy push is authoritative over schema.ts, so an undeclared-but-kept table would be
-- dropped by the next publish anyway — this makes the end state deterministic everywhere,
-- including fresh DBs where the 000 baseline recreates them).
--
-- WHY NO row-count refusal guard (deviation from 158, deliberate): these are API response
-- caches with a 24h TTL by design — rows are reproducible, worthless snapshots of a
-- provider that no longer exists, and every code path that could serve them is deleted in
-- this same commit. Refusing on rows would strand the table forever (transfer_cache and
-- safety_cache have no TTL cleanup, so year-old Amadeus rows may still sit there).
-- We log the counts for the record, then drop.
--
-- KEPT (verified live, do not extend this drop): hotel_cache (booking_com writer),
-- hotel_offer_cache (writerless but read by /api/cache/hotels — flagged, not retired),
-- activity_cache (Viator fetch-on-miss writer + /api/cache/activities), poi_cache
-- (writerless but serves /api/catalog?type=poi per the ruling-34 posture — flagged),
-- restaurant_cache (OpenTable), location_cache, fever_event_cache, travelpayouts_cache.
--
-- Idempotent: IF EXISTS on every drop; safe on DBs where a publish push already removed them.
-- No FK anywhere references these tables (verified: only PK/unique constraints in the
-- 000 baseline), so plain DROP TABLE suffices — no CASCADE needed.
DO $$
DECLARE
  t TEXT;
  n BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY['flight_cache', 'transfer_cache', 'safety_cache'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'migration 176: % already absent — nothing to do.', t;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    EXECUTE format('DROP TABLE IF EXISTS public.%I', t);
    RAISE NOTICE 'migration 176: dropped % (held % expired-era cache row(s); writer dead since the Amadeus drop, ruling 34).', t, n;
  END LOOP;
END $$;
