-- 417 — event_invites.plan_trip_id and plan_user_id
-- (ledger `2026-10-29-invite-plan-around-event`).
--
-- HELD for "Migration 417 SQL approved — Leon". Do not merge until approved.
--
-- Row 280a (Architect rulings, Oct 29, 2026, 2:45 PM ET): a signed-in guest's
-- "plan around the event" binds one trip to this invite.
--   plan_trip_id  varchar  the guest's trip. NULL = not planned.
--                          FK trips(id) ON DELETE SET NULL.
--   plan_user_id  varchar  the session user who bound it. NULL = not planned.
--                          FK users(id) ON DELETE SET NULL.
-- The same user reads that trip back. A different user is refused.
--
-- Additive. Two nullable columns. No default, no check, no not-null, no index, no backfill.
-- Declared in shared/guest-invites-schema.ts (deploy-push durability). IF NOT EXISTS, so a
-- second run is a no-op.

ALTER TABLE event_invites ADD COLUMN IF NOT EXISTS plan_trip_id varchar REFERENCES trips(id) ON DELETE SET NULL;
ALTER TABLE event_invites ADD COLUMN IF NOT EXISTS plan_user_id varchar REFERENCES users(id) ON DELETE SET NULL;
