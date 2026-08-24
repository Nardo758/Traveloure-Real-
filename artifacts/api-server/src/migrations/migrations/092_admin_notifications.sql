-- Migration 092: admin_notifications table + expert_requests.fallback_message column
-- Creates the admin_notifications table for dead-end lead alerts and adds
-- fallback_message to expert_requests so travelers see a holding message
-- instead of a blank state when no expert can be auto-assigned.

CREATE TABLE IF NOT EXISTS admin_notifications (
  id serial PRIMARY KEY,
  type text NOT NULL,
  message text NOT NULL,
  trip_id text,
  destination text,
  reason text,
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

ALTER TABLE expert_requests
  ADD COLUMN IF NOT EXISTS fallback_message text;
