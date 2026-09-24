-- Migration 322: PHONE PUSH — device subscriptions, and a one-time push claim on each notification.
--
-- Ledger `2026-09-24-web-push`. CLAUDE.md Locked Decision 53 (decision-maker ratified Sep 24, 2026:
-- "letting experts and providers receive push notifications on their phones"). §13, §14, §15, §19, §20.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS MISSING
-- ─────────────────────────────────────────────────────────────────────────────
-- There was no push transport at all: no service worker, no manifest, no subscription store. A
-- notification lived only in the in-app bell, polled every 30 seconds while a page was open.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SHAPE
-- ─────────────────────────────────────────────────────────────────────────────
-- push_subscriptions — one row per BROWSER/DEVICE a signed-in person turned phone notifications on
--   for (the Web Push subscription the browser hands back: endpoint + two keys). `endpoint` is
--   UNIQUE: a device re-subscribing replaces its own row, and a device that changes hands moves to
--   the new session user. ON DELETE CASCADE with the user. A subscription the push service reports
--   gone (404/410) is deleted by the sender. Written ONLY by the session-scoped subscribe rail
--   (§14 — the user is the session, never the body).
--
-- notifications.push_claimed_at — additive NULLABLE, NO DEFAULT, NO BACKFILL. The claim that makes
--   each notification go to a phone AT MOST ONCE, however many writers or sweeps race for it: the
--   sender takes it with an atomic conditional `UPDATE … WHERE push_claimed_at IS NULL` BEFORE it
--   sends (§15 — the claim first, then the external call). NULL = not claimed for push. Existing
--   rows stay NULL and are never pushed: the sweep only looks at recent rows, so a deploy can never
--   send a backlog of old notices (§13).
--
-- NO CHECK anywhere (the publish-trap posture). The table, both indexes, the column and its partial
-- index are DECLARED in `shared/schema.ts` in this same commit (deploy-push durability rule).
-- `preflight-prod-constraints.cjs`: no CHECK is added, so no manifest entry is needed.
--
-- Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(300),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMP,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uniq
  ON push_subscriptions(endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS push_claimed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notifications_push_unclaimed
  ON notifications(created_at)
  WHERE push_claimed_at IS NULL;
