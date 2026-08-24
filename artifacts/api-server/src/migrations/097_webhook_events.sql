-- 097: webhook_events — durable log of every Stripe webhook received.
-- Enables deduplication (stripe_event_id UNIQUE), manual reconciliation,
-- and admin gap reports comparing local log vs Stripe API event list.
-- All DDL is idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT      NOT NULL UNIQUE,
  event_type      TEXT      NOT NULL,
  processed       BOOLEAN   NOT NULL DEFAULT FALSE,
  processed_at    TIMESTAMP,
  raw_payload     JSONB     NOT NULL,
  error           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Partial index: fast lookup of events still needing processing / admin review
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
  ON webhook_events (created_at DESC)
  WHERE processed = FALSE;

-- General time-range index for the daily gap-check query
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
  ON webhook_events (created_at DESC);
