-- 396 — who entered a hand-picked OpenStreetMap point, and how (LG-2 Ask 7; ledger `2026-10-19-lg2-admin-osm-points`).
--
-- A person enters a point picked from OSM (Leon's rulings 3–5, Oct 18, 2026). The point is an ordinary
-- `open_place_coords` row (source 'admin', id 'admin:<osm_type>/<osm_id>' — never the batch's own 'osm:…' row, which is
-- not moved), and these four columns say who entered it, when it was checked, what the point is (entrance, centroid,
-- station, path_start) and the reviewer's note. Additive and nullable, NO DEFAULT, no CHECK, no index, no FK, no
-- backfill: a batch row carries NULL in all four (it was matched, not entered). Declared in shared/schema.ts.
ALTER TABLE open_place_coords ADD COLUMN IF NOT EXISTS entered_by varchar(255);
ALTER TABLE open_place_coords ADD COLUMN IF NOT EXISTS checked_at timestamp;
ALTER TABLE open_place_coords ADD COLUMN IF NOT EXISTS point_basis varchar(32);
ALTER TABLE open_place_coords ADD COLUMN IF NOT EXISTS note text;
