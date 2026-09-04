-- Migration 281: trip_destinations — a plan's ORDERED stops.
-- Ledger `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 34.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS IS
-- ─────────────────────────────────────────────────────────────────────────────
-- Child rows of `trips` on the `service_route_points` pattern (migration 192, ruling 22) which is
-- itself the `dmo_extracted_places` pattern (migration 185): ON DELETE CASCADE, composite UNIQUE
-- on (trip_id, "position"), positions SERVER-DERIVED from array order on a replace-list write —
-- never client-numbered.
--
-- `trips.destination` STAYS, and is not deprecated by this table. It remains the single string
-- every existing reader uses (the market/timezone derivations in `storage.createTrip`/`updateTrip`
-- read it, the .ics reads it, the slip reads it), so this table is the ORDERED LIST and
-- `trips.destination` is the POSITION-0 MIRROR of it. The mirror rule — position 0's `name` equals
-- `trips.destination` — is enforced in the ONE writer (`server/services/trip-destinations.service.ts`,
-- `replaceTripDestinations`), which writes the mirror through `storage.updateTrip` so the
-- market_slug and timezone derivations (ruling 30) re-run on the same edit. It is deliberately NOT
-- a trigger: a trigger would be a second author of `trips.destination`, which is the
-- derivation-drift class §18 rule 1 names, and it could not re-run the derivations anyway.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- lat/lng ARE NULLABLE, AND A NULL IS A FINISHED ANSWER (§13)
-- ─────────────────────────────────────────────────────────────────────────────
-- A stop the traveler typed but never placed on a map has NO coordinates. It stays visibly flagged
-- as unlocated in every list and is NEVER guessed onto a map — no city-center fallback, no
-- geocode-on-read. Same posture as `service_route_points` (ruling 22c) and `dmo_extracted_places`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ADDITIVE, NO DB CHECK, NO BACKFILL — deliberately
-- ─────────────────────────────────────────────────────────────────────────────
-- The publish-trap posture (migrations 181 / 195 / 273 / 275 / 276 / 277 / 279 / 280): a CHECK over
-- an app-enforced value set is exactly the publish-time drizzle-push failure CLAUDE.md's
-- Coordination Prevention notes warn about, and it offers the DESTRUCTIVE "copy dev database over
-- production" option when it fires. Shape is enforced by the route's pick-based allowlist instead.
--
-- NO BACKFILL. A legacy trip simply has NO rows here, and an empty list means NOT CAPTURED: every
-- reader falls back to `trips.destination` explicitly and says so (§13). Manufacturing a
-- position-0 row for every trip on disk would turn "we never asked" into "the traveler said one
-- stop", which is a different claim.
--
-- The TABLE, the UNIQUE and the INDEX are ALSO declared in `shared/schema.ts` in this same commit —
-- the deploy-push durability rule: an object that file does not declare is dropped by Replit's
-- publish-time push and never recreated, because this migration is stamped by then.
--
-- Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS trip_destinations (
  id varchar PRIMARY KEY,
  trip_id varchar NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  "position" integer NOT NULL,
  name varchar(255) NOT NULL,
  city varchar(255),
  country varchar(255),
  lat decimal(10, 7),
  lng decimal(10, 7),
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trip_destinations_trip_position_unique
  ON trip_destinations (trip_id, "position");

CREATE INDEX IF NOT EXISTS trip_destinations_trip_idx
  ON trip_destinations (trip_id);

COMMENT ON TABLE trip_destinations IS
  'A plan''s ordered stops (migration 281, ledger 2026-09-04-stops-and-event-time). Position 0 mirrors trips.destination, enforced in the one writer. No rows = not captured: readers fall back to trips.destination. lat/lng NULL = unlocated, never guessed onto a map.';
