-- Phase 1b-1: neighborhood tagging foundations (v2 spec §5.1, §10).
-- DDL only. Seed data and backfills ship as separate scripts so this
-- migration is safe to re-run / roll back independently.

CREATE TABLE "city_neighborhoods" (
"id" varchar PRIMARY KEY NOT NULL,
"city" varchar(100) NOT NULL,
"country" varchar(100) NOT NULL,
"name" varchar(100) NOT NULL,
"slug" varchar(100) NOT NULL,
"centroid_lat" numeric(10, 7) NOT NULL,
"centroid_lng" numeric(10, 7) NOT NULL,
"radius_km" numeric(5, 2) DEFAULT '1.50',
"description" text,
"is_featured" boolean DEFAULT false,
"created_at" timestamp DEFAULT now(),
"updated_at" timestamp DEFAULT now(),
CONSTRAINT "city_neighborhoods_city_country_slug_uniq" UNIQUE("city","country","slug")
);
--> statement-breakpoint
ALTER TABLE "provider_services" ADD COLUMN "neighborhood" varchar(100);--> statement-breakpoint
ALTER TABLE "travel_pulse_hidden_gems" ADD COLUMN "neighborhood" varchar(100);
