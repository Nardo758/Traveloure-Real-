-- Traveler-submitted service requests (the "request a service that doesn't exist
-- yet" capture). Distinct from the machine-generated service_demand_signals and
-- the aggregate demand_signals — this stores an explicit, per-traveler request
-- with a status so admins can triage and mark it fulfilled.
--
-- New table → the status CHECK is created together with the table (no existing
-- rows can violate it), so there is NO publish-time drizzle-push remap trap.
CREATE TABLE IF NOT EXISTS service_requests (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  traveler_id  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  city         VARCHAR(100) NOT NULL,
  country      VARCHAR(100),
  service_type VARCHAR(100),
  description  TEXT NOT NULL,
  budget       NUMERIC(10,2),
  status       VARCHAR(20) NOT NULL DEFAULT 'open',
  admin_notes  TEXT,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT service_requests_status_check CHECK (status IN ('open', 'fulfilled', 'closed'))
);

-- Admin queue reads open requests newest-first; index the common filter.
CREATE INDEX IF NOT EXISTS idx_service_requests_status_created
  ON service_requests (status, created_at DESC);

-- Traveler "my requests" reads by owner.
CREATE INDEX IF NOT EXISTS idx_service_requests_traveler
  ON service_requests (traveler_id);
