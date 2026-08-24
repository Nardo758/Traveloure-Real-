-- Migration 206: cart_items.party_size — the traveler's confirmed party count.
-- docs/DECISIONS.md ruling 83 (lane T2 — the D7 booking-eligibility consumers).
--
-- The D7 party-size gate (party_size_min / party_size_max on provider_services, migration 195) needs
-- a party-count INPUT to validate against; the checkout/cart flow captured none (cart_items.quantity
-- is "number of the service"/price-multiplier and is meaningless for a per-group listing — using it
-- as a party count would misgate, §13). So T2 adds a minimal, honest input on the SAME pattern B1
-- used for the pickup location: additive-nullable, written owner-gated via PATCH /api/cart/:id, read
-- SERVER-SIDE at checkout. It is the traveler's own booking input (like scheduled_date/notes), never a
-- money field — no amount/rate is derived from it, only eligibility.
--
-- NULL = the honest "the traveler never told us" state on every pre-206 row (§13): with no party
-- count, the party-size gate does NOT apply — an unset input is never a fabricated bound.
--
-- Additive nullable column ONLY. NO DB CHECK (the migration-195 posture — a CHECK here is the
-- publish-time deploy-push failure CLAUDE.md warns about). Also DECLARED in shared/schema.ts so the
-- Replit deploy-push cannot drop it (publish-trap rule). Idempotent.

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS party_size integer;
