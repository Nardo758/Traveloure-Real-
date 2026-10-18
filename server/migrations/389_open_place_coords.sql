-- 389 — osm_place_coords + admin_place_coords (LG-1; ledger `2026-10-17-lg1-osm-place-coords`).
-- founder comment: #1525 2026-10-18T00:38:38Z.
--
-- Routing coordinates that did not come from Google, keyed by the Google place id (the one thing kept from Google).
-- Two NEW tables, born empty: a primary key on place_id and nothing else — no DEFAULT, no CHECK, no FK, no other
-- index, no backfill.
--   osm_place_coords   — an OpenStreetMap point matched once to the place by the one-off Nominatim batch
--                        (scripts/regeocode-items-osm.ts --apply). Kept apart from place_facts and itinerary_items
--                        so ODbL's share-alike stays on this table; every row is credited "© OpenStreetMap contributors".
--   admin_place_coords — a coordinate a Traveloure admin entered from the place's official site.
-- The OSRM adapter routes only between these (and a ride's OSM node or an IATA airport). Declared in
-- shared/schema.ts (deploy-push durability rule). IF NOT EXISTS, so a second run is a no-op.
CREATE TABLE IF NOT EXISTS osm_place_coords (
  place_id varchar(255) PRIMARY KEY,
  lat numeric(10, 7),
  lng numeric(10, 7),
  osm_type varchar(16),
  osm_id bigint,
  osm_name text,
  matched_by varchar(32),
  attribution text,
  matched_at timestamp
);

CREATE TABLE IF NOT EXISTS admin_place_coords (
  place_id varchar(255) PRIMARY KEY,
  lat numeric(10, 7),
  lng numeric(10, 7),
  source_url text,
  entered_by varchar,
  entered_at timestamp,
  note text
);
