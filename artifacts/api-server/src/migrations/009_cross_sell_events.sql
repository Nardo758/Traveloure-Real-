-- Migration 009: Cross-sell conversion tracking
-- Adds cross_sell_events table and booking attribution columns

-- New table: cross_sell_events
CREATE TABLE IF NOT EXISTS cross_sell_events (
  id          varchar PRIMARY KEY,
  event_type  varchar(20)  NOT NULL, -- impression | click | conversion
  source_content_type  varchar(50)  NOT NULL,
  source_content_id    varchar(255) NOT NULL,
  source_content_name  varchar(255),
  target_service_id    varchar(255) NOT NULL,
  city         varchar(100),
  neighborhood varchar(100),
  user_id      varchar(255),
  session_id   varchar(255),
  created_at   timestamp DEFAULT now()
);

-- Indexes for efficient provider/admin queries
CREATE INDEX IF NOT EXISTS idx_cse_target_service ON cross_sell_events (target_service_id);
CREATE INDEX IF NOT EXISTS idx_cse_event_type     ON cross_sell_events (event_type);
CREATE INDEX IF NOT EXISTS idx_cse_city           ON cross_sell_events (city);
CREATE INDEX IF NOT EXISTS idx_cse_created_at     ON cross_sell_events (created_at);

-- Add booking attribution columns to service_bookings
ALTER TABLE service_bookings
  ADD COLUMN IF NOT EXISTS source varchar(30) DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS cross_sell_source_content_id varchar(255);
