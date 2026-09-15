-- Migration 295: DROP the legacy `provider_services.expert_offering_type_id`.
-- Ledger `2026-09-15-offering-key-id-drop` (lane 2 of two; lane 1 was
-- `2026-09-12-offering-key-is-canonical`, migration 293).
--
-- WHY. `provider_services` carried TWO columns naming the same offering: this uuid FK
-- (migration 057) and `expert_offering_type_key` (migration 292, the key the offering CATALOGS
-- are actually read by — `impactClassFor` and the whole commerce-contract resolver take a key,
-- and this uuid existed only to be translated back into one). Two columns for one fact is the
-- derivation-drift class CLAUDE.md §18 rule 1 names: they are free to disagree the moment
-- something writes one without the other. The decision-maker ruled the KEY canonical and this
-- column DROPPED, in two lanes. This is lane 2.
--
-- THE PRECONDITION IS A FACT ABOUT A DATABASE, NOT ABOUT THIS FILE. A drop is unrecoverable and
-- a stamped migration never re-runs (CLAUDE.md ruling 31's amendment), so a row that still
-- answers ONLY through the uuid would lose its offering permanently — and on the money path that
-- silently stops a Booking Concierge line being charged its facilitation fee. Migration 293
-- copies the id's answer onto the key; before this migration is PUBLISHED an operator runs the
-- read-only `scripts/preview-offering-key-id-drop.cjs` against production and reads the output.
-- It is refused unless the blocking count is ZERO:
--   SELECT count(*) FROM provider_services
--    WHERE expert_offering_type_id IS NOT NULL AND expert_offering_type_key IS NULL;
-- This migration CANNOT make that check itself: failing a boot migration on a data condition
-- would take the app down rather than hand the question to a human, and passing it silently
-- would be the guess the ruling refuses. The gate is the preview plus `docs/RELEASE.md` step 3.
--
-- POSTURE:
--   · DDL ONLY, and only this column's own objects. Migration 057 created the column, the
--     partial index `idx_provider_services_expert_offering_type` and the FK constraint
--     `provider_services_expert_offering_type_id_fkey`; those three, and nothing else, go here.
--     Postgres would drop the index and the constraint with the column anyway — they are named
--     explicitly so the statement says out loud what it removes.
--   · NO CHECK is added and no CHECK is changed, so `scripts/preflight-prod-constraints.cjs`
--     needs NO new manifest entry (its manifest exists for declared CHECK constraints).
--   · IDEMPOTENT. Every statement is `IF EXISTS`; a second run is a byte-for-byte no-op, and a
--     database that never carried the column applies it cleanly.
--   · THE DECLARATION GOES TOO. `shared/schema.ts` drops `expertOfferingTypeId` in the same
--     commit — that is what makes the Replit deploy push remove the column, and leaving the
--     declaration behind would have the push RE-ADD what this migration removed.
--   · Migration 293 already tolerates the column being absent (it RAISE NOTICEs and returns), so
--     the chain applies from empty in either order of arrival.
--
-- REVERSAL: none that is honest. Re-adding the column would produce a NULL uuid for every row,
-- which is not what it held. The key carries the answer; that is the point of the ruling.

DROP INDEX IF EXISTS idx_provider_services_expert_offering_type;

ALTER TABLE provider_services
  DROP CONSTRAINT IF EXISTS provider_services_expert_offering_type_id_fkey;

ALTER TABLE provider_services
  DROP COLUMN IF EXISTS expert_offering_type_id;
