-- Migration 135 — ready_made_purchases.clone_trip_id: ON DELETE SET NULL.
--
-- Found by the refund gate (5e): the migration-133 FK had no ON DELETE action, so deleting the
-- clone trip — the D7 refund's product revocation, but ALSO a buyer simply deleting their own
-- cloned trip — failed with a 23503 FK violation. The purchase row is the durable financial
-- record; the clone pointer should null out when the trip goes, never block the delete.
--
-- Constraint swap only (no data change, no CHECK → no publish-push trap). ADD is wrapped in the
-- migration-117 duplicate_object guard so a re-run (or a prior drizzle push having already set
-- the action) never fails the fail-fast runner.

ALTER TABLE ready_made_purchases DROP CONSTRAINT IF EXISTS ready_made_purchases_clone_trip_id_fkey;

DO $$
BEGIN
  ALTER TABLE ready_made_purchases
    ADD CONSTRAINT ready_made_purchases_clone_trip_id_fkey
    FOREIGN KEY (clone_trip_id) REFERENCES trips(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
