-- Ensure id has a default so INSERTs below don't need explicit UUIDs.
ALTER TABLE city_neighborhoods ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Master Integration Brief — Phase 3.2: seed neighborhoods per SEED_DATA §6.
--
-- 32 starter rows across 8 launch markets. ON CONFLICT (city, country, slug)
-- DO NOTHING — never overwrite admin edits to existing rows.
--
-- Coordinates are city-center placeholders with a wider radius (3.0 km) so
-- nearest-match backfill still works approximately. Market managers will
-- update to actual neighborhood centroids per the ⚠confirm flag.

INSERT INTO city_neighborhoods
  (city, country, name, slug, centroid_lat, centroid_lng, radius_km, description, is_featured)
VALUES
  -- ── Kyoto, Japan ──────────────────────────────────────────────────────────
  ('Kyoto', 'Japan', 'Gion',                'gion',                 35.0036, 135.7748, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Kyoto', 'Japan', 'Arashiyama',          'arashiyama',           35.0094, 135.6680, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Kyoto', 'Japan', 'Fushimi Inari',       'fushimi_inari',        34.9671, 135.7727, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Kyoto', 'Japan', 'Higashiyama',         'higashiyama',          35.0017, 135.7833, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Kyoto', 'Japan', 'Downtown / Kawaramachi','downtown_kawaramachi',35.0044, 135.7686, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),

  -- ── Edinburgh, UK ─────────────────────────────────────────────────────────
  ('Edinburgh', 'United Kingdom', 'Old Town',    'old_town',    55.9486, -3.1900, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Edinburgh', 'United Kingdom', 'New Town',    'new_town',    55.9550, -3.2050, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Edinburgh', 'United Kingdom', 'Leith',       'leith',       55.9764, -3.1700, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Edinburgh', 'United Kingdom', 'Stockbridge', 'stockbridge', 55.9580, -3.2100, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),
  ('Edinburgh', 'United Kingdom', 'Grassmarket', 'grassmarket', 55.9472, -3.1953, 3.0, '⚠confirm centroid — placeholder city-center coord. Per SEED_DATA §6.', false),

  -- ── Bogotá, Colombia ──────────────────────────────────────────────────────
  ('Bogotá', 'Colombia', 'La Candelaria', 'la_candelaria', 4.5970, -74.0750, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Bogotá', 'Colombia', 'Chapinero',     'chapinero',     4.6480, -74.0635, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Bogotá', 'Colombia', 'Usaquén',       'usaquen',       4.6960, -74.0300, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Bogotá', 'Colombia', 'Zona T',        'zona_t',        4.6680, -74.0540, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),

  -- ── Cartagena, Colombia ───────────────────────────────────────────────────
  ('Cartagena', 'Colombia', 'Old Town',   'centro_historico', 10.4230, -75.5500, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Cartagena', 'Colombia', 'Getsemaní',  'getsemani',        10.4216, -75.5450, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Cartagena', 'Colombia', 'Bocagrande', 'bocagrande',       10.4040, -75.5560, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),

  -- ── Porto, Portugal ───────────────────────────────────────────────────────
  ('Porto', 'Portugal', 'Ribeira',          'ribeira',         41.1410, -8.6130, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Porto', 'Portugal', 'Baixa',            'baixa',           41.1490, -8.6110, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Porto', 'Portugal', 'Foz do Douro',     'foz_do_douro',    41.1525, -8.6760, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Porto', 'Portugal', 'Cedofeita',        'cedofeita',       41.1530, -8.6230, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Porto', 'Portugal', 'Vila Nova de Gaia','vila_nova_gaia',  41.1330, -8.6160, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),

  -- ── Mumbai, India ─────────────────────────────────────────────────────────
  ('Mumbai', 'India', 'Colaba',          'colaba',          18.9067, 72.8147, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Mumbai', 'India', 'Bandra',          'bandra',          19.0590, 72.8400, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Mumbai', 'India', 'Fort / Kala Ghoda','fort_kala_ghoda', 18.9326, 72.8330, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Mumbai', 'India', 'Juhu',            'juhu',            19.0990, 72.8260, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),

  -- ── Goa, India ────────────────────────────────────────────────────────────
  ('Goa', 'India', 'Panjim',                       'panjim',     15.4909, 73.8278, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Goa', 'India', 'North Goa / Anjuna-Vagator',   'north_goa',  15.5840, 73.7400, 5.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Goa', 'India', 'South Goa / Palolem',          'south_goa',  15.0100, 74.0230, 5.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),

  -- ── Jaipur, India ─────────────────────────────────────────────────────────
  ('Jaipur', 'India', 'Pink City / Old City', 'old_city',     26.9220, 75.8260, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Jaipur', 'India', 'Civil Lines',          'civil_lines',  26.9220, 75.7900, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Jaipur', 'India', 'Amer',                 'amer',         26.9854, 75.8513, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false),
  ('Jaipur', 'India', 'Bani Park',            'bani_park',    26.9320, 75.7900, 3.0, '⚠confirm centroid — placeholder. Per SEED_DATA §6.', false)
ON CONFLICT (city, country, slug) DO NOTHING;
