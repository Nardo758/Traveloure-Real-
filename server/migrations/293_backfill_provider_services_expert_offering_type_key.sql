-- Migration 293: copy the listing's expert offering from the legacy uuid link onto the KEY.
-- Ledger `2026-09-12-offering-key-is-canonical` (lane 1 of two; the DROP is lane 2).
--
-- WHY. `provider_services` carries TWO columns naming the same offering: `expert_offering_type_id`
-- (migration 057, a uuid FK) and `expert_offering_type_key` (migration 292, the key the offering
-- CATALOGS are actually read by). Two columns for one fact is the derivation-drift class §18
-- rule 1 names — they are free to disagree the moment something writes one without the other. The
-- decision-maker ruled the KEY canonical and the id DROPPED, in two lanes. This is lane 1: it
-- makes the key able to answer for every row the id can answer for, so that lane 2's drop loses
-- nothing. A drop is unrecoverable and a stamped migration never re-runs (CLAUDE.md ruling 31's
-- amendment), so the copy and the drop must not ride the same deploy.
--
-- THIS BACKFILL IS EXPLICITLY SANCTIONED BY THE RULING, AND IT IS NOT THE ONE D-13 FORBIDS.
-- Ledger `2026-09-12-listing-names-its-expert-offering` refuses INVENTING an offering for a
-- listing that never named one — assigning a key nobody chose (§13). This statement invents
-- nothing: it COPIES, losslessly, an answer the seller already gave, because
-- `expert_offering_types` carries both identifiers for the SAME catalog row. A row with neither
-- identifier is untouched and stays NULL — still "never answered", which remains true.
--
-- POSTURE:
--   · DATA ONLY. One UPDATE. No ALTER, no CHECK, no DROP, no index, no DEFAULT change — so
--     `scripts/preflight-prod-constraints.cjs` needs NO new manifest entry (its manifest exists
--     for declared CHECK constraints, and this migration adds none) and the Replit deploy push has
--     nothing here to fail on.
--   · GUARDED BY `expert_offering_type_key IS NULL`, so a key a seller (or the authoring form) set
--     by hand is NEVER clobbered by the older uuid beside it. Where the two already disagree on
--     disk, this migration leaves the disagreement exactly as it found it — resolving it is a
--     human's call, and lane 2's precondition query lists those rows before the drop.
--   · IDEMPOTENT. After one run every row it can fill is filled, so a second run matches zero rows
--     and is a byte-for-byte no-op.
--   · AN ORPHANED ID FILLS NOTHING. A legacy id whose catalog row has since been deleted joins to
--     nothing, so the key stays NULL — honestly unclassified, never guessed (§13).

DO $$
BEGIN
  IF to_regclass('provider_services') IS NULL OR to_regclass('expert_offering_types') IS NULL THEN
    RAISE EXCEPTION
      'Migration 293 REFUSED: expected tables missing (provider_services and expert_offering_types must both exist)';
  END IF;

  -- Migration 292 adds the target column. Fail loudly rather than silently copying nothing.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_services' AND column_name = 'expert_offering_type_key'
  ) THEN
    RAISE EXCEPTION
      'Migration 293 REFUSED: provider_services.expert_offering_type_key is absent (migration 292 has not applied). No changes applied.';
  END IF;

  -- The SOURCE column is the legacy one this lane is retiring. If a database has already had it
  -- dropped (lane 2 ran there), there is nothing to copy and that is not an error.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'provider_services' AND column_name = 'expert_offering_type_id'
  ) THEN
    RAISE NOTICE 'Migration 293: provider_services.expert_offering_type_id is already gone — nothing to copy.';
    RETURN;
  END IF;

  UPDATE provider_services ps
  SET expert_offering_type_key = eot.offering_type_key
  FROM expert_offering_types eot
  WHERE ps.expert_offering_type_id = eot.id
    AND ps.expert_offering_type_key IS NULL;
END $$;

-- Reversal (manual): there is none that is honest. Once copied, a key and a hand-set key are
-- indistinguishable, so "undo" would have to clear keys a seller chose. The column was NULL for
-- these rows; leaving the copied value in place is harmless (it states what the id already stated).
