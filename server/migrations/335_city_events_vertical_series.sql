-- 335 — city_events: a vertical and a series key (ledger `2026-09-30-city-events-vertical-series`).
-- HELD FOR DECISION-MAKER REVIEW before push (dispatch Sep 30, 2026: "Prerequisite PR (migration
-- HELD for review)").
--
-- THREE ADDITIVE, NULLABLE COLUMNS (two on city_events, one on blog_posts). NO DEFAULT, NO CHECK, NO INDEX, NO BACKFILL — the publish-trap
-- posture; all three declared in shared/schema.ts (deploy-push durability). A publish prompt offering
-- exactly these three `ADD COLUMN IF NOT EXISTS` statements is inside §20's born-column carve-out, and
-- declining it is also safe: boot adds the same columns.
--
-- vertical   — what kind of event this is: 'music' | 'fashion' | 'motorsport' | 'other'. The value
--              set lives ONCE in shared/city-events.ts (CITY_EVENT_VERTICALS) and is app-enforced by
--              the seeder's row builder. NULL = not stated (§13): never guessed from a title.
-- series_key — a stable, lower-case kebab key that groups one recurring series across years and
--              cities (a festival, a fashion week, a race). It is NOT the existing `series` column,
--              which is a display name; two editions of one series can be named differently and must
--              still group. NULL = not part of a stated series.
-- blog_posts.city_event_id — the city event an event-guide post is ABOUT (blog generator lane), so
--              the post page renders its "Start this plan" door from the LIVE event row (a series-follow
--              post reads the other editions live through that event's series_key). NO FOREIGN KEY
--              (decision-maker, Sep 30, 2026: a new column on an existing table is nullable, no
--              DEFAULT/CHECK/index/FK): the link is APP-ENFORCED — the composer sets it, and the post
--              read joins by id and renders no door when the event is gone (that replaces ON DELETE
--              SET NULL). Written only by the server-side generators; NULL = not about an event
--              (every existing post).

ALTER TABLE city_events ADD COLUMN IF NOT EXISTS vertical varchar(20);
ALTER TABLE city_events ADD COLUMN IF NOT EXISTS series_key text;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS city_event_id varchar;
