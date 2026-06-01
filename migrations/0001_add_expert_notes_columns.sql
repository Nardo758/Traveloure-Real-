-- Additive migration: add Expert Notes columns
-- Safe to run on an existing database (uses IF NOT EXISTS guards)

ALTER TABLE "provider_services"
  ADD COLUMN IF NOT EXISTS "includes_expert_notes" boolean DEFAULT false NOT NULL;

ALTER TABLE "local_expert_forms"
  ADD COLUMN IF NOT EXISTS "expert_notes_style" text;
