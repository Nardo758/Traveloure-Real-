-- Migration 321: A SUGGESTION MAY NAME THE LISTING IT SUGGESTS.
--
-- Ledger `2026-09-24-suggestion-names-listing`. CLAUDE.md Locked Decision 52 (booking on behalf,
-- option B; decision-maker ratified Sep 24, 2026). §13, §14, §19, §20.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS MISSING
-- ─────────────────────────────────────────────────────────────────────────────
-- An expert or booking concierge on a plan can SUGGEST an item (`trip_suggestions`), and the
-- traveler's approval materializes it as an `itinerary_items` row — but the suggestion carried only
-- free text, so the item it made named no `provider_services` listing and nothing on it could be
-- bought on Traveloure. "Suggest this bookable listing" had no column to say which listing.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SHAPE
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE column, additive, NULLABLE, NO DEFAULT, NO CHECK (the 181/195/273/.../314 posture — a CHECK
-- is exactly the publish-time drizzle-push failure the Coordination Prevention rules warn about).
-- ON DELETE SET NULL: a listing that is later deleted must never delete the suggestion or the
-- conversation around it. NO BACKFILL: every suggestion on disk was written as free text, and NULL
-- ("names no listing") is the honest reading of it (§13).
--
-- The column is SERVER-VERIFIED at create (the listing must be approved and active — the public
-- read gate) and never trusted from a body beyond that (§14). It is DECLARED in
-- `shared/schema.ts` in this same commit (deploy-push durability rule).
--
-- `preflight-prod-constraints.cjs`: no CHECK is added or changed, so no manifest entry is needed.
-- Column-only, so it is §20's one approvable publish prompt.
--
-- Idempotent; safe to re-run.

ALTER TABLE trip_suggestions
  ADD COLUMN IF NOT EXISTS provider_service_id VARCHAR
    REFERENCES provider_services(id) ON DELETE SET NULL;

COMMENT ON COLUMN trip_suggestions.provider_service_id IS
  'Ledger 2026-09-24-suggestion-names-listing: the platform listing this suggestion proposes, verified approved+active at create. NULL = a free-text suggestion; never backfilled.';
