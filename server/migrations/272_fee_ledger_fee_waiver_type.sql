-- 272_fee_ledger_fee_waiver_type.sql
-- Ruling 2026-09-02-traveler-fee-applies-everywhere (BLOCKER 1, condition 1).
--
-- Adds the `fee_waiver` fee_type to fee_ledger so Trip-Pass / rails suppression of the traveler
-- service fee can be recorded as a TWO-ROW NET-ZERO event — `traveler_service_fee (+X)` plus a
-- negative `fee_waiver (-X)` tagged `covered_by` in metadata — WITHOUT relaxing the migration-179
-- `amount <> 0` CHECK (a literal $0 row stays forbidden). See docs/DECISIONS.md.
--
-- Why a NEW type and not `credit_applied`: the coordination-credit balance system is live
-- (claimCoordinationCredit, migrations 126/127) and is `credit_applied`'s legitimate future owner.
-- A waiver is not a credit; collapsing them is the meaning-collision class the ruling forbids.
--
-- ADDITIVE and SAFE against the publish-time push: this only DROPs+re-ADDs a CHECK constraint (raw
-- SQL the drizzle-kit push does not model), never a table or an index, so the §CLAUDE.md deploy-push
-- trap (which drops undeclared tables/indexes) does not apply. The matching `FEE_LEDGER_TYPES` const
-- in shared/schema.ts is updated in the same change so the TS type and the DB CHECK stay equivalent.
-- No pre-existing row can violate the widened set (it only adds a permitted value), so no
-- CHECK-over-legacy-values publish failure.

ALTER TABLE fee_ledger DROP CONSTRAINT IF EXISTS fee_ledger_fee_type;

ALTER TABLE fee_ledger ADD CONSTRAINT fee_ledger_fee_type CHECK (fee_type IN (
  'traveler_service_fee',
  'provider_commission_full',
  'provider_commission_rails',
  'expert_commission',
  'ai_concierge_fee',
  'affiliate_margin',
  'credit_applied',
  'fee_waiver',
  'reversal'
));
