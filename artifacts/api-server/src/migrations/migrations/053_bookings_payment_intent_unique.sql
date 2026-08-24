-- Migration 052: Add unique constraint on stripe_payment_intent_id in bookings
-- Prevents the same PaymentIntent from confirming more than one booking (replay attack prevention).
-- The column already exists; this migration only adds the unique index.
-- NULL values are excluded from uniqueness checks in PostgreSQL, so unconfirmed rows are unaffected.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_id_unique
  ON bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
