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
--
-- Note: user_id and trip_id use VARCHAR to match the varchar PKs on users/trips.
-- FK constraints are omitted intentionally — rows must survive user/trip deletion.

CREATE TABLE IF NOT EXISTS funnel_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   VARCHAR(128),
  user_id      VARCHAR,
  trip_id      VARCHAR,
  event_type   VARCHAR(64) NOT NULL,
  stage        VARCHAR(4)  NOT NULL,
  properties   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS funnel_events_user_idx    ON funnel_events(user_id);
CREATE INDEX IF NOT EXISTS funnel_events_type_idx    ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS funnel_events_stage_idx   ON funnel_events(stage);
CREATE INDEX IF NOT EXISTS funnel_events_created_idx ON funnel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_stage_time_idx ON funnel_events(stage, created_at DESC);

COMMENT ON TABLE funnel_events IS
  'Append-only funnel audit log. Covers T0 (anonymous) to T7 (viral). '
  'Never update or delete rows. Fire-and-forget writes only.';
