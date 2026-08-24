-- Master Integration Brief — Phase 1.1: SCAFFOLD (additive, no behavior change)
-- Creates fee_bands, platform_settings, template_category_matrix.
-- Adds (nullable) columns to service_categories so existing rows stay valid.
-- No data seeded here; no resolver change yet. Data + flip land in 1.2 / 1.3.
--
-- Decisions honored:
--   - fee_bands replaces booking_fee_configs as the single source of truth for rates.
--   - rateType ENUM via CHECK (percent | flat).
--   - service_categories gets the brief's billing-aware fields, all nullable
--     so the existing 28 seeded rows keep working until the taxonomy
--     reconciliation pass (asks pending).

CREATE TABLE IF NOT EXISTS fee_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_key VARCHAR(100) NOT NULL UNIQUE,
  rate_type VARCHAR(10) NOT NULL CHECK (rate_type IN ('percent', 'flat')),
  default_rate NUMERIC(10, 4) NOT NULL,
  min_rate NUMERIC(10, 4),
  max_rate NUMERIC(10, 4),
  display_name TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_bands_active ON fee_bands(is_active) WHERE is_active = true;

-- Platform-wide single-row settings (key/value).
-- Used for active_provider_commission_policy ('beta_flat' | 'tiered'), among others.
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_by VARCHAR(255),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Template → category matrix per SEED_DATA §3.
-- Strengths: REQ (required), REC (recommended), OPT (optional).
-- Omitted (templateKey, categoryKey) pairs = not surfaced.
CREATE TABLE IF NOT EXISTS template_category_matrix (
  template_key VARCHAR(50) NOT NULL,
  category_key VARCHAR(100) NOT NULL,
  strength VARCHAR(3) NOT NULL CHECK (strength IN ('REQ', 'REC', 'OPT')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (template_key, category_key)
);

-- ALTER service_categories: add the brief's billing-aware fields.
-- All nullable so existing 28 rows stay valid until the reconciliation pass.
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS source_type VARCHAR(30);
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS launch_tier VARCHAR(20);
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS commission_band_key VARCHAR(100);
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS insurance_band INT;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS risk_profile VARCHAR(20);
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS requires_background_check BOOLEAN DEFAULT false;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS affiliate_partner_key VARCHAR(50);
