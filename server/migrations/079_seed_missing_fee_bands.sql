-- Fix C: Seed missing fee_bands that the resolver expects but don't exist.
-- These are common category names that code paths reference directly.
-- Idempotent — ON CONFLICT DO NOTHING.

INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES
  -- Common activity/service category bands (default to expert_standard: 0.25 platform take)
  ('activities',      'percent', 0.25, 0.15, 0.25, 'Activities',      'Generic activities category. Platform take 0.25, expert keeps 0.75.', true),
  ('transport',       'percent', 0.25, 0.15, 0.25, 'Transport',       'Transportation & logistics. Platform take 0.25, expert keeps 0.75.', true),
  ('food',            'percent', 0.25, 0.15, 0.25, 'Food & Dining',   'Food and dining category. Platform take 0.25, expert keeps 0.75.', true),
  ('accommodation',   'percent', 0.25, 0.15, 0.25, 'Accommodation',   'Lodging & accommodation. Platform take 0.25, expert keeps 0.75.', true),
  ('entertainment',   'percent', 0.25, 0.15, 0.25, 'Entertainment',   'Entertainment category. Platform take 0.25, expert keeps 0.75.', true),
  ('shopping',        'percent', 0.25, 0.15, 0.25, 'Shopping',        'Shopping category. Platform take 0.25, expert keeps 0.75.', true),
  ('sightseeing',     'percent', 0.25, 0.15, 0.25, 'Sightseeing',     'Sightseeing category. Platform take 0.25, expert keeps 0.75.', true),
  ('culture',         'percent', 0.25, 0.15, 0.25, 'Culture',         'Cultural experiences. Platform take 0.25, expert keeps 0.75.', true)
ON CONFLICT (band_key) DO NOTHING;

-- Fix D: Widen destination_seasons columns that may receive longer AI-generated values.
-- The travelpulse service can return descriptive ratings longer than 20 chars.
ALTER TABLE destination_seasons
  ALTER COLUMN rating          TYPE VARCHAR(50),
  ALTER COLUMN crowd_level      TYPE VARCHAR(50),
  ALTER COLUMN price_level      TYPE VARCHAR(50),
  ALTER COLUMN source_type      TYPE VARCHAR(50),
  ALTER COLUMN average_temp     TYPE VARCHAR(50);
