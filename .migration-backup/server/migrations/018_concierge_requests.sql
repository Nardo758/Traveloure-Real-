-- CON-A.P3 (N5): Concierge request intent log.
-- Persists every concierge request — guest previews included — for funnel metrics
-- and resume-after-abandonment. user_id nullable so the guest hook (D6) is captured
-- the same way as authed flows. chosen_tier null until the user picks (Phase 5).

CREATE TABLE IF NOT EXISTS concierge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  intent TEXT NOT NULL,
  event_type TEXT,
  trip_id VARCHAR REFERENCES trips(id) ON DELETE SET NULL,
  cart_id TEXT,
  chosen_tier TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concierge_requests_user_id_idx ON concierge_requests(user_id);
CREATE INDEX IF NOT EXISTS concierge_requests_status_idx ON concierge_requests(status);
CREATE INDEX IF NOT EXISTS concierge_requests_trip_id_idx ON concierge_requests(trip_id);
CREATE INDEX IF NOT EXISTS concierge_requests_created_at_idx ON concierge_requests(created_at);
