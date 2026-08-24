-- =============================================
-- SCHEDULED DROP: _deprecated_expert_city_queues
-- Safe to run after: 2026-09-01
-- Reason: Replaced by scoring-based lead routing
-- Migration confirmed: expert-availability.service.ts
--   migrated to expert_requests table 2026-06-27
-- Zero active references confirmed: 2026-06-27
-- =============================================

-- BEFORE RUNNING:
-- 1. Confirm date is after 2026-09-01
-- 2. Run this check first:
--    SELECT COUNT(*) FROM 
--    _deprecated_expert_city_queues;
--    If count > 0, archive data first.
-- 3. Confirm no new references added:
--    Search codebase for "city_queues"

-- DROP STATEMENT:
DROP TABLE IF EXISTS 
  _deprecated_expert_city_queues;

-- VERIFY:
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE '%city_queue%';
-- Expected: 0 rows returned
