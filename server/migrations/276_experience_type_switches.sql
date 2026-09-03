-- 276: An occasion is a ROW carrying defaults — six switch columns on experience_types.
-- Ledger 2026-09-03-occasion-switches; CLAUDE.md Locked Decision 28.
--
-- WHY: the three-class flow model (travel / event / couple) bundles decisions that vary
-- independently. Stops, an internal schedule and a guest list are three separate capabilities any
-- occasion can need in any combination (a golf trip: many stops + a schedule + NO guests; a date
-- night: one place, one evening, a schedule, no guests; a reunion: all three). A class cannot
-- express that; a row can. Each column is a DEFAULT the traveler can flip from inside the plan.
--
-- NO CHECK CONSTRAINT on any of these, deliberately (CLAUDE.md publish-trap note; migrations 181 /
-- 195 / 273 precedent): a CHECK added over a column prod rows can violate fails the Replit deploy
-- push mid-push and offers the DESTRUCTIVE "copy dev database over production" option. The value
-- sets below are APP-ENFORCED (shared/schema.ts + experienceTypeSwitchesSchema), DB-permissive.
--
-- ALL NULLABLE, NO DEFAULT, deliberately: NULL means "not decided for this occasion", which the
-- flow renders as its own plain-trip shape and SAYS SO — never as a fabricated one/day/off
-- presented as the occasion's own answer (§13). The seeder fills every row it writes; a row added
-- later without them is honestly undecided rather than silently opinionated.
--
-- Additive only; every column is declared in shared/schema.ts so the deploy push cannot drop it.

-- step 2's shape: a single destination vs an ordered stop list. "one" | "many".
ALTER TABLE experience_types ADD COLUMN IF NOT EXISTS default_stops varchar(10);

-- step 3's shape: a single date + time vs first-day / last-day. "day" | "range".
ALTER TABLE experience_types ADD COLUMN IF NOT EXISTS default_duration varchar(10);

-- whether step 5 ("What's happening") appears, whether step 3 shows the "main moment" anchor card,
-- and whether the slip groups items under events. Chips come from logistics-presets.service.ts.
ALTER TABLE experience_types ADD COLUMN IF NOT EXISTS default_schedule boolean;

-- whether the Guests page, its per-event columns, invites and the "N attending" count exist here.
ALTER TABLE experience_types ADD COLUMN IF NOT EXISTS default_guests boolean;

-- step 4's noun, the Trip Strip's party chip and the slip's panel names.
-- "travelers" | "guests" | "attendees".
ALTER TABLE experience_types ADD COLUMN IF NOT EXISTS vocabulary varchar(20);

-- "hidden" suppresses the Guests page, Share and invite links — the proposal case, where the
-- surprise is the product. "shown" | "hidden".
ALTER TABLE experience_types ADD COLUMN IF NOT EXISTS default_visibility varchar(10);
