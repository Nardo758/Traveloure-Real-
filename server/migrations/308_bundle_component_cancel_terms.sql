-- Migration 308: THE TRAVELER-CANCELLED COMPONENT FOLLOWS THE SNAPSHOTTED CANCELLATION POLICY AND DEADLINE.
-- Decision-maker ruling 2026-09-16 (CLAUDE.md Locked Decision 50, third paragraph, second sentence):
-- "when the traveler voluntarily cancels an outstanding component, the component's allocated amount
-- follows the snapshotted cancellation policy and deadline." Ledger `2026-09-16-bundle-component-traveler-cancel`.
-- The partial-settlement lane (migration 307) built the seller-FAILURE half and REFUSED a `cancelled`
-- component by name (`traveler_cancel_path_not_built`) because no writer existed and no policy outcome
-- was recorded anywhere a settlement could read. This migration records that outcome.
--
-- Every object below is ADDITIVE, with NO DEFAULT and NO DB CHECK (the
-- migration-181/195/273/275/276/277/279/280/281/282/284/287/295/297/301/302/303/304/305/306/307 posture —
-- a CHECK here is exactly the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention
-- rules warn about), and NO BACKFILL. Both columns are ALSO declared in `shared/schema.ts` in this same
-- commit per the deploy-push durability rule: an object `schema.ts` does not declare is dropped by
-- Replit's publish-time push and NEVER recreated, because the migration is already stamped.
--
-- No CHECK is added or changed, so `scripts/preflight-prod-constraints.cjs` needs no new
-- `CONSTRAINT_MANIFEST` entry and the publish-time push has nothing to fail on.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHERE THE SNAPSHOT ALREADY LIVES, AND WHY THIS ADDS ONE FIELD RATHER THAN TWO
-- ─────────────────────────────────────────────────────────────────────────────
-- The POLICY TIER the traveler bought under is already on the parent row:
-- `service_bookings.offering_contract_snapshot.policy.cancellationPolicyType` (migration 291, taken at
-- birth from the BUNDLE listing — the one listing the traveler contracted with; a component listing's
-- own policy was never shown to them). The DEADLINE is the booking's own scheduled start
-- (`booking_details.scheduledDate`), read through the SAME parse the whole-row cancellation quote uses,
-- so a component cancel and a whole-booking cancel at the same instant resolve the same tier. Neither
-- needs a per-component copy. What NO row held was the policy's OUTCOME at the instant the traveler
-- cancelled — and that instant is what the policy is a function of.
--
-- `cancel_refund_percent` — the refund percent the snapshotted tier yielded at `cancelled_at`, written
-- in the SAME atomic UPDATE that moves the row `pending → cancelled`, so a cancelled row can never lack
-- it. It is the ONE resolver's output (`refundPercentFor`, the terms §8.1 schedule) pinned at the
-- moment it was applied: the D-35 mint and the D-51 settlement both READ it and never re-resolve, so a
-- later reschedule, a later policy edit and a later clock cannot move what the traveler was told.
-- The refunded cents are DERIVED from it and the row's own `allocation_cents` (`cancelledComponentRefundCents`,
-- one pure function, deterministic rounding) — a percent cannot disagree with the allocation it applies
-- to, which is why the percent is pinned and not the cents. NULL = the row was never cancelled by the
-- traveler under this rail, and a row reading `cancelled` with NULL here is REFUSED by the settlement
-- (`cancel_terms_missing`, §13) — never settled under a guessed tier.
--
-- `cancel_reason` — the traveler's own words from the `.strict()` body, stored verbatim; NULL = none
-- given, never "no reason". The `failed_at`/`failure_reason` pair is the seller's statement; this is
-- the traveler's, and the two are never merged.

ALTER TABLE booking_component_states ADD COLUMN IF NOT EXISTS cancel_refund_percent INTEGER;
ALTER TABLE booking_component_states ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN booking_component_states.cancel_refund_percent IS
  'Ledger 2026-09-16-bundle-component-traveler-cancel (Locked Decision 50): the refund percent the SNAPSHOTTED cancellation policy (service_bookings.offering_contract_snapshot.policy) yielded against the booking''s scheduled start at the instant the traveler cancelled this component (cancelled_at). Pinned in the same atomic UPDATE as the pending -> cancelled flip; the settlement and the reduced mint read it and never re-resolve. Refund cents = allocation_cents x percent / 100 (one pure function). NULL = never traveler-cancelled under this rail; a cancelled row with NULL here is refused by the settlement (cancel_terms_missing).';

COMMENT ON COLUMN booking_component_states.cancel_reason IS
  'Ledger 2026-09-16-bundle-component-traveler-cancel: the traveler''s own reason for cancelling this component, verbatim from the .strict() body. NULL = none given (never "no reason"). The seller''s failure_reason is a different person''s statement and is never merged with this.';
