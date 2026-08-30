-- P462: Tab-level control descriptors for flight/hotel filter panels
-- Stores per-tab filter control config (price range, stops, star ratings, sort options)
-- as JSONB so templates can define their own filter UI without hardcoded JSX.
-- Idempotent: ADD COLUMN IF NOT EXISTS

ALTER TABLE experience_template_tabs
  ADD COLUMN IF NOT EXISTS control_config JSONB;
