-- 272_expert_neighborhood_claims.sql — expert field knowledge v2, Phase 1 (claims + schema).
-- TRANSFORMS the migration-271 (#698, v1) state into v2 (#699, canonical — ledger
-- 2026-09-02-field-knowledge-v2-canonical).
--
-- Rulings (docs/DECISIONS.md): 2026-08-29-neighborhood-claims, 2026-08-29-evidence-is-the-test,
-- 2026-08-29-graded-unlocks, 2026-09-01-web-gap-check, 2026-09-01-evidence-thresholds-config,
-- 2026-09-01-scorer-model, 2026-09-01-access-claims-held; Phase 0 D1–D8 ratified
-- (docs/audits/expert-field-knowledge-phase-0.md); 2026-09-02-field-knowledge-v2-canonical.
--
-- Chain reality: 271 always runs before this file (fresh CI chain, dev, prod), so the v1 objects
-- ALWAYS exist when this runs for the first time. Step 0 removes them — and REFUSES (RAISE) if any
-- holds a row, so a v1 table that somehow acquired data is never dropped silently; a human
-- reconciles. Idempotent: step 0 only fires while the v1 shape is present (v1 has
-- `score_specificity`; v2 has `version`), every later statement is IF NOT EXISTS.
--
-- What survives from 271: `nugget_photos` (ported unchanged, with its consent invariant now
-- enforced in code — neighborhood-claims.service.ts listConsentedNuggetPhotos) and the ledger row.
--
-- Posture: no CHECK constraints (publish-trap rule — every vocabulary is app-enforced from
-- shared/neighborhood-claims.ts). Every table, column and index this file LEAVES BEHIND is declared
-- in shared/schema.ts and nothing else is, so the deploy push and this chain agree (deploy-push
-- durability rule). Thresholds are seeded ON CONFLICT DO NOTHING (D3) with NO code fallback.
--
-- ONE WRITER for expert_neighborhoods (D1): the BEFORE INSERT trigger at the end raises unless the
-- inserting transaction set the local GUC `traveloure.expert_neighborhoods_writer = 'ratify'`,
-- which only neighborhood-claims.service.ts ratifyClaim sets. Existing rows are untouched.
-- Trigger/function are not objects drizzle-kit push manages (it introspects tables, columns,
-- indexes, constraints and enums), so the push neither creates nor drops them; server/index.ts
-- logs an error at boot if the trigger is ever found missing.

-- 0. v1 → v2: remove the EMPTY v1 objects (refuse loudly if any holds a row) ─────────────────
DO $$
DECLARE
  v1_present boolean;
  n bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'expert_neighborhood_claims' AND column_name = 'score_specificity'
  ) INTO v1_present;

  IF v1_present THEN
    SELECT count(*) INTO n FROM expert_neighborhood_claims;
    IF n > 0 THEN
      RAISE EXCEPTION '272: expert_neighborhood_claims (v1, migration 271) holds % row(s); the v2 transform expects the v1 tables empty — stop and reconcile by hand', n;
    END IF;
    IF to_regclass('claim_evening_stops') IS NOT NULL THEN
      SELECT count(*) INTO n FROM claim_evening_stops;
      IF n > 0 THEN RAISE EXCEPTION '272: claim_evening_stops (v1) holds % row(s) — refusing to drop', n; END IF;
    END IF;
    IF to_regclass('claim_contingencies') IS NOT NULL THEN
      SELECT count(*) INTO n FROM claim_contingencies;
      IF n > 0 THEN RAISE EXCEPTION '272: claim_contingencies (v1) holds % row(s) — refusing to drop', n; END IF;
    END IF;
    SELECT count(*) INTO n FROM expert_neighborhoods WHERE claim_id IS NOT NULL;
    IF n > 0 THEN RAISE EXCEPTION '272: expert_neighborhoods.claim_id (v1) is set on % row(s) — refusing to drop the column', n; END IF;
    SELECT count(*) INTO n FROM local_knowledge_nuggets WHERE claim_id IS NOT NULL;
    IF n > 0 THEN RAISE EXCEPTION '272: local_knowledge_nuggets.claim_id (v1) is set on % row(s) — refusing to drop the column', n; END IF;

    -- v1 evidence tables (v2 recreates claim_contingencies in its own shape below).
    DROP TABLE IF EXISTS claim_evening_stops;
    DROP TABLE IF EXISTS claim_contingencies;
    -- v1 claim_id columns: dropping them also drops their FKs and the v1 indexes
    -- (expert_neighborhoods_claim_idx, local_knowledge_nuggets_claim_idx). v2 re-adds both
    -- columns below against the v2 claim table.
    ALTER TABLE expert_neighborhoods DROP COLUMN IF EXISTS claim_id;
    ALTER TABLE local_knowledge_nuggets DROP COLUMN IF EXISTS claim_id;
    -- the v1 claim table itself (its indexes go with it).
    DROP TABLE IF EXISTS expert_neighborhood_claims;
  END IF;
END $$;

-- 1. the claim (v2) ─────────────────────────────────────────────────────────────────────────
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

-- 3. P1 depth on the gem-candidate host (claim_id re-added against the v2 table) ───────────
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

-- 5. P3 (v2 shape — keyed to the P2 row; the v1 table of the same name was dropped in step 0) ─
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

-- 8. the ratified join — re-added against the v2 claim table (D1) ──────────────────────────
ALTER TABLE expert_neighborhoods
  ADD COLUMN IF NOT EXISTS claim_id    varchar REFERENCES expert_neighborhood_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamp,
  ADD COLUMN IF NOT EXISTS ratified_by varchar(255) REFERENCES users(id) ON DELETE SET NULL;

-- 9. per-neighborhood capture parameter (D8) + the D5 skip stamp ───────────────────────────
-- NULL = evening (DEFAULT_DAYPART). The companion's two non-evening examples (Porto Bolhão →
-- morning, Jaipur Johari Bazaar → late afternoon) name neighborhoods migration 042 never seeded,
-- so no row is stamped here — an admin sets default_daypart when those rows exist (§13).
ALTER TABLE city_neighborhoods ADD COLUMN IF NOT EXISTS default_daypart varchar(20);
ALTER TABLE local_expert_forms ADD COLUMN IF NOT EXISTS no_neighborhoods_available_at timestamp;

-- 10. nugget_photos — PORTED from 271 unchanged (IF NOT EXISTS makes this a no-op on the chain;
--     it is here so a DB that ever loses 271's objects still ends in the declared state).
--     LOAD-BEARING CONSENT INVARIANT (decision-maker ratified in #698, carried into v2): no
--     public/non-owner read of a row here unless the parent claim's consent_at IS NOT NULL, via
--       nugget_photos → local_knowledge_nuggets.claim_id → expert_neighborhood_claims.consent_at.
--     A photo on a nugget with NULL claim_id has no consent anchor and is never surfaced. In v2 the
--     ONE read path is listConsentedNuggetPhotos (neighborhood-claims.service.ts), which carries
--     the join; submitClaim stamps consent_at in the same UPDATE that flips the claim to submitted,
--     and every P1 nugget it births carries claim_id — so a consented photo is one whose nugget
--     was born through a submitted claim.
CREATE TABLE IF NOT EXISTS nugget_photos (
  id          varchar PRIMARY KEY,
  nugget_id   varchar NOT NULL REFERENCES local_knowledge_nuggets(id) ON DELETE CASCADE,
  "position"  integer NOT NULL,
  photo_url   varchar(500) NOT NULL,
  created_at  timestamp DEFAULT now(),
  CONSTRAINT nugget_photos_nugget_position_uniq UNIQUE (nugget_id, "position")
);

-- 11. ONE WRITER — the BEFORE INSERT guard on expert_neighborhoods (D1) ────────────────────
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
