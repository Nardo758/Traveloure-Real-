-- 265: Creator provenance on vendors.
-- Renumbered from 264 during merge with main — 264 was claimed by
-- 264_trip_entitlement_source.sql (ledger 2026-08-29-trip-pass-provenance).
-- New rows receive created_by_id from the authenticated session in POST /api/vendors;
-- request JSON cannot set or override it. Additive-nullable because legacy rows have no
-- trustworthy creator identity: NULL means "created before this column / origin unknown".
-- ON DELETE SET NULL preserves the vendor audit row if its creator account is removed.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS created_by_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendors_created_by_id_users_id_fk'
      AND conrelid = 'vendors'::regclass
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_created_by_id_users_id_fk
      FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;