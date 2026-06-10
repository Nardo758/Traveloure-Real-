-- Migration 055: Category field schema + provider_services category_attributes

-- 1. Category field schema table (admin-configurable per-category dynamic fields)
CREATE TABLE IF NOT EXISTS category_field_schema (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key    VARCHAR(100) NOT NULL,
  field_key       VARCHAR(100) NOT NULL,
  label           VARCHAR(255) NOT NULL,
  type            VARCHAR(20)  NOT NULL CHECK (type IN ('text','number','select','boolean','url','multiselect')),
  required        BOOLEAN      NOT NULL DEFAULT FALSE,
  options         JSONB,
  sort_order      INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (category_key, field_key)
);

-- 2. Add category_attributes jsonb column to provider_services (idempotent)
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS category_attributes JSONB;

-- 3. Seed: Transport fields
INSERT INTO category_field_schema (category_key, field_key, label, type, required, options, sort_order) VALUES
  ('transportation-logistics', 'vehicle_type',        'Vehicle Type',              'select',  TRUE,  '["Sedan","SUV","Van","Minibus","Bus","Motorcycle","Tuk-tuk","Boat","Other"]', 10),
  ('transportation-logistics', 'seats',               'Number of Seats',           'number',  TRUE,  NULL,                                                                          20),
  ('transportation-logistics', 'license_plate',       'License Plate / License No.','text',   FALSE, NULL,                                                                          30),
  ('transportation-logistics', 'insurance_url',       'Insurance Document URL',    'url',     FALSE, NULL,                                                                          40)
ON CONFLICT (category_key, field_key) DO NOTHING;

-- 4. Seed: Photography fields
INSERT INTO category_field_schema (category_key, field_key, label, type, required, options, sort_order) VALUES
  ('photography-videography', 'equipment_list',       'Equipment / Gear',           'text',       FALSE, NULL,                                                                              10),
  ('photography-videography', 'shooting_styles',      'Shooting Styles',            'multiselect', FALSE, '["Portrait","Street","Architecture","Event","Wedding","Nature","Product","Travel"]', 20),
  ('photography-videography', 'portfolio_url',        'Portfolio URL',              'url',         FALSE, NULL,                                                                              30),
  ('photography-videography', 'raw_files_included',   'RAW Files Included',         'boolean',     FALSE, NULL,                                                                              40)
ON CONFLICT (category_key, field_key) DO NOTHING;

-- 5. Seed: Childcare fields
INSERT INTO category_field_schema (category_key, field_key, label, type, required, options, sort_order) VALUES
  ('childcare-nanny',         'age_range_min',        'Minimum Child Age (years)',  'number',  FALSE, NULL,              10),
  ('childcare-nanny',         'age_range_max',        'Maximum Child Age (years)',  'number',  FALSE, NULL,              20),
  ('childcare-nanny',         'group_or_one_on_one',  'Session Type',               'select',  FALSE, '["1:1","Group"]', 30),
  ('childcare-nanny',         'certifications',       'Certifications / Qualifications', 'text', FALSE, NULL,            40),
  ('childcare-nanny',         'first_aid_certified',  'First-Aid Certified',        'boolean', FALSE, NULL,              50)
ON CONFLICT (category_key, field_key) DO NOTHING;
