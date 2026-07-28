-- 151: Downgrade any @traveloure.test accounts that have admin role to 'user'.
-- Test seed accounts should never hold admin on production.
-- Idempotent: UPDATE WHERE is a no-op if already downgraded.
UPDATE users
SET role = 'user',
    updated_at = NOW()
WHERE email LIKE '%@traveloure.test'
  AND role = 'admin';
