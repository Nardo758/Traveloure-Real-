-- Per-consumer claims for platform webhook work. This intentionally does not
-- reuse webhook_events: Connect and platform endpoints can own the same event ID.
CREATE TABLE IF NOT EXISTS platform_webhook_consumers (
  stripe_event_id TEXT NOT NULL,
  consumer TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  completed_at TIMESTAMP NULL,
  error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stripe_event_id, consumer)
);

CREATE TABLE IF NOT EXISTS stripe_dispute_lifecycle (
  dispute_id TEXT PRIMARY KEY,
  terminal_outcome TEXT NULL,
  booking_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);