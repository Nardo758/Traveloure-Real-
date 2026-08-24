-- Migration 056: Richer pricing model
-- Adds pricing_tiers jsonb to provider_services and default_price_type to category_field_schema

-- 1. Add pricing_tiers column to provider_services (idempotent)
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS pricing_tiers JSONB;

-- 2. Add default_price_type column to category_field_schema (idempotent)
ALTER TABLE category_field_schema
  ADD COLUMN IF NOT EXISTS default_price_type VARCHAR(30);

-- 3. Seed default price type for photography (package_tiers)
UPDATE category_field_schema
SET default_price_type = 'package_tiers'
WHERE category_key = 'photography'
  AND default_price_type IS NULL;

-- 4. Seed default price type for private transportation (hourly)
UPDATE category_field_schema
SET default_price_type = 'hourly'
WHERE category_key = 'private_transportation'
  AND default_price_type IS NULL;

-- 5. Seed default price type for childcare / family (hourly)
UPDATE category_field_schema
SET default_price_type = 'hourly'
WHERE category_key = 'childcare_family'
  AND default_price_type IS NULL;
