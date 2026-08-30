-- 245_demand_onepager_approvals.sql
--
-- Partner Demand Phase 4 · R32 (ledger 2026-08-20-partner-demand-onepager-lifecycle). The admin
-- control persists ONLY the approval DECISION — the recruitment one-pager PDF is regenerated
-- deterministically on demand (generateOnepagerDraft), so no PDF blob is stored.
--
--   market_slug       real operating-market slug; UNIQUE — one approval per market.
--   variant           the approved variant ('property-led' | 'service-led'; app-enforced, no CHECK).
--   approved_by        the admin who approved (FK users, ON DELETE SET NULL — keep the record).
--   approved_at        when approval was granted.
--   template_version   ONEPAGER_TEMPLATE_VERSION at approval — approval is KEPT only while it still
--                      matches the current template AND the market still clears its floor; the
--                      re-validation job DELETES a row that fails either (honest withdraw).
--
-- A row EXISTS iff the market's one-pager is APPROVED. Additive table, NO CHECK (publish-safe);
-- declared in shared/schema.ts per the publish-trap rule.

CREATE TABLE IF NOT EXISTS demand_onepager_approvals (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  market_slug      VARCHAR(40) NOT NULL UNIQUE,
  variant          VARCHAR(20) NOT NULL,
  approved_by      VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMP   NOT NULL DEFAULT now(),
  template_version INTEGER     NOT NULL,
  created_at       TIMESTAMP   DEFAULT now(),
  updated_at       TIMESTAMP   DEFAULT now()
);

COMMENT ON TABLE demand_onepager_approvals IS
  'Partner Demand Phase 4 R32 — admin one-pager approval decisions (draft PDF regenerated on demand, no blob stored). Approval kept only while template_version matches and the market still clears its floor.';
