-- 278 — Taxonomy reconcile: the Kyoto seed's two ORPHAN-category pointers, repaired on disk.
-- Ledger 2026-09-04-taxonomy-reconcile.
--
-- WHAT WAS WRONG
-- ──────────────
-- server/seed-categories.ts seeded ten "experience bundle" service_categories rows at BOOT —
-- services-travel / -wedding / -proposal / -birthday / -trip / -romance / -corporate / -retreat /
-- -event / -party — with NO `category_key`. Every offering-driven reader joins on that key
-- (service_offering_types.category_key → the provider offering picker's groups in ServiceForm.tsx,
-- /api/service-categories/provider-counts, and the /earn role partition in earn-roles.ts), so a
-- key-less row can never be the target of an offering and can never appear in any of them.
-- Worse, those slugs already belong to a DIFFERENT namespace: `servicesCategoryMapping` in
-- shared/constants/providerCategories.ts uses them as BUNDLE keys that fan out to real discipline
-- slugs. The rows were a namespace collision that made a dead taxonomy look live.
--
-- server/seeds/phase-d-kyoto-vendors.seed.ts filed four real, bookable Kyoto vendor services under
-- two of them, so seeded launch-market supply sat in a category no picker could reach.
--
-- The DURABLE fix is in the seeders (the ten rows are retired from seed-categories.ts; the Kyoto
-- map now points at migration-034 categories that carry a key). This migration repairs the rows
-- ALREADY on disk — the Kyoto seed is idempotent on users.email and SKIPS existing vendors, so a
-- re-run would never repoint them.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ────────────────────────────────────────────
--   • It does NOT delete or deactivate the ten bundle rows. provider_services.category_id is
--     ON DELETE SET NULL, so deleting would strand any listing filed under one; and
--     storage.getServiceCategories() does not filter is_active, so deactivating would hide nothing
--     while still changing a row an admin may be using. Rows on disk stay intact and keep
--     resolving. Whether a real (non-seed) provider who chose "Wedding Services" from the raw
--     category <Select> should be repointed is a decision-maker call that needs a PROD count first
--     — it is NOT made here. Only rows this repo's own seed created are touched.
--   • No schema change, no new column, no CHECK, no index — nothing for the Replit deploy-push to
--     enforce or drop (CLAUDE.md "publish-time CHECK failure" trap).
--
-- Every statement is predicate-guarded and idempotent: re-running is a no-op.

-- ── 1. Kyoto bridal-attire service: "services-wedding" → "rental-services" ───────────────────────
-- category_key `rentals` (migration 034), an EVENT_CATEGORY_KEYS category. The single service under
-- this pointer is "Bridal Kimono Rental & Dressing"; 034's own description for rental-services names
-- "costume … rentals". Scoped to the seed's own vendor account so no real provider is re-filed.
UPDATE provider_services ps
   SET category_id = (SELECT id FROM service_categories WHERE slug = 'rental-services'),
       updated_at  = now()
  FROM users u
 WHERE ps.user_id = u.id
   AND u.email = 'kyoto-bridal@traveloure.test'
   AND ps.category_id = (SELECT id FROM service_categories WHERE slug = 'services-wedding')
   AND EXISTS (SELECT 1 FROM service_categories WHERE slug = 'rental-services');

-- ── 2. Kyoto corporate services: "services-corporate" → "events-celebrations" ────────────────────
-- category_key `event_coordinator` (migration 034), also an EVENT_CATEGORY_KEYS category. The three
-- services under this pointer are corporate retreat planning, an executive offsite day and event
-- logistics consultation — event coordination, all three.
UPDATE provider_services ps
   SET category_id = (SELECT id FROM service_categories WHERE slug = 'events-celebrations'),
       updated_at  = now()
  FROM users u
 WHERE ps.user_id = u.id
   AND u.email IN ('kyoto-corporate-retreats@traveloure.test', 'kyoto-teambuilding@traveloure.test')
   AND ps.category_id = (SELECT id FROM service_categories WHERE slug = 'services-corporate')
   AND EXISTS (SELECT 1 FROM service_categories WHERE slug = 'events-celebrations');

-- ── 3. Entertainment's description names the musicians its own catalog already sells ─────────────
-- §13 honesty, and a correction to the wedding audit: the "no DJ / band category" finding is STALE.
-- service_offering_types has carried ('entertainer', 'entertainment', 'DJ / Band / Live Musician /
-- Performer') since migration 038 (restored by 098), so a provider searching the picker for "DJ"
-- has always found it. What was wrong is only this row's DESCRIPTION, which was written before that
-- offering existed and still reads as if musicians belong somewhere else. No category and no
-- offering is added — a category with no offering and no provider is noise.
-- Guarded on the exact 034 text, so an admin-edited description is never overwritten.
UPDATE service_categories
   SET description = 'Comedians, magicians, acrobats, fire performers, caricature artists, game coordinators, kids entertainers, DJs, bands and live ceremony musicians',
       updated_at  = now()
 WHERE slug = 'entertainment'
   AND description = 'Comedians, magicians, acrobats, fire performers, caricature artists, game coordinators, kids entertainers';
