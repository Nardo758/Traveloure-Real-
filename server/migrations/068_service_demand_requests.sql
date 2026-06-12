-- Migration 068: service_demand_requests table
-- Records traveler demand for services not yet covered by a provider in a city.
-- Unique partial index prevents duplicate signals from the same logged-in user.

CREATE TABLE IF NOT EXISTS service_demand_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_type_key TEXT NOT NULL,
  neighborhood_id TEXT,
  city TEXT NOT NULL,
  country TEXT,
  user_id TEXT,
  guest_session_id TEXT,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate requests from the same logged-in user for the same offering + city
CREATE UNIQUE INDEX IF NOT EXISTS service_demand_requests_user_uniq
  ON service_demand_requests (offering_type_key, city, user_id)
  WHERE user_id IS NOT NULL;

-- Fast demand-count lookups by city + offering type
CREATE INDEX IF NOT EXISTS service_demand_requests_city_offering_idx
  ON service_demand_requests (city, offering_type_key);
