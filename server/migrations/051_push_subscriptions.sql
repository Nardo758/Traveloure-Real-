-- Migration 051: push_subscriptions — Web Push subscription store
-- (Phase 3, SMS/PWA delivery lane — docs/planning/sms-delivery-phase0-audit.md).
--
-- Stores the browser PushSubscription per user. SUBSCRIPTION ONLY — there is NO
-- send logic here or anywhere yet (that is Phase 4, gated on the /api/notifications
-- dupe + 10DLC for the SMS arm). endpoint is UNIQUE so re-subscribe upserts.
--
-- Idempotent (IF NOT EXISTS) — safe to re-run.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR(255) NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
