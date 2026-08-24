-- CON-B blocker: ai_cost_tracking table to accumulate 4+ weeks of cost data
-- for pricing the $9 power-user tier's included-AI-plan cap (per §4.7).
-- Tracks cost-per-request by sourceType (ai_concierge, ai_optimization, etc.)
-- and model used so admin can later derive per-plan-type cost percentiles.

CREATE TABLE IF NOT EXISTS ai_cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL, -- 'ai_concierge', 'ai_optimization', etc.
  model_used VARCHAR(100), -- e.g. 'claude-3-sonnet', 'gpt-4', null for unknown
  request_id VARCHAR(255), -- link to the request that triggered this cost (if available)
  user_id UUID, -- who initiated the request
  cost NUMERIC(10, 6) NOT NULL, -- cost in USD
  tokens_in INT, -- input tokens
  tokens_out INT, -- output tokens
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_source_type_created
  ON ai_cost_tracking(source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_user_id_created
  ON ai_cost_tracking(user_id, created_at DESC);
