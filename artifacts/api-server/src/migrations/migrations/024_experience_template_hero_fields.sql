-- P462: Hero-card DB fields on experience_types + tabType on experience_template_tabs
-- Idempotent: all ADD COLUMN IF NOT EXISTS

ALTER TABLE experience_types
  ADD COLUMN IF NOT EXISTS headcount_label VARCHAR(50),
  ADD COLUMN IF NOT EXISTS show_origin_city VARCHAR(10) DEFAULT 'optional',
  ADD COLUMN IF NOT EXISTS show_kids BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS location_label VARCHAR(100),
  ADD COLUMN IF NOT EXISTS hero_image TEXT,
  ADD COLUMN IF NOT EXISTS context_fields JSONB DEFAULT '[]';

ALTER TABLE experience_template_tabs
  ADD COLUMN IF NOT EXISTS tab_type VARCHAR(50) DEFAULT 'venue-search';
