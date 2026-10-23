-- 406 — boot_seed_stamps (ledger `2026-10-22-boot-seed-stamps`).
--
-- HELD for "Migration 406 SQL approved — Leon".
--
-- One row per stamp. stamp_key `boot` is the overall seed version; every other key is a boot
-- seeder name. input_hash is the version that a fully successful run applied. A boot whose
-- stored overall hash matches skips seeding. A seeder whose own hash matches is the only one
-- that stays skipped when the overall row does not. The writer supplies both hashes and
-- applied_at. No DEFAULT, no CHECK, no extra index, no backfill: a database with no row has
-- no stamp and is seeded.
-- Declared in shared/schema.ts (deploy-push durability). IF NOT EXISTS, so a second run is a no-op.

CREATE TABLE IF NOT EXISTS boot_seed_stamps (
  stamp_key text PRIMARY KEY,
  input_hash text NOT NULL,
  applied_at timestamp NOT NULL
);
