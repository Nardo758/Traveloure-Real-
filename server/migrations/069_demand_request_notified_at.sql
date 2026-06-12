-- Migration 069: Add notified_at column to service_demand_requests
-- Tracks when a demand-request traveler was emailed about a matching provider service.
-- NULL means not yet notified; a timestamp means the notification was sent.
ALTER TABLE service_demand_requests
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
