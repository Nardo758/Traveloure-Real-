-- Migration 238: add collects_and_drops to provider_services
-- Tracks whether the provider intends to collect travelers and return them (pickup toggle
-- from the Logistics step of the service wizard). Additive boolean, default false.
-- NULL-safe: existing rows get false without a table rewrite (column default applies).

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS collects_and_drops boolean DEFAULT false;
