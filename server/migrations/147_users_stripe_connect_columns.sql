-- 147: users Stripe Connect columns — repair the phantom-column Connect chain (Build 1 finding).
--
-- storage.getUserStripeAccount / updateUserStripeAccount (and through them the ENTIRE Stripe
-- Connect chain: GET /api/stripe/connect/status, POST /api/stripe/connect/onboard, the
-- payout-request readiness check, the admin payout transfer recipient lookup, and the Connect
-- webhook) read and write users.stripe_account_id / stripe_account_status /
-- can_receive_payments — columns that were NEVER added to the users table by any migration
-- and are absent from shared/models/auth.ts. On a schema-true database every one of those
-- code paths throws at runtime (proven: SELECT stripe_account_id FROM users → column does
-- not exist), which the callers surface as 500s and the dashboards silently render as
-- "payouts not set up".
--
-- Fix = make the schema match the long-standing code intent (Connect state lives on users,
-- one row per earner), NOT rewrite the accessor: additive nullable columns, no CHECK, no
-- DEFAULT backfill semantics beyond the boolean's inert false → no publish-time
-- drizzle-push trap. IF NOT EXISTS makes this a no-op on any environment where the columns
-- already physically exist (grandfathered from an older push).
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_status VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_receive_payments BOOLEAN DEFAULT false;
