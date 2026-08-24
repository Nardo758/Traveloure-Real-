-- Migration 167: retire `activity_comments` (W5-D dead-code cleanup lane).
--
-- WHY: zero client callers ever existed for the three endpoints this table backed —
-- GET/POST /api/activities/:activityId/comments and DELETE /api/comments/:id
-- (server/routes/plancard.routes.ts). Re-verified by a whole-repo grep across client/,
-- server/, scripts/, and e2e/ before writing this migration: no fetch/axios/query call to
-- either path anywhere in the client. The per-item comment system that actually ships today
-- is `trip_item_comments` (migration 165), reached via
-- GET/POST /api/trips/:tripId/items/:itemId/comments (server/routes/booking-actions.ts) and
-- rendered by client/src/components/plancard/ItemComments.tsx.
--
-- The one non-obvious LIVE reader found during verification was
-- `storage.getActivityCommentCounts(tripId)`, called from every trip-plan.service.ts assembly
-- to populate `TripPlanActivity.comments` (a per-activity comment COUNT, not the comments
-- themselves). That field turned out to have zero client renderers too — every other producer
-- of a PlanCardActivity (client/src/pages/itinerary.tsx, trip-details.tsx, itinerary-view.tsx)
-- already hardcodes `comments: 0`, and no plancard component reads `.comments` at all. That
-- call site + the now-dead storage method were removed in the same change as this migration
-- (trip-plan.service.ts now sets `comments: 0` directly, matching every other producer) — so
-- dropping this table breaks nothing live.
--
-- The only possible rows are direct-API test writes (the endpoints required auth but nothing
-- else guarded them); this is not user-facing collaboration data.
--
-- GUARDED: refuses to drop a table that has rows, so if the "no real usage" premise doesn't
-- hold somewhere this runs, the honest response is to keep the data and raise a notice — same
-- refusal posture as migration 109 (delivery_method remap) and migration 158
-- (service_demand_requests retirement).
DO $$
DECLARE
  n BIGINT;
BEGIN
  IF to_regclass('public.activity_comments') IS NULL THEN
    RAISE NOTICE 'migration 167: activity_comments already absent — nothing to do.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.activity_comments' INTO n;

  IF n > 0 THEN
    RAISE NOTICE 'migration 167: REFUSING to drop activity_comments — it holds % row(s). The retirement premise (no real usage) no longer holds; keep the data and re-decide.', n;
    RETURN;
  END IF;

  DROP TABLE public.activity_comments;
  RAISE NOTICE 'migration 167: activity_comments dropped (zero client callers of its endpoints, zero rows, no dependents).';
END $$;
