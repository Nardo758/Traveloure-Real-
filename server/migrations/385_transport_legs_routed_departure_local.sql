-- 385 — transport_legs.routed_departure_local (9b-b; ledger `2026-10-16-9b-b-legs-off-google`; 9b spec v1.0 ED2,
-- Phase 0 ruling 6). HELD: applies only after Leon's approval comment on the PR that carries it.
--
-- ONE nullable column, added and nothing else: no DEFAULT, no CHECK, no FK, no index, nothing altered, no backfill.
-- The departure a routed leg was routed FOR, as plan-timezone wall-clock "HH:MM" (the zone is the plan's
-- trips.timezone, LD 30), stored verbatim and never converted. Its one writer is the routing engine
-- (server/services/routing/plan-legs-engine.service.ts), set alongside `source`. NULL = not recorded (every leg
-- written before 385, and every leg no engine wrote). Declared in shared/schema.ts (deploy-push durability rule).
-- IF NOT EXISTS, so a second run is a no-op.
ALTER TABLE transport_legs ADD COLUMN IF NOT EXISTS routed_departure_local text;
