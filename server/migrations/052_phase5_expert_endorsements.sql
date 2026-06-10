-- Migration 051: Phase 5.4 — Expert Endorsements table
--
-- The upsell engine (upsell-engine.service.ts) uses an `expertEndorsed` boolean
-- signal in its relevance scoring formula (weight w4 = 0.15 by default).
-- This table is the source of truth for that signal: an active row with
-- matching (expert_id, service_id / offering_type_key + city_key) sets
-- expertEndorsed = true for the matched candidate.
--
-- Endorsements are soft-deleted via the `active` flag so historical attribution
-- (upsell_impressions) can still join back without gaps.
--
-- Phase 5.2+ surfaces read from this table to annotate RankInputCandidates
-- before passing them to rankCandidates(). The routes / API layer are a
-- separate feature task (out of scope for this migration).

CREATE TABLE IF NOT EXISTS upsell_expert_endorsements (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The expert who issued the endorsement (references users.id).
  expert_id           VARCHAR(255) NOT NULL,

  -- Optional FK to a specific provider service being endorsed.
  -- NULL when the endorsement is at the offering-type / city level rather
  -- than a specific service listing.
  -- provider_services.id is varchar, so this column must match.
  service_id          VARCHAR(255) REFERENCES provider_services(id) ON DELETE SET NULL,

  -- Offering type key (e.g. "private_photography", "cooking_class") — lets
  -- the engine match endorsements to candidates by category even when no
  -- specific service_id is provided.
  offering_type_key   VARCHAR(100),

  -- City scope for the endorsement (e.g. "tokyo", "paris").
  city_key            VARCHAR(100),

  -- When the expert issued the endorsement.
  endorsed_at         TIMESTAMP   NOT NULL DEFAULT NOW(),

  -- Optional free-text note from the expert (shown in expert_review surface).
  notes               TEXT,

  -- Soft-delete flag. Engine only considers active = true rows.
  active              BOOLEAN     NOT NULL DEFAULT true,

  created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Look up all active endorsements for a given expert quickly.
CREATE INDEX IF NOT EXISTS idx_upsell_endorsements_expert
  ON upsell_expert_endorsements(expert_id)
  WHERE active = true;

-- Look up endorsements by service (used when annotating platform-provider candidates).
CREATE INDEX IF NOT EXISTS idx_upsell_endorsements_service
  ON upsell_expert_endorsements(service_id)
  WHERE active = true AND service_id IS NOT NULL;

-- Look up endorsements by offering type + city (used for affiliate/generic candidates).
CREATE INDEX IF NOT EXISTS idx_upsell_endorsements_offering_city
  ON upsell_expert_endorsements(offering_type_key, city_key)
  WHERE active = true;
