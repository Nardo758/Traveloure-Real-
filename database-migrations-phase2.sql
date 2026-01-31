-- Phase 2: Expert Review, Save for Later, Share Features
-- Migration for additional booking system tables

-- Expert Requests Table
CREATE TABLE IF NOT EXISTS expert_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  variant_id UUID NOT NULL,
  comparison_id UUID NOT NULL,
  destination_city TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('review', 'review_and_book', 'full_concierge')),
  expert_fee DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'assigned', 'in_progress', 'completed', 'canceled')),
  assigned_expert_id TEXT,
  queue_position INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,
  FOREIGN KEY (variant_id) REFERENCES itinerary_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (comparison_id) REFERENCES itinerary_comparisons(id) ON DELETE CASCADE
);

-- Index for queue queries
CREATE INDEX IF NOT EXISTS idx_expert_requests_queue ON expert_requests(destination_city, status, queue_position);
CREATE INDEX IF NOT EXISTS idx_expert_requests_user ON expert_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_requests_expert ON expert_requests(assigned_expert_id, status);

-- Expert City Queues Table
CREATE TABLE IF NOT EXISTS expert_city_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT UNIQUE NOT NULL,
  expert_ids JSONB NOT NULL DEFAULT '[]', -- Array of expert user IDs
  active_requests INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for city lookup
CREATE INDEX IF NOT EXISTS idx_expert_city_queues_city ON expert_city_queues(city);

-- Saved Trips Table
CREATE TABLE IF NOT EXISTS saved_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  variant_id UUID NOT NULL,
  comparison_id UUID NOT NULL,
  notes TEXT,
  saved_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  price_snapshot DECIMAL(10, 2),
  reminders_sent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'booked', 'deleted')),
  FOREIGN KEY (variant_id) REFERENCES itinerary_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (comparison_id) REFERENCES itinerary_comparisons(id) ON DELETE CASCADE
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_saved_trips_user ON saved_trips(user_id, status, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_trips_expiry ON saved_trips(expires_at, status);

-- Shared Trips Table
CREATE TABLE IF NOT EXISTS shared_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL,
  comparison_id UUID NOT NULL,
  shared_by TEXT NOT NULL,
  share_token TEXT UNIQUE NOT NULL,
  views INTEGER DEFAULT 0,
  bookings INTEGER DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (variant_id) REFERENCES itinerary_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (comparison_id) REFERENCES itinerary_comparisons(id) ON DELETE CASCADE
);

-- Index for share token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_trips_token ON shared_trips(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_trips_user ON shared_trips(shared_by, created_at DESC);

-- Shared Trip Views (for analytics)
CREATE TABLE IF NOT EXISTS shared_trip_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_trip_id UUID NOT NULL,
  viewer_ip TEXT,
  viewer_country TEXT,
  viewed_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (shared_trip_id) REFERENCES shared_trips(id) ON DELETE CASCADE
);

-- Index for analytics
CREATE INDEX IF NOT EXISTS idx_shared_trip_views_trip ON shared_trip_views(shared_trip_id, viewed_at DESC);

-- Reminder Emails Log
CREATE TABLE IF NOT EXISTS reminder_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_trip_id UUID NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  reminder_type TEXT NOT NULL, -- 'day_7', 'day_14', 'day_28', 'expiring_soon'
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  FOREIGN KEY (saved_trip_id) REFERENCES saved_trips(id) ON DELETE CASCADE
);

-- Index for tracking sent reminders
CREATE INDEX IF NOT EXISTS idx_reminder_emails_trip ON reminder_emails(saved_trip_id, sent_at DESC);

-- Seed sample expert queues for popular cities
INSERT INTO expert_city_queues (city, expert_ids, active_requests) VALUES
  ('paris', '[]', 0),
  ('rome', '[]', 0),
  ('tokyo', '[]', 0),
  ('new york', '[]', 0),
  ('london', '[]', 0),
  ('barcelona', '[]', 0),
  ('dubai', '[]', 0),
  ('singapore', '[]', 0),
  ('sydney', '[]', 0),
  ('istanbul', '[]', 0)
ON CONFLICT (city) DO NOTHING;

-- Comments
COMMENT ON TABLE expert_requests IS 'Expert review requests with city-based queue routing';
COMMENT ON TABLE expert_city_queues IS 'Expert availability by city with queue management';
COMMENT ON TABLE saved_trips IS 'Saved itineraries with 30-day expiration and reminders';
COMMENT ON TABLE shared_trips IS 'Shareable trip links with view tracking';
COMMENT ON TABLE reminder_emails IS 'Log of all reminder emails sent for saved trips';

COMMENT ON COLUMN expert_requests.request_type IS 'review=feedback only, review_and_book=expert books, full_concierge=white-glove service';
COMMENT ON COLUMN expert_requests.queue_position IS 'Position in city queue, updates when others complete';
COMMENT ON COLUMN saved_trips.reminders_sent IS 'Count of reminder emails sent (max 3)';
COMMENT ON COLUMN shared_trips.share_token IS 'Secure random token for public access';
