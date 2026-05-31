#!/bin/bash
set -e

# Only run npm install if package.json changed since last install
if [ ! -d node_modules ] || [ package.json -nt node_modules/.package-lock.json ]; then
  npm install --prefer-offline --no-audit --no-fund
fi

# Pre-apply unique constraints so drizzle-kit doesn't open an interactive /dev/tty prompt.
# Each statement is isolated so a duplicate-object error on one doesn't abort the rest.
psql "$DATABASE_URL" <<'SQL' 2>/dev/null || true
DO $$ BEGIN ALTER TABLE content_analytics ADD CONSTRAINT content_analytics_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE content_flags ADD CONSTRAINT content_flags_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE content_invoices ADD CONSTRAINT content_invoices_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE content_versions ADD CONSTRAINT content_versions_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE expert_templates ADD CONSTRAINT expert_templates_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE expert_tips ADD CONSTRAINT expert_tips_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE platform_revenue ADD CONSTRAINT platform_revenue_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE provider_earnings ADD CONSTRAINT provider_earnings_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE provider_services ADD CONSTRAINT provider_services_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE service_bookings ADD CONSTRAINT service_bookings_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_and_expert_chats ADD CONSTRAINT user_and_expert_chats_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_experiences ADD CONSTRAINT user_experiences_tracking_number_unique UNIQUE (tracking_number); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE local_expert_forms ADD CONSTRAINT local_expert_forms_referral_code_unique UNIQUE (referral_code); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE wallets ADD CONSTRAINT wallets_user_id_unique UNIQUE (user_id); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE tourist_place_category ADD CONSTRAINT tourist_place_category_name_unique UNIQUE (name); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
SQL

# drizzle-kit push — schema already matches, completes without interactive prompts
npx drizzle-kit push --force 2>/dev/null || true
