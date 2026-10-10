-- 368 — TC-3a: the ride as a plan item (ledger `2026-10-11-tc3a-ride-item`; brief docs/planning/briefs/tc-3a-ride-item.md).
-- HELD: merges only with "Migration 368 SQL approved — Leon" on the TC-3a PR.
--
-- Every object below is declared in shared/schema.ts (deploy-push durability rule). Columns on existing
-- tables are nullable with NO DEFAULT, NO CHECK, NO index, NO FK (the publish-trap posture). The new table
-- is born empty, so its UNIQUE index and its FK cannot fail.
--
-- 1. itinerary_items.exit_latitude / exit_longitude — a ride's exit pin (boarding = the item's own pin).
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS exit_latitude NUMERIC(10, 7);
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS exit_longitude NUMERIC(10, 7);

-- 2. transport_legs.superseded_at / superseded_by_item_id — a superseded leg is kept and hidden, never
--    deleted; the ride that superseded it is named so removing the ride restores exactly those legs.
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP;
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS superseded_by_item_id VARCHAR;

--    P0's interim marker (`origin='superseded'`, ruling 7) moves to the lifecycle column: `origin` is
--    provenance. Rows keep `proposal_status` NULL (hidden); their ride link stays NULL (never restored).
--    Production holds none (the engine has never run there); idempotent — a second run matches nothing.
UPDATE transport_legs
   SET superseded_at = COALESCE(updated_at, now()), origin = NULL
 WHERE origin = 'superseded';

-- 3. service_transport_facts — what a transport catalog row carries that provider_services has no column
--    for. One row per service. official_source is required (nothing seeds without its official page).
CREATE TABLE IF NOT EXISTS service_transport_facts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  service_id VARCHAR NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  weather_rule TEXT,
  weather_fallback_mode VARCHAR(20),
  luggage_rule TEXT,
  pass_validity TEXT,
  payment_constraints TEXT,
  official_link TEXT,
  official_source TEXT NOT NULL,
  verified_at TIMESTAMP,
  booking_window_days INTEGER,
  osm_attribution BOOLEAN,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_transport_facts_service_id_uniq ON service_transport_facts (service_id);
