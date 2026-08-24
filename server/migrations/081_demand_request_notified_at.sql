-- Migration 081: Add notified_at column to service_demand_requests.
--
-- Source-branch file: 069_demand_request_notified_at.sql
--
-- Adds the notified_at timestamp column to service_demand_requests so the
-- platform can track when experts/providers were last notified of an open
-- demand request. Prevents duplicate notification emails and lets the
-- notification scheduler skip recently-notified rows.
--
-- Migration 080 already includes this column in its CREATE TABLE statement,
-- so this ALTER is a no-op on any environment that ran 080 first. It is only
-- needed on environments where 068 (the original source-branch file) ran
-- without the notified_at column being present in that version.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; safe to re-run.

ALTER TABLE service_demand_requests
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP;
