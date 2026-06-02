-- Migration 005: Affiliate reconciliation + AI attribution fields
-- Adds attribution tracking to affiliate_clicks and reconciliation workflow to affiliate_earnings

-- affiliate_clicks: who/what initiated each click
ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS agent_type  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS session_id  VARCHAR(255);

COMMENT ON COLUMN affiliate_clicks.initiated_by IS 'Who initiated the click: user | ai_agent | expert';
COMMENT ON COLUMN affiliate_clicks.agent_type    IS 'Which AI model generated the link: grok | claude | system | NULL';
COMMENT ON COLUMN affiliate_clicks.session_id    IS 'AI planning session trace ID for cross-request attribution';

-- affiliate_earnings: reconciliation workflow fields
ALTER TABLE affiliate_earnings
  ADD COLUMN IF NOT EXISTS partner_reference_id   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reconciliation_status  VARCHAR(20) DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS reconciled_at           TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reconciliation_notes    TEXT,
  ADD COLUMN IF NOT EXISTS external_report_data    JSONB;

COMMENT ON COLUMN affiliate_earnings.partner_reference_id  IS 'Partner''s own booking/transaction ID (from Travelpayouts, Viator, Impact, etc.)';
COMMENT ON COLUMN affiliate_earnings.reconciliation_status IS 'unmatched | matched | disputed | written_off';
COMMENT ON COLUMN affiliate_earnings.reconciled_at         IS 'Timestamp when the record was matched against a partner report';
COMMENT ON COLUMN affiliate_earnings.reconciliation_notes  IS 'Admin notes explaining disputed / written_off status';
COMMENT ON COLUMN affiliate_earnings.external_report_data  IS 'Raw line item from the partner commission report (JSONB)';

-- Back-fill existing rows with the default unmatched status (idempotent)
UPDATE affiliate_earnings
SET reconciliation_status = 'unmatched'
WHERE reconciliation_status IS NULL;
