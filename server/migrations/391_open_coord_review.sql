-- 391 — open_coord_review: open coordinates pulled out of routing for a person to review (LG-2 Ask 1; ledger
-- `2026-10-18-lg2-open-coord-review`).
--
-- Why: an OSM match can land on the wrong thing — a ward, a neighbourhood, a street — or far from the place the plan
-- item names. Such a row is MOVED here, never deleted: the open_place_coords row and every itinerary_item_open_coords
-- link to it are copied verbatim into one review row (jsonb snapshots), then removed from the live tables in the same
-- transaction, so no plan routes from them. A person can restore a review row, which puts the row and its links back.
--
-- One NEW table, born empty: primary key only — no DEFAULT, no CHECK, no other index, no FK (the moved row no longer
-- exists in open_place_coords). `reason` is app-enforced (server/services/routing/open-coord-review.service.ts).
-- Declared in shared/schema.ts (deploy-push durability rule).
--
-- One platform_settings row: open_coord_max_drift_m = 500 (decision-maker's value; admin-editable). The pull refuses
-- to run without it — there is no code fallback.
CREATE TABLE IF NOT EXISTS open_coord_review (
  id varchar(64) PRIMARY KEY,
  open_coord_id varchar(64),
  reason varchar(32),
  drift_m integer,
  open_row jsonb,
  item_links jsonb,
  moved_at timestamp,
  moved_by varchar(255),
  restored_at timestamp,
  restored_by varchar(255)
);

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'open_coord_max_drift_m',
  '500',
  'Metres an open (OSM) coordinate may sit from the plan item''s own point before it is pulled for review (LG-2).',
  now()
)
ON CONFLICT (setting_key) DO NOTHING;
