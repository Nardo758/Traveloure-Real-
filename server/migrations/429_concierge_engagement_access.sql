-- 429 — concierge engagement on trip_expert_advisors.
--
-- HELD until Leon approves this SQL. Do not merge on the file alone.
--
-- source is text, values 'handoff' | 'concierge', app-enforced. NO column
-- DEFAULT and NO CHECK (publish-trap). Existing rows are backfilled to
-- 'handoff' by the UPDATE in this file, not by a default.
-- access_until is timestamptz NULL. NULL means no expiry.
-- Additive. A second run is a no-op: the columns already exist, and the
-- UPDATE matches nothing once every row has a source.

ALTER TABLE trip_expert_advisors
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE trip_expert_advisors
  ADD COLUMN IF NOT EXISTS access_until timestamptz;

UPDATE trip_expert_advisors
   SET source = 'handoff'
 WHERE source IS NULL;
