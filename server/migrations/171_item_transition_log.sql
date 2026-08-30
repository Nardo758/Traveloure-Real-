-- 171_item_transition_log.sql — Lane S (slip identity + transition log), rulings 6/11/12/16/18.
--
-- The slip's diary: every itinerary_items.routing_status transition writes a row here in the SAME
-- transaction as the flip (ruling 18 — helper-internal transaction; the outer money-path swallow is
-- retained so a diary failure can never fail a checkout or refund, but the pair is all-or-nothing).
-- Trip-scoped events (variant_applied, ruling 16) carry item_id NULL.
--
-- APPEND-ONLY BY CONVENTION: no app code carries an UPDATE or DELETE path against this table
-- (ruling 11 — unlike itinerary_changes, which is a traveler display feed with a DELETE endpoint).
--
-- Deliberate postures:
--   * NO DB CHECK on event_type/from_status/to_status/actor_type — the migration-159 no-CHECK
--     posture; canonical vocab lives in shared/schema.ts. Nothing for the preflight
--     CONSTRAINT_MANIFEST; no publish-time drizzle-push remap trap (new table, no legacy rows).
--   * item_id has NO FK — a deleted item's history must survive it (itinerary_changes.activityId
--     posture). trip_id cascades: a deleted trip takes its diary with it.
--   * The table AND its index are declared in shared/schema.ts in the same commit (the deploy-push
--     durability rule — an undeclared object is a drop target at publish).
--   * DB-side gen_random_uuid() default so raw-SQL writers (none today) stay safe; drizzle writers
--     supply ids via $defaultFn.

CREATE TABLE IF NOT EXISTS item_transition_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  trip_id VARCHAR NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id VARCHAR,
  event_type VARCHAR(30) NOT NULL DEFAULT 'status_transition',
  from_status VARCHAR(20),
  to_status VARCHAR(20),
  actor_type VARCHAR(20) NOT NULL,
  actor_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itl_trip_created_idx ON item_transition_log (trip_id, created_at);
