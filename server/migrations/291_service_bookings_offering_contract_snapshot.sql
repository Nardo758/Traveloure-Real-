-- 291 · service_bookings.offering_contract_snapshot
--
-- Lane OC-B1 of `docs/superpowers/specs/2026-09-11-offering-commerce-contract-implementation-plan.md`,
-- implementing §14.1 of the design. Ledger `2026-09-12-offering-contract-snapshot`.
--
-- WHAT IT HOLDS: the behaviour-changing TERMS a traveler actually committed under — the resolved
-- `OfferingCommerceContract` (or the machine-readable reason it could not be resolved), the listing
-- facts that produced it, and the listing's cancellation policy type at that moment. Completion,
-- settlement and reversal (OC-D1/D2/D3) branch on what was true THEN rather than on a listing that
-- has since changed.
--
-- POSTURE (CLAUDE.md Coordination Prevention, the publish-trap rule):
--   · ADDITIVE and NULLABLE. NO DEFAULT and NO DB CHECK — the value sets inside the jsonb are
--     app-enforced, and a CHECK over a new vocabulary is the publish-time drizzle-push failure that
--     has bitten this repository repeatedly.
--   · DECLARED in `shared/schema.ts` in the same commit, or the deploy push drops the column and
--     this migration — already stamped — never recreates it.
--   · NO BACKFILL. NULL means NEVER SNAPSHOTTED, which is a fact about a row committed before this
--     lane; re-deriving a contract for it out of today's listing would manufacture the exact thing
--     the snapshot exists to prevent (§13). A pre-lane row keeps being read the way it WAS charged,
--     through `travelerChargeForRow`'s existing presence-discriminator.
--   · No amount, rate, fee or status is touched. This migration adds one nullable column and
--     nothing else, so `scripts/preflight-prod-constraints.cjs` needs no new manifest entry.

ALTER TABLE service_bookings
  ADD COLUMN IF NOT EXISTS offering_contract_snapshot jsonb;
