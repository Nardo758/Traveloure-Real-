-- Migration 098: Add dispute tracking columns to bookings table
-- Supports chargeback / Stripe dispute workflow.
-- dispute_id: the Stripe dispute object ID (e.g. dp_xxx)
-- dispute_reason: human-readable reason string from Stripe

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS dispute_id     TEXT,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

-- Index for fast admin query of all disputed bookings
CREATE INDEX IF NOT EXISTS bookings_dispute_id_idx
  ON bookings (dispute_id)
  WHERE dispute_id IS NOT NULL;
