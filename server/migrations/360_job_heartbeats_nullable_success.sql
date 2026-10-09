-- HELD / UNREGISTERED. Part 3 development verification only.
-- Founder release approval is separate. Do not apply to production.
-- A first failed commerce sweep has no real success time.
ALTER TABLE job_heartbeats ALTER COLUMN last_success_at DROP NOT NULL;
