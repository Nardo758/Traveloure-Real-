-- Migration 157: give `user_and_expert_contracts` an owner, so its two live read
-- endpoints can be gated.
--
-- THE HOLE THIS EXISTS TO CLOSE. The table has a live writer and two live readers, and
-- no ownership column of any kind:
--   • WRITER: server/routes/payments.routes.ts (`/api/checkout`) creates ONE contract row
--     per cart item, carrying the service name, the trip destination, the traveler's
--     free-text notes and the amount.
--   • READER 1: `GET /api/expert/contracts/recent` (experts.routes.ts) reads `expertId`
--     off the session and then NEVER USES IT — it returns the 20 most recent contracts
--     platform-wide to any authenticated caller. No id guessing required.
--   • READER 2: `GET /api/contracts/:id` (routes.ts) returns any contract row by id to any
--     authenticated caller, with no ownership check at all.
-- Because `storage.createContract` never recorded a principal, there was nothing to filter
-- on — the gate could not be written without this column. That is why this is a migration
-- and not a two-line auth fix.
--
-- COLUMN NAMING (deliberate, not incidental): the counterparty on a contract is the owner of
-- the booked service, who may be an `expert` OR a `service_provider`. Naming the column
-- `expert_id` — which the table's own name would suggest — would be false for every
-- provider-owned booking, the same class of error as the role-vocabulary audit
-- (`users.role` stores "service_provider", never bare "provider"). So: `earner_id`.
--
-- DEPLOY-SAFE POSTURE (CLAUDE.md "Replit deploy-push"): both columns are ADDITIVE and
-- NULLABLE, with NO CHECK, NO NOT NULL and NO DEFAULT. Nothing to remap, nothing for the
-- publish-time drizzle push to fail on, nothing to add to the preflight CONSTRAINT_MANIFEST.
-- The matching declaration goes in `shared/schema.ts` in the same commit — per the same
-- CLAUDE.md note, an object the code depends on but the schema does not declare is one the
-- deploy push is authoritative over and will remove.
--
-- ON DELETE SET NULL, not CASCADE: a contract is a financial artifact. Deleting a user must
-- not delete the record that money changed hands — it should only orphan its attribution,
-- which the read gate then treats as admin-only (see the backfill note below).

ALTER TABLE user_and_expert_contracts
  ADD COLUMN IF NOT EXISTS traveler_id VARCHAR;

ALTER TABLE user_and_expert_contracts
  ADD COLUMN IF NOT EXISTS earner_id VARCHAR;

-- FKs added separately + idempotently: the columns may already exist from a publish-time
-- drizzle push (which creates the column but not necessarily under these constraint names),
-- and the migration runner is fail-fast. Same guard shape as migration 117.
DO $$
BEGIN
  ALTER TABLE user_and_expert_contracts
    ADD CONSTRAINT user_and_expert_contracts_traveler_id_fkey
    FOREIGN KEY (traveler_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE user_and_expert_contracts
    ADD CONSTRAINT user_and_expert_contracts_earner_id_fkey
    FOREIGN KEY (earner_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

-- BACKFILL — a deterministic join, NOT a heuristic. This is the part worth reading.
--
-- The checkout writer stamps `service_bookings.contract_id = contract.id` on the very booking
-- row it creates alongside each contract, and that booking already carries `traveler_id`
-- (the buyer) and `provider_id` (the service owner). So historical attribution is not
-- guesswork from timestamps or amounts — it is a foreign-key join that recovers the exact
-- two principals the checkout had in scope. Nothing is inferred and nothing is fabricated.
--
-- Contracts with no booking row keep BOTH columns NULL. That is the honest state: we do not
-- know who owns them, and the read gate is written so NULL is visible to admins only — an
-- unattributable financial artifact is precisely what should not be shown to a guessing
-- caller. (`WHERE ... IS NULL` also makes this idempotent: a re-run touches nothing.)
UPDATE user_and_expert_contracts c
SET traveler_id = b.traveler_id,
    earner_id   = b.provider_id
FROM service_bookings b
WHERE b.contract_id = c.id
  AND c.traveler_id IS NULL
  AND c.earner_id IS NULL;

-- Read-path indexes: both gated readers filter on exactly these columns.
CREATE INDEX IF NOT EXISTS idx_uaec_earner_created
  ON user_and_expert_contracts (earner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_uaec_traveler_created
  ON user_and_expert_contracts (traveler_id, created_at DESC);

DO $$
DECLARE
  total INT;
  attributed INT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE earner_id IS NOT NULL)
    INTO total, attributed FROM user_and_expert_contracts;
  RAISE NOTICE 'migration 157: % of % contract rows attributed via service_bookings.contract_id; the remainder stay NULL (admin-only by the read gate).', attributed, total;
END $$;
