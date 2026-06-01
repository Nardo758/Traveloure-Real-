-- Additive migration: add revenue_share_rate column to provider_services
-- Safe to run on an existing database (uses IF NOT EXISTS / DO block guards)

ALTER TABLE "provider_services"
  ADD COLUMN IF NOT EXISTS "revenue_share_rate" numeric(4,2) DEFAULT 0.30;
