-- 185: dmo_extracted_places — places extracted from a DMO guide become first-class child rows
-- (CLAUDE.md §20a; decision-maker ratified Aug 9 2026). Replaces extracted_data.places as the
-- source of truth; the blob is backfilled from below and thereafter historical (never read).
-- Additive only: new table + backfill, no changes to dmo_raw_content. Idempotent (IF NOT EXISTS
-- + ON CONFLICT DO NOTHING). Declared in shared/schema.ts in the same commit (publish-trap rule).

CREATE TABLE IF NOT EXISTS dmo_extracted_places (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  dmo_content_id varchar NOT NULL REFERENCES dmo_raw_content(id) ON DELETE CASCADE,
  "position" integer NOT NULL,
  name varchar(255) NOT NULL,
  normalized_name varchar(255) NOT NULL,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  in_library_id varchar,
  ticketing_url text,
  source varchar(30) NOT NULL DEFAULT 'stored_text',
  extracted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT dmo_extracted_places_content_position_unique UNIQUE (dmo_content_id, "position")
);

CREATE INDEX IF NOT EXISTS dmo_extracted_places_content_idx ON dmo_extracted_places (dmo_content_id);
CREATE INDEX IF NOT EXISTS dmo_extracted_places_normalized_name_idx ON dmo_extracted_places (normalized_name);

-- Backfill from the JSON blobs written by the pre-185 extract route. Position comes from the
-- stored 1-based "n" when present, else array order. Blank-string coords/urls become NULL (the
-- honest absent state); rows without a name are skipped, never invented.
INSERT INTO dmo_extracted_places
  (dmo_content_id, "position", name, normalized_name, latitude, longitude, in_library_id, ticketing_url, source, extracted_at)
SELECT
  c.id,
  COALESCE(NULLIF(p.value->>'n', '')::integer, p.ordinality::integer),
  left(p.value->>'name', 255),
  left(lower(trim(p.value->>'name')), 255),
  NULLIF(p.value->>'latitude', '')::numeric(10, 7),
  NULLIF(p.value->>'longitude', '')::numeric(10, 7),
  NULLIF(p.value->>'inLibraryId', ''),
  NULLIF(p.value->>'ticketingUrl', ''),
  COALESCE(NULLIF(c.extracted_data->>'source', ''), 'stored_text'),
  NULLIF(c.extracted_data->>'extractedAt', '')::timestamptz
FROM dmo_raw_content c
CROSS JOIN LATERAL jsonb_array_elements(c.extracted_data->'places') WITH ORDINALITY AS p(value, ordinality)
WHERE jsonb_typeof(c.extracted_data->'places') = 'array'
  AND NULLIF(trim(p.value->>'name'), '') IS NOT NULL
ON CONFLICT (dmo_content_id, "position") DO NOTHING;
