-- 409 — experience themes (ledger `2026-10-23-experience-themes`).
--
-- HELD for "Migration 409 SQL approved — Leon".
--
-- A listing may name one theme from an admin-edited catalog. The free-text title
-- stays on provider_services.service_name. Existing listings stay NULL (no backfill).
-- NULL is untagged. The word is an admin label, not a value stored here.
--
-- "Other / suggest a theme" writes experience_theme_suggestions only. Accepting a
-- suggestion may add a catalog row. It does not assign that row onto the listing.
--
-- Seed labels are the ready-made plan types except custom ("Create your own…").
-- Proposed for wording approval, not a final list. ON CONFLICT (slug) DO NOTHING.
--
-- Additive. New columns are nullable. No DEFAULT on the theme column, no CHECK,
-- no backfill. Catalog ids are the slugs. Active NULL or true is listed; false is hidden.
-- Suggestion status NULL means pending. App values: pending, accepted, dismissed.
-- Foreign keys are named the way drizzle names them. IF NOT EXISTS / duplicate_object,
-- so a second run is a no-op.

CREATE TABLE IF NOT EXISTS experience_themes (
  id varchar PRIMARY KEY,
  slug varchar(80) NOT NULL,
  label varchar(120) NOT NULL,
  sort_order integer,
  active boolean
);

CREATE UNIQUE INDEX IF NOT EXISTS experience_themes_slug_key ON experience_themes (slug);

CREATE TABLE IF NOT EXISTS experience_theme_suggestions (
  id varchar PRIMARY KEY,
  label varchar(120) NOT NULL,
  service_id varchar,
  suggested_by varchar,
  status varchar(20),
  created_at timestamp,
  reviewed_at timestamp,
  reviewed_by varchar
);

DO $$ BEGIN
  ALTER TABLE "experience_theme_suggestions" ADD CONSTRAINT "experience_theme_suggestions_service_id_provider_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "provider_services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "experience_theme_suggestions" ADD CONSTRAINT "experience_theme_suggestions_suggested_by_users_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "experience_theme_suggestions" ADD CONSTRAINT "experience_theme_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS theme_id varchar;

DO $$ BEGIN
  ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_theme_id_experience_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "experience_themes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_provider_services_theme_id ON provider_services (theme_id);

INSERT INTO experience_themes (id, slug, label, sort_order, active) VALUES
  ('hiking_itinerary', 'hiking_itinerary', 'Hiking Itinerary', 10, true),
  ('road_trip_itinerary', 'road_trip_itinerary', 'Road Trip Itinerary', 20, true),
  ('city_itinerary', 'city_itinerary', 'City Itinerary', 30, true),
  ('food_culture_itinerary', 'food_culture_itinerary', 'Food & Culture Itinerary', 40, true),
  ('birthday_plan', 'birthday_plan', 'Birthday Plan', 50, true),
  ('wedding_plan', 'wedding_plan', 'Wedding Plan', 60, true),
  ('proposal_plan', 'proposal_plan', 'Proposal Plan', 70, true),
  ('corporate_retreat_plan', 'corporate_retreat_plan', 'Corporate Retreat Plan', 80, true),
  ('adventure_outdoors', 'adventure_outdoors', 'Adventure & Outdoors', 90, true),
  ('romance_honeymoon', 'romance_honeymoon', 'Romance & Honeymoon', 100, true),
  ('family_trip', 'family_trip', 'Family Trip', 110, true),
  ('wellness_retreat', 'wellness_retreat', 'Wellness Retreat', 120, true),
  ('photography_tour', 'photography_tour', 'Photography Tour', 130, true),
  ('nightlife_entertainment', 'nightlife_entertainment', 'Nightlife & Entertainment', 140, true),
  ('cultural_heritage', 'cultural_heritage', 'Cultural Heritage', 150, true),
  ('beach_island', 'beach_island', 'Beach & Island', 160, true),
  ('festival_seasonal', 'festival_seasonal', 'Festival & Seasonal', 170, true),
  ('shopping_style', 'shopping_style', 'Shopping & Style', 180, true)
ON CONFLICT (slug) DO NOTHING;
