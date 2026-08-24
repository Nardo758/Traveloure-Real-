-- 096: Add idempotency_key to service_bookings and bookings tables
-- Prevents double-charges when the same checkout request fires twice
-- (double-click, network retry, etc.).
-- Both columns are nullable (legacy rows have no key) and unique (DB-level guard).

ALTER TABLE service_bookings
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS service_bookings_idempotency_key_idx
  ON service_bookings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_idempotency_key_idx
  ON bookings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
