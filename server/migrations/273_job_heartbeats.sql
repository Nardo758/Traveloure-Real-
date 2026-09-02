-- 273_job_heartbeats.sql (renumbered from 271; main landed 271_expert_neighborhood_claims first) — internal-jobs-hardening, L6.
-- Additive only, no CHECK (publish-trap posture); declared in shared/schema.ts in this same
-- commit per the deploy-push durability rule. One row per job name, upserted by runJob on ok:true.
CREATE TABLE IF NOT EXISTS job_heartbeats (
  job_name         varchar(80) PRIMARY KEY,
  last_success_at  timestamp NOT NULL,
  last_result      jsonb,
  updated_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_heartbeats_last_success_at ON job_heartbeats (last_success_at);
