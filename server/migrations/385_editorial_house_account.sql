-- Migration 385: THE TRAVELOURE EDITORIAL HOUSE ACCOUNT (ED-1b).
--
-- Ledger `2026-10-16-ed1b-editorial-house-account` (ED-1 rulings, decision-maker, Oct 16, 2026).
-- DATA ONLY: no table, column, index, CHECK, DEFAULT or FK is created or changed, so the deploy
-- push has nothing to add and `preflight-prod-constraints.cjs` needs no manifest entry.
--
-- ONE `users` row for the "Traveloure Editorial" house account, kept SEPARATE from the platform
-- concierge account (migration 313):
--   - never a login: `password` NULL (the password-auth path needs a hash to pass);
--   - `email` on a domain this platform controls and never delivers to;
--   - `role = 'user'`: not an expert or provider role, and NO `local_expert_forms` row, so it
--     clears no expert gate;
--   - no `handle`: the editorial byline is plain text with no storefront link.
-- The code excludes it by id as well (server/services/editorial-account.service.ts): the
-- earnings mint and the advisor-row author refuse it, and the routable-expert filter (the
-- expert directory and lead scoring) leaves it out.
--
-- Idempotent: both inserts are ON CONFLICT DO NOTHING; a re-run inserts nothing.
INSERT INTO users (id, email, password, first_name, last_name, role, created_at, updated_at)
VALUES ('00000000-0000-4000-a000-000065646974', 'editorial@traveloure.internal', NULL,
        'Traveloure Editorial', NULL, 'user', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- The account id lives in ONE place, read by ONE helper (getEditorialUserId), never hardcoded.
INSERT INTO platform_settings (setting_key, setting_value, description, updated_by)
VALUES (
  'editorial_user_id',
  '00000000-0000-4000-a000-000065646974',
  'ED-1b / migration 385: the Traveloure Editorial house account. Read via server/services/editorial-account.service.ts:getEditorialUserId(), never hardcoded a second place.',
  'migration-385'
)
ON CONFLICT (setting_key) DO NOTHING;
