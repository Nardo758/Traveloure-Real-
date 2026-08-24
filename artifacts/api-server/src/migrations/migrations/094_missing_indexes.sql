-- Migration 094: Add missing indexes for slow-query prevention
-- Covers the 6 indexes identified as missing before production scale-up.

-- 1. local_expert_forms — expert matching filters by status='approved'
CREATE INDEX IF NOT EXISTS local_expert_forms_status_idx
  ON local_expert_forms (status);

-- 2. bookings — revenue dashboard aggregates/filters by created_at
CREATE INDEX IF NOT EXISTS bookings_created_at_idx
  ON bookings (created_at);

-- 3. lead_routing_logs — lead history filtered by trip_id
CREATE INDEX IF NOT EXISTS lead_routing_logs_trip_id_idx
  ON lead_routing_logs (trip_id);

-- 4. expert_requests — filtered by destination_city
CREATE INDEX IF NOT EXISTS expert_requests_destination_idx
  ON expert_requests (destination_city);

-- 5. expert_requests — filtered by status
CREATE INDEX IF NOT EXISTS expert_requests_status_idx
  ON expert_requests (status);

-- 6. users — admin user list filtered by role
CREATE INDEX IF NOT EXISTS users_role_idx
  ON users (role);
