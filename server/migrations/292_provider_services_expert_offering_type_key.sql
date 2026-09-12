-- Migration 292: a LISTING names its own expert offering.
-- Ledger `2026-09-12-listing-names-its-expert-offering`; punchlist D-13 answered, V-12 closed.
-- CLAUDE.md Locked Decision 4 (the two catalogs are never merged) and the FAQ (no new service
-- table).
--
-- Migration 107 put `offering_type_key` on the two APPLICATION FORMS —
-- `local_expert_forms` → `expert_offering_types` and `service_provider_forms` →
-- `service_offering_types` — so an ACCOUNT's role is known and a LISTING's offering is not.
-- `impactClassFor` resolves the expert catalog BY KEY, so every expert archetype whose class
-- comes from that catalog (E2/E3/E4/E6) resolved `catalog_keys_unrecognised` off a real row —
-- warn-not-block, so the listing published live and bookable with the refusal recorded in its
-- OC-B1 contract snapshot and the seller never told.
--
-- This is the SAME pointer, of the SAME shape, on the row that actually needs it, aimed at
-- exactly ONE catalog. It is NOT a merge of the two catalogs (§4: experts are not a
-- `service_category`) and NOT a new service table (the FAQ): a listing carries an expert key or a
-- provider category key, never a blended vocabulary, and `impactClassFor` already rules the
-- precedence (expert key first, provider category second) — no second precedence rule is
-- introduced anywhere.
--
-- POSTURE:
--   · ADDITIVE, NULLABLE, NO DEFAULT, NO DB CHECK — the publish-trap posture (migrations
--     181/195/273/275/276/277/279/280/281/282/284/287/290/291). THE FK IS THE VALUE-SET
--     CONSTRAINT and that is deliberate: `expert_offering_types.offering_type_key` is already
--     UNIQUE (see 107's own repair note), so the catalog table stays the authority on which keys
--     exist and a key added by a later seeder needs no code or CHECK change here.
--   · ON DELETE SET NULL, exactly as 107: retiring a catalog row must never delete a seller's
--     listing, and a listing whose offering type was withdrawn is honestly unclassified again.
--   · DECLARED IN `shared/schema.ts` in the same commit — the deploy-push durability rule: an
--     object that file does not declare is dropped at publish and the stamped migration never
--     recreates it.
--   · NO INDEX. Nothing reads this column by value — `loadOfferingListingInput` reads it off a
--     row already fetched by primary key. An index nobody needs is one more object the deploy
--     push can drop (107's own two partial indexes are absent from `schema.ts` and are exactly
--     that shape). If a reader ever scans by key, the index and its `schema.ts` declaration land
--     together.
--   · NO BACKFILL. An existing expert listing stays unclassified, which is TRUE, rather than
--     being assigned a key nobody chose (§13) — including from the pre-existing
--     `provider_services.expert_offering_type_id`, which is a DIFFERENT statement made by a
--     different rail and whose relationship to this column is recorded in the ledger row, not
--     resolved here.
--
-- DATA IS UNTOUCHED: no UPDATE, no DELETE, no DEFAULT change, and the only DDL is one nullable
-- ADD COLUMN, so `scripts/preflight-prod-constraints.cjs` needs no new manifest entry (its
-- manifest exists for CHECK constraints, and this migration adds none).

DO $$
BEGIN
  -- Fail loudly rather than half-apply: the FK target must exist, and it must be UNIQUE on the
  -- key (migration 107 repairs/creates that constraint for the sibling catalog; the expert
  -- catalog has carried it since its own DDL).
  IF to_regclass('provider_services') IS NULL OR to_regclass('expert_offering_types') IS NULL THEN
    RAISE EXCEPTION
      'Migration 292 REFUSED: expected tables missing (provider_services and expert_offering_types must both exist)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'expert_offering_types'::regclass
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indnkeyatts = 1
      AND (
        SELECT attname FROM pg_attribute
        WHERE attrelid = i.indrelid AND attnum = i.indkey[0]
      ) = 'offering_type_key'
  ) THEN
    RAISE EXCEPTION
      'Migration 292 REFUSED: expert_offering_types.offering_type_key carries no unique constraint, so it cannot be an FK target. No changes applied.';
  END IF;
END $$;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS expert_offering_type_key VARCHAR(100)
    REFERENCES expert_offering_types(offering_type_key) ON DELETE SET NULL;

-- Reversal (manual, safe — the column is nullable, additive and read by one loader):
--   ALTER TABLE provider_services DROP COLUMN IF EXISTS expert_offering_type_key;
