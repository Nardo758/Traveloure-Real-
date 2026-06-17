-- Migration 089: funnel_events table
-- Append-only audit log spanning the full traveler funnel T0→T7.
-- Replaces the need to join users + trips + expert_requests + bookings + lead_routing_logs
-- to answer "how many users reached stage X this week?".
--
-- Design principles:
--   - Append-only: never UPDATE or DELETE rows (analytics depend on immutability)
--   - Fire-and-forget: application never awaits these writes on the critical path
--   - userId is nullable: T0 events fire before the user has an account
--   - properties JSONB: flexible per-event payload; avoid schema churn

CREATE TABLE IF NOT EXISTS funnel_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   VARCHAR(128),                        -- anonymous session or userId before T1
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  trip_id      UUID        REFERENCES trips(id) ON DELETE SET NULL,
  event_type   VARCHAR(64) NOT NULL,
  stage        VARCHAR(4)  NOT NULL,                -- T0, T1, T2, ... T7
  properties   JSONB,                               -- event-specific payload
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes optimized for the most common query patterns
CREATE INDEX IF NOT EXISTS funnel_events_user_idx    ON funnel_events(user_id);
CREATE INDEX IF NOT EXISTS funnel_events_type_idx    ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS funnel_events_stage_idx   ON funnel_events(stage);
CREATE INDEX IF NOT EXISTS funnel_events_created_idx ON funnel_events(created_at DESC);

-- Composite index for funnel conversion queries (stage + created_at)
CREATE INDEX IF NOT EXISTS funnel_events_stage_time_idx ON funnel_events(stage, created_at DESC);

COMMENT ON TABLE funnel_events IS
  'Append-only funnel audit log. Covers T0 (anonymous) → T7 (viral). '
  'Never update or delete rows. Fire-and-forget — never block request path on this write.';
