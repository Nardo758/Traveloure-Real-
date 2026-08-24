-- 165: per-item comment threads on the plan — QA_PUNCH_LIST W3-C (item 12). The communication
-- half of the delivery loop: "can we do this earlier?" belongs on the item, not in detached chat.
--
-- New table `trip_item_comments`, the 151/161 DB-side surrogate-PK pattern (this table is written
-- via the Drizzle query builder, so `$defaultFn(() => crypto.randomUUID())` on the ORM side is the
-- primary generator; the DB-side DEFAULT is a backstop for any raw-SQL insert, matching how
-- bundle_components/trip_contexts declare it). NO CHECK constraints anywhere in this migration ->
-- nothing for the preflight CONSTRAINT_MANIFEST, no publish-time drizzle-push trap.
--
--   trip_id    -> trips,           ON DELETE CASCADE (a comment has no life beyond its trip)
--   item_id    -> itinerary_items, ON DELETE CASCADE (a comment has no life beyond its item —
--                 deleting the item the thread was attached to should not leave orphaned rows)
--   author_id  -> users,           ON DELETE CASCADE (matches the notifications/comments-adjacent
--                 tables' posture elsewhere in this schema; a deleted user's comments don't survive
--                 as orphaned FK-less rows)
--
-- Table + columns + indexes are ALSO declared on a new `tripItemComments` pgTable in
-- shared/schema.ts in the same commit (deploy-push durability rule — CLAUDE.md "Replit deploy-push
-- vs. our migrations" flags an undeclared table as the thing the publish push silently drops;
-- ai_cost_tracking is the cautionary instance).
CREATE TABLE IF NOT EXISTS trip_item_comments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  trip_id VARCHAR NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id VARCHAR NOT NULL REFERENCES itinerary_items(id) ON DELETE CASCADE,
  author_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- The thread read (GET .../items/:itemId/comments) fetches by item, oldest-first.
CREATE INDEX IF NOT EXISTS idx_trip_item_comments_item_created ON trip_item_comments(item_id, created_at);
-- Trip-scoped access-check joins / any future "all comments on this trip" surface.
CREATE INDEX IF NOT EXISTS idx_trip_item_comments_trip ON trip_item_comments(trip_id);
