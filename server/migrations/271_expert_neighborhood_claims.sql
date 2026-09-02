-- 271_expert_neighborhood_claims.sql — expert field-knowledge claims, Phase 1.
-- Ledger 2026-08-29-neighborhood-claims (+ 2026-08-29-evidence-is-the-test,
-- 2026-08-29-graded-unlocks, 2026-08-29-scout-check; docs/DECISIONS.md).
--
-- Experts CLAIM neighborhoods; evidence capture (Phase 2) doubles as inventory; an admin-only
-- scorer grades; admin ratifies. Ratification births the ONE expert_neighborhoods row this claim
-- proves (that join table is unchanged by this migration — see storage.ts for the gated-off
-- legacy writer). Public vocabulary is claimed -> verified; "test" appears nowhere client-facing.
--
-- Additive only. NO CHECK constraints (publish-trap posture — CLAUDE.md "publish-time CHECK
-- failure" trap): status/trigger vocabularies are app-enforced. Idempotent (IF NOT EXISTS
-- throughout). Every table, UNIQUE index and FK here is ALSO declared in shared/schema.ts so the
-- Replit deploy-push cannot silently drop them (deploy-push durability rule).

-- (1) expert_neighborhood_claims — the claim itself. Scores are ADMIN-ONLY; never selected on
--     any expert- or public-facing read (enforced in server/services/neighborhood-claims.service.ts
--     by explicit column selection, not by anything at this layer).
CREATE TABLE IF NOT EXISTS expert_neighborhood_claims (
  id                    varchar PRIMARY KEY,
  expert_id             varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  neighborhood_id       varchar NOT NULL REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  status                varchar(20) NOT NULL DEFAULT 'draft', -- draft|submitted|verified|declined, app-enforced
  consent_at            timestamp,
  consent_version       varchar(50),
  access_note           text,
  submitted_at          timestamp,
  reviewed_by           varchar REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           timestamp,
  review_note           text,
  score_specificity     smallint,
  score_verifiability   smallint,
  score_localness       smallint,
  score_practicality    smallint,
  scored_at             timestamp,
  score_model           varchar(100),
  created_at            timestamp DEFAULT now(),
  updated_at            timestamp DEFAULT now(),
  CONSTRAINT expert_neighborhood_claims_expert_neighborhood_uniq UNIQUE (expert_id, neighborhood_id)
);

CREATE INDEX IF NOT EXISTS expert_neighborhood_claims_expert_idx
  ON expert_neighborhood_claims (expert_id);
CREATE INDEX IF NOT EXISTS expert_neighborhood_claims_status_idx
  ON expert_neighborhood_claims (status);

-- (2) claim_evening_stops — the "one composed evening" evidence prompt, typed rows never prose
--     (ledger 2026-08-29-evidence-is-the-test). Child-row pattern (dmo_extracted_places /
--     service_route_points, §20/§22): ON DELETE CASCADE, UNIQUE (claim_id, "position").
CREATE TABLE IF NOT EXISTS claim_evening_stops (
  id                varchar PRIMARY KEY,
  claim_id          varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  "position"        integer NOT NULL,
  title             varchar(200) NOT NULL,
  duration_minutes  integer,
  why_note          text,
  timing_note       text,
  created_at        timestamp DEFAULT now(),
  CONSTRAINT claim_evening_stops_claim_position_uniq UNIQUE (claim_id, "position")
);

-- (3) claim_contingencies — the "backup plan" evidence prompt (rain/closed/with_kids alternates).
--     "trigger" is a reserved word — quoted throughout. Vocabulary app-enforced, no CHECK.
CREATE TABLE IF NOT EXISTS claim_contingencies (
  id                  varchar PRIMARY KEY,
  claim_id            varchar NOT NULL REFERENCES expert_neighborhood_claims(id) ON DELETE CASCADE,
  "trigger"           varchar(30) NOT NULL, -- rain|closed|with_kids, app-enforced
  alternate_title     varchar(200),
  alternate_note      text,
  replaces_position   integer,
  created_at          timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_contingencies_claim_idx
  ON claim_contingencies (claim_id);

-- (4) local_knowledge_nuggets.claim_id — additive nullable linkage: this nugget IS a piece of
--     evidence captured for the linked claim. ON DELETE SET NULL: a deleted claim never takes
--     its evidence nuggets with it. Not client-settable yet (schema.ts insert-schema omit).
ALTER TABLE local_knowledge_nuggets
  ADD COLUMN IF NOT EXISTS claim_id varchar REFERENCES expert_neighborhood_claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS local_knowledge_nuggets_claim_idx
  ON local_knowledge_nuggets (claim_id);

-- (4b) expert_neighborhoods.claim_id — PROVENANCE MARKER (Phase 1 rider, decision-maker
--     ratified). Additive nullable, no CHECK. verifyClaim() stamps this with the claim it
--     ratified; every row the legacy captureExpertNeighborhoods auto-name-match writer produced
--     (pre-lane approvals + the historical backfill script) stays NULL forever, so a row's
--     origin is mechanically answerable without a backfill guess — the same auditable-origin
--     property trip_entitlements.source established. ON DELETE SET NULL: deleting the claim
--     must never delete the join row it produced.
ALTER TABLE expert_neighborhoods
  ADD COLUMN IF NOT EXISTS claim_id varchar REFERENCES expert_neighborhood_claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expert_neighborhoods_claim_idx
  ON expert_neighborhoods (claim_id);

-- (5) nugget_photos — the ratified photo amendment: 2-4 photos per nugget for a Moments
--     slideshow. Child-row pattern, ON DELETE CASCADE, UNIQUE (nugget_id, "position"). Photos
--     arrive via the ruling-58 objstore rail only (platform-served URLs, never hotlinks) — feeds
--     the 2026-09-01-photo-tiers stock-photo replacement path, the Moments gate, and Phase-4
--     scout reports. Upload endpoint itself is Phase 2 — schema only here (Phase 1 exposes NO
--     photo read path at all, owner console included).
--
--     LOAD-BEARING CONSENT INVARIANT (decision-maker ratified): any public/non-owner read of a
--     row here MUST join through the parent claim's consent — "we can prove we asked" — via
--       nugget_photos -> local_knowledge_nuggets.claim_id -> expert_neighborhood_claims.consent_at
--     gated on consent_at IS NOT NULL. A photo on a nugget with NULL claim_id has NO consent
--     anchor and must never be surfaced publicly; nuggets are only capturable-as-evidence (and
--     therefore photo-bearing) when linked to a claim, which Phase 2's upload endpoint enforces
--     at write time. Any future read path — including an own-console listing — inherits this
--     invariant from day one, enforced in the read query itself, not left as an intention.
CREATE TABLE IF NOT EXISTS nugget_photos (
  id          varchar PRIMARY KEY,
  nugget_id   varchar NOT NULL REFERENCES local_knowledge_nuggets(id) ON DELETE CASCADE,
  "position"  integer NOT NULL,
  photo_url   varchar(500) NOT NULL,
  created_at  timestamp DEFAULT now(),
  CONSTRAINT nugget_photos_nugget_position_uniq UNIQUE (nugget_id, "position")
);
