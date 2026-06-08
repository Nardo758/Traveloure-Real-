-- Master Integration Brief — Phase 2: offering types (catalog tables).
--
-- Two new tables, both READ-ONLY vocabulary catalogs (not booking sources):
--
-- service_offering_types — provider-side menu (SEED_DATA §4)
--   Per CLAUDE.md, this is reference data feeding /earn and the provider
--   onboarding flow. It DOES NOT write bookings (canonical = provider_services).
--   It DOES NOT touch the legacy expert_service_offerings template catalog.
--
-- expert_offering_types — expert-side menu (SEED_DATA §5)
--   Per CLAUDE.md, this is reference data feeding /earn and the
--   ask-an-expert picker. Sibling to expert_service_offerings (legacy
--   template catalog kept around for back-compat). Forward direction (not
--   Phase 2 scope): eventually expertSelectedServices should reference
--   expertOfferingTypes so the catalog becomes the selection vocabulary.

CREATE TABLE IF NOT EXISTS service_offering_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_type_key VARCHAR(100) NOT NULL UNIQUE,
  -- Soft reference into service_categories.category_key (the brief's join key).
  -- Not a hard FK: service_categories.category_key has a partial unique index
  -- (NULL allowed), and Postgres FKs need an unconditional unique constraint.
  -- The completeness gate in migration 040 enforces referential integrity.
  category_key VARCHAR(100) NOT NULL,
  display_name TEXT NOT NULL,
  tagline TEXT,
  is_surprising BOOLEAN NOT NULL DEFAULT false,
  -- Array of market slugs ('kyoto', 'edinburgh', …). NULL = universal.
  market_scoped TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_offering_types_category_key
  ON service_offering_types(category_key);
CREATE INDEX IF NOT EXISTS idx_service_offering_types_active
  ON service_offering_types(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS expert_offering_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_type_key VARCHAR(100) NOT NULL UNIQUE,
  -- Enum: advisory | planning | coordination | live_support | specialized.
  service_tier VARCHAR(20) NOT NULL CHECK (
    service_tier IN ('advisory', 'planning', 'coordination', 'live_support', 'specialized')
  ),
  display_name TEXT NOT NULL,
  tagline TEXT,
  -- Array of delivery formats: chat | written | video | live_text | done_for_you.
  delivery_formats TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_surprising BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expert_offering_types_tier
  ON expert_offering_types(service_tier);
CREATE INDEX IF NOT EXISTS idx_expert_offering_types_active
  ON expert_offering_types(is_active) WHERE is_active = true;
