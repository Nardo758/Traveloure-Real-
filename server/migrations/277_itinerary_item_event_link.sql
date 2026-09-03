-- Migration 277: an itinerary item BELONGS TO AN EVENT.
-- Ledger `2026-09-03-item-event-link`, CLAUDE.md entry 29. Additive, nullable, NO CHECK, no
-- DEFAULT, no backfill (the migration-181/195/273/275 posture — a CHECK here is exactly the
-- publish-time drizzle-push failure CLAUDE.md warns about). The column AND the index are ALSO
-- declared in `shared/schema.ts` in this same commit: per the deploy-push durability rule, a DB
-- object the code depends on that `schema.ts` does not declare is dropped by Replit's
-- publish-time push and NEVER recreated (the stamped migration will not re-run).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: THE EVENT ALREADY EXISTS; ONLY THE LINK WAS MISSING
-- ─────────────────────────────────────────────────────────────────────────────
-- A plan is one `trips` row. An event inside that plan is one `user_experiences` row, already
-- bound to the trip by the pre-existing nullable `user_experiences.trip_id` (no uniqueness —
-- many events per trip), already carrying event_date / location / budget / guest_count /
-- experience_type_id. Invites already hang off an event (`event_invites.experience_id`); a
-- temporal anchor already can (`temporal_anchors.user_experience_id`); the slip already mints one
-- row per trip when the traveler sets up a guest list (SlipLogisticsSection →
-- POST /api/user-experiences). NO NEW EVENT TABLE is created here and no new artifact type is
-- introduced — the ONE thing missing was the link in the other direction, from the item to the
-- event, which is this column.
--
--   user_experience_id — the event this plan item is scheduled under. NULLABLE by design:
--       every plan has ONE IMPLICIT unnamed event, and NULL *is* that event. So a NULL is not a
--       missing value to be backfilled or guessed (§13) — it is the honest, complete answer for
--       every item on a single-event plan, which is every plan that exists today.
--
-- ON DELETE SET NULL IS THE RULING, NOT AN IMPLEMENTATION DETAIL. Deleting an event must never
-- delete the items planned under it: the items fall back to the plan's implicit event and stay on
-- the traveler's slip. A CASCADE here would let removing a "Rehearsal dinner" card silently
-- destroy every item beneath it — the class of irreversible loss the item↔booking (migration 159),
-- item↔service and item↔slot (migration 275) links all deliberately avoid the same way.
--
-- ADMISSION (§19) is a pick-based ALLOWLIST, not this migration's business: `insertItineraryItemSchema`
-- omits the column and `itineraryItemEventLinkSchema` re-admits exactly it, with the trip↔event
-- pairing VERIFIED server-side on both live write rails (§14 — never trust the client's pairing).
--
-- Idempotent; safe to re-run.

ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS user_experience_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE itinerary_items
    ADD CONSTRAINT itinerary_items_user_experience_id_fkey
    FOREIGN KEY (user_experience_id) REFERENCES user_experiences(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_user_experience_id
  ON itinerary_items(user_experience_id);
