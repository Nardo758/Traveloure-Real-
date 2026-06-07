-- FEE-2 Phase 2: Add insurance tier columns to booking_fee_configs
ALTER TABLE booking_fee_configs
  ADD COLUMN IF NOT EXISTS insurance_enabled       BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_rate_percent  NUMERIC(5,2)  NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS insurance_applies_to    JSONB         NOT NULL DEFAULT '[]';
