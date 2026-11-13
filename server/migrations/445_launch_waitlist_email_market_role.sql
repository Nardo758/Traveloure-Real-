-- 445 — launch_waitlist: one row per email, market, and role.
-- Migration 445 SQL approved — Leon (Nov 11, 2026, 12:02 PM ET).
--
-- Drops the (email, market_slug) unique index from migration 381 and replaces it with
-- (email, market_slug, role), so a traveler row and an expert or provider row for the
-- same address can sit side by side in one market. No new column. Existing rows are
-- already unique on email and market, so the new index builds on the current data.
-- The index is declared in shared/schema.ts (deploy-push durability).

DROP INDEX IF EXISTS uq_launch_waitlist_email_market;
CREATE UNIQUE INDEX IF NOT EXISTS uq_launch_waitlist_email_market_role
  ON launch_waitlist (email, market_slug, role);
