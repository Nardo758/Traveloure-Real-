-- Phase 2: Optimizer prices reframe (CON-A.P2 / FEE-A v2).
--
-- Updates the per-event-type AI Concierge fee config to the new three-branch model:
--   Trip / Experience: $5.99 flat (all tiers)
--   Event: $19.99 flat (credited toward coordination fee)
--
-- Replaces the old §4.8 defaults ($9.99 tier-level, $49.99 event overrides) with
-- the corrected model from BUSINESS_MODEL_REFRAME_CORRECTION_BRIEF.md.

-- 1. Update tier-level defaults: $9.99 → $5.99
UPDATE optimization_fees SET price_cents = 599, updated_at = NOW()
  WHERE event_type IS NULL AND complexity_tier IN ('simple', 'standard', 'complex');

-- 2. Update existing event-type overrides: $49.99 → new model
--    Trip branch ($5.99): vacation, adventure, honeymoon, anniversary
--    Experience branch ($5.99): proposal, birthday
--    Event branch ($19.99): wedding, corporate
UPDATE optimization_fees SET price_cents = 599, updated_at = NOW()
  WHERE event_type IN ('vacation', 'adventure', 'honeymoon', 'anniversary', 'proposal', 'birthday');

UPDATE optimization_fees SET price_cents = 1999, updated_at = NOW()
  WHERE event_type IN ('wedding', 'corporate');

-- 3. Insert event-type rows for types that don't exist yet (idempotent)
-- Trip branch @ $5.99
INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'simple', 'vacation', 599, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'vacation');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'simple', 'adventure', 599, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'adventure');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'simple', 'honeymoon', 599, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'honeymoon');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'simple', 'anniversary', 599, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'anniversary');

-- Experience branch @ $5.99
INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'simple', 'proposal', 599, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'proposal');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'simple', 'birthday', 599, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'birthday');

-- Event branch @ $19.99
INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'complex', 'wedding', 1999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'wedding');

INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, created_at, updated_at)
SELECT gen_random_uuid(), 'complex', 'corporate', 1999, 'USD', true, false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM optimization_fees WHERE event_type = 'corporate');

-- 4. Deactivate any stale event-type rows we don't recognize (safety)
-- This prevents old pre-reframe rows from leaking incorrect prices.
UPDATE optimization_fees SET is_active = false, updated_at = NOW()
  WHERE event_type IS NOT NULL
    AND event_type NOT IN ('vacation', 'adventure', 'honeymoon', 'anniversary', 'proposal', 'birthday', 'wedding', 'corporate');
