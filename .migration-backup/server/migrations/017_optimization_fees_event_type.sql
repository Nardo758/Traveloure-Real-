-- CON-A.P2 (FEE-A): per-event-type AI Concierge fee config + $0=off semantic.
-- Replaces the tier-only optimization_fees keying with (complexity_tier, event_type),
-- where event_type IS NULL is the tier-level default and a non-null row is an admin override.
-- Seeds §4.8 defaults: $9.99 across tiers; $49.99 overrides for wedding/proposal/corporate.

-- Drop the old single-column unique constraint on complexity_tier (auto-named by PG).
-- Both forms covered to handle either Drizzle's _unique or PG's _key suffix.
ALTER TABLE optimization_fees DROP CONSTRAINT IF EXISTS optimization_fees_complexity_tier_key;
ALTER TABLE optimization_fees DROP CONSTRAINT IF EXISTS optimization_fees_complexity_tier_unique;

-- Add per-event-type dimension + $0=off semantic.
ALTER TABLE optimization_fees ADD COLUMN IF NOT EXISTS event_type VARCHAR(50);
ALTER TABLE optimization_fees ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT false;

-- §4.8 tier-level defaults: $9.99 standard across all tiers.
-- Update any existing rows to align with §4.8 (was 499/999/1999 — off-spec).
UPDATE optimization_fees SET price_cents = 999
  WHERE event_type IS NULL AND complexity_tier IN ('simple', 'standard', 'complex');

-- Insert tier-level rows where missing.
INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'simple', NULL, 999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type IS NULL AND complexity_tier = 'simple');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'standard', NULL, 999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type IS NULL AND complexity_tier = 'standard');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'complex', NULL, 999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type IS NULL AND complexity_tier = 'complex');

-- §4.8 event-type overrides: $49.99 for wedding/proposal/corporate.
-- complexity_tier follows complexityTier() mapping (wedding/corporate → complex, proposal → standard).
INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'complex', 'wedding', 4999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'wedding');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'standard', 'proposal', 4999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'proposal');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'complex', 'corporate', 4999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'corporate');
