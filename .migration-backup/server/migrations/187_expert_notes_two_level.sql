-- 187: trip-level traveler-facing Expert Note (CLAUDE.md §21; decision-maker ratified Aug 9 2026).
-- The PER-ITEM half already exists: itinerary_items.expert_note landed in migration 152
-- (Workstation audit C-1) — what was missing was only the Workstation INPUT for it (client work,
-- no schema change). This migration adds the trip-level companion: one delivery note shown at the
-- top of the delivered plan. DISTINCT from trips.expert_notes, which remains the Workstation's
-- PRIVATE build notes — never merge them. Additive nullable, idempotent, no CHECK (house
-- posture). Declared in shared/schema.ts in the same commit (publish-trap rule).

ALTER TABLE trips ADD COLUMN IF NOT EXISTS expert_traveler_note text;
