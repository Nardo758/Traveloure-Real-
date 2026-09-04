-- Migration 282: user_experiences.start_time — an EVENT'S OWN TIME OF DAY.
-- Ledger `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 35.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS, AND WHAT IT IS NOT
-- ─────────────────────────────────────────────────────────────────────────────
-- An event inside a plan is one `user_experiences` row (ruling 29). The row already carried
-- `event_date` — the DAY — and nothing at all for the TIME OF DAY, so "ceremony at 15:00",
-- "tee time 07:40" and "rehearsal dinner 19:30" had no column to live in and the flow never
-- asked. This adds it.
--
-- It is NOT the plan's MAIN MOMENT. That stays a `temporal_anchors` row written by the plan
-- modal's existing path — one anchor for the plan's centre of gravity. This column is a DIFFERENT
-- fact about a DIFFERENT row: the start time of ONE event among the several a plan can hold.
-- Do not merge or re-point them.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IT IS A WALL-CLOCK STRING, READ IN THE PLAN'S ZONE
-- ─────────────────────────────────────────────────────────────────────────────
-- varchar(5), "HH:MM", stored exactly as entered and NEVER converted — the same posture
-- `itinerary_items.start_time`/`end_time` already take. The zone those strings are read in is
-- `trips.timezone` (migration 279, ruling 30), and where that is NULL the time is honestly
-- zone-less: a reader keeps its zone-free behaviour and says so rather than substituting UTC or
-- the server's zone (§13 — a wrong zone looks authoritative in a way a floating time does not).
--
-- NULL MEANS NOT SET, AND IT IS NEVER RENDERED AS MIDNIGHT OR "ALL DAY" (§13). Both of those are
-- claims about the event that nobody made. A reader with NULL shows the day and no time.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ADDITIVE, NULLABLE, NO DEFAULT, NO CHECK — deliberately
-- ─────────────────────────────────────────────────────────────────────────────
-- The publish-trap posture (migrations 181 / 195 / 273 / 275 / 276 / 277 / 279 / 280 / 281): a
-- CHECK over an app-enforced format is exactly the publish-time drizzle-push failure CLAUDE.md's
-- Coordination Prevention notes warn about. The `^\d{2}:\d{2}$` shape is enforced by the route's
-- pick-based allowlist (§19) in `server/routes/content.routes.ts` instead — the SAME allowlist the
-- POST and the PATCH already share, extended by exactly this one field rather than given a second
-- admission rail.
--
-- Declared in `shared/schema.ts` in this same commit (deploy-push durability rule). No backfill.
-- Idempotent; safe to re-run.

ALTER TABLE user_experiences ADD COLUMN IF NOT EXISTS start_time varchar(5);

COMMENT ON COLUMN user_experiences.start_time IS
  'The EVENT''s own wall-clock start time, "HH:MM" (migration 282, ledger 2026-09-04-stops-and-event-time). Read in trips.timezone; never converted. NULL = not set — never rendered as midnight or "all day". Not the plan main moment (that is a temporal_anchors row).';
