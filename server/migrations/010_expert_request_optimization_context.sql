ALTER TABLE expert_requests
  ADD COLUMN IF NOT EXISTS optimization_context jsonb;
