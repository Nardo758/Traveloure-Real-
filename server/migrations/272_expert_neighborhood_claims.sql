-- 272_expert_neighborhood_claims.sql — expert field knowledge v2, Phase 1 (claims + schema).
--
-- Rulings (docs/DECISIONS.md): 2026-08-29-neighborhood-claims, 2026-08-29-evidence-is-the-test,
-- 2026-08-29-graded-unlocks, 2026-09-01-web-gap-check, 2026-09-01-evidence-thresholds-config,
-- 2026-09-01-scorer-model, 2026-09-01-access-claims-held; Phase 0 D1–D8 ratified
-- (docs/audits/expert-field-knowledge-phase-0.md). Number verified against origin/main (270 is
-- the head there) and the open PRs (271 is claimed by #696).
--
-- Posture: ADDITIVE ONLY. No CHECK constraints (publish-trap rule — every vocabulary is
-- app-enforced from shared/neighborhood-claims.ts). Every table, column and index is DECLARED in
-- shared/schema.ts (deploy-push durability rule). No NOT NULL without a default on an existing
-- table. Idempotent throughout. Thresholds are seeded ON CONFLICT DO NOTHING so no environment
-- boots with an empty table (D3) — and there is deliberately NO code fallback for them.
--
-- ONE WRITER for expert_neighborhoods (D1): the BEFORE INSERT trigger at the end raises unless the
-- inserting transaction has set the local GUC `traveloure.expert_neighborhoods_writer = 'ratify'`,
-- which only neighborhood-claims.service.ts ratifyClaim sets. Existing rows are untouched.
-- Trigger/function are not objects drizzle-kit push manages (it introspects tables, columns,
-- indexes, constraints and enums), so the deploy push neither creates nor drops them; the boot
-- check in server/index.ts logs loudly if the trigger is ever found missing, and the Phase-1 DB
-- test proves a raw insert is refused.

-- 1. the claim ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expert_neighborhood_claims (
  id                    varchar PRIMARY KEY,
  expert_id             varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  neighborhood_id       varchar NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  status                varchar(20) NOT NULL DEFAULT 'draft',
  daypart               varchar(20) NOT NULL DEFAULT 'evening',
  version               integer NOT NULL DEFAULT 1,
  draft_capture         jsonb,
  consent_at            timestamp,
  consent_version       varchar(40),
  scorer_json           jsonb,
  scorer_failed         boolean NOT NULL DEFAULT false,
  scorer_failed_reason  varchar(60),
  submitted_at          timestamp,
  scored_at             timestamp,
  ratified_at           timestamp,
  ratified_by           varchar(255) REFERENCES users(id) ON DELETE SET NULL,
  declined_at           timestamp,
  declined_dimension    varchar(20),
  created_at            timestamp DEFAULT now(),
  updated_at            timestamp DEFAULT now(),
  CONSTRAINT expert_neighborhood_claims_expert_neighborhood_uniq UNIQUE (expert_id, neighborhood_id)
);
CREATE INDEX IF NOT EXISTS idx_expert_neighborhood_claims_status ON expert_neighborhood_claims (status);

-- 2. the claim's diary (append-only; same-transaction writes) ───────────────────────────────
CREATE TABLE IF NOT EXISTS neighborhood_claim_transitions (
  id            varchar PRIMARY KEY,
  claim_id      varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version integer NOT NULL,
  from_status   varchar(20),
  to_status     varchar(20) NOT NULL,
  actor_type    varchar(20) NOT NULL,
  actor_id      varchar(255),
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nct_claim_created_idx ON neighborhood_claim_transitions (claim_id, created_at);

-- 3. P1 depth on the gem-candidate host ────────────────────────────────────────────────────
ALTER TABLE local_knowledge_nuggets
  ADD COLUMN IF NOT EXISTS claim_id            varchar REFERENCES expert_neighborhood_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_version       integer,
  ADD COLUMN IF NOT EXISTS neighborhood_id     varchar REFERENCES city_neighborhoods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS place_category      varchar(50),
  ADD COLUMN IF NOT EXISTS when_json           jsonb,
  ADD COLUMN IF NOT EXISTS watch_out           text,
  ADD COLUMN IF NOT EXISTS price_band          varchar(10),
  ADD COLUMN IF NOT EXISTS expert_confidence   varchar(20),
  ADD COLUMN IF NOT EXISTS normalized_name     varchar(255),
  ADD COLUMN IF NOT EXISTS web_gap             varchar(10),
  ADD COLUMN IF NOT EXISTS web_gap_url         text,
  ADD COLUMN IF NOT EXISTS web_gap_checked_at  timestamp;
CREATE INDEX IF NOT EXISTS idx_local_knowledge_nuggets_claim ON local_knowledge_nuggets (claim_id);

-- 4. P2 ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mini_slip_templates (
  id               varchar PRIMARY KEY,
  claim_id         varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version    integer NOT NULL,
  expert_id        varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  neighborhood_id  varchar NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  daypart          varchar(20) NOT NULL,
  items            jsonb NOT NULL,
  order_reason     text NOT NULL,
  hard_constraints jsonb NOT NULL,
  created_at       timestamp DEFAULT now(),
  CONSTRAINT mini_slip_templates_claim_version_uniq UNIQUE (claim_id, claim_version)
);

-- 5. P3 ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claim_contingencies (
  id                    varchar PRIMARY KEY,
  mini_slip_template_id varchar NOT NULL REFERENCES mini_slip_templates(id) ON DELETE CASCADE,
  claim_id              varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version         integer NOT NULL,
  expert_id             varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger               varchar(20) NOT NULL,
  replaces_position     integer,
  alternate             jsonb NOT NULL,
  reason                text NOT NULL,
  created_at            timestamp DEFAULT now()
);

-- 6. P4 (held — ruling 2026-09-01-access-claims-held) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_claims (
  id                  varchar PRIMARY KEY,
  claim_id            varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  claim_version       integer NOT NULL,
  expert_id           varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue               varchar(255) NOT NULL,
  normalized_name     varchar(255),
  access_type         varchar(20) NOT NULL,
  relationship_basis  text,
  verification_status varchar(20) NOT NULL DEFAULT 'held',
  created_at          timestamp DEFAULT now()
);

-- 7. thresholds — the ONLY place a number lives (companion §3 values) ───────────────────────
CREATE TABLE IF NOT EXISTS evidence_thresholds (
  threshold_key varchar(60) PRIMARY KEY,
  value         integer NOT NULL,
  description   text,
  updated_by    varchar(255),
  updated_at    timestamp DEFAULT now()
);
INSERT INTO evidence_thresholds (threshold_key, value, description) VALUES
  ('p1_min_entries',               2,  'places-verified: P1 entries that must each clear the per-entry bar (companion §3)'),
  ('p1_entry_min_total',           5,  'places-verified: per-entry total out of 8 (companion §3)'),
  ('p1_entry_min_localness',       1,  'places-verified: per-entry Localness floor (companion §3)'),
  ('p1_entry_min_verifiability',   1,  'places-verified: per-entry Verifiability floor (companion §3)'),
  ('p2_min_total',                 5,  'sequencing: P2 total out of 8 (companion §3)'),
  ('p2_min_practicality',          2,  'sequencing: P2 Practicality must equal this (companion §3)'),
  ('p3_min_total',                 4,  'contingency: P3 total out of 8 (companion §3)'),
  ('p3_alternate_min_specificity', 1,  'contingency: alternate Specificity floor (companion §3)'),
  ('web_gap_found_localness_cap',  1,  'web-gap found ⇒ Localness caps here (ruling 2026-09-01-web-gap-check)'),
  ('dimension_max',                2,  'rubric scale ceiling per dimension (companion §2)'),
  ('resubmit_cooldown_days',       14, 'resubmission: once per this many days (companion §5)')
ON CONFLICT (threshold_key) DO NOTHING;

-- 8. the ratified join — additive on the existing table (D1) ───────────────────────────────
ALTER TABLE expert_neighborhoods
  ADD COLUMN IF NOT EXISTS claim_id    varchar REFERENCES expert_neighborhood_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamp,
  ADD COLUMN IF NOT EXISTS ratified_by varchar(255) REFERENCES users(id) ON DELETE SET NULL;

-- 9. per-neighborhood capture parameter (D8) + the D5 skip stamp ───────────────────────────
-- NULL = evening (DEFAULT_DAYPART). The companion's two non-evening examples (Porto Bolhão →
-- morning, Jaipur Johari Bazaar → late afternoon) name neighborhoods migration 042 never seeded,
-- so no row is stamped here — an admin sets default_daypart when those rows exist (§13: never
-- stamp a row that isn't there).
ALTER TABLE city_neighborhoods ADD COLUMN IF NOT EXISTS default_daypart varchar(20);
ALTER TABLE local_expert_forms ADD COLUMN IF NOT EXISTS no_neighborhoods_available_at timestamp;

-- 10. ONE WRITER — the BEFORE INSERT guard on expert_neighborhoods (D1) ─────────────────────
CREATE OR REPLACE FUNCTION expert_neighborhoods_ratify_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('traveloure.expert_neighborhoods_writer', true) IS DISTINCT FROM 'ratify' THEN
    RAISE EXCEPTION 'expert_neighborhoods is written only by claim ratification (ruling 2026-08-29-neighborhood-claims)'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS expert_neighborhoods_ratify_only_trg ON expert_neighborhoods;
CREATE TRIGGER expert_neighborhoods_ratify_only_trg
  BEFORE INSERT ON expert_neighborhoods
  FOR EACH ROW EXECUTE FUNCTION expert_neighborhoods_ratify_only();
