-- Migration: Add DMO Content Layer (Expert Workspace)
-- Date: 2026-06-13
-- Tables: dmo_sources, dmo_raw_content, expert_dmo_collections, expert_dmo_collection_items, expert_dmo_edits, content_gap_alerts, dmo_scrape_jobs
-- Architecture: All DMO content routes to Expert Workspace first. Discover page is gated by expert review.

-- 1. DMO Sources Registry
CREATE TABLE IF NOT EXISTS "dmo_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"source_type" varchar(30) DEFAULT 'scraped' NOT NULL,
	"market" varchar(100) NOT NULL,
	"market_region" varchar(100) NOT NULL,
	"api_endpoint" text,
	"api_docs_url" text,
	"partner_portal_url" text,
	"scrape_config" jsonb DEFAULT '{}',
	"confidence" varchar(30) DEFAULT 'scraped' NOT NULL,
	"attribution_required" boolean DEFAULT false,
	"attribution_text" text,
	"is_active" boolean DEFAULT true,
	"last_ingested_at" timestamp,
	"total_records" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "dmo_sources_domain_market_unique" UNIQUE("domain","market")
);

-- 2. Raw DMO Content (The Ingestion Pipeline)
CREATE TABLE IF NOT EXISTS "dmo_raw_content" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar NOT NULL,
	"external_id" varchar(255),
	"content_type" varchar(30) DEFAULT 'attraction' NOT NULL,
	"status" varchar(30) DEFAULT 'pending_expert_review' NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255),
	"description" text,
	"short_description" text,
	"country" varchar(100) NOT NULL,
	"city" varchar(100) NOT NULL,
	"neighborhood" varchar(100),
	"latitude" decimal(10,7),
	"longitude" decimal(10,7),
	"address" text,
	"raw_data" jsonb DEFAULT '{}' NOT NULL,
	"extracted_data" jsonb DEFAULT '{}',
	"normalized_data" jsonb DEFAULT '{}',
	"images" jsonb DEFAULT '[]',
	"primary_image_url" text,
	"tags" jsonb DEFAULT '[]',
	"categories" jsonb DEFAULT '[]',
	"event_types" jsonb DEFAULT '[]',
	"source_url" text NOT NULL,
	"source_page_title" text,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"scraped_by" varchar(255),
	"license" varchar(30) DEFAULT 'unknown',
	"confidence_score" decimal(3,2) DEFAULT '0.5',
	"data_quality_flags" jsonb DEFAULT '[]',
	"expert_reviewed_at" timestamp,
	"expert_reviewed_by" varchar,
	"expert_notes" text,
	"expert_modified_data" jsonb DEFAULT '{}',
	"expert_workspace_visible" boolean DEFAULT true NOT NULL,
	"discover_page_visible" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"published_by" varchar,
	"embedding_vector" jsonb,
	"ai_summary" text,
	"ai_suggested_tags" jsonb DEFAULT '[]',
	"search_vector" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "dmo_raw_content_source_url_unique" UNIQUE("source_url","source_id")
);

-- 3. Expert DMO Collections (Expert's curated subsets from DMO Library)
CREATE TABLE IF NOT EXISTS "expert_dmo_collections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expert_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"market" varchar(100) NOT NULL,
	"content_type_filter" varchar(30),
	"tag_filter" jsonb DEFAULT '[]',
	"is_public" boolean DEFAULT false,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- 4. Expert DMO Collection Items (Links collections to raw content)
CREATE TABLE IF NOT EXISTS "expert_dmo_collection_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" varchar NOT NULL,
	"raw_content_id" varchar NOT NULL,
	"expert_notes" text,
	"expert_rating" integer,
	"custom_tags" jsonb DEFAULT '[]',
	"added_at" timestamp DEFAULT now(),
	CONSTRAINT "expert_dmo_collection_items_unique" UNIQUE("collection_id","raw_content_id")
);

-- 5. Expert DMO Edits (Expert enrichments and overrides to raw content)
CREATE TABLE IF NOT EXISTS "expert_dmo_edits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_content_id" varchar NOT NULL,
	"expert_id" varchar NOT NULL,
	"edited_name" varchar(255),
	"edited_description" text,
	"edited_short_description" text,
	"edited_images" jsonb DEFAULT '[]',
	"added_images" jsonb DEFAULT '[]',
	"edited_tags" jsonb DEFAULT '[]',
	"edited_categories" jsonb DEFAULT '[]',
	"edited_event_types" jsonb DEFAULT '[]',
	"edited_pricing" jsonb DEFAULT '{}',
	"edited_capacity" jsonb DEFAULT '{}',
	"edited_hours" jsonb DEFAULT '{}',
	"edited_address" text,
	"edited_latitude" decimal(10,7),
	"edited_longitude" decimal(10,7),
	"vendor_links" jsonb DEFAULT '[]',
	"edit_status" varchar(20) DEFAULT 'draft' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- 6. Content Gap Alerts (AI-generated missing content alerts)
CREATE TABLE IF NOT EXISTS "content_gap_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" varchar(100) NOT NULL,
	"city" varchar(100),
	"content_type" varchar(30) NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"gap_description" text NOT NULL,
	"missing_count" integer,
	"existing_count" integer,
	"benchmark_market" varchar(100),
	"ai_suggested_sources" jsonb DEFAULT '[]',
	"ai_generated_draft" jsonb DEFAULT '{}',
	"assigned_expert_id" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"is_auto_generated" boolean DEFAULT true,
	"generated_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- 7. DMO Scrape Jobs (AI scraping job tracking)
CREATE TABLE IF NOT EXISTS "dmo_scrape_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar,
	"job_type" varchar(30) DEFAULT 'search_extract' NOT NULL,
	"market" varchar(100) NOT NULL,
	"query" text,
	"target_urls" jsonb DEFAULT '[]',
	"start_url" text,
	"include_paths" jsonb DEFAULT '[]',
	"exclude_paths" jsonb DEFAULT '[]',
	"max_depth" integer DEFAULT 2,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"total_urls" integer DEFAULT 0,
	"processed_urls" integer DEFAULT 0,
	"failed_urls" integer DEFAULT 0,
	"records_created" integer DEFAULT 0,
	"records_updated" integer DEFAULT 0,
	"error_message" text,
	"error_details" jsonb DEFAULT '{}',
	"tool_used" varchar(30) DEFAULT 'firecrawl',
	"tool_job_id" varchar(255),
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"credits_consumed" integer DEFAULT 0,
	"estimated_cost" decimal(10,4),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Foreign Keys.
-- Guarded with DO/EXCEPTION so the migration is idempotent: the tables + these
-- constraints may already exist from a Replit publish-time drizzle-kit push (which
-- builds from shared/schema.ts), and the runner is fail-fast — a bare "constraint
-- already exists" would block startup. duplicate_object is swallowed; any other
-- error still surfaces.
DO $$ BEGIN
  ALTER TABLE "dmo_raw_content" ADD CONSTRAINT "dmo_raw_content_source_id_dmo_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "dmo_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "dmo_raw_content" ADD CONSTRAINT "dmo_raw_content_expert_reviewed_by_users_id_fk" FOREIGN KEY ("expert_reviewed_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "dmo_raw_content" ADD CONSTRAINT "dmo_raw_content_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "expert_dmo_collections" ADD CONSTRAINT "expert_dmo_collections_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "expert_dmo_collection_items" ADD CONSTRAINT "expert_dmo_collection_items_collection_id_expert_dmo_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "expert_dmo_collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "expert_dmo_collection_items" ADD CONSTRAINT "expert_dmo_collection_items_raw_content_id_dmo_raw_content_id_fk" FOREIGN KEY ("raw_content_id") REFERENCES "dmo_raw_content"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "expert_dmo_edits" ADD CONSTRAINT "expert_dmo_edits_raw_content_id_dmo_raw_content_id_fk" FOREIGN KEY ("raw_content_id") REFERENCES "dmo_raw_content"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "expert_dmo_edits" ADD CONSTRAINT "expert_dmo_edits_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "expert_dmo_edits" ADD CONSTRAINT "expert_dmo_edits_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "content_gap_alerts" ADD CONSTRAINT "content_gap_alerts_assigned_expert_id_users_id_fk" FOREIGN KEY ("assigned_expert_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dmo_scrape_jobs" ADD CONSTRAINT "dmo_scrape_jobs_source_id_dmo_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "dmo_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS "dmo_raw_content_market_idx" ON "dmo_raw_content" ("country","city","content_type");
CREATE INDEX IF NOT EXISTS "dmo_raw_content_status_idx" ON "dmo_raw_content" ("status","expert_workspace_visible");
CREATE INDEX IF NOT EXISTS "dmo_raw_content_source_id_idx" ON "dmo_raw_content" ("source_id");
CREATE INDEX IF NOT EXISTS "dmo_raw_content_scraped_at_idx" ON "dmo_raw_content" ("scraped_at");
CREATE INDEX IF NOT EXISTS "dmo_raw_content_confidence_idx" ON "dmo_raw_content" ("confidence_score");
CREATE INDEX IF NOT EXISTS "dmo_sources_market_idx" ON "dmo_sources" ("market","market_region");
CREATE INDEX IF NOT EXISTS "expert_dmo_collections_expert_idx" ON "expert_dmo_collections" ("expert_id","market");
CREATE INDEX IF NOT EXISTS "expert_dmo_collection_items_raw_idx" ON "expert_dmo_collection_items" ("raw_content_id");
CREATE INDEX IF NOT EXISTS "content_gap_alerts_market_idx" ON "content_gap_alerts" ("market","severity","resolved_at");
CREATE INDEX IF NOT EXISTS "dmo_scrape_jobs_status_idx" ON "dmo_scrape_jobs" ("status","market","created_at");
CREATE INDEX IF NOT EXISTS "dmo_scrape_jobs_source_idx" ON "dmo_scrape_jobs" ("source_id");
