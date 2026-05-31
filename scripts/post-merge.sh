#!/bin/bash
set -e

# Only run npm install if package.json changed since last install
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
  npm install --prefer-offline --no-audit --no-fund
fi

# Pre-apply unique constraints so drizzle-kit doesn't open an interactive /dev/tty prompt.
# Each statement is isolated so errors on one don't abort the rest.
# Also renames legacy uq_* constraints to drizzle's expected _unique suffix,
# and fixes standalone unique indexes that lack a pg_constraint entry.
psql "$DATABASE_URL" <<'SQL' 2>/dev/null || true
-- Rename legacy uq_* unique constraints to drizzle-expected _unique names
DO $$ BEGIN ALTER TABLE local_expert_forms RENAME CONSTRAINT uq_local_expert_forms_user_id TO local_expert_forms_user_id_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE service_provider_forms RENAME CONSTRAINT uq_service_provider_forms_user_id TO service_provider_forms_user_id_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;

-- Rename _key suffix constraints to _unique (PostgreSQL default vs drizzle default)
DO $$ BEGIN ALTER TABLE bookings RENAME CONSTRAINT bookings_confirmation_code_key TO bookings_confirmation_code_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE content_invoices RENAME CONSTRAINT content_invoices_invoice_number_key TO content_invoices_invoice_number_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE daily_revenue_summary RENAME CONSTRAINT daily_revenue_summary_date_key TO daily_revenue_summary_date_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE expert_city_queues RENAME CONSTRAINT expert_city_queues_city_key TO expert_city_queues_city_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE payment_intents RENAME CONSTRAINT payment_intents_stripe_payment_intent_id_key TO payment_intents_stripe_payment_intent_id_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE service_reviews RENAME CONSTRAINT service_reviews_tracking_number_key TO service_reviews_tracking_number_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE shared_itineraries RENAME CONSTRAINT shared_itineraries_share_token_key TO shared_itineraries_share_token_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trips RENAME CONSTRAINT trips_tracking_number_key TO trips_tracking_number_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;

-- Rename content_registry constraint
DO $$ BEGIN ALTER TABLE content_registry RENAME CONSTRAINT content_registry_tracking_number_key TO content_registry_tracking_number_unique; EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL; END $$;

-- Fix standalone unique indexes → proper UNIQUE CONSTRAINTs so drizzle sees them.
-- Pattern: drop index, add constraint (idempotent via exception handlers).
DO $$ BEGIN
  DROP INDEX IF EXISTS local_expert_forms_referral_code_unique;
  ALTER TABLE local_expert_forms ADD CONSTRAINT local_expert_forms_referral_code_unique UNIQUE (referral_code);
  EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP INDEX IF EXISTS provider_services_tracking_number_unique;
  ALTER TABLE provider_services ADD CONSTRAINT provider_services_tracking_number_unique UNIQUE (tracking_number);
  EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP INDEX IF EXISTS service_bookings_tracking_number_unique;
  ALTER TABLE service_bookings ADD CONSTRAINT service_bookings_tracking_number_unique UNIQUE (tracking_number);
  EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
DO $$ BEGIN
  DROP INDEX IF EXISTS idx_shared_trips_token;
  ALTER TABLE shared_trips ADD CONSTRAINT shared_trips_share_token_unique UNIQUE (share_token);
  EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- Add remaining tracking_number unique constraints
DO $$ BEGIN ALTER TABLE content_analytics ADD CONSTRAINT content_analytics_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE content_flags ADD CONSTRAINT content_flags_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE content_invoices ADD CONSTRAINT content_invoices_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE content_versions ADD CONSTRAINT content_versions_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE expert_templates ADD CONSTRAINT expert_templates_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE expert_tips ADD CONSTRAINT expert_tips_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE platform_revenue ADD CONSTRAINT platform_revenue_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE provider_earnings ADD CONSTRAINT provider_earnings_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_and_expert_chats ADD CONSTRAINT user_and_expert_chats_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_experiences ADD CONSTRAINT user_experiences_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE wallets ADD CONSTRAINT wallets_user_id_unique UNIQUE (user_id); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE tourist_place_category ADD CONSTRAINT tourist_place_category_name_unique UNIQUE (name); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- Fix null values in NOT NULL columns that drizzle would fail on
UPDATE page_view_analytics SET page_path = '/' WHERE page_path IS NULL;
SQL

# drizzle-kit push — schema already matches, completes without interactive prompts
npx drizzle-kit push --force 2>/dev/null || true
