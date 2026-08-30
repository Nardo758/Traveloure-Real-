-- Migration 026: Restore expert_service_categories and fix FK constraint
--
-- Migration 013 incorrectly dropped expert_service_categories, which left
-- expert_service_offerings.category_id with 7 distinct orphaned category UUIDs
-- and broke the seeding code (role-scoped-templates, seed-expert-services).
--
-- This migration:
--   1. Recreates expert_service_categories with IF NOT EXISTS (idempotent)
--   2. Inserts the 7 category rows using the exact UUIDs already referenced by
--      existing expert_service_offerings rows (ON CONFLICT DO NOTHING = idempotent)
--   3. Restores the FK constraint from expert_service_offerings.category_id
--      so referential integrity is enforced going forward

-- 1. Recreate the table
CREATE TABLE IF NOT EXISTS expert_service_categories (
  id         VARCHAR PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  is_default BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Insert the 7 categories with the exact UUIDs referenced by existing offerings
INSERT INTO expert_service_categories (id, name, is_default, sort_order) VALUES
  ('0b8b0e25-845a-44fa-83a3-b065d7f23070', 'Itinerary Planning',      TRUE, 0),
  ('06e61854-f1c5-44b2-9872-4df15012a152', 'Local Experience Design',  TRUE, 1),
  ('0429b76c-e163-4072-8634-b32401caf066', 'Specialty Travel',         TRUE, 2),
  ('20bbdb85-0d32-4c19-9a1a-4bab02a0c779', 'Seasonal Travel',          TRUE, 3),
  ('224e4181-9c72-4a19-a880-1be01fab5704', 'Budget Travel',            TRUE, 4),
  ('4b88b026-5d66-47fe-a44a-744dec79bfa3', 'Adventure & Outdoor',      TRUE, 5),
  ('6a4c38d8-0a9c-4ba3-90e3-f7273d757986', 'Photography & Content',    TRUE, 6)
ON CONFLICT (id) DO NOTHING;

-- 3. Restore the FK constraint (drop first to make this idempotent)
ALTER TABLE expert_service_offerings
  DROP CONSTRAINT IF EXISTS expert_service_offerings_category_id_expert_service_categories_;

ALTER TABLE expert_service_offerings
  ADD CONSTRAINT expert_service_offerings_category_id_expert_service_categories_
  FOREIGN KEY (category_id)
  REFERENCES expert_service_categories(id)
  ON DELETE CASCADE;
