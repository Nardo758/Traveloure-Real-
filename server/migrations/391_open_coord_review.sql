-- 391 — itinerary_item_open_coords_review: item → open place links pulled out of routing for a person to check
-- (LG-2 Ask 1; ledger `2026-10-18-lg2-open-coord-review`).
--
-- Why: an OSM match can land on the wrong thing — a ward, a neighbourhood, a street, a name that is not the item's — or
-- far from the place the plan item names. Such a LINK is pulled: its itinerary_item_open_coords row is copied here with
-- what a person needs to check it (the open place's OSM type/id and display name, the item's stored point, the
-- distance, the reason), then removed in the same transaction, so the item no longer routes from that place. The
-- open_place_coords row itself is never moved or changed. A checked link can be restored, once.
--
-- One NEW table, born empty: primary key only — no DEFAULT, no CHECK, no other index, no FK (the pulled link no longer
-- exists; the open place and the item may later be deleted). `reason` is app-enforced
-- (server/services/routing/open-coord-review.service.ts). link_source / link_matched_at keep the link as it was so a
-- restore puts it back verbatim. Declared in shared/schema.ts (deploy-push durability rule).
--
-- One platform_settings row: open_coord_max_drift_m = 500 (decision-maker's value; admin-editable). The pull refuses
-- to run without it — there is no code fallback.
CREATE TABLE IF NOT EXISTS itinerary_item_open_coords_review (
  id varchar(64) PRIMARY KEY,
  item_id varchar,
  open_coord_id varchar(64),
  osm_type varchar(16),
  osm_id bigint,
  display_name text,
  item_lat numeric(10, 7),
  item_lng numeric(10, 7),
  distance_m integer,
  reason varchar(32),
  link_source varchar(16),
  link_matched_at timestamp,
  removed_at timestamp,
  removed_by varchar(255),
  restored_at timestamp,
  restored_by varchar(255)
);

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'open_coord_max_drift_m',
  '500',
  'Metres an open (OSM) coordinate may sit from the plan item''s own point before its link is pulled for review (LG-2).',
  now()
)
ON CONFLICT (setting_key) DO NOTHING;
