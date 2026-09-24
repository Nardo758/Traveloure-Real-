-- 319 — REPAIR of the `requires_background_check` flags migration 289 could not set.
-- Ledger `2026-09-24-background-check-flags-repair`; board task #550; CLAUDE.md Locked Decision 31
-- (the "A REGISTRY MIGRATION MAY ALSO REPAIR AN EARLIER ONE" amendment, as extended by this ledger row).
--
-- WHY THIS FILE EXISTS
-- ────────────────────
-- Migrations 034 and 289 intend `requires_background_check = true` for exactly five category keys:
-- private_transportation, tour_guide, private_chef, childcare_family, accessibility_specialist.
-- 289 wrote the flag as `COALESCE(existing, intended)`. The column DEFAULTS TO false, so a legacy
-- row already held `false` — never NULL — and COALESCE kept it. A read-only production check on
-- 2026-09-24 found four of the five still `false` (only accessibility_specialist, a row 289
-- INSERTED, is `true`).
--
-- WHAT THAT BREAKS. `provider-publish.service.ts` lets a provider publish in a category flagged
-- `requires_background_check` only after confirming a background check; the upsell ranking reads
-- the same flag. With it `false`, a childcare, private-chef, tour-guide or driver listing could go
-- live with no background-check confirmation. The same production check found NO approved listing
-- in those categories whose owner lacks confirmation, so this repair blocks nothing that is live.
--
-- WHAT THIS FILE IS NOT
-- ─────────────────────
--  • NOT DDL. No ALTER, no CHECK, no index, no DEFAULT change. `preflight-prod-constraints.cjs` is
--    unaffected and the deploy push has nothing to offer or fail on.
--  • NOT a taxonomy migration. It assigns no `category_key`, so the taxonomy registry is untouched.
--  • NOT a general reset. It touches the flag on exactly four keys, and only where it is not
--    already `true`. Every other column, and every other row, is left as it is.
--
-- STATED LIMIT (§13): a `false` an admin set deliberately on one of these four keys is
-- indistinguishable from the default this repairs, and is overwritten. That is intended: 034/289 are
-- the ratified values, and switching off the background check for childcare or drivers is a policy
-- change that belongs in a ruling, not in an admin toggle.
--
-- Idempotent: a second run matches no row.

UPDATE service_categories
   SET requires_background_check = true,
       updated_at = NOW()
 WHERE category_key IN ('private_transportation', 'tour_guide', 'private_chef', 'childcare_family')
   AND requires_background_check IS DISTINCT FROM true;
