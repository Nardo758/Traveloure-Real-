-- Migration 080: Service demand requests table.
--
-- Source-branch file: 068_service_demand_requests.sql
--
-- Creates the service_demand_requests table — user/guest requests for a
-- specific offering type in a specific city/neighborhood. Experts and providers
-- can query open demand requests to identify booking opportunities.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run.

CREATE TABLE IF NOT EXISTS service_demand_requests (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_type_key  VARCHAR(100) NOT NULL,
  neighborhood_id    VARCHAR REFERENCES city_neighborhoods(id) ON DELETE SET NULL,
  city               VARCHAR(100) NOT NULL,
  country            VARCHAR(100),
  user_id            VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  guest_session_id   VARCHAR(255),
  date_range_start   DATE,
  date_range_end     DATE,
  notified_at        TIMESTAMP,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdr_city_offering
  ON service_demand_requests(city, offering_type_key);
CREATE INDEX IF NOT EXISTS idx_sdr_user_id
  ON service_demand_requests(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sdr_created_at
  ON service_demand_requests(created_at DESC);
