-- Migration: Add visa_requirements_cache table and booking_metadata columns
-- Safe to run on both fresh and already-migrated databases (IF NOT EXISTS guards)

-- 1. Visa requirements cache (7-day TTL, keyed by passport+destination)
CREATE TABLE IF NOT EXISTS "visa_requirements_cache" (
  "id" varchar PRIMARY KEY NOT NULL,
  "passport_country" varchar(100) NOT NULL,
  "destination_country" varchar(100) NOT NULL,
  "visa_required" boolean NOT NULL,
  "visa_types" jsonb DEFAULT '[]'::jsonb,
  "required_documents" jsonb DEFAULT '[]'::jsonb,
  "processing_time" varchar(200),
  "fee_range" varchar(200),
  "disclaimer" text,
  "cached_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 2. booking_metadata on bookings table (cart-flow visa intake data)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "booking_metadata" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint

-- 3. booking_metadata on service_bookings table (direct service-booking visa intake data)
ALTER TABLE "service_bookings" ADD COLUMN IF NOT EXISTS "booking_metadata" jsonb DEFAULT '{}'::jsonb;
