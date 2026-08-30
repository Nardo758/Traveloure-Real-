-- Trip Collaborators Migration
-- Created: 2026-06-06
-- Description: Adds trip_collaborators table for three-tier permission model (owner/expert/friend)

CREATE TABLE IF NOT EXISTS trip_collaborators (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trip_id VARCHAR NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'expert', 'friend')),
  invited_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_collaborators_trip_id ON trip_collaborators(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user_id ON trip_collaborators(user_id);
