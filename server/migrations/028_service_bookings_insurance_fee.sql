-- FEE-2 Phase 2: Store per-booking insurance fee component for accurate reporting
ALTER TABLE service_bookings
  ADD COLUMN IF NOT EXISTS insurance_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;
