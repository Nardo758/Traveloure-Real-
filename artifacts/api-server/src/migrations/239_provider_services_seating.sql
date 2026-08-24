-- 239_provider_services_seating.sql
--
-- Capacity-step "Seating" (create-flow mock fidelity, decision-maker ratified Aug 17 2026).
--
-- The ratified mock's Capacity step (mock-06-create-step3-capacity) draws a two-column row:
-- "Party size [min] to [max]" | "Seating" (Private — one party at a time / Shared — I will seat
-- several parties together), with the help "Asked once, here, and rendered on the traveler's page
-- in these words." Party size already had columns (party_size_min/max); Seating had none, so the
-- flow could not ask it and nothing could render it — the drawn-and-never-collected class ledger
-- 2026-08-16-bring-access named.
--
-- ADDITIVE-NULLABLE, NO DB CHECK — the migration-181/195/228 posture, chosen deliberately to
-- avoid the Replit publish-time CHECK trap documented in CLAUDE.md. The 'private'|'shared' shape
-- is app-enforced (insertProviderServiceSchema floor + the wizard's own two-option select). NULL
-- means "the provider never answered" and the row is OMITTED from the traveler surface (§13); it
-- never becomes a guessed default. Owner-authored descriptive content (no amount, identity, rate
-- or authorization grant), so §19's mass-assignment strip does not apply.
--
-- Declared in shared/schema.ts per the publish-trap rule (an object the code depends on must be
-- in the schema or the deploy push is authoritative and will remove it).

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS seating VARCHAR(16);

COMMENT ON COLUMN provider_services.seating IS
  'Capacity-step seating arrangement: ''private'' (one party at a time) | ''shared'' (several parties seated together). App-enforced, no DB CHECK. NULL = never answered — omitted from traveler surfaces (§13), never a guessed default.';
