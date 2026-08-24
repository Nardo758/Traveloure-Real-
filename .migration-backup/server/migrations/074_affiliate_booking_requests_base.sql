-- Migration 074: Affiliate clicks (detail) — affiliate_booking_requests base table.
--
-- Creates the affiliate_booking_requests table used for expert-facilitated
-- affiliate bookings where users never leave the platform. Migration 060
-- adds the trip_id FK column to this table via ALTER TABLE IF NOT EXISTS,
-- so that migration is idempotent whether or not this CREATE runs first.
--
-- Flow: user requests a booking → expert confirms + optionally links to a Trip
--   → platform earns affiliate commission via the partner URL.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run on environments
-- where drizzle-kit push already created this table.

CREATE TABLE IF NOT EXISTS affiliate_booking_requests (
  id               VARCHAR PRIMARY KEY,
  user_id          VARCHAR NOT NULL REFERENCES users(id),
  expert_id        VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  trip_id          VARCHAR REFERENCES trips(id) ON DELETE SET NULL,
  item_name        VARCHAR(255) NOT NULL,
  item_description TEXT,
  partner_name     VARCHAR(100) NOT NULL,
  partner_category VARCHAR(50),
  affiliate_url    TEXT NOT NULL,
  travel_date      DATE,
  travelers        INT DEFAULT 1,
  user_notes       TEXT,
  expert_notes     TEXT,
  confirmation_ref VARCHAR(255),
  price            NUMERIC(10, 2),
  status           VARCHAR(30) DEFAULT 'pending',               -- pending | confirmed | completed | cancelled
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abr_user_id
  ON affiliate_booking_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_abr_expert_id
  ON affiliate_booking_requests(expert_id) WHERE expert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abr_status
  ON affiliate_booking_requests(status, created_at DESC);
