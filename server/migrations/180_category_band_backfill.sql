-- 180_category_band_backfill.sql — Fee-Ledger lane, rulings R1 + R2 (2026-08-06). Locked.
--
-- R1: assign a commission band to every category that lacks one, so D1's model
-- (provider commission resolves via service_categories.commission_band_key → fee_bands) is total.
-- R2: a category must never exist active without a band — DB layer. BACKFILL FIRST, CONSTRAINT
-- SECOND, SAME MIGRATION, verified. The resolver stays fail-loud (no silent fallback rate, ever);
-- R1+R2 together make the missing-band state UNREACHABLE rather than survivable.
--
-- WHY THIS EXISTS: 20 of 42 dev categories carried a band; the 22 without included live provider
-- categories (Health & Wellness, Language & Translation, Pets & Animals, Technology & Connectivity,
-- Custom/Other, and every event/wedding/party category). Under D1 a booking in one of those would
-- have reached a fail-loud resolver and thrown at checkout.
--
-- MAPPED BY NAME, NOT ID: environments carry different category sets (dev 42, a freshly migrated DB
-- 24), so id-based mapping would silently skip rows. Every statement is a predicate-guarded UPDATE
-- restricted to `commission_band_key IS NULL`, so this migration NEVER re-bands a category an admin
-- has already set, and is safe to re-run.

-- ── R1.1 — event / wedding / party family → `limited` (0.12) ─────────────────────────────────
-- The ruling reads "ALL event / wedding / party categories". Enumerated explicitly rather than by
-- LIKE so the set is reviewable and cannot silently capture a future category.
UPDATE service_categories SET commission_band_key = 'limited', updated_at = now()
 WHERE commission_band_key IS NULL
   AND name IN (
     'Birthday Services',
     'Corporate Services',   -- corporate EVENTS (matches the platform's corporate-events experience type)
     'Event Services',
     'Party Services',
     'Proposal Services',    -- proposal is an event product on this platform (experiences taxonomy)
     'Retreat Services',     -- retreats are a multi-day event product
     'Romance Services',
     'Wedding Services'
   );

-- ── R1.2 — named single assignments ──────────────────────────────────────────────────────────
UPDATE service_categories SET commission_band_key = 'moderate', updated_at = now()
 WHERE commission_band_key IS NULL AND name IN ('Health & Wellness', 'Pets & Animals');

UPDATE service_categories SET commission_band_key = 'commercial', updated_at = now()
 WHERE commission_band_key IS NULL AND name IN ('Technology & Connectivity', 'Language & Translation');

-- R1: "Custom / Other → moderate (0.08) as explicit INTERIM." The durable model is an admin
-- assigning the band explicitly at approval time for custom services — NOT built here, filed in
-- FOLLOWUPS.md. This interim exists only so checkout cannot throw.
UPDATE service_categories SET commission_band_key = 'moderate', updated_at = now()
 WHERE commission_band_key IS NULL AND name = 'Custom / Other';

-- ── R1.3 — RESIDUE: categories R1 did not name, assigned under R1's own interim principle ────
-- DELTA ON R1, RECORDED NOT HIDDEN. R1 enumerates the event family and five named categories; the
-- dev set also contains these, which R2's NOT NULL forces to a value in the same migration:
--
--   Specialty Services · TaskRabbit Services · Travel Services · Trip Services · Visa Assistance
--   Affiliate: Activities · Affiliate: Air & Hotel · Affiliate: Events · Affiliate: Ground Transport
--
-- They take `moderate` (0.08) — the SAME interim R1 chose for Custom / Other, for the same stated
-- reason (checkout must not throw), and the mid band so an interim never silently charges a
-- provider the worst rate. This is an interim, not a pricing ruling; it is listed in FOLLOWUPS.md
-- beside the custom-band-at-approval flow for explicit assignment.
--
-- The four `Affiliate: *` rows deserve a specific note: affiliate bookings do NOT resolve provider
-- commission through this column at all — they resolve `affiliate_standard` via source="affiliate"
-- (commission.ts). The band written here is therefore inert for them; it exists solely to satisfy
-- R2's NOT NULL. Do not read it as a statement about affiliate economics.
UPDATE service_categories SET commission_band_key = 'moderate', updated_at = now()
 WHERE commission_band_key IS NULL;

-- ── R2 — the DB layer of the two-layer guard (ruling 35) ─────────────────────────────────────
-- Backfill is complete above, so this constraint cannot be violated by rows already on disk — the
-- publish-time CHECK/NOT-NULL failure mode in CLAUDE.md needs pre-existing violating rows, and by
-- construction there are none. The application layer (category create/activate validation) is the
-- second layer and lands in the same commit.
ALTER TABLE service_categories ALTER COLUMN commission_band_key SET NOT NULL;

COMMENT ON COLUMN service_categories.commission_band_key IS
  'FK-by-key into fee_bands.band_key — the provider commission band for services in this category '
  '(D1). NOT NULL per R2: a category may never exist without a band, because the resolver is '
  'fail-loud by design and a missing band would throw at checkout. Application-layer validation on '
  'create/activate is the second layer (ruling 35).';
