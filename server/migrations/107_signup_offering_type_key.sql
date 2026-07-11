-- Migration 107: offering-type selection keys on the two application forms
-- (Structural consolidation brief, Phase 1a — decision D5a.)
--
-- The /earn recruitment funnel carries ?offeringTypeKey= into both signup
-- pages, but neither application table had a column for it — only the display
-- name survived submit (folded into specializations / serviceOffers jsonb).
-- These columns are where the selection-only signup (brief Phase 5) persists
-- the canonical key.
--
--  • local_expert_forms.offering_type_key    → expert_offering_types(offering_type_key)
--  • service_provider_forms.offering_type_key → service_offering_types(offering_type_key)
--
-- Two separate FKs to two separate catalogs — the catalogs stay parallel
-- (experts are NOT service_categories rows); never one shared reference.
-- Nullable + ON DELETE SET NULL: applications predating this migration, and
-- applications submitted without an /earn preselection, carry NULL.
--
-- Precondition repair: shared/schema.ts declares offering_type_key UNIQUE on
-- both catalogs, but the shipped DDL only created the unique constraint on
-- expert_offering_types — service_offering_types has no unique constraint on
-- offering_type_key in live databases, which would make the FK below fail.
-- This migration adds the missing constraint, guarded: it REFUSES to run (and
-- the server fail-fasts) if duplicate offering_type_key values already exist,
-- rather than half-applying.

DO $$
DECLARE
  dup_keys TEXT;
BEGIN
  -- Guard 1: all four tables must exist (fail loudly, not half-apply).
  IF to_regclass('local_expert_forms') IS NULL
     OR to_regclass('service_provider_forms') IS NULL
     OR to_regclass('expert_offering_types') IS NULL
     OR to_regclass('service_offering_types') IS NULL THEN
    RAISE EXCEPTION
      'Migration 107 REFUSED: expected tables missing (local_expert_forms, service_provider_forms, expert_offering_types, service_offering_types must all exist)';
  END IF;

  -- Guard 2: the FK target must be deduplicated before we can constrain it.
  SELECT string_agg(offering_type_key, ', ')
    INTO dup_keys
    FROM (
      SELECT offering_type_key
      FROM service_offering_types
      GROUP BY offering_type_key
      HAVING COUNT(*) > 1
    ) d;

  IF dup_keys IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 107 REFUSED: duplicate service_offering_types.offering_type_key values (%) — deduplicate before constraining. No changes applied.', dup_keys;
  END IF;

  -- Repair: add the unique constraint schema.ts already declares, if missing.
  -- Checks for ANY non-partial unique index covering exactly (offering_type_key)
  -- — a Drizzle-snapshot-bootstrapped DB may carry it under a different name.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'service_offering_types'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indnkeyatts = 1
      AND (
        SELECT attname FROM pg_attribute
        WHERE attrelid = i.indrelid AND attnum = i.indkey[0]
      ) = 'offering_type_key'
  ) THEN
    ALTER TABLE service_offering_types
      ADD CONSTRAINT service_offering_types_offering_type_key_key
      UNIQUE (offering_type_key);
  END IF;
END $$;

ALTER TABLE local_expert_forms
  ADD COLUMN IF NOT EXISTS offering_type_key VARCHAR(100)
    REFERENCES expert_offering_types(offering_type_key) ON DELETE SET NULL;

ALTER TABLE service_provider_forms
  ADD COLUMN IF NOT EXISTS offering_type_key VARCHAR(100)
    REFERENCES service_offering_types(offering_type_key) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_local_expert_forms_offering_type_key
  ON local_expert_forms (offering_type_key)
  WHERE offering_type_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_provider_forms_offering_type_key
  ON service_provider_forms (offering_type_key)
  WHERE offering_type_key IS NOT NULL;

-- Reversal (manual, safe — columns are nullable and additive):
--   ALTER TABLE local_expert_forms DROP COLUMN IF EXISTS offering_type_key;
--   ALTER TABLE service_provider_forms DROP COLUMN IF EXISTS offering_type_key;
--   (the service_offering_types unique constraint matches schema.ts and should stay)
