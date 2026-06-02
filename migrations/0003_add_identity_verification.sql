CREATE TABLE "provider_settings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"instant_booking" boolean DEFAULT false,
	"auto_response" boolean DEFAULT true,
	"minimum_lead_time_days" integer DEFAULT 7,
	"target_response_time_hours" integer DEFAULT 2,
	"payout_frequency" varchar(20) DEFAULT 'monthly',
	"minimum_payout_amount" numeric(10, 2) DEFAULT '100',
	"notifications_json" jsonb DEFAULT '{"newBookings":true,"bookingUpdates":true,"messages":true,"reviews":true,"payouts":true,"marketing":false}'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "provider_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "local_expert_forms" ADD COLUMN "identity_verification_session_id" varchar(255);--> statement-breakpoint
ALTER TABLE "local_expert_forms" ADD COLUMN "identity_verification_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "local_expert_forms" ADD COLUMN "identity_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "data" jsonb;--> statement-breakpoint
ALTER TABLE "provider_services" ADD COLUMN "revenue_share_rate" numeric(4, 2) DEFAULT '0.30';--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "identity_verification_session_id" varchar(255);--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "identity_verification_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "identity_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "business_verification_status" varchar(20) DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "business_country" varchar(100);--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "business_registration_number" varchar(255);--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "business_documents" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "service_provider_forms" ADD COLUMN "persona_inquiry_id" varchar(255);--> statement-breakpoint
ALTER TABLE "trip_expert_advisors" ADD COLUMN "workspace_status" varchar(20) DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "provider_settings" ADD CONSTRAINT "provider_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;