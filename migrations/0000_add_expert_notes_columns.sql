CREATE TYPE "public"."content_status" AS ENUM('draft', 'pending_review', 'published', 'flagged', 'under_review', 'suspended', 'archived', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('trip', 'itinerary', 'service', 'review', 'chat_message', 'expert_profile', 'provider_profile', 'template', 'booking', 'vendor', 'experience', 'custom_venue', 'contract', 'media', 'tip', 'other');--> statement-breakpoint
CREATE TABLE "access_audit_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"actor_id" varchar NOT NULL,
	"actor_role" varchar(30) NOT NULL,
	"action" varchar(50) NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" varchar,
	"target_user_id" varchar,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "activity_booking_analytics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"session_id" varchar(100),
	"user_id" varchar,
	"activity_type" varchar(100) NOT NULL,
	"activity_category" varchar(100),
	"service_name" varchar(255),
	"provider_id" varchar,
	"provider_type" varchar(50),
	"destination" varchar(255),
	"country" varchar(100),
	"city" varchar(100),
	"booking_status" varchar(50),
	"price" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"group_size" integer,
	"trip_type" varchar(50),
	"traveler_origin_country" varchar(100),
	"booking_lead_days" integer,
	"activity_date" timestamp,
	"device_type" varchar(20),
	"referral_source" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "activity_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"product_code" varchar(100) NOT NULL,
	"destination" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"meeting_point" text,
	"address" text,
	"city" varchar(255),
	"state" varchar(100),
	"county" varchar(100),
	"country_code" varchar(10),
	"country_name" varchar(100),
	"postal_code" varchar(20),
	"provider" varchar(100) DEFAULT 'viator',
	"category" varchar(100),
	"subcategory" varchar(100),
	"preference_tags" jsonb DEFAULT '[]'::jsonb,
	"popularity_score" integer DEFAULT 0,
	"duration_minutes" integer,
	"price" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD',
	"rating" numeric(3, 2),
	"review_count" integer DEFAULT 0,
	"image_url" text,
	"flags" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "activity_cache_product_code_unique" UNIQUE("product_code")
);
--> statement-breakpoint
CREATE TABLE "activity_comments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"activity_id" varchar NOT NULL,
	"trip_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"author_name" varchar(255) NOT NULL,
	"text" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"parent_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "activity_demand_trends" (
	"id" varchar PRIMARY KEY NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"destination" varchar(255),
	"country" varchar(100),
	"period" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"search_count" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"inquiry_count" integer DEFAULT 0,
	"booking_count" integer DEFAULT 0,
	"total_revenue" numeric(12, 2) DEFAULT '0',
	"avg_price" numeric(10, 2),
	"avg_group_size" numeric(5, 1),
	"top_origin_countries" jsonb,
	"trip_type_breakdown" jsonb,
	"conversion_rate" numeric(5, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"product_id" varchar,
	"partner_id" varchar,
	"user_id" varchar,
	"trip_id" varchar,
	"itinerary_item_id" varchar,
	"referrer" varchar(500),
	"user_agent" varchar(500),
	"ip_address" varchar(50),
	"clicked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_earnings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"click_id" varchar,
	"partner_id" varchar,
	"expert_id" varchar,
	"booking_amount" numeric(10, 2) NOT NULL,
	"commission_rate" numeric(5, 2) NOT NULL,
	"total_commission" numeric(10, 2) NOT NULL,
	"platform_share" numeric(10, 2) NOT NULL,
	"expert_share" numeric(10, 2) NOT NULL,
	"provider_share" numeric(10, 2) DEFAULT '0.00',
	"currency" varchar(10) DEFAULT 'USD',
	"status" varchar(20) DEFAULT 'pending',
	"confirmed_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_partners" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"website_url" varchar(500) NOT NULL,
	"category" varchar(100) NOT NULL,
	"affiliate_tracking_id" varchar(200),
	"affiliate_link_template" varchar(1000),
	"description" text,
	"logo_url" varchar(500),
	"commission_rate" numeric(5, 2),
	"scrape_config" jsonb,
	"is_active" boolean DEFAULT true,
	"last_scraped_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_platforms" (
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar(100) NOT NULL,
	"image_url" text NOT NULL,
	"platform" varchar(10) NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_products" (
	"id" varchar PRIMARY KEY NOT NULL,
	"partner_id" varchar NOT NULL,
	"external_id" varchar(200),
	"name" varchar(500) NOT NULL,
	"description" text,
	"short_description" varchar(500),
	"category" varchar(100),
	"sub_category" varchar(100),
	"price" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD',
	"original_price" numeric(10, 2),
	"discount_percent" integer,
	"image_url" varchar(1000),
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"product_url" varchar(1000) NOT NULL,
	"affiliate_url" varchar(1500),
	"location" varchar(300),
	"city" varchar(100),
	"country" varchar(100),
	"coordinates" jsonb,
	"rating" numeric(3, 2),
	"review_count" integer,
	"duration" varchar(100),
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"includes" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"availability" varchar(200),
	"booking_info" text,
	"metadata" jsonb,
	"is_active" boolean DEFAULT true,
	"last_scraped_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_scrape_jobs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"partner_id" varchar NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"products_found" integer DEFAULT 0,
	"products_updated" integer DEFAULT 0,
	"products_new" integer DEFAULT 0,
	"pages_scraped" integer DEFAULT 0,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_trips" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"place_data" jsonb DEFAULT '[]'::jsonb,
	"hotel_data" jsonb DEFAULT '[]'::jsonb,
	"service_data" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_blueprints" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar,
	"user_id" varchar,
	"event_type" varchar(30) NOT NULL,
	"destination" varchar(255),
	"blueprint_data" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(30) DEFAULT 'generated',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_discovered_gems" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(200) NOT NULL,
	"country" varchar(100),
	"category" varchar(100) NOT NULL,
	"name" varchar(300) NOT NULL,
	"description" text NOT NULL,
	"why_special" text,
	"best_time_to_visit" varchar(200),
	"insider_tip" text,
	"approximate_location" varchar(300),
	"coordinates" jsonb,
	"price_range" varchar(50),
	"difficulty_level" varchar(50),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"image_search_terms" jsonb DEFAULT '[]'::jsonb,
	"related_experiences" jsonb DEFAULT '[]'::jsonb,
	"source_model" varchar(50) DEFAULT 'grok',
	"confidence_score" numeric(3, 2),
	"verified_by_user" boolean DEFAULT false,
	"verified_by_expert" boolean DEFAULT false,
	"view_count" integer DEFAULT 0,
	"save_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_refreshed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_generated_itineraries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"trip_id" varchar,
	"destination" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"title" varchar(255),
	"summary" text,
	"total_estimated_cost" numeric(10, 2),
	"itinerary_data" jsonb DEFAULT '{}'::jsonb,
	"accommodation_suggestions" jsonb DEFAULT '[]'::jsonb,
	"packing_list" jsonb DEFAULT '[]'::jsonb,
	"travel_tips" jsonb DEFAULT '[]'::jsonb,
	"provider" varchar(20) DEFAULT 'grok',
	"status" varchar(20) DEFAULT 'generated',
	"feedback" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_interactions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"estimated_cost" numeric(10, 6) DEFAULT '0',
	"duration_ms" integer DEFAULT 0,
	"success" boolean DEFAULT true,
	"error_message" text,
	"user_id" varchar,
	"trip_id" varchar,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"provider" varchar(20) NOT NULL,
	"model" varchar(50) NOT NULL,
	"operation" varchar(50) NOT NULL,
	"user_id" varchar,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"input_cost_per_million" integer DEFAULT 0,
	"output_cost_per_million" integer DEFAULT 0,
	"response_time_ms" integer DEFAULT 0,
	"success" boolean DEFAULT true,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_usage_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"provider" varchar(30) NOT NULL,
	"endpoint" varchar(100) NOT NULL,
	"operation" varchar(50) NOT NULL,
	"user_id" varchar,
	"request_count" integer DEFAULT 1 NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"cost_per_call_cents" integer DEFAULT 0,
	"response_time_ms" integer DEFAULT 0,
	"success" boolean DEFAULT true,
	"error_message" text,
	"result_count" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_fee_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50) NOT NULL,
	"platform_fee_percent" numeric(5, 2) DEFAULT '12.00',
	"expert_share_percent" numeric(5, 2) DEFAULT '70.00',
	"ai_keeps_100" boolean DEFAULT true,
	"min_fee" numeric(10, 2),
	"max_fee" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "booking_fee_configs_category_unique" UNIQUE("category")
);
--> statement-breakpoint
CREATE TABLE "booking_funnel_analytics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"session_id" varchar(100),
	"user_id" varchar,
	"funnel_stage" varchar(50) NOT NULL,
	"service_type" varchar(50),
	"service_id" varchar,
	"provider_id" varchar,
	"destination" varchar(255),
	"price" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"abandon_reason" varchar(100),
	"ip_country" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"trip_item_id" uuid,
	"provider_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending_provider',
	"requested_date" date NOT NULL,
	"requested_time" time,
	"travelers" integer NOT NULL,
	"special_requests" text,
	"provider_response" text,
	"responded_at" timestamp,
	"response_expires_at" timestamp,
	"counter_date" date,
	"counter_time" time,
	"counter_price" numeric,
	"counter_message" text,
	"booking_id" uuid,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255),
	"trip_id" varchar(255),
	"trip_item_id" uuid,
	"provider_id" varchar(255),
	"expert_id" varchar(255),
	"booking_type" varchar(20),
	"status" varchar(50) DEFAULT 'pending',
	"title" varchar(255),
	"booking_date" date,
	"booking_time" time,
	"travelers" integer,
	"service_amount" numeric,
	"platform_fee" numeric,
	"expert_fee" numeric,
	"total_amount" numeric,
	"provider_payout" numeric,
	"payment_method" varchar(20),
	"deposit_amount" numeric,
	"deposit_paid" boolean DEFAULT false,
	"balance_amount" numeric,
	"balance_paid" boolean DEFAULT false,
	"balance_due_date" date,
	"stripe_payment_intent_id" varchar(255),
	"stripe_deposit_intent_id" varchar(255),
	"stripe_balance_intent_id" varchar(255),
	"payment_status" varchar(50),
	"confirmation_code" varchar(50),
	"confirmed_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"cancelled_by" varchar(20),
	"refund_amount" numeric,
	"refund_status" varchar(50),
	"refunded_at" timestamp,
	"special_requests" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"service_id" varchar,
	"custom_venue_id" varchar,
	"experience_slug" varchar(50),
	"quantity" integer DEFAULT 1,
	"trip_id" varchar,
	"scheduled_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "city_media_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city_id" varchar,
	"city_name" varchar(100) NOT NULL,
	"country" varchar(100) NOT NULL,
	"source" varchar(20) NOT NULL,
	"media_type" varchar(20) NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"preview_url" text,
	"width" integer,
	"height" integer,
	"duration" integer,
	"context" varchar(50),
	"context_query" text,
	"attraction_name" varchar(200),
	"photographer_name" varchar(200),
	"photographer_url" text,
	"source_name" varchar(100),
	"source_url" text,
	"license" varchar(50),
	"download_location_url" text,
	"google_place_id" varchar(200),
	"html_attributions" text[],
	"quality_score" integer DEFAULT 50,
	"is_primary" boolean DEFAULT false,
	"fetched_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "content_analytics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar NOT NULL,
	"date" timestamp NOT NULL,
	"views" integer DEFAULT 0,
	"unique_views" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"bookmarks" integer DEFAULT 0,
	"conversions" integer DEFAULT 0,
	"revenue" integer DEFAULT 0,
	"avg_time_spent" integer DEFAULT 0,
	"bounce_rate" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_flags" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar NOT NULL,
	"reporter_id" varchar,
	"flag_type" varchar(30) NOT NULL,
	"severity" varchar(10) DEFAULT 'medium',
	"description" text,
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'pending',
	"resolution" text,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_invoices" (
	"id" varchar PRIMARY KEY NOT NULL,
	"invoice_number" varchar(20) NOT NULL,
	"tracking_number" varchar NOT NULL,
	"customer_id" varchar,
	"provider_id" varchar,
	"invoice_type" varchar(30) NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"status" varchar(20) DEFAULT 'pending',
	"tax_amount" integer DEFAULT 0,
	"discount_amount" integer DEFAULT 0,
	"total_amount" integer NOT NULL,
	"payment_method" varchar(30),
	"payment_reference" varchar,
	"notes" text,
	"due_date" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "content_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "content_registry" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar(20) NOT NULL,
	"content_type" "content_type" NOT NULL,
	"content_id" varchar NOT NULL,
	"owner_id" varchar,
	"status" "content_status" DEFAULT 'published',
	"title" text,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"view_count" integer DEFAULT 0,
	"engagement_score" integer DEFAULT 0,
	"last_viewed_at" timestamp,
	"published_at" timestamp,
	"flagged_at" timestamp,
	"flag_reason" text,
	"flagged_by" varchar,
	"moderator_id" varchar,
	"moderator_notes" text,
	"moderated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "content_registry_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"change_type" varchar(20) NOT NULL,
	"changed_by" varchar,
	"previous_data" jsonb,
	"new_data" jsonb,
	"change_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coordination_bookings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"coordination_id" varchar NOT NULL,
	"item_type" varchar(30) NOT NULL,
	"item_id" varchar(255) NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"vendor_id" varchar,
	"service_id" varchar,
	"availability_slot_id" varchar,
	"scheduled_date" date,
	"scheduled_time" varchar(10),
	"duration" varchar(50),
	"price" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD',
	"status" varchar(30) DEFAULT 'pending',
	"booking_reference" varchar(100),
	"confirmation_details" jsonb DEFAULT '{}'::jsonb,
	"source" varchar(30) DEFAULT 'platform',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"confirmed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coordination_states" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"trip_id" varchar,
	"experience_type" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'intake',
	"path" varchar(20) DEFAULT 'browse',
	"user_request" jsonb DEFAULT '{}'::jsonb,
	"destination" varchar(255),
	"dates" jsonb DEFAULT '{}'::jsonb,
	"travelers" jsonb DEFAULT '{}'::jsonb,
	"budget" jsonb DEFAULT '{}'::jsonb,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"assigned_expert_id" varchar,
	"expert_recommendations" jsonb DEFAULT '{}'::jsonb,
	"selected_vendors" jsonb DEFAULT '[]'::jsonb,
	"custom_venue_ids" jsonb DEFAULT '[]'::jsonb,
	"generated_itinerary" jsonb DEFAULT '{}'::jsonb,
	"optimization_score" numeric(5, 2),
	"ai_insights" jsonb DEFAULT '{}'::jsonb,
	"booking_statuses" jsonb DEFAULT '[]'::jsonb,
	"confirmations" jsonb DEFAULT '[]'::jsonb,
	"timeline" jsonb DEFAULT '[]'::jsonb,
	"state_history" jsonb DEFAULT '[]'::jsonb,
	"total_estimated_cost" numeric(10, 2),
	"total_confirmed_cost" numeric(10, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"wallet_id" varchar NOT NULL,
	"amount" integer NOT NULL,
	"transaction_type" varchar(20) NOT NULL,
	"description" text,
	"reference_id" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_venues" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"trip_id" varchar,
	"experience_type" varchar(50),
	"name" varchar(255) NOT NULL,
	"address" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"venue_type" varchar(50) DEFAULT 'custom',
	"notes" text,
	"estimated_cost" numeric(10, 2),
	"image_url" text,
	"source" varchar(20) DEFAULT 'custom',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_revenue_summary" (
	"id" varchar PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"total_gross" numeric(12, 2) DEFAULT '0',
	"total_platform_fee" numeric(12, 2) DEFAULT '0',
	"total_processing_fees" numeric(12, 2) DEFAULT '0',
	"total_net" numeric(12, 2) DEFAULT '0',
	"booking_revenue" numeric(12, 2) DEFAULT '0',
	"template_revenue" numeric(12, 2) DEFAULT '0',
	"affiliate_revenue" numeric(12, 2) DEFAULT '0',
	"tip_revenue" numeric(12, 2) DEFAULT '0',
	"other_revenue" numeric(12, 2) DEFAULT '0',
	"total_expert_earnings" numeric(12, 2) DEFAULT '0',
	"total_provider_earnings" numeric(12, 2) DEFAULT '0',
	"transaction_count" integer DEFAULT 0,
	"booking_count" integer DEFAULT 0,
	"template_sales_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "daily_revenue_summary_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "day_boundaries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"day_number" integer NOT NULL,
	"end_location" varchar(255),
	"must_return_to_hotel" boolean DEFAULT false,
	"latest_activity_end" varchar(10),
	"reason_for_constraint" varchar(500),
	"relocation_required" boolean DEFAULT false,
	"transit_duration_minutes" integer DEFAULT 0,
	"earliest_activity_start" varchar(10),
	"next_day_hotel_location" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "demand_signals" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(255) NOT NULL,
	"country" varchar(100),
	"service_type" varchar(50),
	"search_count" integer DEFAULT 0,
	"no_results_count" integer DEFAULT 0,
	"avg_budget" numeric(10, 2),
	"peak_month" varchar(20),
	"travelers_profile" jsonb,
	"origin_countries" jsonb,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "destination_benchmarks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(255) NOT NULL,
	"country" varchar(100),
	"period" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"search_volume" integer,
	"booking_volume" integer,
	"market_share" numeric(5, 2),
	"top_source_countries" jsonb,
	"avg_trip_spend" numeric(10, 2),
	"avg_daily_spend" numeric(10, 2),
	"revenue_estimate" numeric(14, 2),
	"avg_length_of_stay" numeric(5, 1),
	"avg_lead_time" numeric(5, 1),
	"avg_party_size" numeric(5, 1),
	"peak_months" jsonb,
	"seasonality_index" jsonb,
	"top_activities" jsonb,
	"similar_destinations" jsonb,
	"competitor_comparison" jsonb,
	"avg_rating" numeric(3, 2),
	"sentiment_score" numeric(3, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "destination_events" (
	"id" varchar PRIMARY KEY NOT NULL,
	"country" varchar(100) NOT NULL,
	"city" varchar(100),
	"region" varchar(100),
	"title" varchar(255) NOT NULL,
	"description" text,
	"event_type" varchar(30) DEFAULT 'other',
	"start_month" integer,
	"end_month" integer,
	"specific_date" date,
	"is_recurring" boolean DEFAULT true,
	"year" integer,
	"season_rating" varchar(20),
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"tips" text,
	"source_type" varchar(20) DEFAULT 'manual',
	"source_id" varchar(255),
	"contributor_id" varchar,
	"status" varchar(20) DEFAULT 'pending',
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "destination_intelligence" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(255) NOT NULL,
	"start_date" varchar(10),
	"end_date" varchar(10),
	"intelligence_data" jsonb DEFAULT '{}'::jsonb,
	"events" jsonb DEFAULT '[]'::jsonb,
	"weather_forecast" jsonb DEFAULT '{}'::jsonb,
	"safety_alerts" jsonb DEFAULT '[]'::jsonb,
	"trending_experiences" jsonb DEFAULT '[]'::jsonb,
	"deals" jsonb DEFAULT '[]'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destination_metrics_history" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(255) NOT NULL,
	"city" varchar(100),
	"country" varchar(100),
	"metric_type" varchar(50) NOT NULL,
	"metric_value" numeric(10, 2) NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destination_search_patterns" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(255) NOT NULL,
	"city" varchar(100),
	"country" varchar(100),
	"search_query" varchar(500),
	"search_type" varchar(50) NOT NULL,
	"user_id" varchar,
	"results_viewed" integer DEFAULT 0,
	"items_clicked" integer DEFAULT 0,
	"item_selected" boolean DEFAULT false,
	"booking_value" numeric(10, 2),
	"dwell_time_seconds" integer DEFAULT 0,
	"date" date NOT NULL,
	"hour" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "destination_seasons" (
	"id" varchar PRIMARY KEY NOT NULL,
	"country" varchar(100) NOT NULL,
	"city" varchar(100),
	"month" integer NOT NULL,
	"rating" varchar(20) NOT NULL,
	"weather_description" text,
	"average_temp" varchar(20),
	"rainfall" varchar(50),
	"crowd_level" varchar(20),
	"price_level" varchar(20),
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"source_type" varchar(20) DEFAULT 'system',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discovery_jobs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(200) NOT NULL,
	"categories" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"gems_discovered" integer DEFAULT 0,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "energy_tracking" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"day_number" integer NOT NULL,
	"starting_energy" integer DEFAULT 100,
	"activity_depletion" integer DEFAULT 0,
	"ending_energy" integer DEFAULT 100,
	"recovery_needed" boolean DEFAULT false,
	"recovery_reason" varchar(500),
	"energy_breakdown" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_template_filter_options" (
	"id" varchar PRIMARY KEY NOT NULL,
	"filter_id" varchar NOT NULL,
	"label" varchar(100) NOT NULL,
	"value" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"min_value" numeric(10, 2),
	"max_value" numeric(10, 2),
	"sort_order" integer DEFAULT 0,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_template_filters" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tab_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"description" text,
	"filter_type" varchar(30) DEFAULT 'multi_select',
	"icon" varchar(50),
	"sort_order" integer DEFAULT 0,
	"is_required" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_template_steps" (
	"id" varchar PRIMARY KEY NOT NULL,
	"experience_type_id" varchar NOT NULL,
	"step_number" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"service_categories" jsonb DEFAULT '[]'::jsonb,
	"is_required" boolean DEFAULT false,
	"fields" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_template_tabs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"experience_type_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_types" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"color" varchar(20),
	"image_url" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"payment_flow_type" varchar(50),
	"payment_complexity" varchar(20),
	"timing_complexity" varchar(20),
	"contingency_level" varchar(20),
	"typical_group_size_min" integer,
	"typical_group_size_max" integer,
	"typical_duration_min_days" integer,
	"typical_duration_max_days" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "experience_types_name_unique" UNIQUE("name"),
	CONSTRAINT "experience_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "experience_universal_filter_options" (
	"id" varchar PRIMARY KEY NOT NULL,
	"filter_id" varchar NOT NULL,
	"label" varchar(100) NOT NULL,
	"value" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"min_value" numeric(10, 2),
	"max_value" numeric(10, 2),
	"sort_order" integer DEFAULT 0,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_universal_filters" (
	"id" varchar PRIMARY KEY NOT NULL,
	"experience_type_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"description" text,
	"filter_type" varchar(30) DEFAULT 'multi_select',
	"icon" varchar(50),
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_ai_tasks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"client_name" varchar(255),
	"task_description" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"ai_result" jsonb DEFAULT '{}'::jsonb,
	"confidence" integer,
	"quality_score" numeric(3, 1),
	"edited_content" text,
	"was_edited" boolean DEFAULT false,
	"tokens_used" integer DEFAULT 0,
	"cost_estimate" numeric(10, 6) DEFAULT '0',
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_city_queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text,
	"expert_ids" jsonb DEFAULT '[]'::jsonb,
	"active_requests" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_custom_services" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category_name" varchar(100),
	"existing_category_id" varchar,
	"price" numeric(10, 2) NOT NULL,
	"duration" varchar(50),
	"deliverables" jsonb DEFAULT '[]'::jsonb,
	"cancellation_policy" text,
	"lead_time" varchar(50),
	"image_url" text,
	"gallery_images" jsonb DEFAULT '[]'::jsonb,
	"experience_types" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'draft',
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"rejection_reason" text,
	"is_active" boolean DEFAULT true,
	"bookings_count" integer DEFAULT 0,
	"average_rating" numeric(3, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_earnings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"reference_id" varchar,
	"reference_type" varchar(50),
	"description" text,
	"status" varchar(50) DEFAULT 'pending',
	"available_at" timestamp,
	"paid_out_at" timestamp,
	"payout_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_experience_types" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"experience_type_id" varchar NOT NULL,
	"proficiency_level" varchar(20) DEFAULT 'intermediate',
	"years_experience" integer DEFAULT 0,
	"portfolio_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" varchar(255) NOT NULL,
	"expert_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"original_itinerary" jsonb NOT NULL,
	"modified_itinerary" jsonb,
	"expert_notes" text,
	"user_feedback" text,
	"can_book_on_behalf" boolean DEFAULT false,
	"bookings_made" jsonb DEFAULT '[]'::jsonb,
	"expert_fee" numeric,
	"fee_paid" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"accepted_at" timestamp,
	"completed_at" timestamp,
	"user_approved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "expert_match_analytics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"traveler_id" varchar,
	"match_score" integer NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb,
	"reasoning" text,
	"traveler_destination" varchar(255),
	"traveler_budget" numeric(10, 2),
	"traveler_interests" jsonb DEFAULT '[]'::jsonb,
	"traveler_group_size" integer,
	"expert_selected" boolean DEFAULT false,
	"booking_completed" boolean DEFAULT false,
	"feedback" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_match_scores" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar,
	"expert_id" varchar NOT NULL,
	"traveler_id" varchar,
	"overall_score" integer NOT NULL,
	"destination_match" integer DEFAULT 0,
	"specialty_match" integer DEFAULT 0,
	"experience_type_match" integer DEFAULT 0,
	"budget_alignment" integer DEFAULT 0,
	"availability_score" integer DEFAULT 0,
	"strengths" jsonb DEFAULT '[]'::jsonb,
	"reasoning" text,
	"request_context" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "expert_payouts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"payout_method" varchar(50),
	"status" varchar(50) DEFAULT 'pending',
	"processed_at" timestamp,
	"failure_reason" text,
	"transaction_id" varchar(255),
	"metadata" jsonb,
	"requested_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_referrals" (
	"id" varchar PRIMARY KEY NOT NULL,
	"referrer_id" varchar NOT NULL,
	"referred_id" varchar NOT NULL,
	"referral_code" varchar(50),
	"status" varchar(20) DEFAULT 'pending',
	"bonus_amount" numeric(10, 2) DEFAULT '50.00',
	"qualified_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"trip_id" varchar,
	"variant_id" text,
	"comparison_id" text,
	"destination_city" text,
	"request_type" text,
	"expert_fee" numeric,
	"status" text DEFAULT 'pending',
	"assigned_expert_id" text,
	"queue_position" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"assigned_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "expert_selected_services" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"service_offering_id" varchar NOT NULL,
	"custom_price" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_service_categories" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_default" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "expert_service_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "expert_service_offerings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"category_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"is_default" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_specializations" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"specialization" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_templates" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar(20),
	"expert_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"short_description" varchar(500),
	"destination" varchar(255) NOT NULL,
	"duration" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"category" varchar(100),
	"cover_image" varchar(1000),
	"images" jsonb DEFAULT '[]'::jsonb,
	"itinerary_data" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"is_published" boolean DEFAULT false,
	"is_featured" boolean DEFAULT false,
	"sales_count" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"average_rating" numeric(3, 2),
	"review_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "expert_templates_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "expert_tips" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar(20),
	"expert_id" varchar NOT NULL,
	"traveler_id" varchar NOT NULL,
	"booking_id" varchar,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"message" text,
	"is_anonymous" boolean DEFAULT false,
	"platform_fee" numeric(10, 2) DEFAULT '0.00',
	"expert_amount" numeric(10, 2),
	"status" varchar(20) DEFAULT 'pending',
	"stripe_payment_intent_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "expert_tips_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "expert_updated_itineraries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar,
	"share_token" varchar,
	"itinerary_data" jsonb DEFAULT '{}'::jsonb,
	"message" text,
	"status" varchar(20) DEFAULT 'pending',
	"created_by_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expert_vendor_coordination" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"expert_id" varchar NOT NULL,
	"vendor_name" varchar(255) NOT NULL,
	"vendor_category" varchar(100) NOT NULL,
	"vendor_email" varchar(255),
	"vendor_phone" varchar(50),
	"provider_id" varchar,
	"setup_time" varchar(10),
	"arrival_time" varchar(10),
	"start_time" varchar(10),
	"end_time" varchar(10),
	"service_date" date,
	"status" varchar(30) DEFAULT 'pending',
	"contract_status" varchar(30) DEFAULT 'none',
	"deposit_amount" numeric(10, 2),
	"total_amount" numeric(10, 2),
	"primary_anchor_id" varchar,
	"anchor_constraint_note" text,
	"notes" text,
	"last_contacted_at" timestamp,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"attachment" text,
	"category" varchar(100),
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fever_event_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"slug" varchar(500),
	"description" text,
	"short_description" text,
	"image_url" text,
	"thumbnail_url" text,
	"category" varchar(100) NOT NULL,
	"subcategory" varchar(100),
	"city" varchar(255) NOT NULL,
	"city_code" varchar(10) NOT NULL,
	"country" varchar(100) NOT NULL,
	"country_code" varchar(10),
	"venue_name" varchar(255),
	"venue_address" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"start_date" timestamp,
	"end_date" timestamp,
	"sessions" jsonb DEFAULT '[]'::jsonb,
	"currency" varchar(10) DEFAULT 'USD',
	"min_price" numeric(10, 2),
	"max_price" numeric(10, 2),
	"price_range" varchar(100),
	"is_free" boolean DEFAULT false,
	"is_sold_out" boolean DEFAULT false,
	"rating" numeric(3, 2),
	"review_count" integer DEFAULT 0,
	"booking_url" text NOT NULL,
	"affiliate_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"highlights" jsonb DEFAULT '[]'::jsonb,
	"provider" varchar(100) DEFAULT 'fever',
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"origin_code" varchar(10) NOT NULL,
	"destination_code" varchar(10) NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date,
	"adults" integer NOT NULL,
	"offer_id" varchar(100) NOT NULL,
	"carrier_code" varchar(10),
	"carrier_name" varchar(100),
	"flight_number" varchar(20),
	"departure_time" varchar(30),
	"arrival_time" varchar(30),
	"duration" varchar(30),
	"stops" integer DEFAULT 0,
	"origin_latitude" numeric(10, 7),
	"origin_longitude" numeric(10, 7),
	"origin_city" varchar(255),
	"origin_country_code" varchar(10),
	"origin_airport_name" varchar(255),
	"destination_latitude" numeric(10, 7),
	"destination_longitude" numeric(10, 7),
	"destination_city" varchar(255),
	"destination_country_code" varchar(10),
	"destination_airport_name" varchar(255),
	"provider" varchar(100) DEFAULT 'amadeus',
	"price" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD',
	"cabin" varchar(50),
	"popularity_score" integer DEFAULT 0,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_itineraries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"tracking_number" varchar(20),
	"itinerary_data" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'pending',
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "generated_itineraries_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "help_guide_trips" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"country" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"city" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"highlights" text NOT NULL,
	"days" integer NOT NULL,
	"nights" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"old_price" numeric(10, 2),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"inclusive" text NOT NULL,
	"exclusive" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hotel_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"hotel_id" varchar(100) NOT NULL,
	"city_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"address" text,
	"city" varchar(255),
	"state" varchar(100),
	"county" varchar(100),
	"country_code" varchar(10),
	"country_name" varchar(100),
	"postal_code" varchar(20),
	"provider" varchar(100) DEFAULT 'amadeus',
	"rating" varchar(10),
	"star_rating" integer,
	"review_count" integer DEFAULT 0,
	"popularity_score" integer DEFAULT 0,
	"preference_tags" jsonb DEFAULT '[]'::jsonb,
	"amenities" jsonb DEFAULT '[]'::jsonb,
	"media" jsonb DEFAULT '[]'::jsonb,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_offer_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"hotel_cache_id" varchar NOT NULL,
	"offer_id" varchar(100) NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"room_type" varchar(100),
	"room_description" text,
	"price" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD',
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "influencer_curated_content" (
	"id" varchar PRIMARY KEY NOT NULL,
	"influencer_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"content_type" varchar(50) DEFAULT 'guide',
	"platform" varchar(50),
	"external_url" text,
	"image_url" text,
	"destinations" jsonb DEFAULT '[]'::jsonb,
	"experiences" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"view_count" integer DEFAULT 0,
	"save_count" integer DEFAULT 0,
	"is_featured" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "influencer_referrals" (
	"id" varchar PRIMARY KEY NOT NULL,
	"influencer_id" varchar NOT NULL,
	"referral_code" varchar(50) NOT NULL,
	"referred_user_id" varchar,
	"booking_id" varchar,
	"status" varchar(20) DEFAULT 'pending',
	"commission_rate" numeric(5, 2) DEFAULT '10.00',
	"commission_amount" numeric(10, 2),
	"booking_amount" numeric(10, 2),
	"paid_at" timestamp,
	"expires_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_changes" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"activity_id" varchar,
	"who" varchar(255) NOT NULL,
	"action" text NOT NULL,
	"change_type" varchar(20) NOT NULL,
	"role" varchar(20) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_comparisons" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"user_experience_id" varchar,
	"trip_id" varchar,
	"title" varchar(255),
	"destination" varchar(255),
	"start_date" date,
	"end_date" date,
	"budget" numeric(10, 2),
	"travelers" integer DEFAULT 1,
	"experience_type_slug" varchar(50),
	"status" varchar(30) DEFAULT 'pending',
	"selected_variant_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"item_type" varchar(30) DEFAULT 'activity',
	"status" varchar(20) DEFAULT 'planned',
	"day_number" integer NOT NULL,
	"start_time" varchar(10),
	"end_time" varchar(10),
	"duration_minutes" integer,
	"is_flexible" boolean DEFAULT false,
	"location_name" varchar(255),
	"location_address" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"google_place_id" varchar(255),
	"travel_from_previous" jsonb DEFAULT '{}'::jsonb,
	"vendor_contract_id" varchar,
	"booking_reference" varchar(255),
	"booking_status" varchar(20),
	"confirmation_number" varchar(255),
	"estimated_cost" numeric(10, 2),
	"actual_cost" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"cost_per_person" boolean DEFAULT false,
	"energy_level" varchar(20),
	"is_outdoor" boolean DEFAULT false,
	"weather_dependent" boolean DEFAULT false,
	"backup_plan_id" varchar(255),
	"is_backup_plan" boolean DEFAULT false,
	"weather_conditions" jsonb DEFAULT '{}'::jsonb,
	"participant_ids" jsonb DEFAULT '[]'::jsonb,
	"min_participants" integer,
	"max_participants" integer,
	"energy_cost" integer DEFAULT 20,
	"energy_type" varchar(20),
	"attendance_requirement" varchar(20) DEFAULT 'optional',
	"conflicts_with" jsonb DEFAULT '[]'::jsonb,
	"peak_timing_preference" varchar(20),
	"notes" text,
	"private_notes" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"suggested_by" varchar(20),
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_variant_items" (
	"id" varchar PRIMARY KEY NOT NULL,
	"variant_id" varchar NOT NULL,
	"provider_service_id" varchar,
	"day_number" integer NOT NULL,
	"time_slot" varchar(50),
	"start_time" varchar(20),
	"end_time" varchar(20),
	"name" varchar(255) NOT NULL,
	"description" text,
	"service_type" varchar(50),
	"price" numeric(10, 2),
	"rating" numeric(3, 2),
	"location" varchar(255),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"duration" integer,
	"travel_time_from_previous" integer,
	"is_replacement" boolean DEFAULT false,
	"replacement_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_variant_metrics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"variant_id" varchar NOT NULL,
	"metric_key" varchar(50) NOT NULL,
	"metric_label" varchar(100) NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"unit" varchar(30),
	"better_is_lower" boolean DEFAULT true,
	"comparison" varchar(50),
	"improvement_percentage" numeric(5, 2),
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "itinerary_variants" (
	"id" varchar PRIMARY KEY NOT NULL,
	"comparison_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"source" varchar(30) DEFAULT 'user',
	"status" varchar(30) DEFAULT 'pending',
	"total_cost" numeric(10, 2),
	"total_travel_time" integer,
	"average_rating" numeric(3, 2),
	"free_time_minutes" integer,
	"optimization_score" integer,
	"ai_reasoning" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_routing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid,
	"user_id" varchar(255),
	"destination" varchar(255),
	"topic" varchar(255),
	"assigned_expert_id" varchar(255),
	"top_score" integer,
	"scores_json" jsonb,
	"overridden_by" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_events" (
	"id" varchar PRIMARY KEY NOT NULL,
	"search_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"start_date" varchar(100),
	"address" text,
	"link" text,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "local_expert_forms" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"expert_type" varchar(30) DEFAULT 'travel_expert',
	"first_name" varchar(100),
	"last_name" varchar(100),
	"email" varchar(255),
	"phone" varchar(50),
	"country" varchar(100),
	"city" varchar(100),
	"destinations" jsonb DEFAULT '[]'::jsonb,
	"specialties" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '[]'::jsonb,
	"experience_types" jsonb DEFAULT '[]'::jsonb,
	"specializations" jsonb DEFAULT '[]'::jsonb,
	"selected_services" jsonb DEFAULT '[]'::jsonb,
	"years_of_experience" varchar(50),
	"bio" text,
	"portfolio" text,
	"certifications" text,
	"availability" varchar(50),
	"response_time" varchar(50),
	"hourly_rate" varchar(50),
	"years_in_city" integer DEFAULT 0,
	"offer_service" boolean DEFAULT false,
	"gov_id" text,
	"travel_licence" text,
	"instagram_link" text,
	"facebook_link" text,
	"linkedin_link" text,
	"services" jsonb DEFAULT '[]'::jsonb,
	"service_availability" integer DEFAULT 15,
	"price_expectation" integer DEFAULT 0,
	"short_bio" text,
	"confirm_age" boolean DEFAULT false,
	"terms_and_conditions" boolean DEFAULT false,
	"partnership" boolean DEFAULT false,
	"is_influencer" boolean DEFAULT false,
	"social_followers" jsonb DEFAULT '{}'::jsonb,
	"verified_influencer" boolean DEFAULT false,
	"influencer_tier" varchar(20),
	"expert_notes_style" text,
	"referral_code" varchar(50),
	"tiktok_link" text,
	"youtube_link" text,
	"can_book_on_behalf" boolean DEFAULT false,
	"is_personal_assistant" boolean DEFAULT false,
	"pa_access_granted_at" timestamp,
	"pa_access_granted_by" varchar(255),
	"booking_fee_type" varchar(20),
	"booking_fee_percentage" numeric,
	"booking_fee_fixed" numeric,
	"booking_fee_hourly" numeric,
	"min_booking_fee" numeric,
	"stripe_account_id" varchar(255),
	"stripe_account_status" varchar(50),
	"can_receive_payments" boolean DEFAULT false,
	"total_earnings" numeric DEFAULT '0',
	"pending_payout" numeric DEFAULT '0',
	"total_handoffs" integer DEFAULT 0,
	"completed_handoffs" integer DEFAULT 0,
	"total_bookings_assisted" integer DEFAULT 0,
	"handoff_response_time_hours" integer,
	"max_concurrent_handoffs" integer DEFAULT 5,
	"accepts_new_handoffs" boolean DEFAULT true,
	"fee_settings" jsonb DEFAULT '{}'::jsonb,
	"payout_schedule" varchar(20),
	"status" varchar(20) DEFAULT 'pending',
	"rejection_message" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "local_expert_forms_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "location_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"iata_code" varchar(10) NOT NULL,
	"location_type" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"detailed_name" text,
	"city_name" varchar(255),
	"city_code" varchar(10),
	"country_name" varchar(100),
	"country_code" varchar(10),
	"region_code" varchar(20),
	"state_code" varchar(20),
	"latitude" text,
	"longitude" text,
	"timezone_offset" varchar(10),
	"traveler_score" integer,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps_export_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"variant_id" varchar NOT NULL,
	"kml_content" text,
	"gpx_content" text,
	"geo_json_content" jsonb,
	"google_maps_urls" jsonb,
	"apple_maps_urls" jsonb,
	"apple_maps_web_urls" jsonb,
	"generated_at" timestamp DEFAULT now(),
	"transport_legs_hash" text
);
--> statement-breakpoint
CREATE TABLE "market_intelligence" (
	"id" varchar PRIMARY KEY NOT NULL,
	"report_type" varchar(50) NOT NULL,
	"target_entity" varchar(255) NOT NULL,
	"period" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"metrics" jsonb NOT NULL,
	"insights" jsonb,
	"recommendations" jsonb,
	"data_quality" varchar(20) DEFAULT 'high',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"related_id" varchar(255),
	"related_type" varchar(50),
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "page_view_analytics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"session_id" varchar(100),
	"user_id" varchar,
	"page_path" varchar(500) NOT NULL,
	"page_type" varchar(50),
	"referrer" text,
	"utm_source" varchar(100),
	"utm_medium" varchar(100),
	"utm_campaign" varchar(100),
	"time_on_page" integer,
	"scroll_depth" integer,
	"device_type" varchar(20),
	"ip_country" varchar(100),
	"ip_city" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"user_id" varchar(255),
	"amount" numeric,
	"currency" varchar(10) DEFAULT 'usd',
	"status" varchar(50),
	"is_deposit" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fee_type" varchar(20),
	"category" varchar(50),
	"provider_id" varchar(255),
	"fee_type_method" varchar(20),
	"fee_percentage" numeric,
	"fee_fixed_amount" numeric,
	"min_fee" numeric,
	"max_fee" numeric,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_revenue" (
	"id" varchar PRIMARY KEY NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"source_id" varchar,
	"tracking_number" varchar(20),
	"gross_amount" numeric(10, 2) NOT NULL,
	"platform_fee" numeric(10, 2) NOT NULL,
	"net_amount" numeric(10, 2) NOT NULL,
	"processing_fees" numeric(10, 2) DEFAULT '0',
	"currency" varchar(3) DEFAULT 'USD',
	"expert_id" varchar,
	"expert_earnings" numeric(10, 2) DEFAULT '0',
	"provider_id" varchar,
	"provider_earnings" numeric(10, 2) DEFAULT '0',
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'recorded',
	"transaction_date" timestamp DEFAULT now(),
	"reconciliation_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "poi_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"amadeus_id" varchar(100) NOT NULL,
	"name" varchar(500) NOT NULL,
	"category" varchar(100) NOT NULL,
	"rank" integer DEFAULT 0,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"city" varchar(255),
	"country" varchar(100),
	"country_code" varchar(10),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "poi_cache_amadeus_id_unique" UNIQUE("amadeus_id")
);
--> statement-breakpoint
CREATE TABLE "pricing_intelligence" (
	"id" varchar PRIMARY KEY NOT NULL,
	"service_type" varchar(50) NOT NULL,
	"destination" varchar(255),
	"country" varchar(100),
	"avg_price" numeric(10, 2),
	"min_price" numeric(10, 2),
	"max_price" numeric(10, 2),
	"median_price" numeric(10, 2),
	"price_range" varchar(50),
	"sample_size" integer,
	"period" varchar(20),
	"period_start" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"service_id" uuid,
	"availability_type" varchar(20) NOT NULL,
	"blocked_dates" jsonb DEFAULT '[]'::jsonb,
	"available_dates" jsonb DEFAULT '[]'::jsonb,
	"is_available" boolean DEFAULT true,
	"daily_capacity" integer,
	"current_bookings" integer DEFAULT 0,
	"time_slots" jsonb,
	"recurring_unavailable" jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_availability_schedule" (
	"id" varchar PRIMARY KEY NOT NULL,
	"provider_id" varchar NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"is_available" boolean DEFAULT true,
	"preferred_slots" jsonb DEFAULT '[]'::jsonb,
	"pricing_modifier" integer DEFAULT 0,
	"pricing_reason" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_blackout_dates" (
	"id" varchar PRIMARY KEY NOT NULL,
	"provider_id" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" varchar(500),
	"is_recurring" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_booking_requests" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"expert_id" varchar,
	"service_type" varchar(100) NOT NULL,
	"service_description" text,
	"requested_date" date NOT NULL,
	"requested_start_time" varchar(10) NOT NULL,
	"requested_end_time" varchar(10) NOT NULL,
	"price" numeric(10, 2),
	"client_context" jsonb DEFAULT '{}'::jsonb,
	"anchor_constraints" jsonb DEFAULT '[]'::jsonb,
	"expert_notes" text,
	"status" varchar(30) DEFAULT 'pending',
	"counter_offer" jsonb DEFAULT 'null'::jsonb,
	"provider_response" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_earnings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"provider_id" varchar NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"source_type" varchar(50),
	"source_id" varchar,
	"tracking_number" varchar(20),
	"description" text,
	"status" varchar(20) DEFAULT 'pending',
	"available_at" timestamp,
	"paid_at" timestamp,
	"payout_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_payouts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"provider_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"payout_method" varchar(50),
	"status" varchar(20) DEFAULT 'pending',
	"payout_reference" varchar(100),
	"notes" text,
	"requested_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "provider_performance_metrics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"provider_id" varchar NOT NULL,
	"period" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"impressions" integer DEFAULT 0,
	"profile_views" integer DEFAULT 0,
	"search_appearances" integer DEFAULT 0,
	"inquiries" integer DEFAULT 0,
	"bookings" integer DEFAULT 0,
	"revenue" numeric(10, 2) DEFAULT '0',
	"avg_response_time" integer,
	"conversion_rate" numeric(5, 2),
	"competitor_rank" integer,
	"price_competitiveness" varchar(20),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"service_id" uuid,
	"pricing_type" varchar(20) NOT NULL,
	"base_price" numeric,
	"currency" varchar(3) DEFAULT 'USD',
	"seasonal_pricing" jsonb,
	"date_overrides" jsonb,
	"requires_quote" boolean DEFAULT false,
	"estimated_range_min" numeric,
	"estimated_range_max" numeric,
	"per_person" boolean DEFAULT false,
	"group_discounts" jsonb,
	"requires_deposit" boolean DEFAULT false,
	"deposit_type" varchar(20),
	"deposit_amount" numeric,
	"deposit_percentage" integer,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_services" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"tracking_number" varchar(20),
	"service_name" varchar(255) NOT NULL,
	"short_description" varchar(150),
	"description" text,
	"service_type" varchar(50) DEFAULT 'planning',
	"category_id" varchar,
	"price" numeric(10, 2),
	"price_type" varchar(20) DEFAULT 'fixed',
	"price_based_on" varchar(100),
	"delivery_method" varchar(50) DEFAULT 'pdf',
	"delivery_timeframe" varchar(100),
	"revisions_included" integer DEFAULT 0,
	"includes_expert_notes" boolean DEFAULT false,
	"max_concurrent_bookings" integer,
	"lead_time_hours" integer DEFAULT 24,
	"location" varchar(255) DEFAULT 'Unknown',
	"availability" jsonb DEFAULT '[]'::jsonb,
	"what_included" jsonb DEFAULT '[]'::jsonb,
	"requirements" jsonb DEFAULT '[]'::jsonb,
	"faqs" jsonb DEFAULT '[]'::jsonb,
	"service_image" text,
	"service_file" text,
	"status" varchar(20) DEFAULT 'active',
	"form_status" varchar(50) DEFAULT 'pending',
	"is_featured" boolean DEFAULT false,
	"bookings_count" integer DEFAULT 0,
	"total_revenue" numeric(10, 2) DEFAULT '0',
	"average_rating" numeric(3, 2),
	"review_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "provider_services_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "realtime_signals" (
	"id" varchar PRIMARY KEY NOT NULL,
	"source" varchar(50) NOT NULL,
	"keyword" varchar(100) NOT NULL,
	"location" varchar(100),
	"signal_strength" integer NOT NULL,
	"volume" integer,
	"sentiment" numeric(3, 2),
	"opportunity_id" varchar,
	"detected_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "recommendation_conversions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"recommendation_id" varchar NOT NULL,
	"user_id" varchar,
	"conversion_type" varchar(50) NOT NULL,
	"result_id" varchar,
	"revenue_generated" numeric(10, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reminder_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_trip_id" uuid NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"reminder_type" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"cuisine" varchar(255),
	"price_level" varchar(10),
	"rating" varchar(10),
	"review_count" integer DEFAULT 0,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"city" varchar(255),
	"booking_url" text,
	"image_url" text,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "restaurant_cache_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "revenue_splits" (
	"id" varchar PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"platform_percentage" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"expert_percentage" numeric(5, 2) DEFAULT '85.00' NOT NULL,
	"provider_percentage" numeric(5, 2) DEFAULT '0.00',
	"description" text,
	"is_active" boolean DEFAULT true,
	"effective_from" timestamp DEFAULT now(),
	"effective_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_ratings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"local_expert_id" varchar NOT NULL,
	"reviewer_id" varchar NOT NULL,
	"review" text NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "safety_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"amadeus_id" varchar(100) NOT NULL,
	"name" varchar(500) NOT NULL,
	"sub_type" varchar(50),
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"city" varchar(255),
	"country" varchar(100),
	"country_code" varchar(10),
	"overall_score" integer,
	"lgbtq_score" integer,
	"medical_score" integer,
	"physical_harm_score" integer,
	"political_freedom_score" integer,
	"theft_score" integer,
	"women_safety_score" integer,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "safety_cache_amadeus_id_unique" UNIQUE("amadeus_id")
);
--> statement-breakpoint
CREATE TABLE "saved_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"variant_id" text,
	"comparison_id" text,
	"notes" text,
	"saved_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"price_snapshot" numeric,
	"reminders_sent" integer DEFAULT 0,
	"status" text DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE "search_analytics" (
	"id" varchar PRIMARY KEY NOT NULL,
	"session_id" varchar(100),
	"user_id" varchar,
	"search_type" varchar(50) NOT NULL,
	"query" text,
	"destination" varchar(255),
	"origin_country" varchar(100),
	"origin_city" varchar(100),
	"travel_dates" jsonb,
	"travelers" integer,
	"budget" varchar(50),
	"filters" jsonb,
	"results_count" integer,
	"clicked_results" jsonb,
	"converted_to_booking" boolean DEFAULT false,
	"device_type" varchar(20),
	"user_agent" text,
	"ip_country" varchar(100),
	"ip_city" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seasonal_opportunities" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100),
	"month" integer NOT NULL,
	"service_type" varchar(100) NOT NULL,
	"opportunity_type" varchar(50) NOT NULL,
	"event_name" varchar(255),
	"demand_multiplier" numeric(4, 2) DEFAULT '1.0',
	"pricing_opportunity" varchar(20),
	"lead_time_weeks" integer DEFAULT 4,
	"preparation_tips" jsonb DEFAULT '[]'::jsonb,
	"historical_performance" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "serp_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"cache_key" varchar(500) NOT NULL,
	"query" text NOT NULL,
	"location" varchar(200) NOT NULL,
	"category" varchar(100),
	"template" varchar(100),
	"results" jsonb NOT NULL,
	"result_count" integer DEFAULT 0,
	"cached_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "serp_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "serp_inquiries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"serp_provider_id" varchar(200) NOT NULL,
	"provider_name" varchar(300) NOT NULL,
	"provider_email" varchar(200),
	"provider_phone" varchar(50),
	"provider_website" text,
	"message" text NOT NULL,
	"destination" varchar(200),
	"category" varchar(100),
	"template" varchar(100),
	"status" varchar(50) DEFAULT 'pending',
	"sent_at" timestamp,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "serp_provider_tracking" (
	"id" varchar PRIMARY KEY NOT NULL,
	"serp_provider_id" varchar(200) NOT NULL,
	"provider_name" varchar(300) NOT NULL,
	"destination" varchar(200),
	"category" varchar(100),
	"template" varchar(100),
	"click_count" integer DEFAULT 0,
	"inquiry_count" integer DEFAULT 0,
	"priority_score" varchar(20) DEFAULT 'LOW',
	"last_clicked_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "serp_provider_tracking_serp_provider_id_unique" UNIQUE("serp_provider_id")
);
--> statement-breakpoint
CREATE TABLE "service_bookings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar(20),
	"service_id" varchar NOT NULL,
	"traveler_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"contract_id" varchar,
	"booking_details" jsonb DEFAULT '{}'::jsonb,
	"trip_id" varchar,
	"status" varchar(30) DEFAULT 'pending',
	"total_amount" numeric(10, 2) NOT NULL,
	"platform_fee" numeric(10, 2) DEFAULT '0',
	"provider_earnings" numeric(10, 2),
	"stripe_payment_intent_id" varchar(255),
	"confirmed_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "service_bookings_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100),
	"description" text,
	"icon" varchar(10),
	"image_url" text,
	"category_type" varchar(20) DEFAULT 'service_provider',
	"verification_required" boolean DEFAULT true,
	"required_documents" jsonb DEFAULT '[]'::jsonb,
	"custom_profile_fields" jsonb DEFAULT '[]'::jsonb,
	"price_range" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "service_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "service_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "service_demand_signals" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100),
	"service_type" varchar(100) NOT NULL,
	"category_slug" varchar(100),
	"demand_level" varchar(20) NOT NULL,
	"demand_score" integer DEFAULT 0 NOT NULL,
	"trend_direction" varchar(10) DEFAULT 'stable',
	"trend_velocity" integer DEFAULT 0,
	"search_volume" integer DEFAULT 0,
	"supply_gap" integer DEFAULT 0,
	"average_price" numeric(10, 2),
	"price_trend" varchar(10),
	"seasonal_peak" jsonb DEFAULT '[]'::jsonb,
	"trigger_events" jsonb DEFAULT '[]'::jsonb,
	"related_trends" jsonb DEFAULT '[]'::jsonb,
	"data_source" varchar(50) DEFAULT 'travelpulse',
	"confidence_score" integer DEFAULT 80,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_gap_analysis" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100),
	"service_type" varchar(100) NOT NULL,
	"current_supply_count" integer DEFAULT 0,
	"estimated_demand" integer DEFAULT 0,
	"gap_score" integer DEFAULT 0 NOT NULL,
	"price_range_gap" jsonb DEFAULT '{}'::jsonb,
	"quality_gap" integer DEFAULT 0,
	"availability_gap" integer DEFAULT 0,
	"language_gaps" jsonb DEFAULT '[]'::jsonb,
	"specialization_gaps" jsonb DEFAULT '[]'::jsonb,
	"competitor_analysis" jsonb DEFAULT '{}'::jsonb,
	"opportunity_description" text,
	"recommended_actions" jsonb DEFAULT '[]'::jsonb,
	"last_analyzed_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_provider_forms" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"business_name" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"website" text,
	"mobile" varchar(50) NOT NULL,
	"whatsapp" varchar(50),
	"country" varchar(100) NOT NULL,
	"address" text NOT NULL,
	"booking_link" text,
	"gst" varchar(100),
	"instagram_link" text,
	"facebook_link" text,
	"linkedin_link" text,
	"photo1" text,
	"photo2" text,
	"photo3" text,
	"photo4" text,
	"photo5" text,
	"business_type" varchar(100) NOT NULL,
	"service_offers" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"instant_booking" boolean DEFAULT false,
	"business_logo" text,
	"business_license" text,
	"business_gst_tax" text,
	"terms_and_conditions" boolean DEFAULT false,
	"info_confirmation" boolean DEFAULT false,
	"contact_request" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'pending',
	"rejection_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_recommendations" (
	"id" varchar PRIMARY KEY NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" varchar,
	"demand_signal_id" varchar,
	"title" varchar(255) NOT NULL,
	"description" text,
	"service_type" varchar(100) NOT NULL,
	"city" varchar(100),
	"country" varchar(100),
	"opportunity_score" integer DEFAULT 0 NOT NULL,
	"potential_revenue" numeric(10, 2),
	"competition_level" varchar(20),
	"action_items" jsonb DEFAULT '[]'::jsonb,
	"supporting_data" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"dismissed_at" timestamp,
	"converted_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_reviews" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar(20),
	"booking_id" varchar NOT NULL,
	"service_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"traveler_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"review_text" text,
	"response_text" text,
	"response_at" timestamp,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "service_reviews_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "service_subcategories" (
	"id" varchar PRIMARY KEY NOT NULL,
	"category_id" varchar NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(10),
	"price_range" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_templates" (
	"id" varchar PRIMARY KEY NOT NULL,
	"category_id" varchar,
	"title" varchar(255) NOT NULL,
	"short_description" varchar(150),
	"description" text,
	"service_type" varchar(50) DEFAULT 'planning',
	"suggested_price" numeric(10, 2),
	"price_range" jsonb DEFAULT '[]'::jsonb,
	"delivery_method" varchar(50),
	"delivery_timeframe" varchar(100),
	"what_included" jsonb DEFAULT '[]'::jsonb,
	"requirements" jsonb DEFAULT '[]'::jsonb,
	"usage_count" integer DEFAULT 0,
	"average_rating" numeric(3, 2),
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shared_itineraries" (
	"id" varchar PRIMARY KEY NOT NULL,
	"share_token" varchar NOT NULL,
	"variant_id" varchar NOT NULL,
	"shared_by_user_id" varchar NOT NULL,
	"shared_with_user_id" varchar,
	"permissions" varchar(20) DEFAULT 'view' NOT NULL,
	"expert_status" varchar(30) DEFAULT 'pending',
	"expert_notes" text,
	"expert_diff" jsonb,
	"transport_preferences" jsonb,
	"view_count" integer DEFAULT 0,
	"last_viewed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "shared_itineraries_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "shared_trip_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shared_trip_id" uuid,
	"trip_id" varchar,
	"viewer_ip" text,
	"viewer_country" text,
	"viewed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shared_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" text,
	"comparison_id" text,
	"shared_by" text,
	"trip_id" varchar,
	"share_token" text NOT NULL,
	"views" integer DEFAULT 0,
	"bookings" integer DEFAULT 0,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spontaneous_opportunities" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"type" varchar(50) NOT NULL,
	"source" varchar(50) NOT NULL,
	"external_id" varchar(255),
	"title" varchar(200) NOT NULL,
	"description" text,
	"image_url" text,
	"affiliate_url" text,
	"original_price" numeric(10, 2),
	"current_price" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"discount_percent" integer,
	"start_time" timestamp,
	"end_time" timestamp,
	"expiration_time" timestamp,
	"capacity" integer,
	"remaining_spots" integer,
	"urgency_score" integer DEFAULT 0,
	"actionability_score" integer DEFAULT 0,
	"trending_score" numeric(5, 2) DEFAULT '0.0',
	"category" varchar(100),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submit_itinerary_feedbacks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expert_id" varchar NOT NULL,
	"contract_id" varchar,
	"attachment" text,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"location" varchar(200) NOT NULL,
	"status" varchar(10) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_purchases" (
	"id" varchar PRIMARY KEY NOT NULL,
	"template_id" varchar NOT NULL,
	"buyer_id" varchar NOT NULL,
	"expert_id" varchar NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"platform_fee" numeric(10, 2) NOT NULL,
	"expert_earnings" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'completed',
	"purchased_at" timestamp DEFAULT now(),
	"refunded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "template_reviews" (
	"id" varchar PRIMARY KEY NOT NULL,
	"template_id" varchar NOT NULL,
	"purchase_id" varchar NOT NULL,
	"reviewer_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"review" text,
	"helpful_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "temporal_anchors" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"user_experience_id" varchar,
	"anchor_type" varchar(50) NOT NULL,
	"anchor_datetime" timestamp NOT NULL,
	"buffer_before" integer DEFAULT 0,
	"buffer_after" integer DEFAULT 0,
	"location" varchar(255),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"radius_km" integer DEFAULT 5,
	"must_return_to_hotel" boolean DEFAULT false,
	"is_immovable" boolean DEFAULT false,
	"depends_on_item_ids" jsonb DEFAULT '[]'::jsonb,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tourist_help_me_guide_activities" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"location" text NOT NULL,
	"activity" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_help_me_guide_events" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"location" text NOT NULL,
	"event" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_place_category" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tourist_place_category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tourist_place_results" (
	"id" varchar PRIMARY KEY NOT NULL,
	"search_id" varchar NOT NULL,
	"country" varchar(100) NOT NULL,
	"city" varchar(100) NOT NULL,
	"place" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"activities" jsonb NOT NULL,
	"festivals" jsonb NOT NULL,
	"latitude" varchar(200),
	"longitude" varchar(200),
	"category" varchar(200) NOT NULL,
	"best_months" varchar(100) NOT NULL,
	"image_url" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "tourist_places_searches" (
	"id" varchar PRIMARY KEY NOT NULL,
	"search" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tourist_preferences" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"preference_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_sequences" (
	"id" varchar PRIMARY KEY NOT NULL,
	"prefix" varchar(10) NOT NULL,
	"year_month" varchar(6) NOT NULL,
	"last_number" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tracking_sequences_prefix_year_month_unique" UNIQUE("prefix","year_month")
);
--> statement-breakpoint
CREATE TABLE "transfer_cache" (
	"id" varchar PRIMARY KEY NOT NULL,
	"offer_id" varchar(100) NOT NULL,
	"transfer_type" varchar(50) NOT NULL,
	"start_location_code" varchar(10) NOT NULL,
	"end_address" text,
	"end_city_name" varchar(255),
	"end_latitude" numeric(10, 7),
	"end_longitude" numeric(10, 7),
	"vehicle_code" varchar(50),
	"vehicle_category" varchar(100),
	"vehicle_description" text,
	"max_seats" integer,
	"price" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'USD',
	"provider" varchar(100) DEFAULT 'amadeus',
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_booking_options" (
	"id" varchar PRIMARY KEY NOT NULL,
	"transport_leg_id" varchar,
	"variant_id" varchar,
	"booking_type" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"mode_type" text NOT NULL,
	"icon_type" text,
	"price_display" text,
	"price_cents_low" integer,
	"price_cents_high" integer,
	"price_per_person" boolean DEFAULT false,
	"currency" text DEFAULT 'USD',
	"estimated_minutes" integer,
	"estimated_minutes_high" integer,
	"provider_id" integer,
	"external_url" text,
	"affiliate_code" text,
	"deep_link_scheme" text,
	"booking_status" text DEFAULT 'available',
	"confirmation_ref" text,
	"booking_id" integer,
	"is_multi_day_pass" boolean DEFAULT false,
	"pass_valid_days" integer,
	"savings_vs_individual_cents" integer,
	"rating" double precision,
	"review_count" integer,
	"sort_order" integer DEFAULT 0,
	"is_recommended" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transport_legs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"variant_id" varchar NOT NULL,
	"day_number" integer NOT NULL,
	"leg_order" integer NOT NULL,
	"from_activity_id" varchar,
	"from_name" text NOT NULL,
	"from_lat" double precision NOT NULL,
	"from_lng" double precision NOT NULL,
	"to_activity_id" varchar,
	"to_name" text NOT NULL,
	"to_lat" double precision NOT NULL,
	"to_lng" double precision NOT NULL,
	"distance_meters" integer NOT NULL,
	"distance_display" text NOT NULL,
	"recommended_mode" text NOT NULL,
	"user_selected_mode" text,
	"estimated_duration_minutes" integer NOT NULL,
	"estimated_cost_usd" double precision,
	"alternative_modes" jsonb,
	"energy_cost" integer DEFAULT 0,
	"linked_product_id" varchar,
	"linked_product_url" text,
	"calculated_at" timestamp DEFAULT now(),
	"destination_profile" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_calendar_events" (
	"id" varchar PRIMARY KEY NOT NULL,
	"event_name" varchar(255) NOT NULL,
	"event_type" varchar(50),
	"city" varchar(100),
	"country" varchar(100),
	"region" varchar(100),
	"start_date" date NOT NULL,
	"end_date" date,
	"crowd_impact" varchar(20),
	"price_impact" varchar(20),
	"crowd_impact_percent" integer,
	"description" text,
	"affected_areas" jsonb DEFAULT '[]'::jsonb,
	"tips" jsonb DEFAULT '[]'::jsonb,
	"source" varchar(50),
	"image_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_cities" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city_name" varchar(100) NOT NULL,
	"country" varchar(100) NOT NULL,
	"country_code" varchar(3),
	"region" varchar(100),
	"timezone" varchar(50),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"pulse_score" integer DEFAULT 0,
	"active_travelers" integer DEFAULT 0,
	"trending_score" integer DEFAULT 0,
	"crowd_level" varchar(20) DEFAULT 'moderate',
	"vibe_tags" jsonb DEFAULT '[]'::jsonb,
	"current_highlight" text,
	"highlight_emoji" varchar(10),
	"current_weather" jsonb DEFAULT '{}'::jsonb,
	"weather_score" integer DEFAULT 50,
	"avg_hotel_price" numeric(10, 2),
	"price_change" numeric(5, 2),
	"price_trend" varchar(20),
	"deal_alert" text,
	"total_trending_spots" integer DEFAULT 0,
	"total_hidden_gems" integer DEFAULT 0,
	"total_alerts" integer DEFAULT 0,
	"image_url" text,
	"thumbnail_url" text,
	"ai_generated_at" timestamp,
	"ai_source_model" varchar(50),
	"ai_best_time_to_visit" text,
	"ai_seasonal_highlights" jsonb DEFAULT '[]'::jsonb,
	"ai_upcoming_events" jsonb DEFAULT '[]'::jsonb,
	"ai_travel_tips" jsonb DEFAULT '[]'::jsonb,
	"ai_local_insights" text,
	"ai_safety_notes" text,
	"ai_optimal_duration" varchar(50),
	"ai_budget_estimate" jsonb DEFAULT '{}'::jsonb,
	"ai_must_see_attractions" jsonb DEFAULT '[]'::jsonb,
	"ai_avoid_dates" jsonb DEFAULT '[]'::jsonb,
	"expires_at" timestamp,
	"ai_refresh_error_count" integer DEFAULT 0,
	"last_refresh_status" varchar(20),
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_city_alerts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"severity" varchar(20) DEFAULT 'info',
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"emoji" varchar(10),
	"action_url" text,
	"action_text" varchar(50),
	"is_active" boolean DEFAULT true,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_crowd_forecasts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"place_name" varchar(255) NOT NULL,
	"city" varchar(100) NOT NULL,
	"forecast_date" date NOT NULL,
	"hour_of_day" integer NOT NULL,
	"crowd_level_percent" integer,
	"crowd_level_label" varchar(20),
	"confidence_score" numeric(3, 2),
	"weather_forecast" varchar(50),
	"special_events" jsonb DEFAULT '[]'::jsonb,
	"is_optimal_window" boolean DEFAULT false,
	"is_avoid_window" boolean DEFAULT false,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_discovery_scores" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"total_discovery_score" integer DEFAULT 0,
	"hidden_gems_found" integer DEFAULT 0,
	"emerging_spots_visited" integer DEFAULT 0,
	"tips_contributed" integer DEFAULT 0,
	"badges" jsonb DEFAULT '[]'::jsonb,
	"rank" varchar(50) DEFAULT 'Explorer',
	"last_activity_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_happening_now" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"venue" varchar(200),
	"address" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"crowd_level" varchar(20),
	"entry_fee" varchar(50),
	"image_url" text,
	"source_url" text,
	"is_live" boolean DEFAULT false,
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_hidden_gems" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100),
	"place_name" varchar(200) NOT NULL,
	"place_type" varchar(50),
	"address" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"local_rating" numeric(3, 2),
	"tourist_mentions" integer DEFAULT 0,
	"local_mentions" integer DEFAULT 0,
	"gem_score" integer DEFAULT 0,
	"discovery_status" varchar(20) DEFAULT 'hidden',
	"days_until_mainstream" integer,
	"description" text,
	"why_locals_love_it" text,
	"best_for" jsonb DEFAULT '[]'::jsonb,
	"price_range" varchar(10),
	"image_url" text,
	"ai_generated" boolean DEFAULT false,
	"ai_generated_at" timestamp,
	"detected_at" timestamp DEFAULT now(),
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_live_activity" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"place_name" varchar(200),
	"activity_type" varchar(50) NOT NULL,
	"activity_text" text NOT NULL,
	"activity_emoji" varchar(10),
	"user_name" varchar(50),
	"user_avatar" text,
	"likes_count" integer DEFAULT 0,
	"occurred_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_live_scores" (
	"id" varchar PRIMARY KEY NOT NULL,
	"entity_name" varchar(255) NOT NULL,
	"entity_type" varchar(50),
	"city" varchar(100) NOT NULL,
	"window_period" varchar(20) DEFAULT '24h',
	"mention_count" integer DEFAULT 0,
	"unique_users_count" integer DEFAULT 0,
	"avg_sentiment" numeric(3, 2),
	"positive_count" integer DEFAULT 0,
	"neutral_count" integer DEFAULT 0,
	"negative_count" integer DEFAULT 0,
	"sentiment_trend" varchar(10),
	"live_score" numeric(3, 2),
	"score_change_24h" numeric(3, 2),
	"score_change_7d" numeric(3, 2),
	"is_trending" boolean DEFAULT false,
	"trend_velocity" integer DEFAULT 0,
	"top_positive_keywords" jsonb DEFAULT '[]'::jsonb,
	"top_negative_keywords" jsonb DEFAULT '[]'::jsonb,
	"calculated_at" timestamp DEFAULT now(),
	"valid_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_trending" (
	"id" varchar PRIMARY KEY NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100),
	"destination_name" varchar(255) NOT NULL,
	"destination_type" varchar(50),
	"trend_score" integer DEFAULT 0,
	"growth_percent" integer DEFAULT 0,
	"mention_count" integer DEFAULT 0,
	"trend_status" varchar(20) DEFAULT 'emerging',
	"trigger_event" text,
	"live_score" numeric(3, 2),
	"live_score_change" numeric(3, 2),
	"sentiment_score" numeric(3, 2),
	"sentiment_trend" varchar(10),
	"worth_it_percent" integer,
	"meh_percent" integer,
	"avoid_percent" integer,
	"overall_verdict" varchar(20),
	"reality_score" integer,
	"top_highlights" jsonb DEFAULT '[]'::jsonb,
	"top_warnings" jsonb DEFAULT '[]'::jsonb,
	"crowdsourced_tips" jsonb DEFAULT '[]'::jsonb,
	"best_time_to_visit" varchar(100),
	"worst_time_to_visit" varchar(100),
	"crowd_forecast" jsonb DEFAULT '[]'::jsonb,
	"image_url" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"detected_at" timestamp DEFAULT now(),
	"last_updated" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "travel_pulse_truth_checks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"query_text" text NOT NULL,
	"query_hash" varchar(64) NOT NULL,
	"subject_name" varchar(255),
	"subject_type" varchar(50),
	"city" varchar(100),
	"posts_analyzed" integer DEFAULT 0,
	"analysis_start_date" date,
	"analysis_end_date" date,
	"worth_it_percent" integer,
	"meh_percent" integer,
	"avoid_percent" integer,
	"overall_verdict" varchar(20),
	"positive_mentions" jsonb DEFAULT '[]'::jsonb,
	"negative_mentions" jsonb DEFAULT '[]'::jsonb,
	"crowdsourced_tips" jsonb DEFAULT '[]'::jsonb,
	"reality_score" integer,
	"expectation_gap" integer,
	"hit_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"last_accessed_at" timestamp DEFAULT now(),
	CONSTRAINT "travel_pulse_truth_checks_query_hash_unique" UNIQUE("query_hash")
);
--> statement-breakpoint
CREATE TABLE "travelpayouts_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" varchar(100) NOT NULL,
	"cache_key" varchar(500) NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "travelpayouts_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "trending_experiences" (
	"id" varchar PRIMARY KEY NOT NULL,
	"destination" varchar(255),
	"experience_name" varchar(255) NOT NULL,
	"experience_type" varchar(50),
	"reason" text,
	"popularity_score" integer DEFAULT 0,
	"source" varchar(50) DEFAULT 'grok',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "trip_alerts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"severity" varchar(20) DEFAULT 'info',
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"source" varchar(100),
	"source_url" text,
	"effective_from" timestamp,
	"effective_until" timestamp,
	"is_active" boolean DEFAULT true,
	"is_read" boolean DEFAULT false,
	"acknowledged_at" timestamp,
	"acknowledged_by_user_id" varchar,
	"suggested_actions" jsonb DEFAULT '[]'::jsonb,
	"action_taken" text,
	"affected_itinerary_item_ids" jsonb DEFAULT '[]'::jsonb,
	"affected_vendor_contract_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_analytics_enhanced" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar,
	"user_id" varchar,
	"destination_country" varchar(100),
	"destination_region" varchar(100),
	"destination_city" varchar(100),
	"destination_type" varchar(50),
	"origin_country" varchar(100),
	"origin_region" varchar(100),
	"origin_city" varchar(100),
	"booking_date" timestamp,
	"trip_start_date" timestamp,
	"trip_end_date" timestamp,
	"lead_time_days" integer,
	"length_of_stay" integer,
	"season" varchar(20),
	"party_size" integer,
	"party_composition" varchar(50),
	"has_children" boolean,
	"trip_purpose" varchar(50),
	"total_budget" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"accommodation_budget" numeric(10, 2),
	"activities_budget" numeric(10, 2),
	"dining_budget" numeric(10, 2),
	"transport_budget" numeric(10, 2),
	"spend_per_day" numeric(10, 2),
	"price_segment" varchar(20),
	"activities_booked" jsonb,
	"primary_activity" varchar(100),
	"accommodation_type" varchar(50),
	"star_rating" integer,
	"booking_channel" varchar(50),
	"device_used" varchar(20),
	"other_destinations_considered" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_emergency_contacts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"contact_type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"organization" varchar(255),
	"phone" varchar(100),
	"alternate_phone" varchar(100),
	"email" varchar(255),
	"address" text,
	"website" text,
	"city" varchar(100),
	"country" varchar(100),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"available_24_hours" boolean DEFAULT false,
	"operating_hours" jsonb DEFAULT '{}'::jsonb,
	"languages" jsonb DEFAULT '["English"]'::jsonb,
	"priority" integer DEFAULT 0,
	"notes" text,
	"special_instructions" text,
	"is_verified" boolean DEFAULT false,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_expert_advisors" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"local_expert_id" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"message" text,
	"expert_response" text,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" varchar(255) NOT NULL,
	"item_type" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"date" date NOT NULL,
	"time" time,
	"duration" varchar(50),
	"day_number" integer,
	"order_in_day" integer DEFAULT 0,
	"price" numeric DEFAULT '0' NOT NULL,
	"is_price_estimated" boolean DEFAULT true,
	"currency" varchar(3) DEFAULT 'USD',
	"location_name" varchar(255),
	"latitude" numeric,
	"longitude" numeric,
	"address" text,
	"provider_id" varchar(255),
	"booking_type" varchar(20),
	"external_url" text,
	"affiliate_partner" varchar(50),
	"booking_status" varchar(20) DEFAULT 'not_booked',
	"confirmation_code" varchar(100),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_other_services" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"other_service" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "trip_participants" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"user_id" varchar,
	"name" varchar(200) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"role" varchar(50) DEFAULT 'guest',
	"status" varchar(20) DEFAULT 'invited',
	"invited_at" timestamp DEFAULT now(),
	"responded_at" timestamp,
	"rsvp_notes" text,
	"dietary_restrictions" jsonb DEFAULT '[]'::jsonb,
	"accessibility_needs" jsonb DEFAULT '[]'::jsonb,
	"special_requests" text,
	"payment_status" varchar(20) DEFAULT 'unpaid',
	"amount_owed" numeric(10, 2) DEFAULT '0',
	"amount_paid" numeric(10, 2) DEFAULT '0',
	"payment_method" varchar(50),
	"payment_notes" text,
	"emergency_contact_name" varchar(200),
	"emergency_contact_phone" varchar(50),
	"emergency_contact_relation" varchar(50),
	"arrival_datetime" timestamp,
	"departure_datetime" timestamp,
	"mobility_level" varchar(20) DEFAULT 'high',
	"mandatory_event_ids" jsonb DEFAULT '[]'::jsonb,
	"optional_event_ids" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_selected_flights" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"flight_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"origin" varchar(255),
	"destination" varchar(255),
	"departure_date" date,
	"return_date" date,
	"price_range" varchar(50),
	"image_url" varchar(1000),
	"website_url" varchar(1000),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "trip_selected_hotels" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"hotel_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"address" varchar(255),
	"rating" numeric,
	"price_range" varchar(50),
	"image_url" varchar(1000),
	"website_url" varchar(1000),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "trip_selected_places" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"place_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"address" varchar(255),
	"rating" numeric,
	"image_url" varchar(1000),
	"website_url" varchar(1000),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "trip_selected_services" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"service_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"service_type" varchar(50) NOT NULL,
	"price_range" varchar(50),
	"image_url" varchar(1000),
	"website_url" varchar(1000),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "trip_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" varchar NOT NULL,
	"expert_id" varchar NOT NULL,
	"type" varchar(50) NOT NULL,
	"day_number" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"estimated_cost" numeric(10, 2),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"rejection_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "trip_transactions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"transaction_type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'unpaid',
	"paid_by_participant_id" varchar,
	"paid_to_vendor_contract_id" varchar,
	"assigned_to_participant_id" varchar,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"original_amount" numeric(10, 2),
	"original_currency" varchar(3),
	"exchange_rate" numeric(10, 6),
	"category" varchar(50),
	"subcategory" varchar(50),
	"description" text,
	"payment_method" varchar(50),
	"payment_reference" varchar(255),
	"receipt_url" text,
	"transaction_date" timestamp DEFAULT now(),
	"due_date" timestamp,
	"paid_date" timestamp,
	"tip_amount" numeric(10, 2),
	"tip_percentage" numeric(5, 2),
	"split_method" varchar(20),
	"split_details" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"tracking_number" varchar(20),
	"title" varchar(255) DEFAULT 'My Trip',
	"event_type" varchar(30) DEFAULT 'vacation',
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"destination" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"number_of_travelers" integer DEFAULT 1,
	"adults" integer DEFAULT 2,
	"kids" integer DEFAULT 0,
	"budget" numeric(10, 2),
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"event_details" jsonb DEFAULT '{}'::jsonb,
	"experience_type" varchar(20),
	"travelers" integer,
	"special_requests" text,
	"expert_id" varchar(255),
	"expert_notes" text,
	"expert_modified_at" timestamp,
	"booking_reference" varchar(50),
	"is_public" boolean DEFAULT false,
	"share_token" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "trips_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "user_and_expert_chats" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar(20),
	"sender_id" varchar NOT NULL,
	"receiver_id" varchar,
	"contract_id" varchar,
	"message" text,
	"attachment" text,
	"itinerary_submit_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"read_at" timestamp,
	CONSTRAINT "user_and_expert_chats_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "user_and_expert_contracts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"trip_to" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"is_paid" boolean DEFAULT false,
	"payment_url" text,
	"attachment" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_experience_items" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_experience_id" varchar NOT NULL,
	"step_id" varchar,
	"provider_service_id" varchar,
	"external_service_data" jsonb DEFAULT '{}'::jsonb,
	"is_external" boolean DEFAULT false,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2),
	"scheduled_date" timestamp,
	"scheduled_time" varchar(20),
	"location" varchar(255),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"status" varchar(20) DEFAULT 'pending',
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_experiences" (
	"id" varchar PRIMARY KEY NOT NULL,
	"tracking_number" varchar(20),
	"user_id" varchar NOT NULL,
	"experience_type_id" varchar NOT NULL,
	"title" varchar(255),
	"status" varchar(20) DEFAULT 'draft',
	"event_date" date,
	"location" varchar(255),
	"budget" numeric(10, 2),
	"guest_count" integer,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"step_data" jsonb DEFAULT '{}'::jsonb,
	"current_step" integer DEFAULT 1,
	"map_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_experiences_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
CREATE TABLE "user_filter_preferences" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"item_type" varchar(30) NOT NULL,
	"price_min" numeric(10, 2) DEFAULT '0',
	"price_max" numeric(10, 2) DEFAULT '10000',
	"min_rating" numeric(3, 2) DEFAULT '0',
	"sort_by" varchar(30) DEFAULT 'popularity',
	"selected_tags" jsonb DEFAULT '[]'::jsonb,
	"search_query" text,
	"county" varchar(100),
	"state" varchar(100),
	"country_code" varchar(10),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_saved_gems" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"gem_id" varchar NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_spontaneity_preferences" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"spontaneity_level" integer DEFAULT 50,
	"notification_radius" integer DEFAULT 10,
	"preferred_cities" jsonb DEFAULT '[]'::jsonb,
	"preferred_categories" jsonb DEFAULT '[]'::jsonb,
	"blacklisted_types" jsonb DEFAULT '[]'::jsonb,
	"price_sensitivity" integer DEFAULT 50,
	"max_budget_per_activity" numeric(10, 2),
	"time_windows" jsonb DEFAULT '[{"day":"weekend","hours":["18:00","22:00"]},{"day":"weekday","hours":["19:00","23:00"]}]'::jsonb,
	"enable_notifications" boolean DEFAULT true,
	"last_notified_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendor_assignments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"vendor_id" varchar NOT NULL,
	"service_type" varchar(100) NOT NULL,
	"status" varchar(30) DEFAULT 'pending',
	"notes" text,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendor_availability_slots" (
	"id" varchar PRIMARY KEY NOT NULL,
	"service_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"date" date NOT NULL,
	"start_time" varchar(10),
	"end_time" varchar(10),
	"capacity" integer DEFAULT 1,
	"booked_count" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'available',
	"pricing" jsonb DEFAULT '{}'::jsonb,
	"discounts" jsonb DEFAULT '[]'::jsonb,
	"minimum_notice" varchar(50) DEFAULT '24 hours',
	"cancellation_policy" varchar(100),
	"special_requirements" jsonb DEFAULT '[]'::jsonb,
	"confirmation_method" varchar(20) DEFAULT 'instant',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendor_contracts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"trip_id" varchar NOT NULL,
	"vendor_id" varchar,
	"vendor_name" varchar(255) NOT NULL,
	"vendor_category" varchar(100),
	"vendor_email" varchar(255),
	"vendor_phone" varchar(50),
	"vendor_address" text,
	"contract_status" varchar(20) DEFAULT 'draft',
	"contract_number" varchar(100),
	"service_description" text,
	"start_date" date,
	"end_date" date,
	"total_amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"paid_amount" numeric(10, 2) DEFAULT '0',
	"remaining_balance" numeric(10, 2),
	"payment_schedule" jsonb DEFAULT '[]'::jsonb,
	"contract_document_url" text,
	"signed_document_url" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"cancellation_policy" text,
	"special_terms" text,
	"notes" text,
	"communication_log" jsonb DEFAULT '[]'::jsonb,
	"last_contact_date" timestamp,
	"next_follow_up_date" timestamp,
	"assigned_to_participant_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text,
	"email" varchar(255),
	"phone" varchar(50),
	"website" varchar(500),
	"address" text,
	"city" varchar(100),
	"country" varchar(100),
	"rating" numeric(3, 2),
	"price_range" varchar(50),
	"image_url" varchar(1000),
	"status" varchar(30) DEFAULT 'active',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"credits" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password" varchar(255),
	"email_verified" timestamp,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar(30) DEFAULT 'user',
	"bio" varchar(500),
	"specialties" jsonb DEFAULT '[]'::jsonb,
	"terms_accepted_at" timestamp,
	"privacy_accepted_at" timestamp,
	"terms_version" varchar(20),
	"privacy_version" varchar(20),
	"instagram_user_id" varchar,
	"instagram_access_token" varchar(512),
	"auth_provider" varchar(20) DEFAULT 'email',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"user_id" varchar(255),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_audit_logs" ADD CONSTRAINT "access_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_audit_logs" ADD CONSTRAINT "access_audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_booking_analytics" ADD CONSTRAINT "activity_booking_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_product_id_affiliate_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."affiliate_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_partner_id_affiliate_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_click_id_affiliate_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."affiliate_clicks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_partner_id_affiliate_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_earnings" ADD CONSTRAINT "affiliate_earnings_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_products" ADD CONSTRAINT "affiliate_products_partner_id_affiliate_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_scrape_jobs" ADD CONSTRAINT "affiliate_scrape_jobs_partner_id_affiliate_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."affiliate_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_trips" ADD CONSTRAINT "affiliate_trips_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_blueprints" ADD CONSTRAINT "ai_blueprints_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_blueprints" ADD CONSTRAINT "ai_blueprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generated_itineraries" ADD CONSTRAINT "ai_generated_itineraries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generated_itineraries" ADD CONSTRAINT "ai_generated_itineraries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_funnel_analytics" ADD CONSTRAINT "booking_funnel_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_service_id_provider_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."provider_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_custom_venue_id_custom_venues_id_fk" FOREIGN KEY ("custom_venue_id") REFERENCES "public"."custom_venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_media_cache" ADD CONSTRAINT "city_media_cache_city_id_travel_pulse_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."travel_pulse_cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_analytics" ADD CONSTRAINT "content_analytics_tracking_number_content_registry_tracking_number_fk" FOREIGN KEY ("tracking_number") REFERENCES "public"."content_registry"("tracking_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_tracking_number_content_registry_tracking_number_fk" FOREIGN KEY ("tracking_number") REFERENCES "public"."content_registry"("tracking_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_invoices" ADD CONSTRAINT "content_invoices_tracking_number_content_registry_tracking_number_fk" FOREIGN KEY ("tracking_number") REFERENCES "public"."content_registry"("tracking_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_invoices" ADD CONSTRAINT "content_invoices_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_invoices" ADD CONSTRAINT "content_invoices_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_registry" ADD CONSTRAINT "content_registry_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_registry" ADD CONSTRAINT "content_registry_flagged_by_users_id_fk" FOREIGN KEY ("flagged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_registry" ADD CONSTRAINT "content_registry_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_tracking_number_content_registry_tracking_number_fk" FOREIGN KEY ("tracking_number") REFERENCES "public"."content_registry"("tracking_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_bookings" ADD CONSTRAINT "coordination_bookings_coordination_id_coordination_states_id_fk" FOREIGN KEY ("coordination_id") REFERENCES "public"."coordination_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_bookings" ADD CONSTRAINT "coordination_bookings_vendor_id_users_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_bookings" ADD CONSTRAINT "coordination_bookings_service_id_provider_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."provider_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_bookings" ADD CONSTRAINT "coordination_bookings_availability_slot_id_vendor_availability_slots_id_fk" FOREIGN KEY ("availability_slot_id") REFERENCES "public"."vendor_availability_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_states" ADD CONSTRAINT "coordination_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_states" ADD CONSTRAINT "coordination_states_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_states" ADD CONSTRAINT "coordination_states_assigned_expert_id_users_id_fk" FOREIGN KEY ("assigned_expert_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_venues" ADD CONSTRAINT "custom_venues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_venues" ADD CONSTRAINT "custom_venues_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_boundaries" ADD CONSTRAINT "day_boundaries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_events" ADD CONSTRAINT "destination_events_contributor_id_users_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_events" ADD CONSTRAINT "destination_events_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_search_patterns" ADD CONSTRAINT "destination_search_patterns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_tracking" ADD CONSTRAINT "energy_tracking_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_template_filter_options" ADD CONSTRAINT "experience_template_filter_options_filter_id_experience_template_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."experience_template_filters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_template_filters" ADD CONSTRAINT "experience_template_filters_tab_id_experience_template_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."experience_template_tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_template_steps" ADD CONSTRAINT "experience_template_steps_experience_type_id_experience_types_id_fk" FOREIGN KEY ("experience_type_id") REFERENCES "public"."experience_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_template_tabs" ADD CONSTRAINT "experience_template_tabs_experience_type_id_experience_types_id_fk" FOREIGN KEY ("experience_type_id") REFERENCES "public"."experience_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_universal_filter_options" ADD CONSTRAINT "experience_universal_filter_options_filter_id_experience_universal_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."experience_universal_filters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_universal_filters" ADD CONSTRAINT "experience_universal_filters_experience_type_id_experience_types_id_fk" FOREIGN KEY ("experience_type_id") REFERENCES "public"."experience_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_ai_tasks" ADD CONSTRAINT "expert_ai_tasks_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_custom_services" ADD CONSTRAINT "expert_custom_services_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_custom_services" ADD CONSTRAINT "expert_custom_services_existing_category_id_expert_service_categories_id_fk" FOREIGN KEY ("existing_category_id") REFERENCES "public"."expert_service_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_custom_services" ADD CONSTRAINT "expert_custom_services_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_earnings" ADD CONSTRAINT "expert_earnings_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_experience_types" ADD CONSTRAINT "expert_experience_types_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_experience_types" ADD CONSTRAINT "expert_experience_types_experience_type_id_experience_types_id_fk" FOREIGN KEY ("experience_type_id") REFERENCES "public"."experience_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_match_analytics" ADD CONSTRAINT "expert_match_analytics_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_match_analytics" ADD CONSTRAINT "expert_match_analytics_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_match_scores" ADD CONSTRAINT "expert_match_scores_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_match_scores" ADD CONSTRAINT "expert_match_scores_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_match_scores" ADD CONSTRAINT "expert_match_scores_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_payouts" ADD CONSTRAINT "expert_payouts_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_referrals" ADD CONSTRAINT "expert_referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_referrals" ADD CONSTRAINT "expert_referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_requests" ADD CONSTRAINT "expert_requests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_selected_services" ADD CONSTRAINT "expert_selected_services_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_selected_services" ADD CONSTRAINT "expert_selected_services_service_offering_id_expert_service_offerings_id_fk" FOREIGN KEY ("service_offering_id") REFERENCES "public"."expert_service_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_service_offerings" ADD CONSTRAINT "expert_service_offerings_category_id_expert_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expert_service_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_specializations" ADD CONSTRAINT "expert_specializations_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_templates" ADD CONSTRAINT "expert_templates_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_tips" ADD CONSTRAINT "expert_tips_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_tips" ADD CONSTRAINT "expert_tips_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_tips" ADD CONSTRAINT "expert_tips_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."service_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_updated_itineraries" ADD CONSTRAINT "expert_updated_itineraries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_updated_itineraries" ADD CONSTRAINT "expert_updated_itineraries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_vendor_coordination" ADD CONSTRAINT "expert_vendor_coordination_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_vendor_coordination" ADD CONSTRAINT "expert_vendor_coordination_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_vendor_coordination" ADD CONSTRAINT "expert_vendor_coordination_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_itineraries" ADD CONSTRAINT "generated_itineraries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_guide_trips" ADD CONSTRAINT "help_guide_trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_offer_cache" ADD CONSTRAINT "hotel_offer_cache_hotel_cache_id_hotel_cache_id_fk" FOREIGN KEY ("hotel_cache_id") REFERENCES "public"."hotel_cache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_curated_content" ADD CONSTRAINT "influencer_curated_content_influencer_id_users_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_referrals" ADD CONSTRAINT "influencer_referrals_influencer_id_users_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_referrals" ADD CONSTRAINT "influencer_referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_changes" ADD CONSTRAINT "itinerary_changes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_comparisons" ADD CONSTRAINT "itinerary_comparisons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_comparisons" ADD CONSTRAINT "itinerary_comparisons_user_experience_id_user_experiences_id_fk" FOREIGN KEY ("user_experience_id") REFERENCES "public"."user_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_comparisons" ADD CONSTRAINT "itinerary_comparisons_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_vendor_contract_id_vendor_contracts_id_fk" FOREIGN KEY ("vendor_contract_id") REFERENCES "public"."vendor_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_variant_items" ADD CONSTRAINT "itinerary_variant_items_variant_id_itinerary_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."itinerary_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_variant_items" ADD CONSTRAINT "itinerary_variant_items_provider_service_id_provider_services_id_fk" FOREIGN KEY ("provider_service_id") REFERENCES "public"."provider_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_variant_metrics" ADD CONSTRAINT "itinerary_variant_metrics_variant_id_itinerary_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."itinerary_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_variants" ADD CONSTRAINT "itinerary_variants_comparison_id_itinerary_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."itinerary_comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_events" ADD CONSTRAINT "live_events_search_id_tourist_places_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."tourist_places_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_expert_forms" ADD CONSTRAINT "local_expert_forms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_export_cache" ADD CONSTRAINT "maps_export_cache_variant_id_itinerary_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."itinerary_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_view_analytics" ADD CONSTRAINT "page_view_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_revenue" ADD CONSTRAINT "platform_revenue_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_revenue" ADD CONSTRAINT "platform_revenue_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_availability_schedule" ADD CONSTRAINT "provider_availability_schedule_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_blackout_dates" ADD CONSTRAINT "provider_blackout_dates_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_booking_requests" ADD CONSTRAINT "provider_booking_requests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_booking_requests" ADD CONSTRAINT "provider_booking_requests_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_booking_requests" ADD CONSTRAINT "provider_booking_requests_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_earnings" ADD CONSTRAINT "provider_earnings_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_payouts" ADD CONSTRAINT "provider_payouts_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_performance_metrics" ADD CONSTRAINT "provider_performance_metrics_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_signals" ADD CONSTRAINT "realtime_signals_opportunity_id_spontaneous_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."spontaneous_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_conversions" ADD CONSTRAINT "recommendation_conversions_recommendation_id_service_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."service_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_conversions" ADD CONSTRAINT "recommendation_conversions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_local_expert_id_users_id_fk" FOREIGN KEY ("local_expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_analytics" ADD CONSTRAINT "search_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_service_id_provider_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."provider_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_contract_id_user_and_expert_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."user_and_expert_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD CONSTRAINT "service_provider_forms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_recommendations" ADD CONSTRAINT "service_recommendations_demand_signal_id_service_demand_signals_id_fk" FOREIGN KEY ("demand_signal_id") REFERENCES "public"."service_demand_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_service_id_provider_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."provider_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_subcategories" ADD CONSTRAINT "service_subcategories_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_templates" ADD CONSTRAINT "service_templates_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_itineraries" ADD CONSTRAINT "shared_itineraries_variant_id_itinerary_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."itinerary_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_itineraries" ADD CONSTRAINT "shared_itineraries_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_itineraries" ADD CONSTRAINT "shared_itineraries_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_trip_views" ADD CONSTRAINT "shared_trip_views_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_trips" ADD CONSTRAINT "shared_trips_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submit_itinerary_feedbacks" ADD CONSTRAINT "submit_itinerary_feedbacks_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submit_itinerary_feedbacks" ADD CONSTRAINT "submit_itinerary_feedbacks_contract_id_user_and_expert_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."user_and_expert_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_purchases" ADD CONSTRAINT "template_purchases_template_id_expert_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."expert_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_purchases" ADD CONSTRAINT "template_purchases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_purchases" ADD CONSTRAINT "template_purchases_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_reviews" ADD CONSTRAINT "template_reviews_template_id_expert_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."expert_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_reviews" ADD CONSTRAINT "template_reviews_purchase_id_template_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."template_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_reviews" ADD CONSTRAINT "template_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_anchors" ADD CONSTRAINT "temporal_anchors_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporal_anchors" ADD CONSTRAINT "temporal_anchors_user_experience_id_user_experiences_id_fk" FOREIGN KEY ("user_experience_id") REFERENCES "public"."user_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_help_me_guide_activities" ADD CONSTRAINT "tourist_help_me_guide_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_help_me_guide_events" ADD CONSTRAINT "tourist_help_me_guide_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_place_results" ADD CONSTRAINT "tourist_place_results_search_id_tourist_places_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."tourist_places_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_preferences" ADD CONSTRAINT "tourist_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tourist_preferences" ADD CONSTRAINT "tourist_preferences_preference_id_tourist_place_results_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."tourist_place_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_booking_options" ADD CONSTRAINT "transport_booking_options_transport_leg_id_transport_legs_id_fk" FOREIGN KEY ("transport_leg_id") REFERENCES "public"."transport_legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_booking_options" ADD CONSTRAINT "transport_booking_options_variant_id_itinerary_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."itinerary_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_legs" ADD CONSTRAINT "transport_legs_variant_id_itinerary_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."itinerary_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_alerts" ADD CONSTRAINT "trip_alerts_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_alerts" ADD CONSTRAINT "trip_alerts_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_analytics_enhanced" ADD CONSTRAINT "trip_analytics_enhanced_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_analytics_enhanced" ADD CONSTRAINT "trip_analytics_enhanced_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_emergency_contacts" ADD CONSTRAINT "trip_emergency_contacts_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expert_advisors" ADD CONSTRAINT "trip_expert_advisors_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expert_advisors" ADD CONSTRAINT "trip_expert_advisors_local_expert_id_users_id_fk" FOREIGN KEY ("local_expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_other_services" ADD CONSTRAINT "trip_other_services_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_selected_flights" ADD CONSTRAINT "trip_selected_flights_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_selected_hotels" ADD CONSTRAINT "trip_selected_hotels_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_selected_places" ADD CONSTRAINT "trip_selected_places_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_selected_services" ADD CONSTRAINT "trip_selected_services_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_suggestions" ADD CONSTRAINT "trip_suggestions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_suggestions" ADD CONSTRAINT "trip_suggestions_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_transactions" ADD CONSTRAINT "trip_transactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_transactions" ADD CONSTRAINT "trip_transactions_paid_by_participant_id_trip_participants_id_fk" FOREIGN KEY ("paid_by_participant_id") REFERENCES "public"."trip_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_transactions" ADD CONSTRAINT "trip_transactions_paid_to_vendor_contract_id_vendor_contracts_id_fk" FOREIGN KEY ("paid_to_vendor_contract_id") REFERENCES "public"."vendor_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_transactions" ADD CONSTRAINT "trip_transactions_assigned_to_participant_id_trip_participants_id_fk" FOREIGN KEY ("assigned_to_participant_id") REFERENCES "public"."trip_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_expert_id_users_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_and_expert_chats" ADD CONSTRAINT "user_and_expert_chats_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_and_expert_chats" ADD CONSTRAINT "user_and_expert_chats_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_and_expert_chats" ADD CONSTRAINT "user_and_expert_chats_contract_id_user_and_expert_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."user_and_expert_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_and_expert_chats" ADD CONSTRAINT "user_and_expert_chats_itinerary_submit_id_submit_itinerary_feedbacks_id_fk" FOREIGN KEY ("itinerary_submit_id") REFERENCES "public"."submit_itinerary_feedbacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experience_items" ADD CONSTRAINT "user_experience_items_user_experience_id_user_experiences_id_fk" FOREIGN KEY ("user_experience_id") REFERENCES "public"."user_experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experience_items" ADD CONSTRAINT "user_experience_items_step_id_experience_template_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."experience_template_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experience_items" ADD CONSTRAINT "user_experience_items_provider_service_id_provider_services_id_fk" FOREIGN KEY ("provider_service_id") REFERENCES "public"."provider_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experiences" ADD CONSTRAINT "user_experiences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experiences" ADD CONSTRAINT "user_experiences_experience_type_id_experience_types_id_fk" FOREIGN KEY ("experience_type_id") REFERENCES "public"."experience_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_filter_preferences" ADD CONSTRAINT "user_filter_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_gems" ADD CONSTRAINT "user_saved_gems_gem_id_ai_discovered_gems_id_fk" FOREIGN KEY ("gem_id") REFERENCES "public"."ai_discovered_gems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_spontaneity_preferences" ADD CONSTRAINT "user_spontaneity_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_availability_slots" ADD CONSTRAINT "vendor_availability_slots_service_id_provider_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."provider_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_availability_slots" ADD CONSTRAINT "vendor_availability_slots_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_assigned_to_participant_id_trip_participants_id_fk" FOREIGN KEY ("assigned_to_participant_id") REFERENCES "public"."trip_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");