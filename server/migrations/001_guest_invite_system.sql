-- Guest Invite System Migration
-- Created: 2025-02-01
-- Description: Adds guest invite system for personalized travel logistics

-- ===================================================================
-- TABLE: event_invites
-- Purpose: Store unique invite links for each guest
-- ===================================================================
CREATE TABLE IF NOT EXISTS event_invites (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Links to user_experiences table (the event)
  experience_id VARCHAR NOT NULL REFERENCES user_experiences(id) ON DELETE CASCADE,
  
  -- Event organizer
  organizer_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Guest information
  guest_email VARCHAR(255) NOT NULL,
  guest_name VARCHAR(255),
  guest_phone VARCHAR(50),
  
  -- Unique token for invite link
  unique_token VARCHAR(100) NOT NULL UNIQUE,
  
  -- Guest's origin city (for personalized recommendations)
  origin_city VARCHAR(255),
  origin_state VARCHAR(100),
  origin_country VARCHAR(100),
  origin_latitude DECIMAL(10, 7),
  origin_longitude DECIMAL(10, 7),
  
  -- RSVP details
  rsvp_status VARCHAR(20) DEFAULT 'pending',
  rsvp_date TIMESTAMP,
  number_of_guests INTEGER DEFAULT 1,
  
  -- Guest preferences
  dietary_restrictions JSONB DEFAULT '[]'::jsonb,
  accommodation_preference VARCHAR(50) DEFAULT 'undecided',
  transportation_needed BOOLEAN DEFAULT false,
  
  -- Special notes
  special_requests TEXT,
  message TEXT,
  
  -- Tracking metadata
  invite_sent_at TIMESTAMP,
  invite_viewed_at TIMESTAMP,
  last_viewed_at TIMESTAMP,
  view_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_event_invites_experience ON event_invites(experience_id);
CREATE INDEX idx_event_invites_organizer ON event_invites(organizer_id);
CREATE INDEX idx_event_invites_token ON event_invites(unique_token);
CREATE INDEX idx_event_invites_email ON event_invites(guest_email);
CREATE INDEX idx_event_invites_rsvp_status ON event_invites(rsvp_status);

-- ===================================================================
-- TABLE: guest_travel_plans
-- Purpose: Store personalized travel arrangements for each guest
-- ===================================================================
CREATE TABLE IF NOT EXISTS guest_travel_plans (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Link to invite
  invite_id VARCHAR NOT NULL REFERENCES event_invites(id) ON DELETE CASCADE,
  
  -- Flight details (SERP API results)
  selected_flight JSONB,
  flight_options JSONB DEFAULT '[]'::jsonb,
  flight_search_date TIMESTAMP,
  
  -- Ground transportation
  selected_transport JSONB,
  transport_options JSONB DEFAULT '[]'::jsonb,
  transport_search_date TIMESTAMP,
  
  -- Accommodation
  selected_accommodation JSONB,
  accommodation_options JSONB DEFAULT '[]'::jsonb,
  accommodation_search_date TIMESTAMP,
  
  -- Local activities
  selected_activities JSONB DEFAULT '[]'::jsonb,
  activity_recommendations JSONB DEFAULT '[]'::jsonb,
  activities_search_date TIMESTAMP,
  
  -- Budget
  estimated_total_cost DECIMAL(10, 2),
  budget_breakdown JSONB DEFAULT '{}'::jsonb,
  
  -- Travel dates
  arrival_date TIMESTAMP,
  departure_date TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_guest_travel_plans_invite ON guest_travel_plans(invite_id);
CREATE UNIQUE INDEX idx_guest_travel_plans_invite_unique ON guest_travel_plans(invite_id);

-- ===================================================================
-- TABLE: invite_templates
-- Purpose: Allow organizers to customize invite messages
-- ===================================================================
CREATE TABLE IF NOT EXISTS invite_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Template owner
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Template content
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  message_body TEXT NOT NULL,
  
  -- Template variables
  variables JSONB DEFAULT '[]'::jsonb,
  
  -- Template type
  event_type VARCHAR(50),
  is_default BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_invite_templates_user ON invite_templates(user_id);
CREATE INDEX idx_invite_templates_event_type ON invite_templates(event_type);

-- ===================================================================
-- TABLE: invite_send_log
-- Purpose: Track when invites are sent
-- ===================================================================
CREATE TABLE IF NOT EXISTS invite_send_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  invite_id VARCHAR NOT NULL REFERENCES event_invites(id) ON DELETE CASCADE,
  
  -- Send details
  method VARCHAR(20) NOT NULL, -- email, sms, whatsapp
  recipient_address VARCHAR(255) NOT NULL,
  
  -- Status tracking
  status VARCHAR(20) NOT NULL, -- sent, failed, bounced, opened, clicked
  error_message TEXT,
  
  sent_at TIMESTAMP DEFAULT NOW(),
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_invite_send_log_invite ON invite_send_log(invite_id);
CREATE INDEX idx_invite_send_log_status ON invite_send_log(status);

-- ===================================================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ===================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_event_invites_updated_at
  BEFORE UPDATE ON event_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guest_travel_plans_updated_at
  BEFORE UPDATE ON guest_travel_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invite_templates_updated_at
  BEFORE UPDATE ON invite_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===================================================================
-- COMMENTS
-- ===================================================================
COMMENT ON TABLE event_invites IS 'Stores unique invite links for event guests with personalized travel logistics';
COMMENT ON TABLE guest_travel_plans IS 'Personalized travel recommendations based on guest origin city';
COMMENT ON TABLE invite_templates IS 'Customizable invite message templates for event organizers';
COMMENT ON TABLE invite_send_log IS 'Tracks invite delivery and engagement metrics';

COMMENT ON COLUMN event_invites.unique_token IS 'Unique URL-safe token for invite link (e.g., /invite/abc123xyz)';
COMMENT ON COLUMN event_invites.origin_city IS 'Guest city of origin for personalized flight/transport recommendations';
COMMENT ON COLUMN guest_travel_plans.flight_options IS 'Cached SERP API results for flights from origin → destination';
COMMENT ON COLUMN guest_travel_plans.transport_options IS 'Ground transport options from airport → venue';
COMMENT ON COLUMN guest_travel_plans.accommodation_options IS 'Hotels near event venue';
