-- 403 — city-knowledge test attempts, retake grants, and the bank sign-off row.
-- Ledger `2026-10-21-city-knowledge-test`.
-- HELD until Leon comments on the PR: Migration 403 SQL approved — Leon
--
-- The Kyoto question file stays unverified. This table records a later sign-off
-- (a hash of the bank) without a code change. Editing the saved bank clears that hash.
-- No DEFAULT and no CHECK. Absent status is not a guessed value.
-- Idempotent.

CREATE TABLE IF NOT EXISTS city_knowledge_banks (
  city_key varchar(64) PRIMARY KEY,
  verification_status varchar(32),
  signed_off_hash varchar(64),
  bank_json jsonb,
  updated_at timestamp,
  updated_by varchar
);

CREATE TABLE IF NOT EXISTS city_knowledge_attempts (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id varchar NOT NULL REFERENCES local_expert_forms(id) ON DELETE CASCADE,
  city_key varchar(64) NOT NULL,
  attempt_number integer NOT NULL,
  status varchar(32),
  outcome varchar(32),
  draw_seed varchar(64),
  item_ids jsonb,
  source_hashes jsonb,
  result jsonb,
  attention_flag boolean,
  started_at timestamp,
  part_a_submitted_at timestamp,
  submitted_at timestamp,
  scored_at timestamp
);

CREATE INDEX IF NOT EXISTS city_knowledge_attempts_user_city_idx
  ON city_knowledge_attempts (user_id, city_key);

CREATE INDEX IF NOT EXISTS city_knowledge_attempts_application_idx
  ON city_knowledge_attempts (application_id);

CREATE TABLE IF NOT EXISTS city_knowledge_retake_grants (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id varchar NOT NULL REFERENCES local_expert_forms(id) ON DELETE CASCADE,
  city_key varchar(64) NOT NULL,
  for_attempt_number integer NOT NULL,
  granted_at timestamp,
  granted_by varchar
);

CREATE UNIQUE INDEX IF NOT EXISTS city_knowledge_retake_grants_slot_idx
  ON city_knowledge_retake_grants (application_id, city_key, for_attempt_number);

INSERT INTO city_knowledge_banks (city_key, verification_status)
VALUES ('kyoto', 'unverified')
ON CONFLICT (city_key) DO NOTHING;
