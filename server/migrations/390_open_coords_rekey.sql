-- 390 — open coordinates keyed by the open source's own id, linked to plan items (LG-1 re-key; ledger
-- `2026-10-18-lg1-open-coords-rekey`).
--
-- Why: 389 keyed `osm_place_coords` by the Google place id, and 185 of 244 Kyoto items carry none, so the batch's
-- resolved matches had no key to land on (8 of 66 written). An open coordinate's identity is now its OWN source's id;
-- the Google place id is a nullable attribute, and items reach a coordinate through a join row.
--
--   open_place_coords           — one row per open place: id = 'osm:<osm_type>/<osm_id>' (Wikidata 'wikidata:<Qid>' when
--                                 step 1c lands). Credited per row ("© OpenStreetMap contributors"; "Wikidata").
--   itinerary_item_open_coords  — which open place an item is (one per item). ON DELETE CASCADE both ways: deleting the
--                                 item or the open row removes the link, never anything else.
--
-- Two NEW tables, born empty except for the copy below: primary keys and the two FKs only — no DEFAULT, no CHECK, no
-- other index. `source` value sets are app-enforced (shared/open-coords.ts). The 389 rows that name their OSM element
-- are copied in (their place id kept); `osm_place_coords` itself is left in place and no longer written or read.
-- Declared in shared/schema.ts (deploy-push durability rule). IF NOT EXISTS / ON CONFLICT DO NOTHING: a second run is
-- a no-op.
CREATE TABLE IF NOT EXISTS open_place_coords (
  id varchar(64) PRIMARY KEY,
  source varchar(16),
  osm_type varchar(16),
  osm_id bigint,
  wikidata_qid varchar(32),
  lat numeric(10, 7),
  lng numeric(10, 7),
  name text,
  google_place_id varchar(255),
  matched_by varchar(32),
  attribution text,
  matched_at timestamp
);

CREATE TABLE IF NOT EXISTS itinerary_item_open_coords (
  item_id varchar PRIMARY KEY REFERENCES itinerary_items(id) ON DELETE CASCADE,
  open_coord_id varchar(64) REFERENCES open_place_coords(id) ON DELETE CASCADE,
  source varchar(16),
  matched_at timestamp
);

INSERT INTO open_place_coords (id, source, osm_type, osm_id, lat, lng, name, google_place_id, matched_by, attribution, matched_at)
SELECT 'osm:' || osm_type || '/' || osm_id, 'osm', osm_type, osm_id, lat, lng, osm_name, place_id, matched_by, attribution, matched_at
FROM osm_place_coords
WHERE osm_type IS NOT NULL AND osm_id IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
ON CONFLICT (id) DO NOTHING;
