-- 000_baseline_schema.sql
-- Idempotent baseline DDL for all tables managed by the Drizzle ORM.
-- Runs first in the migration chain on a fresh CI database so that
-- migrations 001+ can safely add FKs/columns to pre-existing tables.
-- Generated from the live schema via pg_dump --schema-only and transformed:
--   CREATE TABLE/SEQUENCE/INDEX -> IF NOT EXISTS
--   CREATE TYPE (no IF NOT EXISTS in Postgres) -> DO $$ EXCEPTION WHEN duplicate_object
--   ALTER TABLE ADD CONSTRAINT -> DO $$ EXCEPTION WHEN duplicate_object


--
--





DO $$ BEGIN
  CREATE TYPE public.content_status AS ENUM (
    'draft',
    'pending_review',
    'published',
    'flagged',
    'under_review',
    'suspended',
    'archived',
    'deleted'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.content_type AS ENUM (
    'trip',
    'itinerary',
    'service',
    'review',
    'chat_message',
    'expert_profile',
    'provider_profile',
    'template',
    'booking',
    'vendor',
    'experience',
    'custom_venue',
    'contract',
    'media',
    'tip',
    'affiliate_product',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.access_audit_logs (
    id character varying NOT NULL,
    actor_id character varying NOT NULL,
    actor_role character varying(30) NOT NULL,
    action character varying(50) NOT NULL,
    resource_type character varying(50) NOT NULL,
    resource_id character varying,
    target_user_id character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_booking_analytics (
    id character varying NOT NULL,
    session_id character varying(100),
    user_id character varying,
    activity_type character varying(100) NOT NULL,
    activity_category character varying(100),
    service_name character varying(255),
    provider_id character varying,
    provider_type character varying(50),
    destination character varying(255),
    country character varying(100),
    city character varying(100),
    booking_status character varying(50),
    price numeric(10,2),
    currency character varying(3) DEFAULT 'USD'::character varying,
    group_size integer,
    trip_type character varying(50),
    traveler_origin_country character varying(100),
    booking_lead_days integer,
    activity_date timestamp without time zone,
    device_type character varying(20),
    referral_source character varying(100),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_cache (
    id character varying NOT NULL,
    product_code character varying(100) NOT NULL,
    destination character varying(255) NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    meeting_point text,
    duration_minutes integer,
    price numeric(10,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    rating numeric(3,2),
    review_count integer DEFAULT 0,
    image_url text,
    flags jsonb DEFAULT '[]'::jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    address text,
    city character varying(255),
    state character varying(100),
    county character varying(100),
    country_code character varying(10),
    country_name character varying(100),
    postal_code character varying(20),
    provider character varying(100) DEFAULT 'viator'::character varying,
    category character varying(100),
    subcategory character varying(100),
    preference_tags jsonb DEFAULT '[]'::jsonb,
    popularity_score integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.activity_comments (
    id character varying NOT NULL,
    activity_id character varying NOT NULL,
    trip_id character varying NOT NULL,
    author_id character varying NOT NULL,
    author_name character varying(255) NOT NULL,
    text text NOT NULL,
    role character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    parent_id character varying
);

CREATE TABLE IF NOT EXISTS public.activity_demand_trends (
    id character varying NOT NULL,
    activity_type character varying(100) NOT NULL,
    destination character varying(255),
    country character varying(100),
    period character varying(20) NOT NULL,
    period_start timestamp without time zone NOT NULL,
    search_count integer DEFAULT 0,
    view_count integer DEFAULT 0,
    inquiry_count integer DEFAULT 0,
    booking_count integer DEFAULT 0,
    total_revenue numeric(12,2) DEFAULT 0,
    avg_price numeric(10,2),
    avg_group_size numeric(5,1),
    top_origin_countries jsonb,
    trip_type_breakdown jsonb,
    conversion_rate numeric(5,2),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliate_booking_requests (
    id character varying NOT NULL,
    user_id character varying(255) NOT NULL,
    expert_id character varying(255),
    item_name character varying(255) NOT NULL,
    item_description text,
    partner_name character varying(100) NOT NULL,
    partner_category character varying(50),
    affiliate_url text NOT NULL,
    travel_date date,
    travelers integer DEFAULT 1,
    user_notes text,
    expert_notes text,
    confirmation_ref character varying(255),
    price numeric(10,2),
    status character varying(30) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    trip_id character varying
);

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
    id character varying NOT NULL,
    product_id character varying,
    partner_id character varying,
    user_id character varying,
    trip_id character varying,
    itinerary_item_id character varying,
    referrer character varying(500),
    user_agent character varying(500),
    ip_address character varying(50),
    clicked_at timestamp without time zone DEFAULT now(),
    initiated_by character varying(20) DEFAULT 'user'::character varying,
    agent_type character varying(20),
    session_id character varying(255),
    source_impression_id text,
    click_content_type text,
    click_content_id text
);

CREATE TABLE IF NOT EXISTS public.affiliate_earnings (
    id character varying NOT NULL,
    click_id character varying,
    partner_id character varying,
    expert_id character varying,
    booking_amount numeric(10,2) NOT NULL,
    commission_rate numeric(5,2) NOT NULL,
    total_commission numeric(10,2) NOT NULL,
    platform_share numeric(10,2) NOT NULL,
    expert_share numeric(10,2) NOT NULL,
    provider_share numeric(10,2) DEFAULT 0.00,
    currency character varying(10) DEFAULT 'USD'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    confirmed_at timestamp without time zone,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    partner_reference_id character varying(255),
    reconciliation_status character varying(20) DEFAULT 'unmatched'::character varying,
    reconciled_at timestamp without time zone,
    reconciliation_notes text,
    external_report_data jsonb,
    content_tracking_number character varying(25)
);

CREATE TABLE IF NOT EXISTS public.affiliate_partners (
    id character varying NOT NULL,
    name character varying(200) NOT NULL,
    website_url character varying(500) NOT NULL,
    category character varying(100) NOT NULL,
    affiliate_tracking_id character varying(200),
    affiliate_link_template character varying(1000),
    description text,
    logo_url character varying(500),
    commission_rate numeric(5,2),
    scrape_config jsonb,
    is_active boolean DEFAULT true,
    last_scraped_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliate_platforms (
    id character varying NOT NULL,
    title character varying(100) NOT NULL,
    image_url text NOT NULL,
    platform character varying(10) NOT NULL,
    base_url text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliate_products (
    id character varying NOT NULL,
    partner_id character varying NOT NULL,
    external_id character varying(200),
    name character varying(500) NOT NULL,
    description text,
    short_description character varying(500),
    category character varying(100),
    sub_category character varying(100),
    price numeric(10,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    original_price numeric(10,2),
    discount_percent integer,
    image_url character varying(1000),
    image_urls jsonb DEFAULT '[]'::jsonb,
    product_url character varying(1000) NOT NULL,
    affiliate_url character varying(1500),
    location character varying(300),
    city character varying(100),
    country character varying(100),
    coordinates jsonb,
    rating numeric(3,2),
    review_count integer,
    duration character varying(100),
    highlights jsonb DEFAULT '[]'::jsonb,
    includes jsonb DEFAULT '[]'::jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    availability character varying(200),
    booking_info text,
    metadata jsonb,
    is_active boolean DEFAULT true,
    last_scraped_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(25)
);

CREATE TABLE IF NOT EXISTS public.affiliate_scrape_jobs (
    id character varying NOT NULL,
    partner_id character varying NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    products_found integer DEFAULT 0,
    products_updated integer DEFAULT 0,
    products_new integer DEFAULT 0,
    pages_scraped integer DEFAULT 0,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.affiliate_trips (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    place_data jsonb DEFAULT '[]'::jsonb,
    hotel_data jsonb DEFAULT '[]'::jsonb,
    service_data jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_blueprints (
    id character varying NOT NULL,
    trip_id character varying,
    user_id character varying,
    event_type character varying(30) NOT NULL,
    destination character varying(255),
    blueprint_data jsonb DEFAULT '{}'::jsonb,
    status character varying(30) DEFAULT 'generated'::character varying,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_cost_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_type character varying(50) NOT NULL,
    model_used character varying(100),
    request_id character varying(255),
    user_id uuid,
    cost numeric(10,6) NOT NULL,
    tokens_in integer,
    tokens_out integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ai_discovered_gems (
    id character varying NOT NULL,
    destination character varying(200) NOT NULL,
    country character varying(100),
    category character varying(100) NOT NULL,
    name character varying(300) NOT NULL,
    description text NOT NULL,
    why_special text,
    best_time_to_visit character varying(200),
    insider_tip text,
    approximate_location character varying(300),
    coordinates jsonb,
    price_range character varying(50),
    difficulty_level character varying(50),
    tags jsonb DEFAULT '[]'::jsonb,
    image_search_terms jsonb DEFAULT '[]'::jsonb,
    related_experiences jsonb DEFAULT '[]'::jsonb,
    source_model character varying(50) DEFAULT 'grok'::character varying,
    confidence_score numeric(3,2),
    verified_by_user boolean DEFAULT false,
    verified_by_expert boolean DEFAULT false,
    view_count integer DEFAULT 0,
    save_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    last_refreshed_at timestamp without time zone,
    image_url text
);

CREATE TABLE IF NOT EXISTS public.ai_generated_itineraries (
    id character varying NOT NULL,
    user_id character varying,
    trip_id character varying,
    destination character varying(255) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    title character varying(255),
    summary text,
    total_estimated_cost numeric(10,2),
    itinerary_data jsonb DEFAULT '{}'::jsonb,
    accommodation_suggestions jsonb DEFAULT '[]'::jsonb,
    packing_list jsonb DEFAULT '[]'::jsonb,
    travel_tips jsonb DEFAULT '[]'::jsonb,
    provider character varying(20) DEFAULT 'grok'::character varying,
    status character varying(20) DEFAULT 'generated'::character varying,
    feedback jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_interactions (
    id character varying NOT NULL,
    task_type character varying(50) NOT NULL,
    provider character varying(20) NOT NULL,
    prompt_tokens integer DEFAULT 0,
    completion_tokens integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    estimated_cost numeric(10,6) DEFAULT '0'::numeric,
    duration_ms integer DEFAULT 0,
    success boolean DEFAULT true,
    error_message text,
    user_id character varying,
    trip_id character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id character varying NOT NULL,
    provider character varying(20) NOT NULL,
    model character varying(50) NOT NULL,
    operation character varying(50) NOT NULL,
    user_id character varying,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost_cents integer DEFAULT 0 NOT NULL,
    input_cost_per_million integer DEFAULT 0,
    output_cost_per_million integer DEFAULT 0,
    response_time_ms integer DEFAULT 0,
    success boolean DEFAULT true,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id character varying NOT NULL,
    provider character varying(30) NOT NULL,
    endpoint character varying(100) NOT NULL,
    operation character varying(50) NOT NULL,
    user_id character varying,
    request_count integer DEFAULT 1 NOT NULL,
    estimated_cost_cents integer DEFAULT 0 NOT NULL,
    cost_per_call_cents integer DEFAULT 0,
    response_time_ms integer DEFAULT 0,
    success boolean DEFAULT true,
    error_message text,
    result_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_fee_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category character varying(50) NOT NULL,
    platform_fee_percent numeric(5,2) DEFAULT 12.00,
    expert_share_percent numeric(5,2) DEFAULT 75.00,
    ai_keeps_100 boolean DEFAULT true,
    min_fee numeric(10,2),
    max_fee numeric(10,2),
    is_active boolean DEFAULT true,
    updated_by character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    insurance_enabled boolean DEFAULT false NOT NULL,
    insurance_rate_percent numeric(5,2) DEFAULT 0.00 NOT NULL,
    insurance_applies_to jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.booking_funnel_analytics (
    id character varying NOT NULL,
    session_id character varying(100),
    user_id character varying,
    service_id character varying,
    provider_id character varying,
    destination character varying(255),
    price numeric(10,2),
    created_at timestamp without time zone DEFAULT now(),
    funnel_stage character varying(50) NOT NULL,
    service_type character varying(50),
    currency character varying(3) DEFAULT 'USD'::character varying,
    abandon_reason character varying(100),
    ip_country character varying(100)
);

CREATE TABLE IF NOT EXISTS public.booking_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255) NOT NULL,
    trip_item_id uuid,
    provider_id character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'pending_provider'::character varying,
    requested_date date NOT NULL,
    requested_time time without time zone,
    travelers integer NOT NULL,
    special_requests text,
    provider_response text,
    responded_at timestamp without time zone,
    response_expires_at timestamp without time zone,
    counter_date date,
    counter_time time without time zone,
    counter_price numeric,
    counter_message text,
    booking_id uuid,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255),
    trip_id character varying(255),
    trip_item_id uuid,
    provider_id character varying(255),
    expert_id character varying(255),
    booking_type character varying(20),
    status character varying(50) DEFAULT 'pending'::character varying,
    title character varying(255),
    booking_date date,
    booking_time time without time zone,
    travelers integer,
    service_amount numeric,
    platform_fee numeric,
    expert_fee numeric,
    total_amount numeric,
    provider_payout numeric,
    payment_method character varying(20),
    deposit_amount numeric,
    deposit_paid boolean DEFAULT false,
    balance_amount numeric,
    balance_paid boolean DEFAULT false,
    balance_due_date date,
    stripe_payment_intent_id character varying(255),
    stripe_deposit_intent_id character varying(255),
    stripe_balance_intent_id character varying(255),
    payment_status character varying(50),
    confirmation_code character varying(50),
    confirmed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    cancellation_reason text,
    cancelled_by character varying(20),
    refund_amount numeric,
    refund_status character varying(50),
    refunded_at timestamp without time zone,
    special_requests text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    booking_metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id character varying NOT NULL,
    user_id character varying,
    service_id character varying,
    quantity integer DEFAULT 1,
    trip_id character varying,
    scheduled_date timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    experience_slug character varying(50),
    custom_venue_id character varying,
    guest_session_id character varying(64),
    content_type character varying(20),
    content_id text,
    content_meta jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.category_field_schema (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_key character varying(100) NOT NULL,
    field_key character varying(100) NOT NULL,
    label character varying(255) NOT NULL,
    type character varying(20) NOT NULL,
    required boolean DEFAULT false NOT NULL,
    options jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    default_price_type character varying(30),
    CONSTRAINT category_field_schema_type_check CHECK (((type)::text = ANY ((ARRAY['text'::character varying, 'number'::character varying, 'select'::character varying, 'boolean'::character varying, 'url'::character varying, 'multiselect'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.city_media_cache (
    id character varying NOT NULL,
    city_id character varying,
    city_name character varying(100) NOT NULL,
    country character varying(100) NOT NULL,
    source character varying(20) NOT NULL,
    media_type character varying(20) NOT NULL,
    url text NOT NULL,
    thumbnail_url text,
    preview_url text,
    width integer,
    height integer,
    duration integer,
    context character varying(50),
    context_query text,
    attraction_name character varying(200),
    photographer_name character varying(200),
    photographer_url text,
    source_name character varying(100),
    source_url text,
    license character varying(50),
    google_place_id character varying(200),
    quality_score integer DEFAULT 50,
    is_primary boolean DEFAULT false,
    fetched_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true,
    download_location_url text,
    html_attributions text[]
);

CREATE TABLE IF NOT EXISTS public.city_neighborhoods (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    city character varying(100) NOT NULL,
    country character varying(100) NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    centroid_lat numeric(10,7) NOT NULL,
    centroid_lng numeric(10,7) NOT NULL,
    radius_km numeric(5,2) DEFAULT 1.50,
    description text,
    is_featured boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    adjacent_keys text[],
    lead_expert_target integer DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.concierge_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text,
    intent text NOT NULL,
    event_type text,
    trip_id character varying,
    cart_id text,
    chosen_tier text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id character varying NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(50),
    subject character varying(200) NOT NULL,
    message text NOT NULL,
    reason character varying(50),
    preferred_contact_method character varying(20),
    source character varying(50) DEFAULT 'contact_page'::character varying,
    status character varying(20) DEFAULT 'new'::character varying,
    assigned_admin_id character varying,
    resolved_at timestamp without time zone,
    response_notes text,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_analytics (
    id character varying NOT NULL,
    tracking_number character varying NOT NULL,
    date timestamp without time zone NOT NULL,
    views integer DEFAULT 0,
    unique_views integer DEFAULT 0,
    clicks integer DEFAULT 0,
    shares integer DEFAULT 0,
    bookmarks integer DEFAULT 0,
    conversions integer DEFAULT 0,
    revenue integer DEFAULT 0,
    avg_time_spent integer DEFAULT 0,
    bounce_rate integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_flags (
    id character varying NOT NULL,
    tracking_number character varying NOT NULL,
    reporter_id character varying,
    flag_type character varying(30) NOT NULL,
    severity character varying(10) DEFAULT 'medium'::character varying,
    description text,
    evidence jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'pending'::character varying,
    resolution text,
    resolved_by character varying,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_impressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type text NOT NULL,
    content_id text NOT NULL,
    city text,
    card_position integer,
    session_id text NOT NULL,
    user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.content_invoices (
    id character varying NOT NULL,
    invoice_number character varying(20) NOT NULL,
    tracking_number character varying NOT NULL,
    customer_id character varying,
    provider_id character varying,
    invoice_type character varying(30) NOT NULL,
    amount integer NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    tax_amount integer DEFAULT 0,
    discount_amount integer DEFAULT 0,
    total_amount integer NOT NULL,
    payment_method character varying(30),
    payment_reference character varying,
    notes text,
    due_date timestamp without time zone,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_placement_rules (
    id character varying NOT NULL,
    content_source character varying(30) NOT NULL,
    source_id character varying(255) NOT NULL,
    content_label character varying(500),
    city_name character varying(100) NOT NULL,
    country character varying(100),
    surfaces jsonb DEFAULT '[]'::jsonb,
    min_pulse_score integer DEFAULT 0,
    is_pinned boolean DEFAULT false,
    is_auto_tagged boolean DEFAULT false,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_registry (
    id character varying NOT NULL,
    tracking_number character varying(20) NOT NULL,
    content_type public.content_type NOT NULL,
    content_id character varying NOT NULL,
    owner_id character varying,
    status public.content_status DEFAULT 'published'::public.content_status,
    title text,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    view_count integer DEFAULT 0,
    engagement_score integer DEFAULT 0,
    last_viewed_at timestamp without time zone,
    published_at timestamp without time zone,
    flagged_at timestamp without time zone,
    flag_reason text,
    flagged_by character varying,
    moderator_id character varying,
    moderator_notes text,
    moderated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_versions (
    id character varying NOT NULL,
    tracking_number character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    change_type character varying(20) NOT NULL,
    changed_by character varying,
    previous_data jsonb,
    new_data jsonb,
    change_reason text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
    id integer NOT NULL,
    title text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id character varying(255)
);

CREATE SEQUENCE IF NOT EXISTS public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;

CREATE TABLE IF NOT EXISTS public.coordination_bookings (
    id character varying NOT NULL,
    coordination_id character varying NOT NULL,
    item_type character varying(30) NOT NULL,
    item_id character varying(255) NOT NULL,
    item_name character varying(255) NOT NULL,
    vendor_id character varying,
    service_id character varying,
    availability_slot_id character varying,
    scheduled_date date,
    scheduled_time character varying(10),
    duration character varying(50),
    price numeric(10,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    status character varying(30) DEFAULT 'pending'::character varying,
    booking_reference character varying(100),
    confirmation_details jsonb DEFAULT '{}'::jsonb,
    source character varying(30) DEFAULT 'platform'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    confirmed_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.coordination_states (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    trip_id character varying,
    experience_type character varying(50) NOT NULL,
    status character varying(30) DEFAULT 'intake'::character varying,
    path character varying(20) DEFAULT 'browse'::character varying,
    user_request jsonb DEFAULT '{}'::jsonb,
    destination character varying(255),
    dates jsonb DEFAULT '{}'::jsonb,
    travelers jsonb DEFAULT '{}'::jsonb,
    budget jsonb DEFAULT '{}'::jsonb,
    preferences jsonb DEFAULT '{}'::jsonb,
    assigned_expert_id character varying,
    expert_recommendations jsonb DEFAULT '{}'::jsonb,
    selected_vendors jsonb DEFAULT '[]'::jsonb,
    custom_venue_ids jsonb DEFAULT '[]'::jsonb,
    generated_itinerary jsonb DEFAULT '{}'::jsonb,
    optimization_score numeric(5,2),
    ai_insights jsonb DEFAULT '{}'::jsonb,
    booking_statuses jsonb DEFAULT '[]'::jsonb,
    confirmations jsonb DEFAULT '[]'::jsonb,
    timeline jsonb DEFAULT '[]'::jsonb,
    state_history jsonb DEFAULT '[]'::jsonb,
    total_estimated_cost numeric(10,2),
    total_confirmed_cost numeric(10,2),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id character varying NOT NULL,
    wallet_id character varying NOT NULL,
    amount integer NOT NULL,
    transaction_type character varying(20) NOT NULL,
    description text,
    reference_id character varying(255),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cross_sell_events (
    id character varying NOT NULL,
    event_type character varying(20) NOT NULL,
    source_content_type character varying(50) NOT NULL,
    source_content_id character varying(255) NOT NULL,
    source_content_name character varying(255),
    target_service_id character varying(255) NOT NULL,
    city character varying(100),
    neighborhood character varying(100),
    user_id character varying(255),
    session_id character varying(255),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_venues (
    id character varying NOT NULL,
    user_id character varying,
    trip_id character varying,
    experience_type character varying(50),
    name character varying(255) NOT NULL,
    address text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    venue_type character varying(50) DEFAULT 'custom'::character varying,
    notes text,
    estimated_cost numeric(10,2),
    image_url text,
    source character varying(20) DEFAULT 'custom'::character varying,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_revenue_summary (
    id character varying NOT NULL,
    date date NOT NULL,
    total_gross numeric(12,2) DEFAULT 0,
    total_platform_fee numeric(12,2) DEFAULT 0,
    total_processing_fees numeric(12,2) DEFAULT 0,
    total_net numeric(12,2) DEFAULT 0,
    booking_revenue numeric(12,2) DEFAULT 0,
    template_revenue numeric(12,2) DEFAULT 0,
    affiliate_revenue numeric(12,2) DEFAULT 0,
    tip_revenue numeric(12,2) DEFAULT 0,
    other_revenue numeric(12,2) DEFAULT 0,
    total_expert_earnings numeric(12,2) DEFAULT 0,
    total_provider_earnings numeric(12,2) DEFAULT 0,
    transaction_count integer DEFAULT 0,
    booking_count integer DEFAULT 0,
    template_sales_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.day_boundaries (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    day_number integer NOT NULL,
    end_location character varying(255),
    must_return_to_hotel boolean DEFAULT false,
    latest_activity_end character varying(10),
    reason_for_constraint character varying(500),
    relocation_required boolean DEFAULT false,
    transit_duration_minutes integer DEFAULT 0,
    earliest_activity_start character varying(10),
    next_day_hotel_location character varying(255),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demand_signals (
    id character varying NOT NULL,
    destination character varying(255) NOT NULL,
    country character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    service_type character varying(50),
    search_count integer DEFAULT 0,
    no_results_count integer DEFAULT 0,
    avg_budget numeric(10,2),
    peak_month character varying(20),
    travelers_profile jsonb,
    origin_countries jsonb,
    last_updated timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.destination_benchmarks (
    id character varying NOT NULL,
    destination character varying(255) NOT NULL,
    country character varying(100),
    period character varying(20) NOT NULL,
    period_start timestamp without time zone NOT NULL,
    search_volume integer,
    booking_volume integer,
    market_share numeric(5,2),
    top_source_countries jsonb,
    avg_trip_spend numeric(10,2),
    avg_daily_spend numeric(10,2),
    revenue_estimate numeric(14,2),
    avg_length_of_stay numeric(5,1),
    avg_lead_time numeric(5,1),
    avg_party_size numeric(5,1),
    peak_months jsonb,
    seasonality_index jsonb,
    top_activities jsonb,
    similar_destinations jsonb,
    competitor_comparison jsonb,
    avg_rating numeric(3,2),
    sentiment_score numeric(3,2),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.destination_events (
    id character varying NOT NULL,
    country character varying(100) NOT NULL,
    city character varying(100),
    region character varying(100),
    title character varying(255) NOT NULL,
    description text,
    event_type character varying(30) DEFAULT 'other'::character varying,
    start_month integer,
    end_month integer,
    specific_date date,
    is_recurring boolean DEFAULT true,
    year integer,
    season_rating character varying(20),
    highlights jsonb DEFAULT '[]'::jsonb,
    tips text,
    source_type character varying(20) DEFAULT 'manual'::character varying,
    source_id character varying(255),
    contributor_id character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    reviewed_by character varying,
    reviewed_at timestamp without time zone,
    rejection_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.destination_intelligence (
    id character varying NOT NULL,
    destination character varying(255) NOT NULL,
    intelligence_data jsonb DEFAULT '{}'::jsonb,
    events jsonb DEFAULT '[]'::jsonb,
    weather_forecast jsonb DEFAULT '{}'::jsonb,
    safety_alerts jsonb DEFAULT '[]'::jsonb,
    trending_experiences jsonb DEFAULT '[]'::jsonb,
    deals jsonb DEFAULT '[]'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    start_date character varying(10),
    end_date character varying(10)
);

CREATE TABLE IF NOT EXISTS public.destination_metrics_history (
    id character varying NOT NULL,
    destination character varying(255) NOT NULL,
    city character varying(100),
    country character varying(100),
    metric_type character varying(50) NOT NULL,
    metric_value numeric(10,2) NOT NULL,
    recorded_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.destination_search_patterns (
    id character varying NOT NULL,
    destination character varying(255) NOT NULL,
    city character varying(100),
    country character varying(100),
    search_query character varying(500),
    search_type character varying(50) NOT NULL,
    user_id character varying,
    results_viewed integer DEFAULT 0,
    items_clicked integer DEFAULT 0,
    item_selected boolean DEFAULT false,
    booking_value numeric(10,2),
    dwell_time_seconds integer DEFAULT 0,
    date date NOT NULL,
    hour integer,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.destination_seasons (
    id character varying NOT NULL,
    country character varying(100) NOT NULL,
    city character varying(100),
    month integer NOT NULL,
    rating character varying(20) NOT NULL,
    weather_description text,
    average_temp character varying(20),
    rainfall character varying(50),
    crowd_level character varying(20),
    price_level character varying(20),
    highlights jsonb DEFAULT '[]'::jsonb,
    source_type character varying(20) DEFAULT 'system'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discovery_jobs (
    id character varying NOT NULL,
    destination character varying(200) NOT NULL,
    categories jsonb NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    gems_discovered integer DEFAULT 0,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    error_message text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_ai_tasks (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    type character varying(100) NOT NULL,
    executive_name character varying(150),
    task text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    confidence integer DEFAULT 90,
    draft text,
    options jsonb DEFAULT '[]'::jsonb,
    approved_at timestamp without time zone,
    rejected_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_client_relationships (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    client_user_id character varying,
    client_email character varying(255),
    display_name character varying(100),
    notes text,
    billing_name character varying(255),
    billing_email character varying(255),
    billing_address text,
    payment_notes text,
    preferred_currency character varying(10) DEFAULT 'USD'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_communications (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    executive_id character varying,
    executive_name character varying(150),
    type character varying(20) DEFAULT 'email'::character varying,
    subject character varying(255) NOT NULL,
    recipient character varying(255),
    status character varying(30) DEFAULT 'sent'::character varying,
    body text,
    sent_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_events (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    executive_id character varying,
    executive_name character varying(150),
    title character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'meeting'::character varying,
    date timestamp without time zone,
    venue character varying(255),
    guests integer DEFAULT 0,
    status character varying(30) DEFAULT 'pending'::character varying,
    notes text,
    gift_needed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_executives (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    name character varying(150) NOT NULL,
    title character varying(150),
    email character varying(255),
    phone character varying(50),
    status character varying(20) DEFAULT 'active'::character varying,
    preferences jsonb DEFAULT '{}'::jsonb,
    family jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_gifts (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    executive_id character varying,
    executive_name character varying(150),
    occasion character varying(150) NOT NULL,
    occasion_date date,
    recipient character varying(150),
    gift character varying(255),
    amount numeric(10,2),
    status character varying(30) DEFAULT 'pending'::character varying,
    rating integer,
    gift_needed boolean DEFAULT true,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_saved_venues (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'Restaurant'::character varying,
    location character varying(255),
    rating numeric(3,1),
    price_range character varying(10),
    notes text,
    favorite boolean DEFAULT false,
    used_by text[] DEFAULT '{}'::text[],
    last_used date,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ea_travel_arrangements (
    id character varying NOT NULL,
    ea_user_id character varying NOT NULL,
    executive_id character varying,
    executive_name character varying(150),
    title character varying(255) NOT NULL,
    destination character varying(255),
    start_date date,
    end_date date,
    status character varying(30) DEFAULT 'planning'::character varying,
    segments jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.energy_tracking (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    day_number integer NOT NULL,
    starting_energy integer DEFAULT 100,
    activity_depletion integer DEFAULT 0,
    ending_energy integer DEFAULT 100,
    recovery_needed boolean DEFAULT false,
    recovery_reason character varying(500),
    energy_breakdown jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_coordination_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    anchor_type text NOT NULL,
    vendor_matrix jsonb DEFAULT '[]'::jsonb,
    sequencing_ruleset jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.event_invites (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    experience_id character varying NOT NULL,
    organizer_id character varying NOT NULL,
    guest_email character varying(255) NOT NULL,
    guest_name character varying(255),
    guest_phone character varying(50),
    unique_token character varying(100) NOT NULL,
    origin_city character varying(255),
    origin_state character varying(100),
    origin_country character varying(100),
    origin_latitude numeric(10,7),
    origin_longitude numeric(10,7),
    rsvp_status character varying(20) DEFAULT 'pending'::character varying,
    rsvp_date timestamp without time zone,
    number_of_guests integer DEFAULT 1,
    dietary_restrictions jsonb DEFAULT '[]'::jsonb,
    accommodation_preference character varying(50) DEFAULT 'undecided'::character varying,
    transportation_needed boolean DEFAULT false,
    special_requests text,
    message text,
    invite_sent_at timestamp without time zone,
    invite_viewed_at timestamp without time zone,
    last_viewed_at timestamp without time zone,
    view_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    market text NOT NULL,
    title text NOT NULL,
    description text,
    price_from_cents integer,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_template_filter_options (
    id character varying NOT NULL,
    filter_id character varying NOT NULL,
    label character varying(100) NOT NULL,
    value character varying(100) NOT NULL,
    description text,
    icon character varying(50),
    min_value numeric(10,2),
    max_value numeric(10,2),
    sort_order integer DEFAULT 0,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_template_filters (
    id character varying NOT NULL,
    tab_id character varying NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(50) NOT NULL,
    description text,
    filter_type character varying(30) DEFAULT 'multi_select'::character varying,
    icon character varying(50),
    sort_order integer DEFAULT 0,
    is_required boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_template_steps (
    id character varying NOT NULL,
    experience_type_id character varying NOT NULL,
    step_number integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    icon character varying(50),
    service_categories jsonb DEFAULT '[]'::jsonb,
    is_required boolean DEFAULT false,
    fields jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_template_tabs (
    id character varying NOT NULL,
    experience_type_id character varying NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(50) NOT NULL,
    description text,
    icon character varying(50),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    tab_type character varying(50) DEFAULT 'venue-search'::character varying,
    control_config jsonb
);

CREATE TABLE IF NOT EXISTS public.experience_types (
    id character varying NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(50) NOT NULL,
    description text,
    icon character varying(50),
    color character varying(20),
    image_url text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    payment_flow_type character varying(50),
    payment_complexity character varying(20),
    timing_complexity character varying(20),
    contingency_level character varying(20),
    typical_group_size_min integer,
    typical_group_size_max integer,
    typical_duration_min_days integer,
    typical_duration_max_days integer,
    headcount_label character varying(50),
    show_origin_city character varying(10) DEFAULT 'optional'::character varying,
    show_kids boolean DEFAULT true,
    location_label character varying(100),
    hero_image text,
    context_fields jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.experience_universal_filter_options (
    id character varying NOT NULL,
    filter_id character varying NOT NULL,
    label character varying(100) NOT NULL,
    value character varying(100) NOT NULL,
    description text,
    icon character varying(50),
    min_value numeric(10,2),
    max_value numeric(10,2),
    sort_order integer DEFAULT 0,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experience_universal_filters (
    id character varying NOT NULL,
    experience_type_id character varying NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(50) NOT NULL,
    description text,
    filter_type character varying(30) DEFAULT 'multi_select'::character varying,
    icon character varying(50),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_ai_tasks (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    task_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    client_name character varying(255),
    task_description text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb,
    ai_result jsonb DEFAULT '{}'::jsonb,
    confidence integer,
    quality_score numeric(3,1),
    edited_content text,
    was_edited boolean DEFAULT false,
    tokens_used integer DEFAULT 0,
    cost_estimate numeric(10,6) DEFAULT '0'::numeric,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_city_queues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city text,
    expert_ids jsonb DEFAULT '[]'::jsonb,
    active_requests integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_earnings (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    type character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    reference_id character varying,
    reference_type character varying(50),
    description text,
    status character varying(50) DEFAULT 'pending'::character varying,
    available_at timestamp without time zone,
    paid_out_at timestamp without time zone,
    payout_id character varying,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_experience_types (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    experience_type_id character varying NOT NULL,
    proficiency_level character varying(20) DEFAULT 'intermediate'::character varying,
    years_experience integer DEFAULT 0,
    portfolio_url text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_handoffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id character varying(255) NOT NULL,
    expert_id character varying(255) NOT NULL,
    user_id character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    original_itinerary jsonb NOT NULL,
    modified_itinerary jsonb,
    expert_notes text,
    user_feedback text,
    can_book_on_behalf boolean DEFAULT false,
    bookings_made jsonb DEFAULT '[]'::jsonb,
    expert_fee numeric,
    fee_paid boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    accepted_at timestamp without time zone,
    completed_at timestamp without time zone,
    user_approved_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.expert_match_analytics (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    traveler_id character varying,
    match_score integer NOT NULL,
    breakdown jsonb DEFAULT '{}'::jsonb,
    reasoning text,
    traveler_destination character varying(255),
    traveler_budget numeric(10,2),
    traveler_interests jsonb DEFAULT '[]'::jsonb,
    traveler_group_size integer,
    expert_selected boolean DEFAULT false,
    booking_completed boolean DEFAULT false,
    feedback jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_match_scores (
    id character varying NOT NULL,
    trip_id character varying,
    expert_id character varying NOT NULL,
    traveler_id character varying,
    overall_score integer NOT NULL,
    destination_match integer DEFAULT 0,
    specialty_match integer DEFAULT 0,
    experience_type_match integer DEFAULT 0,
    budget_alignment integer DEFAULT 0,
    availability_score integer DEFAULT 0,
    strengths jsonb DEFAULT '[]'::jsonb,
    reasoning text,
    request_context jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.expert_neighborhoods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expert_id character varying(255) NOT NULL,
    neighborhood_id character varying NOT NULL,
    is_lead boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expert_offering_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offering_type_key character varying(100) NOT NULL,
    service_tier character varying(20) NOT NULL,
    display_name text NOT NULL,
    tagline text,
    delivery_formats text[] DEFAULT ARRAY[]::text[] NOT NULL,
    is_surprising boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    season_tag character varying(100),
    CONSTRAINT expert_offering_types_service_tier_check CHECK (((service_tier)::text = ANY ((ARRAY['advisory'::character varying, 'planning'::character varying, 'coordination'::character varying, 'live_support'::character varying, 'specialized'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.expert_payouts (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    payout_method character varying(50),
    status character varying(50) DEFAULT 'pending'::character varying,
    processed_at timestamp without time zone,
    failure_reason text,
    transaction_id character varying(255),
    metadata jsonb,
    requested_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_referrals (
    id character varying NOT NULL,
    referrer_id character varying NOT NULL,
    referred_id character varying NOT NULL,
    referral_code character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying,
    bonus_amount numeric(10,2) DEFAULT 50.00,
    qualified_at timestamp without time zone,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text,
    variant_id text,
    comparison_id text,
    destination_city text,
    request_type text,
    expert_fee numeric,
    status text DEFAULT 'pending'::text,
    assigned_expert_id text,
    queue_position integer,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    assigned_at timestamp without time zone,
    completed_at timestamp without time zone,
    trip_id character varying,
    optimization_context jsonb
);

CREATE TABLE IF NOT EXISTS public.expert_service_categories (
    id character varying NOT NULL,
    name character varying(100) NOT NULL,
    is_default boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_service_offerings (
    id character varying NOT NULL,
    category_id character varying NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    is_default boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    target_roles text[]
);

CREATE TABLE IF NOT EXISTS public.expert_specializations (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    specialization character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expert_templates (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    short_description character varying(500),
    destination character varying(255) NOT NULL,
    duration integer NOT NULL,
    price numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    category character varying(100),
    cover_image character varying(1000),
    images jsonb DEFAULT '[]'::jsonb,
    itinerary_data jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    highlights jsonb DEFAULT '[]'::jsonb,
    is_published boolean DEFAULT false,
    is_featured boolean DEFAULT false,
    sales_count integer DEFAULT 0,
    view_count integer DEFAULT 0,
    average_rating numeric(3,2),
    review_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20)
);

CREATE TABLE IF NOT EXISTS public.expert_tips (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    traveler_id character varying NOT NULL,
    booking_id character varying,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    message text,
    is_anonymous boolean DEFAULT false,
    platform_fee numeric(10,2) DEFAULT 0.00,
    expert_amount numeric(10,2),
    status character varying(20) DEFAULT 'pending'::character varying,
    stripe_payment_intent_id character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20)
);

CREATE TABLE IF NOT EXISTS public.expert_updated_itineraries (
    id character varying NOT NULL,
    trip_id character varying,
    itinerary_data jsonb DEFAULT '{}'::jsonb,
    message text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_by_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    share_token character varying
);

CREATE TABLE IF NOT EXISTS public.expert_vendor_coordination (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    expert_id character varying NOT NULL,
    vendor_name character varying(255) NOT NULL,
    vendor_category character varying(100) NOT NULL,
    vendor_email character varying(255),
    vendor_phone character varying(50),
    provider_id character varying,
    setup_time character varying(10),
    arrival_time character varying(10),
    start_time character varying(10),
    end_time character varying(10),
    service_date date,
    status character varying(30) DEFAULT 'pending'::character varying,
    contract_status character varying(30) DEFAULT 'none'::character varying,
    deposit_amount numeric(10,2),
    total_amount numeric(10,2),
    primary_anchor_id character varying,
    anchor_constraint_note text,
    notes text,
    last_contacted_at timestamp without time zone,
    confirmed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faqs (
    id character varying NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    attachment text,
    category character varying(100),
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_bands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    band_key character varying(100) NOT NULL,
    rate_type character varying(10) NOT NULL,
    default_rate numeric(10,4) NOT NULL,
    min_rate numeric(10,4),
    max_rate numeric(10,4),
    display_name text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    updated_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_bands_rate_type_check CHECK (((rate_type)::text = ANY ((ARRAY['percent'::character varying, 'flat'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.fever_event_cache (
    id character varying NOT NULL,
    event_id character varying(100) NOT NULL,
    title character varying(500) NOT NULL,
    slug character varying(500),
    description text,
    short_description text,
    image_url text,
    thumbnail_url text,
    category character varying(100) NOT NULL,
    subcategory character varying(100),
    city character varying(255) NOT NULL,
    city_code character varying(10) NOT NULL,
    country character varying(100) NOT NULL,
    country_code character varying(10),
    venue_name character varying(255),
    venue_address text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    sessions jsonb DEFAULT '[]'::jsonb,
    currency character varying(10) DEFAULT 'USD'::character varying,
    min_price numeric(10,2),
    max_price numeric(10,2),
    price_range character varying(100),
    is_free boolean DEFAULT false,
    is_sold_out boolean DEFAULT false,
    rating numeric(3,2),
    review_count integer DEFAULT 0,
    booking_url text NOT NULL,
    affiliate_url text,
    tags jsonb DEFAULT '[]'::jsonb,
    highlights jsonb DEFAULT '[]'::jsonb,
    provider character varying(100) DEFAULT 'fever'::character varying,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.flight_cache (
    id character varying NOT NULL,
    origin_code character varying(10) NOT NULL,
    destination_code character varying(10) NOT NULL,
    departure_date date NOT NULL,
    return_date date,
    adults integer NOT NULL,
    offer_id character varying(100) NOT NULL,
    carrier_code character varying(10),
    flight_number character varying(20),
    departure_time character varying(30),
    arrival_time character varying(30),
    duration character varying(30),
    stops integer DEFAULT 0,
    price numeric(10,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    carrier_name character varying(100),
    origin_latitude numeric(10,7),
    origin_longitude numeric(10,7),
    origin_city character varying(255),
    origin_country_code character varying(10),
    origin_airport_name character varying(255),
    destination_latitude numeric(10,7),
    destination_longitude numeric(10,7),
    destination_city character varying(255),
    destination_country_code character varying(10),
    destination_airport_name character varying(255),
    provider character varying(100) DEFAULT 'amadeus'::character varying,
    cabin character varying(50),
    popularity_score integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.generated_itineraries (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    itinerary_data jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'pending'::character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20)
);

CREATE TABLE IF NOT EXISTS public.guest_travel_plans (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    invite_id character varying NOT NULL,
    selected_flight jsonb,
    flight_options jsonb DEFAULT '[]'::jsonb,
    flight_search_date timestamp without time zone,
    selected_transport jsonb,
    transport_options jsonb DEFAULT '[]'::jsonb,
    transport_search_date timestamp without time zone,
    selected_accommodation jsonb,
    accommodation_options jsonb DEFAULT '[]'::jsonb,
    accommodation_search_date timestamp without time zone,
    selected_activities jsonb DEFAULT '[]'::jsonb,
    activity_recommendations jsonb DEFAULT '[]'::jsonb,
    activities_search_date timestamp without time zone,
    estimated_total_cost numeric(10,2),
    budget_breakdown jsonb DEFAULT '{}'::jsonb,
    arrival_date timestamp without time zone,
    departure_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.help_guide_trips (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    country character varying(100) NOT NULL,
    state character varying(100) NOT NULL,
    city character varying(100) NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    highlights text NOT NULL,
    days integer NOT NULL,
    nights integer NOT NULL,
    price numeric(10,2) NOT NULL,
    old_price numeric(10,2),
    start_date date NOT NULL,
    end_date date NOT NULL,
    inclusive text NOT NULL,
    exclusive text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotel_cache (
    id character varying NOT NULL,
    hotel_id character varying(100) NOT NULL,
    city_code character varying(10) NOT NULL,
    name character varying(255) NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    address text,
    rating character varying(10),
    amenities jsonb DEFAULT '[]'::jsonb,
    media jsonb DEFAULT '[]'::jsonb,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    city character varying(255),
    state character varying(100),
    county character varying(100),
    country_code character varying(10),
    country_name character varying(100),
    postal_code character varying(20),
    provider character varying(100) DEFAULT 'amadeus'::character varying,
    star_rating integer,
    review_count integer DEFAULT 0,
    popularity_score integer DEFAULT 0,
    preference_tags jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.hotel_offer_cache (
    id character varying NOT NULL,
    hotel_cache_id character varying NOT NULL,
    offer_id character varying(100) NOT NULL,
    check_in_date date NOT NULL,
    check_out_date date NOT NULL,
    room_type character varying(100),
    room_description text,
    price numeric(10,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.influencer_curated_content (
    id character varying NOT NULL,
    influencer_id character varying NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    category character varying(100),
    content_type character varying(50) DEFAULT 'guide'::character varying,
    platform character varying(50),
    external_url text,
    image_url text,
    destinations jsonb DEFAULT '[]'::jsonb,
    experiences jsonb DEFAULT '[]'::jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    view_count integer DEFAULT 0,
    save_count integer DEFAULT 0,
    is_featured boolean DEFAULT false,
    is_active boolean DEFAULT true,
    published_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.influencer_referrals (
    id character varying NOT NULL,
    influencer_id character varying NOT NULL,
    referral_code character varying(50) NOT NULL,
    referred_user_id character varying,
    booking_id character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    commission_rate numeric(5,2) DEFAULT 10.00,
    commission_amount numeric(10,2),
    booking_amount numeric(10,2),
    paid_at timestamp without time zone,
    expires_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invite_send_log (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    invite_id character varying NOT NULL,
    method character varying(20) NOT NULL,
    recipient_address character varying(255) NOT NULL,
    status character varying(20) NOT NULL,
    error_message text,
    sent_at timestamp without time zone DEFAULT now(),
    opened_at timestamp without time zone,
    clicked_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.invite_templates (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id character varying NOT NULL,
    name character varying(255) NOT NULL,
    subject character varying(500),
    message_body text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    event_type character varying(50),
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itinerary_changes (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    activity_id character varying,
    who character varying(255) NOT NULL,
    action text NOT NULL,
    change_type character varying(20) NOT NULL,
    role character varying(20) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    source_impression_id text,
    source_content_id text
);

CREATE TABLE IF NOT EXISTS public.itinerary_comparisons (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    user_experience_id character varying,
    trip_id character varying,
    title character varying(255),
    destination character varying(255),
    start_date date,
    end_date date,
    budget numeric(10,2),
    travelers integer DEFAULT 1,
    status character varying(30) DEFAULT 'pending'::character varying,
    selected_variant_id character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    experience_type_slug character varying(50),
    optimized_at timestamp without time zone,
    optimization_payment_id character varying(255)
);

CREATE TABLE IF NOT EXISTS public.itinerary_items (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    item_type character varying(30) DEFAULT 'activity'::character varying,
    status character varying(20) DEFAULT 'planned'::character varying,
    day_number integer NOT NULL,
    start_time character varying(10),
    end_time character varying(10),
    duration_minutes integer,
    is_flexible boolean DEFAULT false,
    location_name character varying(255),
    location_address text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    google_place_id character varying(255),
    travel_from_previous jsonb DEFAULT '{}'::jsonb,
    vendor_contract_id character varying,
    booking_reference character varying(255),
    booking_status character varying(20),
    confirmation_number character varying(255),
    estimated_cost numeric(10,2),
    actual_cost numeric(10,2),
    currency character varying(3) DEFAULT 'USD'::character varying,
    cost_per_person boolean DEFAULT false,
    energy_level character varying(20),
    is_outdoor boolean DEFAULT false,
    weather_dependent boolean DEFAULT false,
    backup_plan_id character varying(255),
    is_backup_plan boolean DEFAULT false,
    weather_conditions jsonb DEFAULT '{}'::jsonb,
    participant_ids jsonb DEFAULT '[]'::jsonb,
    min_participants integer,
    max_participants integer,
    notes text,
    private_notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    suggested_by character varying(20),
    energy_cost integer DEFAULT 20,
    energy_type character varying(20),
    attendance_requirement character varying(20) DEFAULT 'optional'::character varying,
    conflicts_with jsonb DEFAULT '[]'::jsonb,
    peak_timing_preference character varying(20),
    scheduled_date date
);

CREATE TABLE IF NOT EXISTS public.itinerary_variant_items (
    id character varying NOT NULL,
    variant_id character varying NOT NULL,
    provider_service_id character varying,
    day_number integer NOT NULL,
    time_slot character varying(50),
    start_time character varying(20),
    end_time character varying(20),
    name character varying(255) NOT NULL,
    description text,
    service_type character varying(50),
    price numeric(10,2),
    rating numeric(3,2),
    location character varying(255),
    latitude numeric(10,7),
    longitude numeric(10,7),
    duration integer,
    travel_time_from_previous integer,
    is_replacement boolean DEFAULT false,
    replacement_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itinerary_variant_metrics (
    id character varying NOT NULL,
    variant_id character varying NOT NULL,
    metric_key character varying(50) NOT NULL,
    metric_label character varying(100) NOT NULL,
    value numeric(10,2) NOT NULL,
    unit character varying(30),
    better_is_lower boolean DEFAULT true,
    comparison character varying(50),
    improvement_percentage numeric(5,2),
    description text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itinerary_variants (
    id character varying NOT NULL,
    comparison_id character varying NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    source character varying(30) DEFAULT 'user'::character varying,
    status character varying(30) DEFAULT 'pending'::character varying,
    total_cost numeric(10,2),
    total_travel_time integer,
    average_rating numeric(3,2),
    free_time_minutes integer,
    optimization_score integer,
    ai_reasoning text,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_routing_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid,
    user_id character varying(255),
    destination character varying(255),
    topic character varying(255),
    assigned_expert_id character varying(255),
    top_score integer,
    scores_json jsonb,
    overridden_by character varying(255),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.live_events (
    id character varying NOT NULL,
    search_id character varying NOT NULL,
    title character varying(255) NOT NULL,
    start_date character varying(100),
    address text,
    link text,
    image_url text
);

CREATE TABLE IF NOT EXISTS public.local_expert_forms (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    languages jsonb DEFAULT '[]'::jsonb,
    years_in_city integer DEFAULT 0,
    offer_service boolean DEFAULT false,
    gov_id text,
    travel_licence text,
    instagram_link text,
    facebook_link text,
    linkedin_link text,
    services jsonb DEFAULT '[]'::jsonb,
    service_availability integer DEFAULT 15,
    price_expectation integer DEFAULT 0,
    short_bio text,
    confirm_age boolean DEFAULT false,
    terms_and_conditions boolean DEFAULT false,
    partnership boolean DEFAULT false,
    status character varying(20) DEFAULT 'pending'::character varying,
    rejection_message text,
    created_at timestamp without time zone DEFAULT now(),
    first_name character varying(100),
    last_name character varying(100),
    email character varying(255),
    phone character varying(50),
    country character varying(100),
    city character varying(100),
    destinations jsonb DEFAULT '[]'::jsonb,
    specialties jsonb DEFAULT '[]'::jsonb,
    experience_types jsonb DEFAULT '[]'::jsonb,
    specializations jsonb DEFAULT '[]'::jsonb,
    selected_services jsonb DEFAULT '[]'::jsonb,
    years_of_experience character varying(50),
    bio text,
    portfolio text,
    certifications text,
    availability character varying(50),
    response_time character varying(50),
    hourly_rate character varying(50),
    is_influencer boolean DEFAULT false,
    social_followers jsonb DEFAULT '{}'::jsonb,
    verified_influencer boolean DEFAULT false,
    influencer_tier character varying(20),
    referral_code character varying(50),
    tiktok_link text,
    youtube_link text,
    can_book_on_behalf boolean DEFAULT false,
    is_personal_assistant boolean DEFAULT false,
    pa_access_granted_at timestamp without time zone,
    pa_access_granted_by character varying(255),
    booking_fee_type character varying(20),
    booking_fee_percentage numeric,
    booking_fee_fixed numeric,
    booking_fee_hourly numeric,
    min_booking_fee numeric,
    stripe_account_id character varying(255),
    stripe_account_status character varying(50),
    can_receive_payments boolean DEFAULT false,
    total_earnings numeric DEFAULT '0'::numeric,
    pending_payout numeric DEFAULT '0'::numeric,
    total_handoffs integer DEFAULT 0,
    completed_handoffs integer DEFAULT 0,
    total_bookings_assisted integer DEFAULT 0,
    handoff_response_time_hours integer,
    max_concurrent_handoffs integer DEFAULT 5,
    accepts_new_handoffs boolean DEFAULT true,
    fee_settings jsonb DEFAULT '{}'::jsonb,
    payout_schedule character varying(20),
    expert_type character varying(30) DEFAULT 'travel_expert'::character varying,
    expert_notes_style text,
    identity_verification_session_id character varying(255),
    identity_verification_status character varying(20) DEFAULT 'pending'::character varying,
    identity_verified_at timestamp without time zone,
    neighborhoods jsonb DEFAULT '[]'::jsonb,
    locality_proof character varying(30),
    knowledge_proof_answers jsonb DEFAULT '[]'::jsonb,
    local_specialties jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.local_knowledge_nuggets (
    id character varying NOT NULL,
    expert_user_id character varying NOT NULL,
    nugget_type character varying(30) DEFAULT 'tip'::character varying NOT NULL,
    city character varying(150) NOT NULL,
    linked_poi character varying(255),
    linked_neighbourhood character varying(255),
    insight text NOT NULL,
    target_audience text,
    not_for text,
    seasonality jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.location_cache (
    id character varying NOT NULL,
    iata_code character varying(10) NOT NULL,
    location_type character varying(20) NOT NULL,
    name character varying(255) NOT NULL,
    detailed_name text,
    city_name character varying(255),
    city_code character varying(10),
    country_name character varying(100),
    country_code character varying(10),
    region_code character varying(20),
    state_code character varying(20),
    latitude text,
    longitude text,
    timezone_offset character varying(10),
    traveler_score integer,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.maps_export_cache (
    id character varying NOT NULL,
    variant_id character varying NOT NULL,
    kml_content text,
    gpx_content text,
    geo_json_content jsonb,
    google_maps_urls jsonb,
    apple_maps_urls jsonb,
    apple_maps_web_urls jsonb,
    generated_at timestamp without time zone DEFAULT now(),
    transport_legs_hash text
);

CREATE TABLE IF NOT EXISTS public.market_intelligence (
    id character varying NOT NULL,
    report_type character varying(50) NOT NULL,
    period character varying(20) NOT NULL,
    period_start timestamp without time zone NOT NULL,
    insights jsonb,
    recommendations jsonb,
    created_at timestamp without time zone DEFAULT now(),
    target_entity character varying(255) NOT NULL,
    metrics jsonb NOT NULL,
    data_quality character varying(20) DEFAULT 'high'::character varying
);

CREATE TABLE IF NOT EXISTS public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;

CREATE TABLE IF NOT EXISTS public.neighborhood_coverage_target (
    neighborhood_id character varying NOT NULL,
    category_key character varying(100) NOT NULL,
    target_count integer DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    related_id character varying(255),
    related_type character varying(50),
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    data jsonb
);

CREATE TABLE IF NOT EXISTS public.optimization_fees (
    id character varying NOT NULL,
    complexity_tier character varying(20) NOT NULL,
    price_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_by character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    event_type character varying(50),
    is_disabled boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.page_view_analytics (
    id character varying NOT NULL,
    session_id character varying(100),
    user_id character varying,
    page_path character varying(500) NOT NULL,
    page_type character varying(50),
    referrer text,
    time_on_page integer,
    scroll_depth integer,
    device_type character varying(20),
    created_at timestamp without time zone DEFAULT now(),
    utm_source character varying(100),
    utm_medium character varying(100),
    utm_campaign character varying(100),
    ip_country character varying(100),
    ip_city character varying(100)
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_intents (
    id integer NOT NULL,
    stripe_payment_intent_id character varying(255),
    user_id character varying(255),
    amount numeric,
    currency character varying(10) DEFAULT 'usd'::character varying,
    status character varying(50),
    is_deposit boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.payment_intents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payment_intents_id_seq OWNED BY public.payment_intents.id;

CREATE TABLE IF NOT EXISTS public.platform_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fee_type character varying(20),
    category character varying(50),
    provider_id character varying(255),
    fee_type_method character varying(20),
    fee_percentage numeric,
    fee_fixed_amount numeric,
    min_fee numeric,
    max_fee numeric,
    is_active boolean DEFAULT true,
    priority integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_revenue (
    id character varying NOT NULL,
    source_type character varying(50) NOT NULL,
    source_id character varying,
    tracking_number character varying(20),
    gross_amount numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    net_amount numeric(10,2) NOT NULL,
    processing_fees numeric(10,2) DEFAULT 0,
    currency character varying(3) DEFAULT 'USD'::character varying,
    expert_id character varying,
    expert_earnings numeric(10,2) DEFAULT 0,
    provider_id character varying,
    provider_earnings numeric(10,2) DEFAULT 0,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'recorded'::character varying,
    transaction_date timestamp without time zone DEFAULT now(),
    reconciliation_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
    setting_key character varying(100) NOT NULL,
    setting_value text NOT NULL,
    description text,
    updated_by character varying(255),
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.poi_cache (
    id character varying NOT NULL,
    amadeus_id character varying(100) NOT NULL,
    name character varying(500) NOT NULL,
    category character varying(100) NOT NULL,
    rank integer DEFAULT 0,
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    city character varying(255),
    country character varying(100),
    country_code character varying(10),
    tags jsonb DEFAULT '[]'::jsonb,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pricing_intelligence (
    id character varying NOT NULL,
    service_type character varying(50) NOT NULL,
    destination character varying(255),
    country character varying(100),
    min_price numeric(10,2),
    max_price numeric(10,2),
    created_at timestamp without time zone DEFAULT now(),
    avg_price numeric(10,2),
    median_price numeric(10,2),
    price_range character varying(50),
    sample_size integer,
    period character varying(20),
    period_start timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.provider_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id character varying(255) NOT NULL,
    service_id uuid,
    availability_type character varying(20) NOT NULL,
    blocked_dates jsonb DEFAULT '[]'::jsonb,
    available_dates jsonb DEFAULT '[]'::jsonb,
    is_available boolean DEFAULT true,
    daily_capacity integer,
    current_bookings integer DEFAULT 0,
    time_slots jsonb,
    recurring_unavailable jsonb,
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_availability_schedule (
    id character varying NOT NULL,
    provider_id character varying NOT NULL,
    day_of_week integer NOT NULL,
    start_time character varying(10) NOT NULL,
    end_time character varying(10) NOT NULL,
    is_available boolean DEFAULT true,
    preferred_slots jsonb DEFAULT '[]'::jsonb,
    pricing_modifier integer DEFAULT 0,
    pricing_reason character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_blackout_dates (
    id character varying NOT NULL,
    provider_id character varying NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason character varying(500),
    is_recurring boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_booking_requests (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    provider_id character varying NOT NULL,
    expert_id character varying,
    service_type character varying(100) NOT NULL,
    service_description text,
    requested_date date NOT NULL,
    requested_start_time character varying(10) NOT NULL,
    requested_end_time character varying(10) NOT NULL,
    price numeric(10,2),
    client_context jsonb DEFAULT '{}'::jsonb,
    anchor_constraints jsonb DEFAULT '[]'::jsonb,
    expert_notes text,
    status character varying(30) DEFAULT 'pending'::character varying,
    counter_offer jsonb DEFAULT 'null'::jsonb,
    provider_response text,
    responded_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_earnings (
    id character varying NOT NULL,
    provider_id character varying NOT NULL,
    type character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    source_type character varying(50),
    source_id character varying,
    tracking_number character varying(20),
    description text,
    status character varying(20) DEFAULT 'pending'::character varying,
    available_at timestamp without time zone,
    paid_at timestamp without time zone,
    payout_id character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_neighborhood_coverage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id character varying(255) NOT NULL,
    neighborhood_id character varying NOT NULL,
    category_key character varying(100) NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.provider_payouts (
    id character varying NOT NULL,
    provider_id character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    payout_method character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying,
    payout_reference character varying(100),
    notes text,
    requested_at timestamp without time zone DEFAULT now(),
    processed_at timestamp without time zone,
    completed_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.provider_performance_metrics (
    id character varying NOT NULL,
    provider_id character varying NOT NULL,
    period character varying(20) NOT NULL,
    period_start timestamp without time zone NOT NULL,
    avg_response_time integer,
    conversion_rate numeric(5,2),
    created_at timestamp without time zone DEFAULT now(),
    impressions integer DEFAULT 0,
    profile_views integer DEFAULT 0,
    search_appearances integer DEFAULT 0,
    inquiries integer DEFAULT 0,
    bookings integer DEFAULT 0,
    revenue numeric(10,2) DEFAULT '0'::numeric,
    competitor_rank integer,
    price_competitiveness character varying(20)
);

CREATE TABLE IF NOT EXISTS public.provider_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id character varying(255) NOT NULL,
    service_id uuid,
    pricing_type character varying(20) NOT NULL,
    base_price numeric,
    currency character varying(3) DEFAULT 'USD'::character varying,
    seasonal_pricing jsonb,
    date_overrides jsonb,
    requires_quote boolean DEFAULT false,
    estimated_range_min numeric,
    estimated_range_max numeric,
    per_person boolean DEFAULT false,
    group_discounts jsonb,
    requires_deposit boolean DEFAULT false,
    deposit_type character varying(20),
    deposit_amount numeric,
    deposit_percentage integer,
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_services (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    service_name character varying(255) NOT NULL,
    service_type character varying(50) DEFAULT 'planning'::character varying,
    category_id character varying,
    price numeric(10,2),
    price_based_on character varying(100),
    description text,
    location character varying(255) DEFAULT 'Unknown'::character varying,
    availability jsonb DEFAULT '[]'::jsonb,
    service_file text,
    form_status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    short_description character varying(150),
    price_type character varying(20) DEFAULT 'fixed'::character varying,
    delivery_method character varying(50) DEFAULT 'pdf'::character varying,
    delivery_timeframe character varying(100),
    revisions_included integer DEFAULT 0,
    max_concurrent_bookings integer,
    lead_time_hours integer DEFAULT 24,
    what_included jsonb DEFAULT '[]'::jsonb,
    requirements jsonb DEFAULT '[]'::jsonb,
    faqs jsonb DEFAULT '[]'::jsonb,
    service_image text,
    status character varying(20) DEFAULT 'active'::character varying,
    is_featured boolean DEFAULT false,
    bookings_count integer DEFAULT 0,
    total_revenue numeric(10,2) DEFAULT '0'::numeric,
    average_rating numeric(3,2),
    review_count integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20),
    includes_expert_notes boolean DEFAULT false,
    revenue_share_rate numeric(4,2) DEFAULT 0.75,
    meeting_point text,
    pickup_available boolean DEFAULT false,
    pickup_address text,
    service_radius integer,
    subcategory_id character varying,
    neighborhood character varying(100),
    content_affinity_tags text[] DEFAULT '{}'::text[],
    approval_status character varying(20) DEFAULT 'approved'::character varying,
    cancellation_policy text,
    lead_time character varying(50),
    deliverables jsonb DEFAULT '[]'::jsonb,
    experience_types jsonb DEFAULT '[]'::jsonb,
    gallery_images jsonb DEFAULT '[]'::jsonb,
    submitted_at timestamp without time zone,
    reviewed_at timestamp without time zone,
    reviewed_by character varying,
    rejection_reason text,
    duration character varying,
    category_attributes jsonb,
    pricing_tiers jsonb,
    expert_offering_type_id uuid
);

CREATE TABLE IF NOT EXISTS public.provider_settings (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    instant_booking boolean DEFAULT false,
    auto_response boolean DEFAULT true,
    minimum_lead_time_days integer DEFAULT 7,
    target_response_time_hours integer DEFAULT 2,
    payout_frequency character varying(20) DEFAULT 'monthly'::character varying,
    minimum_payout_amount numeric(10,2) DEFAULT '100'::numeric,
    notifications_json jsonb DEFAULT '{"payouts": true, "reviews": true, "messages": true, "marketing": false, "newBookings": true, "bookingUpdates": true}'::jsonb,
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.realtime_signals (
    id character varying NOT NULL,
    source character varying(50) NOT NULL,
    keyword character varying(100) NOT NULL,
    location character varying(100),
    signal_strength integer NOT NULL,
    volume integer,
    sentiment numeric(3,2),
    opportunity_id character varying,
    detected_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.recommendation_conversions (
    id character varying NOT NULL,
    recommendation_id character varying NOT NULL,
    user_id character varying,
    conversion_type character varying(50) NOT NULL,
    result_id character varying,
    revenue_generated numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reminder_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    saved_trip_id uuid NOT NULL,
    sent_at timestamp without time zone DEFAULT now(),
    reminder_type text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_cache (
    id character varying NOT NULL,
    external_id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    cuisine character varying(255),
    price_level character varying(10),
    rating character varying(10),
    review_count integer DEFAULT 0,
    latitude numeric(10,7),
    longitude numeric(10,7),
    city character varying(255),
    booking_url text,
    image_url text,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.revenue_splits (
    id character varying NOT NULL,
    type character varying(50) NOT NULL,
    platform_percentage numeric(5,2) DEFAULT 15.00 NOT NULL,
    expert_percentage numeric(5,2) DEFAULT 85.00 NOT NULL,
    provider_percentage numeric(5,2) DEFAULT 0.00,
    description text,
    is_active boolean DEFAULT true,
    effective_from timestamp without time zone DEFAULT now(),
    effective_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_moderation_logs (
    id character varying(255) DEFAULT (gen_random_uuid())::text NOT NULL,
    review_id character varying(255) NOT NULL,
    action character varying(20) NOT NULL,
    actor_id character varying(255) NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.review_ratings (
    id character varying NOT NULL,
    local_expert_id character varying NOT NULL,
    reviewer_id character varying NOT NULL,
    review text NOT NULL,
    rating integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safety_cache (
    id character varying NOT NULL,
    amadeus_id character varying(100) NOT NULL,
    name character varying(500) NOT NULL,
    sub_type character varying(50),
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    city character varying(255),
    country character varying(100),
    country_code character varying(10),
    overall_score integer,
    lgbtq_score integer,
    medical_score integer,
    physical_harm_score integer,
    political_freedom_score integer,
    theft_score integer,
    women_safety_score integer,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.saved_items (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    content_type character varying(50) NOT NULL,
    content_id character varying(255) NOT NULL,
    content_name character varying(255) NOT NULL,
    content_image text,
    city character varying(100),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text,
    variant_id text,
    comparison_id text,
    notes text,
    saved_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    price_snapshot numeric,
    reminders_sent integer DEFAULT 0,
    status text DEFAULT 'active'::text
);

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    migration_name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.search_analytics (
    id character varying NOT NULL,
    session_id character varying(100),
    user_id character varying,
    search_type character varying(50) NOT NULL,
    query text,
    destination character varying(255),
    origin_country character varying(100),
    travel_dates jsonb,
    travelers integer,
    budget character varying(50),
    filters jsonb,
    results_count integer,
    device_type character varying(20),
    created_at timestamp without time zone DEFAULT now(),
    origin_city character varying(100),
    clicked_results jsonb,
    converted_to_booking boolean DEFAULT false,
    user_agent text,
    ip_country character varying(100),
    ip_city character varying(100)
);

CREATE TABLE IF NOT EXISTS public.seasonal_opportunities (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    country character varying(100),
    month integer NOT NULL,
    service_type character varying(100) NOT NULL,
    opportunity_type character varying(50) NOT NULL,
    event_name character varying(255),
    demand_multiplier numeric(4,2) DEFAULT 1.0,
    pricing_opportunity character varying(20),
    lead_time_weeks integer DEFAULT 4,
    preparation_tips jsonb DEFAULT '[]'::jsonb,
    historical_performance jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.serp_cache (
    id character varying NOT NULL,
    cache_key character varying(500) NOT NULL,
    query text NOT NULL,
    location character varying(200) NOT NULL,
    category character varying(100),
    template character varying(100),
    results jsonb NOT NULL,
    result_count integer DEFAULT 0,
    cached_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.serp_inquiries (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    serp_provider_id character varying(200) NOT NULL,
    provider_name character varying(300) NOT NULL,
    provider_email character varying(200),
    provider_phone character varying(50),
    provider_website text,
    message text NOT NULL,
    destination character varying(200),
    category character varying(100),
    template character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying,
    sent_at timestamp without time zone,
    responded_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.serp_provider_tracking (
    id character varying NOT NULL,
    serp_provider_id character varying(200) NOT NULL,
    provider_name character varying(300) NOT NULL,
    destination character varying(200),
    category character varying(100),
    template character varying(100),
    click_count integer DEFAULT 0,
    inquiry_count integer DEFAULT 0,
    priority_score character varying(20) DEFAULT 'LOW'::character varying,
    last_clicked_at timestamp without time zone,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_bookings (
    id character varying NOT NULL,
    service_id character varying,
    traveler_id character varying,
    provider_id character varying,
    contract_id character varying,
    booking_details jsonb DEFAULT '{}'::jsonb,
    trip_id character varying,
    status character varying(30) DEFAULT 'pending'::character varying,
    total_amount numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) DEFAULT '0'::numeric,
    provider_earnings numeric(10,2),
    stripe_payment_intent_id character varying(255),
    confirmed_at timestamp without time zone,
    completed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    cancellation_reason text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20),
    booking_metadata jsonb DEFAULT '{}'::jsonb,
    source character varying(30) DEFAULT 'direct'::character varying,
    cross_sell_source_content_id character varying(255),
    insurance_fee numeric(10,2) DEFAULT 0.00 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_categories (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    image_url text,
    created_at timestamp without time zone DEFAULT now(),
    slug character varying(100),
    icon character varying(10),
    category_type character varying(20) DEFAULT 'service_provider'::character varying,
    verification_required boolean DEFAULT true,
    required_documents jsonb DEFAULT '[]'::jsonb,
    custom_profile_fields jsonb DEFAULT '[]'::jsonb,
    price_range jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now(),
    source_type character varying(30),
    launch_tier character varying(20),
    commission_band_key character varying(100),
    insurance_band integer,
    risk_profile character varying(20),
    requires_background_check boolean DEFAULT false,
    affiliate_partner_key character varying(50),
    category_key character varying(100)
);

CREATE TABLE IF NOT EXISTS public.service_demand_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offering_type_key text NOT NULL,
    neighborhood_id text,
    city text NOT NULL,
    country text,
    user_id text,
    guest_session_id text,
    date_range_start timestamp with time zone,
    date_range_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.service_demand_signals (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    country character varying(100),
    service_type character varying(100) NOT NULL,
    category_slug character varying(100),
    demand_level character varying(20) NOT NULL,
    demand_score integer DEFAULT 0 NOT NULL,
    trend_direction character varying(10) DEFAULT 'stable'::character varying,
    trend_velocity integer DEFAULT 0,
    search_volume integer DEFAULT 0,
    supply_gap integer DEFAULT 0,
    average_price numeric(10,2),
    price_trend character varying(10),
    seasonal_peak jsonb DEFAULT '[]'::jsonb,
    trigger_events jsonb DEFAULT '[]'::jsonb,
    related_trends jsonb DEFAULT '[]'::jsonb,
    data_source character varying(50) DEFAULT 'travelpulse'::character varying,
    confidence_score integer DEFAULT 80,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_gap_analysis (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    country character varying(100),
    service_type character varying(100) NOT NULL,
    current_supply_count integer DEFAULT 0,
    estimated_demand integer DEFAULT 0,
    gap_score integer DEFAULT 0 NOT NULL,
    price_range_gap jsonb DEFAULT '{}'::jsonb,
    quality_gap integer DEFAULT 0,
    availability_gap integer DEFAULT 0,
    language_gaps jsonb DEFAULT '[]'::jsonb,
    specialization_gaps jsonb DEFAULT '[]'::jsonb,
    competitor_analysis jsonb DEFAULT '{}'::jsonb,
    opportunity_description text,
    recommended_actions jsonb DEFAULT '[]'::jsonb,
    last_analyzed_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_offering_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offering_type_key character varying(100) NOT NULL,
    category_key character varying(100) NOT NULL,
    display_name text NOT NULL,
    tagline text,
    is_surprising boolean DEFAULT false NOT NULL,
    market_scoped text[],
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    risk_override character varying(20),
    season_tag character varying(100),
    CONSTRAINT service_offering_types_risk_override_chk CHECK (((risk_override IS NULL) OR ((risk_override)::text = ANY ((ARRAY['low'::character varying, 'moderate'::character varying, 'high'::character varying, 'specialized'::character varying])::text[]))))
);

CREATE TABLE IF NOT EXISTS public.service_provider_forms (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    business_name text NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    website text,
    mobile character varying(50) NOT NULL,
    whatsapp character varying(50),
    country character varying(100) NOT NULL,
    address text NOT NULL,
    booking_link text,
    gst character varying(100),
    instagram_link text,
    facebook_link text,
    linkedin_link text,
    photo1 text,
    photo2 text,
    photo3 text,
    photo4 text,
    photo5 text,
    business_type character varying(100) NOT NULL,
    service_offers jsonb DEFAULT '[]'::jsonb,
    description text,
    instant_booking boolean DEFAULT false,
    business_logo text,
    business_license text,
    business_gst_tax text,
    terms_and_conditions boolean DEFAULT false,
    info_confirmation boolean DEFAULT false,
    contact_request boolean DEFAULT false,
    status character varying(20) DEFAULT 'pending'::character varying,
    rejection_message text,
    created_at timestamp without time zone DEFAULT now(),
    identity_verification_session_id character varying(255),
    identity_verification_status character varying(20) DEFAULT 'pending'::character varying,
    identity_verified_at timestamp without time zone,
    business_verification_status character varying(20) DEFAULT 'pending'::character varying,
    business_country character varying(100),
    business_registration_number character varying(255),
    business_documents jsonb DEFAULT '{}'::jsonb,
    persona_inquiry_id character varying(255)
);

CREATE TABLE IF NOT EXISTS public.service_recommendations (
    id character varying NOT NULL,
    target_type character varying(20) NOT NULL,
    target_id character varying,
    demand_signal_id character varying,
    title character varying(255) NOT NULL,
    description text,
    service_type character varying(100) NOT NULL,
    city character varying(100),
    country character varying(100),
    opportunity_score integer DEFAULT 0 NOT NULL,
    potential_revenue numeric(10,2),
    competition_level character varying(20),
    action_items jsonb DEFAULT '[]'::jsonb,
    supporting_data jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    dismissed_at timestamp without time zone,
    converted_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_reviews (
    id character varying NOT NULL,
    booking_id character varying NOT NULL,
    service_id character varying NOT NULL,
    provider_id character varying NOT NULL,
    traveler_id character varying NOT NULL,
    rating integer NOT NULL,
    review_text text,
    response_text text,
    response_at timestamp without time zone,
    is_verified boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    flag_reason text,
    moderated_by character varying(255),
    moderated_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.service_subcategories (
    id character varying NOT NULL,
    category_id character varying NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    icon character varying(10),
    price_range jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.service_templates (
    id character varying NOT NULL,
    category_id character varying,
    title character varying(255) NOT NULL,
    short_description character varying(150),
    description text,
    service_type character varying(50) DEFAULT 'planning'::character varying,
    suggested_price numeric(10,2),
    price_range jsonb DEFAULT '[]'::jsonb,
    delivery_method character varying(50),
    delivery_timeframe character varying(100),
    what_included jsonb DEFAULT '[]'::jsonb,
    requirements jsonb DEFAULT '[]'::jsonb,
    usage_count integer DEFAULT 0,
    average_rating numeric(3,2),
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shared_itineraries (
    id character varying NOT NULL,
    share_token character varying NOT NULL,
    variant_id character varying NOT NULL,
    shared_by_user_id character varying NOT NULL,
    shared_with_user_id character varying,
    permissions character varying(20) DEFAULT 'view'::character varying NOT NULL,
    expert_status character varying(30) DEFAULT 'pending'::character varying,
    transport_preferences jsonb,
    view_count integer DEFAULT 0,
    last_viewed_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    expert_notes text,
    expert_diff jsonb
);

CREATE TABLE IF NOT EXISTS public.shared_trip_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shared_trip_id uuid,
    viewer_ip text,
    viewer_country text,
    viewed_at timestamp without time zone DEFAULT now(),
    trip_id character varying
);

CREATE TABLE IF NOT EXISTS public.shared_trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id text,
    comparison_id text,
    shared_by text,
    share_token text NOT NULL,
    views integer DEFAULT 0,
    bookings integer DEFAULT 0,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    trip_id character varying
);

CREATE TABLE IF NOT EXISTS public.spontaneous_opportunities (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    type character varying(50) NOT NULL,
    source character varying(50) NOT NULL,
    external_id character varying(255),
    title character varying(200) NOT NULL,
    description text,
    image_url text,
    affiliate_url text,
    original_price numeric(10,2),
    current_price numeric(10,2),
    currency character varying(3) DEFAULT 'USD'::character varying,
    discount_percent integer,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    expiration_time timestamp without time zone,
    capacity integer,
    remaining_spots integer,
    urgency_score integer DEFAULT 0,
    actionability_score integer DEFAULT 0,
    trending_score numeric(5,2) DEFAULT 0.0,
    category character varying(100),
    tags jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.submit_itinerary_feedbacks (
    id character varying NOT NULL,
    expert_id character varying NOT NULL,
    contract_id character varying,
    attachment text,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    location character varying(200) NOT NULL,
    status character varying(10) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_category_matrix (
    template_key character varying(50) NOT NULL,
    category_key character varying(100) NOT NULL,
    strength character varying(3) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT template_category_matrix_strength_check CHECK (((strength)::text = ANY ((ARRAY['REQ'::character varying, 'REC'::character varying, 'OPT'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.template_purchases (
    id character varying NOT NULL,
    template_id character varying NOT NULL,
    buyer_id character varying NOT NULL,
    expert_id character varying NOT NULL,
    price numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    platform_fee numeric(10,2) NOT NULL,
    expert_earnings numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'completed'::character varying,
    purchased_at timestamp without time zone DEFAULT now(),
    refunded_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.template_reviews (
    id character varying NOT NULL,
    template_id character varying NOT NULL,
    purchase_id character varying NOT NULL,
    reviewer_id character varying NOT NULL,
    rating integer NOT NULL,
    review text,
    helpful_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.temporal_anchors (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    user_experience_id character varying,
    anchor_type character varying(50) NOT NULL,
    anchor_datetime timestamp without time zone NOT NULL,
    buffer_before integer DEFAULT 0,
    buffer_after integer DEFAULT 0,
    location character varying(255),
    latitude numeric(10,7),
    longitude numeric(10,7),
    radius_km integer DEFAULT 5,
    must_return_to_hotel boolean DEFAULT false,
    is_immovable boolean DEFAULT false,
    depends_on_item_ids jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    description character varying(500)
);

CREATE TABLE IF NOT EXISTS public.tourist_help_me_guide_activities (
    id character varying NOT NULL,
    user_id character varying,
    location text NOT NULL,
    activity text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tourist_help_me_guide_events (
    id character varying NOT NULL,
    user_id character varying,
    location text NOT NULL,
    event jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tourist_place_category (
    id character varying NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tourist_place_results (
    id character varying NOT NULL,
    search_id character varying NOT NULL,
    country character varying(100) NOT NULL,
    city character varying(100) NOT NULL,
    place character varying(200) NOT NULL,
    description text NOT NULL,
    activities jsonb NOT NULL,
    festivals jsonb NOT NULL,
    latitude character varying(200),
    longitude character varying(200),
    category character varying(200) NOT NULL,
    best_months character varying(100) NOT NULL,
    image_url jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.tourist_places_searches (
    id character varying NOT NULL,
    search text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tourist_preferences (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    preference_id character varying NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tracking_sequences (
    id character varying NOT NULL,
    prefix character varying(10) NOT NULL,
    year_month character varying(6) NOT NULL,
    last_number integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transfer_cache (
    id character varying NOT NULL,
    offer_id character varying(100) NOT NULL,
    transfer_type character varying(50) NOT NULL,
    start_location_code character varying(10) NOT NULL,
    end_address text,
    end_city_name character varying(255),
    end_latitude numeric(10,7),
    end_longitude numeric(10,7),
    vehicle_code character varying(50),
    vehicle_category character varying(100),
    vehicle_description text,
    max_seats integer,
    price numeric(10,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    provider character varying(100) DEFAULT 'amadeus'::character varying,
    raw_data jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.transport_booking_options (
    id character varying NOT NULL,
    transport_leg_id character varying,
    variant_id character varying,
    booking_type text NOT NULL,
    source text NOT NULL,
    title text NOT NULL,
    description text,
    mode_type text NOT NULL,
    icon_type text,
    price_display text,
    price_cents_low integer,
    price_cents_high integer,
    price_per_person boolean DEFAULT false,
    currency text DEFAULT 'USD'::text,
    estimated_minutes integer,
    estimated_minutes_high integer,
    provider_id integer,
    external_url text,
    affiliate_code text,
    deep_link_scheme text,
    booking_status text DEFAULT 'available'::text,
    booking_id integer,
    is_multi_day_pass boolean DEFAULT false,
    pass_valid_days integer,
    savings_vs_individual_cents integer,
    rating double precision,
    review_count integer,
    sort_order integer DEFAULT 0,
    is_recommended boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    confirmation_ref text
);

CREATE TABLE IF NOT EXISTS public.transport_legs (
    id character varying NOT NULL,
    variant_id character varying NOT NULL,
    day_number integer NOT NULL,
    leg_order integer NOT NULL,
    from_activity_id character varying,
    from_name text NOT NULL,
    from_lat double precision NOT NULL,
    from_lng double precision NOT NULL,
    to_activity_id character varying,
    to_name text NOT NULL,
    to_lat double precision NOT NULL,
    to_lng double precision NOT NULL,
    distance_meters integer NOT NULL,
    distance_display text NOT NULL,
    recommended_mode text NOT NULL,
    user_selected_mode text,
    estimated_duration_minutes integer NOT NULL,
    estimated_cost_usd double precision,
    alternative_modes jsonb,
    energy_cost integer DEFAULT 0,
    linked_product_id character varying,
    linked_product_url text,
    calculated_at timestamp without time zone DEFAULT now(),
    destination_profile text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_calendar_events (
    id character varying NOT NULL,
    event_name character varying(255) NOT NULL,
    event_type character varying(50),
    city character varying(100),
    country character varying(100),
    region character varying(100),
    start_date date NOT NULL,
    end_date date,
    crowd_impact character varying(20),
    price_impact character varying(20),
    crowd_impact_percent integer,
    description text,
    affected_areas jsonb DEFAULT '[]'::jsonb,
    tips jsonb DEFAULT '[]'::jsonb,
    source character varying(50),
    image_url text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_cities (
    id character varying NOT NULL,
    city_name character varying(100) NOT NULL,
    country character varying(100) NOT NULL,
    country_code character varying(3),
    region character varying(100),
    timezone character varying(50),
    latitude numeric(10,7),
    longitude numeric(10,7),
    pulse_score integer DEFAULT 0,
    active_travelers integer DEFAULT 0,
    trending_score integer DEFAULT 0,
    crowd_level character varying(20) DEFAULT 'moderate'::character varying,
    vibe_tags jsonb DEFAULT '[]'::jsonb,
    current_highlight text,
    highlight_emoji character varying(10),
    current_weather jsonb DEFAULT '{}'::jsonb,
    weather_score integer DEFAULT 50,
    avg_hotel_price numeric(10,2),
    price_change numeric(5,2),
    price_trend character varying(20),
    deal_alert text,
    total_trending_spots integer DEFAULT 0,
    total_hidden_gems integer DEFAULT 0,
    total_alerts integer DEFAULT 0,
    image_url text,
    thumbnail_url text,
    last_updated timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    ai_generated_at timestamp without time zone,
    ai_source_model character varying(50),
    ai_best_time_to_visit text,
    ai_seasonal_highlights jsonb DEFAULT '[]'::jsonb,
    ai_upcoming_events jsonb DEFAULT '[]'::jsonb,
    ai_travel_tips jsonb DEFAULT '[]'::jsonb,
    ai_local_insights text,
    ai_safety_notes text,
    ai_optimal_duration character varying(50),
    ai_budget_estimate jsonb DEFAULT '{}'::jsonb,
    ai_must_see_attractions jsonb DEFAULT '[]'::jsonb,
    ai_avoid_dates jsonb DEFAULT '[]'::jsonb,
    expires_at timestamp without time zone,
    ai_refresh_error_count integer DEFAULT 0,
    last_refresh_status character varying(20)
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_city_alerts (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    alert_type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    emoji character varying(10),
    action_url text,
    action_text character varying(50),
    is_active boolean DEFAULT true,
    starts_at timestamp without time zone,
    ends_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_crowd_forecasts (
    id character varying NOT NULL,
    place_name character varying(255) NOT NULL,
    city character varying(100) NOT NULL,
    forecast_date date NOT NULL,
    hour_of_day integer NOT NULL,
    crowd_level_percent integer,
    crowd_level_label character varying(20),
    confidence_score numeric(3,2),
    weather_forecast character varying(50),
    special_events jsonb DEFAULT '[]'::jsonb,
    is_optimal_window boolean DEFAULT false,
    is_avoid_window boolean DEFAULT false,
    generated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_discovery_scores (
    id character varying NOT NULL,
    user_id character varying(255) NOT NULL,
    total_discovery_score integer DEFAULT 0,
    hidden_gems_found integer DEFAULT 0,
    emerging_spots_visited integer DEFAULT 0,
    tips_contributed integer DEFAULT 0,
    badges jsonb DEFAULT '[]'::jsonb,
    rank character varying(50) DEFAULT 'Explorer'::character varying,
    last_activity_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_happening_now (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    event_type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    venue character varying(200),
    address text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    starts_at timestamp without time zone NOT NULL,
    ends_at timestamp without time zone,
    crowd_level character varying(20),
    entry_fee character varying(50),
    image_url text,
    source_url text,
    is_live boolean DEFAULT false,
    detected_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_hidden_gems (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    country character varying(100),
    place_name character varying(200) NOT NULL,
    place_type character varying(50),
    address text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    local_rating numeric(3,2),
    tourist_mentions integer DEFAULT 0,
    local_mentions integer DEFAULT 0,
    gem_score integer DEFAULT 0,
    discovery_status character varying(20) DEFAULT 'hidden'::character varying,
    days_until_mainstream integer,
    description text,
    why_locals_love_it text,
    best_for jsonb DEFAULT '[]'::jsonb,
    price_range character varying(10),
    image_url text,
    detected_at timestamp without time zone DEFAULT now(),
    last_updated timestamp without time zone DEFAULT now(),
    ai_generated boolean DEFAULT false,
    ai_generated_at timestamp without time zone,
    neighborhood character varying(100),
    curated_by_expert_id character varying(255)
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_live_activity (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    place_name character varying(200),
    activity_type character varying(50) NOT NULL,
    activity_text text NOT NULL,
    activity_emoji character varying(10),
    user_name character varying(50),
    user_avatar text,
    likes_count integer DEFAULT 0,
    occurred_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_live_scores (
    id character varying NOT NULL,
    entity_name character varying(255) NOT NULL,
    entity_type character varying(50),
    city character varying(100) NOT NULL,
    window_period character varying(20) DEFAULT '24h'::character varying,
    mention_count integer DEFAULT 0,
    unique_users_count integer DEFAULT 0,
    avg_sentiment numeric(3,2),
    positive_count integer DEFAULT 0,
    neutral_count integer DEFAULT 0,
    negative_count integer DEFAULT 0,
    sentiment_trend character varying(10),
    live_score numeric(3,2),
    score_change_24h numeric(3,2),
    score_change_7d numeric(3,2),
    is_trending boolean DEFAULT false,
    trend_velocity integer DEFAULT 0,
    top_positive_keywords jsonb DEFAULT '[]'::jsonb,
    top_negative_keywords jsonb DEFAULT '[]'::jsonb,
    calculated_at timestamp without time zone DEFAULT now(),
    valid_until timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_trending (
    id character varying NOT NULL,
    city character varying(100) NOT NULL,
    country character varying(100),
    destination_name character varying(255) NOT NULL,
    destination_type character varying(50),
    trend_score integer DEFAULT 0,
    growth_percent integer DEFAULT 0,
    mention_count integer DEFAULT 0,
    trend_status character varying(20) DEFAULT 'emerging'::character varying,
    trigger_event text,
    live_score numeric(3,2),
    live_score_change numeric(3,2),
    sentiment_score numeric(3,2),
    sentiment_trend character varying(10),
    worth_it_percent integer,
    meh_percent integer,
    avoid_percent integer,
    overall_verdict character varying(20),
    reality_score integer,
    top_highlights jsonb DEFAULT '[]'::jsonb,
    top_warnings jsonb DEFAULT '[]'::jsonb,
    crowdsourced_tips jsonb DEFAULT '[]'::jsonb,
    best_time_to_visit character varying(100),
    worst_time_to_visit character varying(100),
    crowd_forecast jsonb DEFAULT '[]'::jsonb,
    image_url text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    detected_at timestamp without time zone DEFAULT now(),
    last_updated timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.travel_pulse_truth_checks (
    id character varying NOT NULL,
    query_text text NOT NULL,
    query_hash character varying(64) NOT NULL,
    subject_name character varying(255),
    subject_type character varying(50),
    city character varying(100),
    posts_analyzed integer DEFAULT 0,
    analysis_start_date date,
    analysis_end_date date,
    worth_it_percent integer,
    meh_percent integer,
    avoid_percent integer,
    overall_verdict character varying(20),
    positive_mentions jsonb DEFAULT '[]'::jsonb,
    negative_mentions jsonb DEFAULT '[]'::jsonb,
    crowdsourced_tips jsonb DEFAULT '[]'::jsonb,
    reality_score integer,
    expectation_gap integer,
    hit_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    last_accessed_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.travelpayouts_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand character varying(100) NOT NULL,
    cache_key character varying(500) NOT NULL,
    data jsonb NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trending_experiences (
    id character varying NOT NULL,
    destination character varying(255),
    experience_name character varying(255) NOT NULL,
    experience_type character varying(50),
    reason text,
    popularity_score integer DEFAULT 0,
    source character varying(50) DEFAULT 'grok'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.trip_alerts (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    alert_type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    source character varying(100),
    source_url text,
    effective_from timestamp without time zone,
    effective_until timestamp without time zone,
    is_active boolean DEFAULT true,
    is_read boolean DEFAULT false,
    acknowledged_at timestamp without time zone,
    acknowledged_by_user_id character varying,
    suggested_actions jsonb DEFAULT '[]'::jsonb,
    action_taken text,
    affected_itinerary_item_ids jsonb DEFAULT '[]'::jsonb,
    affected_vendor_contract_ids jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trip_analytics_enhanced (
    id character varying NOT NULL,
    trip_id character varying,
    user_id character varying,
    destination_country character varying(100),
    destination_region character varying(100),
    destination_city character varying(100),
    destination_type character varying(50),
    origin_country character varying(100),
    origin_region character varying(100),
    origin_city character varying(100),
    booking_date timestamp without time zone,
    trip_start_date timestamp without time zone,
    trip_end_date timestamp without time zone,
    lead_time_days integer,
    length_of_stay integer,
    season character varying(20),
    party_size integer,
    party_composition character varying(50),
    has_children boolean,
    trip_purpose character varying(50),
    total_budget numeric(12,2),
    currency character varying(3) DEFAULT 'USD'::character varying,
    accommodation_budget numeric(10,2),
    activities_budget numeric(10,2),
    dining_budget numeric(10,2),
    transport_budget numeric(10,2),
    spend_per_day numeric(10,2),
    price_segment character varying(20),
    activities_booked jsonb,
    primary_activity character varying(100),
    accommodation_type character varying(50),
    star_rating integer,
    booking_channel character varying(50),
    device_used character varying(20),
    other_destinations_considered jsonb,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trip_collaborators (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    trip_id character varying NOT NULL,
    user_id character varying NOT NULL,
    role character varying(20) NOT NULL,
    invited_by character varying,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT trip_collaborators_role_check CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'expert'::character varying, 'friend'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.trip_emergency_contacts (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    contact_type character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    organization character varying(255),
    phone character varying(100),
    alternate_phone character varying(100),
    email character varying(255),
    address text,
    website text,
    city character varying(100),
    country character varying(100),
    latitude numeric(10,7),
    longitude numeric(10,7),
    available_24_hours boolean DEFAULT false,
    operating_hours jsonb DEFAULT '{}'::jsonb,
    languages jsonb DEFAULT '["English"]'::jsonb,
    priority integer DEFAULT 0,
    notes text,
    special_instructions text,
    is_verified boolean DEFAULT false,
    last_verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trip_expert_advisors (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    local_expert_id character varying NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    message text,
    assigned_at timestamp without time zone DEFAULT now(),
    expert_response text,
    workspace_status character varying(20) DEFAULT 'draft'::character varying
);

CREATE TABLE IF NOT EXISTS public.trip_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id character varying(255) NOT NULL,
    item_type character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    date date NOT NULL,
    "time" time without time zone,
    duration character varying(50),
    day_number integer,
    order_in_day integer DEFAULT 0,
    price numeric DEFAULT '0'::numeric NOT NULL,
    is_price_estimated boolean DEFAULT true,
    currency character varying(3) DEFAULT 'USD'::character varying,
    location_name character varying(255),
    latitude numeric,
    longitude numeric,
    address text,
    provider_id character varying(255),
    booking_type character varying(20),
    external_url text,
    affiliate_partner character varying(50),
    booking_status character varying(20) DEFAULT 'not_booked'::character varying,
    confirmation_code character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trip_other_services (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    other_service jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.trip_participants (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    user_id character varying,
    name character varying(200) NOT NULL,
    email character varying(255),
    phone character varying(50),
    role character varying(50) DEFAULT 'guest'::character varying,
    status character varying(20) DEFAULT 'invited'::character varying,
    invited_at timestamp without time zone DEFAULT now(),
    responded_at timestamp without time zone,
    rsvp_notes text,
    dietary_restrictions jsonb DEFAULT '[]'::jsonb,
    accessibility_needs jsonb DEFAULT '[]'::jsonb,
    special_requests text,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying,
    amount_owed numeric(10,2) DEFAULT '0'::numeric,
    amount_paid numeric(10,2) DEFAULT '0'::numeric,
    payment_method character varying(50),
    payment_notes text,
    emergency_contact_name character varying(200),
    emergency_contact_phone character varying(50),
    emergency_contact_relation character varying(50),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    arrival_datetime timestamp without time zone,
    departure_datetime timestamp without time zone,
    mobility_level character varying(20) DEFAULT 'high'::character varying,
    mandatory_event_ids jsonb DEFAULT '[]'::jsonb,
    optional_event_ids jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.trip_selected_flights (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    flight_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    origin character varying(255),
    destination character varying(255),
    departure_date date,
    return_date date,
    price_range character varying(50),
    image_url character varying(1000),
    website_url character varying(1000),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.trip_selected_hotels (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    hotel_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    address character varying(255),
    rating numeric,
    price_range character varying(50),
    image_url character varying(1000),
    website_url character varying(1000),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.trip_selected_places (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    place_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    address character varying(255),
    rating numeric,
    image_url character varying(1000),
    website_url character varying(1000),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.trip_selected_services (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    service_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    service_type character varying(50) NOT NULL,
    price_range character varying(50),
    image_url character varying(1000),
    website_url character varying(1000),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.trip_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id character varying NOT NULL,
    expert_id character varying NOT NULL,
    type character varying(50) NOT NULL,
    day_number integer,
    title character varying(255) NOT NULL,
    description text,
    estimated_cost numeric(10,2),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    rejection_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.trip_transactions (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    transaction_type character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'unpaid'::character varying,
    paid_by_participant_id character varying,
    paid_to_vendor_contract_id character varying,
    assigned_to_participant_id character varying,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    original_amount numeric(10,2),
    original_currency character varying(3),
    exchange_rate numeric(10,6),
    category character varying(50),
    subcategory character varying(50),
    description text,
    payment_method character varying(50),
    payment_reference character varying(255),
    receipt_url text,
    transaction_date timestamp without time zone DEFAULT now(),
    due_date timestamp without time zone,
    paid_date timestamp without time zone,
    tip_amount numeric(10,2),
    tip_percentage numeric(5,2),
    split_method character varying(20),
    split_details jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trips (
    id character varying NOT NULL,
    user_id character varying,
    title character varying(255) DEFAULT 'My Trip'::character varying,
    start_date date NOT NULL,
    end_date date NOT NULL,
    destination character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    number_of_travelers integer DEFAULT 1,
    preferences jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    event_type character varying(30) DEFAULT 'vacation'::character varying,
    budget numeric(10,2),
    event_details jsonb DEFAULT '{}'::jsonb,
    tracking_number character varying(20),
    experience_type character varying(20),
    travelers integer,
    special_requests text,
    expert_id character varying(255),
    expert_notes text,
    expert_modified_at timestamp without time zone,
    booking_reference character varying(50),
    is_public boolean DEFAULT false,
    share_token character varying(64),
    adults integer DEFAULT 2,
    kids integer DEFAULT 0,
    managed_by_ea_id character varying,
    ea_client_relationship_id character varying,
    primary_expert_id character varying(255),
    neighborhood_ids text[]
);

CREATE TABLE IF NOT EXISTS public.upsell_expert_endorsements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expert_id character varying(255) NOT NULL,
    service_id character varying(255),
    offering_type_key character varying(100),
    city_key character varying(100),
    endorsed_at timestamp without time zone DEFAULT now() NOT NULL,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.upsell_impressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id character varying(255),
    guest_session_id character varying(255),
    user_id character varying(255),
    surface character varying(50) NOT NULL,
    offering_id character varying(255) NOT NULL,
    category_key character varying(100),
    source_type character varying(30),
    relevance_score numeric(6,4),
    revenue_score numeric(6,4),
    final_score numeric(6,4),
    rank_position integer,
    shown_at timestamp without time zone DEFAULT now() NOT NULL,
    clicked boolean DEFAULT false NOT NULL,
    clicked_at timestamp without time zone,
    added boolean DEFAULT false NOT NULL,
    added_at timestamp without time zone,
    booked boolean DEFAULT false NOT NULL,
    booked_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.upsell_slot_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    surface character varying(50) NOT NULL,
    max_items integer DEFAULT 3 NOT NULL,
    revenue_weight numeric(5,4) DEFAULT 0.15 NOT NULL,
    revenue_cap numeric(5,4) DEFAULT 0.15 NOT NULL,
    frequency_cap_hours integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_and_expert_chats (
    id character varying NOT NULL,
    sender_id character varying NOT NULL,
    receiver_id character varying,
    contract_id character varying,
    message text,
    attachment text,
    itinerary_submit_id character varying,
    created_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20),
    read_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.user_and_expert_contracts (
    id character varying NOT NULL,
    title character varying(255) NOT NULL,
    trip_to character varying(255) NOT NULL,
    description text NOT NULL,
    amount numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    is_paid boolean DEFAULT false,
    payment_url text,
    attachment text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_experience_items (
    id character varying NOT NULL,
    user_experience_id character varying NOT NULL,
    step_id character varying,
    provider_service_id character varying,
    external_service_data jsonb DEFAULT '{}'::jsonb,
    is_external boolean DEFAULT false,
    name character varying(255) NOT NULL,
    description text,
    price numeric(10,2),
    scheduled_date timestamp without time zone,
    scheduled_time character varying(20),
    location character varying(255),
    latitude numeric(10,7),
    longitude numeric(10,7),
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_experiences (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    experience_type_id character varying NOT NULL,
    title character varying(255),
    status character varying(20) DEFAULT 'draft'::character varying,
    event_date date,
    location character varying(255),
    budget numeric(10,2),
    guest_count integer,
    preferences jsonb DEFAULT '{}'::jsonb,
    step_data jsonb DEFAULT '{}'::jsonb,
    current_step integer DEFAULT 1,
    map_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tracking_number character varying(20),
    trip_id character varying
);

CREATE TABLE IF NOT EXISTS public.user_filter_preferences (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    item_type character varying(30) NOT NULL,
    price_min numeric(10,2) DEFAULT '0'::numeric,
    price_max numeric(10,2) DEFAULT '10000'::numeric,
    min_rating numeric(3,2) DEFAULT '0'::numeric,
    sort_by character varying(30) DEFAULT 'popularity'::character varying,
    selected_tags jsonb DEFAULT '[]'::jsonb,
    search_query text,
    county character varying(100),
    state character varying(100),
    country_code character varying(10),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_saved_gems (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    gem_id character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_spontaneity_preferences (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    spontaneity_level integer DEFAULT 50,
    notification_radius integer DEFAULT 10,
    preferred_cities jsonb DEFAULT '[]'::jsonb,
    preferred_categories jsonb DEFAULT '[]'::jsonb,
    blacklisted_types jsonb DEFAULT '[]'::jsonb,
    price_sensitivity integer DEFAULT 50,
    max_budget_per_activity numeric(10,2),
    time_windows jsonb DEFAULT '[{"day": "weekend", "hours": ["18:00", "22:00"]}, {"day": "weekday", "hours": ["19:00", "23:00"]}]'::jsonb,
    enable_notifications boolean DEFAULT true,
    last_notified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    role character varying(30) DEFAULT 'user'::character varying,
    bio character varying(500),
    specialties jsonb DEFAULT '[]'::jsonb,
    terms_accepted_at timestamp without time zone,
    privacy_accepted_at timestamp without time zone,
    terms_version character varying(20),
    privacy_version character varying(20),
    instagram_user_id character varying,
    instagram_access_token character varying(512),
    password character varying(255),
    auth_provider character varying(20) DEFAULT 'email'::character varying,
    email_verified timestamp without time zone,
    commission_override_expert_share_percent numeric(5,2),
    provider_verification_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    background_check_confirmed boolean DEFAULT false NOT NULL,
    preferred_currency character varying(3) DEFAULT 'USD'::character varying
);

CREATE TABLE IF NOT EXISTS public.vendor_assignments (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    vendor_id character varying NOT NULL,
    service_type character varying(100) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying,
    notes text,
    confirmed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_availability_slots (
    id character varying NOT NULL,
    service_id character varying NOT NULL,
    provider_id character varying NOT NULL,
    date date NOT NULL,
    start_time character varying(10),
    end_time character varying(10),
    capacity integer DEFAULT 1,
    booked_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'available'::character varying,
    pricing jsonb DEFAULT '{}'::jsonb,
    discounts jsonb DEFAULT '[]'::jsonb,
    minimum_notice character varying(50) DEFAULT '24 hours'::character varying,
    cancellation_policy character varying(100),
    special_requirements jsonb DEFAULT '[]'::jsonb,
    confirmation_method character varying(20) DEFAULT 'instant'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendor_contracts (
    id character varying NOT NULL,
    trip_id character varying NOT NULL,
    vendor_id character varying,
    vendor_name character varying(255) NOT NULL,
    vendor_category character varying(100),
    vendor_email character varying(255),
    vendor_phone character varying(50),
    vendor_address text,
    contract_status character varying(20) DEFAULT 'draft'::character varying,
    contract_number character varying(100),
    service_description text,
    start_date date,
    end_date date,
    total_amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying,
    paid_amount numeric(10,2) DEFAULT '0'::numeric,
    remaining_balance numeric(10,2),
    payment_schedule jsonb DEFAULT '[]'::jsonb,
    contract_document_url text,
    signed_document_url text,
    attachments jsonb DEFAULT '[]'::jsonb,
    cancellation_policy text,
    special_terms text,
    notes text,
    communication_log jsonb DEFAULT '[]'::jsonb,
    last_contact_date timestamp without time zone,
    next_follow_up_date timestamp without time zone,
    assigned_to_participant_id character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendors (
    id character varying NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(100) NOT NULL,
    description text,
    email character varying(255),
    phone character varying(50),
    website character varying(500),
    address text,
    city character varying(100),
    country character varying(100),
    rating numeric(3,2),
    price_range character varying(50),
    image_url character varying(1000),
    status character varying(30) DEFAULT 'active'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visa_requirements_cache (
    id character varying NOT NULL,
    passport_country character varying(100) NOT NULL,
    destination_country character varying(100) NOT NULL,
    visa_required boolean NOT NULL,
    visa_types jsonb DEFAULT '[]'::jsonb,
    required_documents jsonb DEFAULT '[]'::jsonb,
    processing_time character varying(200),
    fee_range character varying(200),
    disclaimer text,
    cached_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.wallets (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    credits integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);

ALTER TABLE ONLY public.payment_intents ALTER COLUMN id SET DEFAULT nextval('public.payment_intents_id_seq'::regclass);

DO $$ BEGIN
  ALTER TABLE ONLY public.access_audit_logs
    ADD CONSTRAINT access_audit_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.activity_booking_analytics
    ADD CONSTRAINT activity_booking_analytics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.activity_cache
    ADD CONSTRAINT activity_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.activity_cache
    ADD CONSTRAINT activity_cache_product_code_unique UNIQUE (product_code);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.activity_comments
    ADD CONSTRAINT activity_comments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.activity_demand_trends
    ADD CONSTRAINT activity_demand_trends_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_booking_requests
    ADD CONSTRAINT affiliate_booking_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_earnings
    ADD CONSTRAINT affiliate_earnings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_partners
    ADD CONSTRAINT affiliate_partners_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_platforms
    ADD CONSTRAINT affiliate_platforms_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_products
    ADD CONSTRAINT affiliate_products_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_scrape_jobs
    ADD CONSTRAINT affiliate_scrape_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_trips
    ADD CONSTRAINT affiliate_trips_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_blueprints
    ADD CONSTRAINT ai_blueprints_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_cost_tracking
    ADD CONSTRAINT ai_cost_tracking_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_discovered_gems
    ADD CONSTRAINT ai_discovered_gems_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_generated_itineraries
    ADD CONSTRAINT ai_generated_itineraries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_interactions
    ADD CONSTRAINT ai_interactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.api_usage_logs
    ADD CONSTRAINT api_usage_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.booking_fee_configs
    ADD CONSTRAINT booking_fee_configs_category_unique UNIQUE (category);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.booking_fee_configs
    ADD CONSTRAINT booking_fee_configs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.booking_funnel_analytics
    ADD CONSTRAINT booking_funnel_analytics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.booking_requests
    ADD CONSTRAINT booking_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.category_field_schema
    ADD CONSTRAINT category_field_schema_category_key_field_key_key UNIQUE (category_key, field_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.category_field_schema
    ADD CONSTRAINT category_field_schema_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.city_media_cache
    ADD CONSTRAINT city_media_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.city_neighborhoods
    ADD CONSTRAINT city_neighborhoods_city_country_slug_uniq UNIQUE (city, country, slug);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.city_neighborhoods
    ADD CONSTRAINT city_neighborhoods_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.concierge_requests
    ADD CONSTRAINT concierge_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.contact_submissions
    ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_analytics
    ADD CONSTRAINT content_analytics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_impressions
    ADD CONSTRAINT content_impressions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_invoices
    ADD CONSTRAINT content_invoices_invoice_number_unique UNIQUE (invoice_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_invoices
    ADD CONSTRAINT content_invoices_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_placement_rules
    ADD CONSTRAINT content_placement_rules_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_registry
    ADD CONSTRAINT content_registry_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_registry
    ADD CONSTRAINT content_registry_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_versions
    ADD CONSTRAINT content_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_bookings
    ADD CONSTRAINT coordination_bookings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_states
    ADD CONSTRAINT coordination_states_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.cross_sell_events
    ADD CONSTRAINT cross_sell_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.custom_venues
    ADD CONSTRAINT custom_venues_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.daily_revenue_summary
    ADD CONSTRAINT daily_revenue_summary_date_unique UNIQUE (date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.daily_revenue_summary
    ADD CONSTRAINT daily_revenue_summary_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.day_boundaries
    ADD CONSTRAINT day_boundaries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.demand_signals
    ADD CONSTRAINT demand_signals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_benchmarks
    ADD CONSTRAINT destination_benchmarks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_events
    ADD CONSTRAINT destination_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_intelligence
    ADD CONSTRAINT destination_intelligence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_metrics_history
    ADD CONSTRAINT destination_metrics_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_search_patterns
    ADD CONSTRAINT destination_search_patterns_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_seasons
    ADD CONSTRAINT destination_seasons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.discovery_jobs
    ADD CONSTRAINT discovery_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_ai_tasks
    ADD CONSTRAINT ea_ai_tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_client_relationships
    ADD CONSTRAINT ea_client_relationships_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_communications
    ADD CONSTRAINT ea_communications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_events
    ADD CONSTRAINT ea_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_executives
    ADD CONSTRAINT ea_executives_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_gifts
    ADD CONSTRAINT ea_gifts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_saved_venues
    ADD CONSTRAINT ea_saved_venues_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_travel_arrangements
    ADD CONSTRAINT ea_travel_arrangements_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.energy_tracking
    ADD CONSTRAINT energy_tracking_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.event_coordination_profiles
    ADD CONSTRAINT event_coordination_profiles_event_type_key UNIQUE (event_type);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.event_coordination_profiles
    ADD CONSTRAINT event_coordination_profiles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_unique_token_key UNIQUE (unique_token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.event_packages
    ADD CONSTRAINT event_packages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_filter_options
    ADD CONSTRAINT experience_template_filter_options_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_filters
    ADD CONSTRAINT experience_template_filters_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_steps
    ADD CONSTRAINT experience_template_steps_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_tabs
    ADD CONSTRAINT experience_template_tabs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_types
    ADD CONSTRAINT experience_types_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_types
    ADD CONSTRAINT experience_types_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_types
    ADD CONSTRAINT experience_types_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_universal_filter_options
    ADD CONSTRAINT experience_universal_filter_options_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_universal_filters
    ADD CONSTRAINT experience_universal_filters_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_ai_tasks
    ADD CONSTRAINT expert_ai_tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_city_queues
    ADD CONSTRAINT expert_city_queues_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_earnings
    ADD CONSTRAINT expert_earnings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_experience_types
    ADD CONSTRAINT expert_experience_types_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_handoffs
    ADD CONSTRAINT expert_handoffs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_match_analytics
    ADD CONSTRAINT expert_match_analytics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_match_scores
    ADD CONSTRAINT expert_match_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_neighborhoods
    ADD CONSTRAINT expert_neighborhoods_expert_id_neighborhood_id_key UNIQUE (expert_id, neighborhood_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_neighborhoods
    ADD CONSTRAINT expert_neighborhoods_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_offering_types
    ADD CONSTRAINT expert_offering_types_offering_type_key_key UNIQUE (offering_type_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_offering_types
    ADD CONSTRAINT expert_offering_types_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_payouts
    ADD CONSTRAINT expert_payouts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_referrals
    ADD CONSTRAINT expert_referrals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_requests
    ADD CONSTRAINT expert_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_service_categories
    ADD CONSTRAINT expert_service_categories_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_service_categories
    ADD CONSTRAINT expert_service_categories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_service_offerings
    ADD CONSTRAINT expert_service_offerings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_specializations
    ADD CONSTRAINT expert_specializations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_templates
    ADD CONSTRAINT expert_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_templates
    ADD CONSTRAINT expert_templates_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_tips
    ADD CONSTRAINT expert_tips_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_tips
    ADD CONSTRAINT expert_tips_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_updated_itineraries
    ADD CONSTRAINT expert_updated_itineraries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_vendor_coordination
    ADD CONSTRAINT expert_vendor_coordination_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.fee_bands
    ADD CONSTRAINT fee_bands_band_key_key UNIQUE (band_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.fee_bands
    ADD CONSTRAINT fee_bands_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.fever_event_cache
    ADD CONSTRAINT fever_event_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.flight_cache
    ADD CONSTRAINT flight_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.generated_itineraries
    ADD CONSTRAINT generated_itineraries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.generated_itineraries
    ADD CONSTRAINT generated_itineraries_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.guest_travel_plans
    ADD CONSTRAINT guest_travel_plans_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.help_guide_trips
    ADD CONSTRAINT help_guide_trips_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.hotel_cache
    ADD CONSTRAINT hotel_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.hotel_offer_cache
    ADD CONSTRAINT hotel_offer_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.influencer_curated_content
    ADD CONSTRAINT influencer_curated_content_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.influencer_referrals
    ADD CONSTRAINT influencer_referrals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.invite_send_log
    ADD CONSTRAINT invite_send_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.invite_templates
    ADD CONSTRAINT invite_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_changes
    ADD CONSTRAINT itinerary_changes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_comparisons
    ADD CONSTRAINT itinerary_comparisons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_items
    ADD CONSTRAINT itinerary_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_variant_items
    ADD CONSTRAINT itinerary_variant_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_variant_metrics
    ADD CONSTRAINT itinerary_variant_metrics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_variants
    ADD CONSTRAINT itinerary_variants_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.lead_routing_logs
    ADD CONSTRAINT lead_routing_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_events
    ADD CONSTRAINT live_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.local_expert_forms
    ADD CONSTRAINT local_expert_forms_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.local_expert_forms
    ADD CONSTRAINT local_expert_forms_referral_code_unique UNIQUE (referral_code);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.local_knowledge_nuggets
    ADD CONSTRAINT local_knowledge_nuggets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.location_cache
    ADD CONSTRAINT location_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.maps_export_cache
    ADD CONSTRAINT maps_export_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.market_intelligence
    ADD CONSTRAINT market_intelligence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.neighborhood_coverage_target
    ADD CONSTRAINT neighborhood_coverage_target_pkey PRIMARY KEY (neighborhood_id, category_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.optimization_fees
    ADD CONSTRAINT optimization_fees_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.page_view_analytics
    ADD CONSTRAINT page_view_analytics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.platform_fees
    ADD CONSTRAINT platform_fees_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.platform_revenue
    ADD CONSTRAINT platform_revenue_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (setting_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.poi_cache
    ADD CONSTRAINT poi_cache_amadeus_id_unique UNIQUE (amadeus_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.poi_cache
    ADD CONSTRAINT poi_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.pricing_intelligence
    ADD CONSTRAINT pricing_intelligence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_availability
    ADD CONSTRAINT provider_availability_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_availability_schedule
    ADD CONSTRAINT provider_availability_schedule_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_blackout_dates
    ADD CONSTRAINT provider_blackout_dates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_booking_requests
    ADD CONSTRAINT provider_booking_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_earnings
    ADD CONSTRAINT provider_earnings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_neighborhood_coverage
    ADD CONSTRAINT provider_neighborhood_coverag_provider_id_neighborhood_id_c_key UNIQUE (provider_id, neighborhood_id, category_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_neighborhood_coverage
    ADD CONSTRAINT provider_neighborhood_coverage_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_payouts
    ADD CONSTRAINT provider_payouts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_performance_metrics
    ADD CONSTRAINT provider_performance_metrics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_pricing
    ADD CONSTRAINT provider_pricing_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_services
    ADD CONSTRAINT provider_services_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_services
    ADD CONSTRAINT provider_services_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_settings
    ADD CONSTRAINT provider_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_settings
    ADD CONSTRAINT provider_settings_user_id_unique UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.realtime_signals
    ADD CONSTRAINT realtime_signals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.recommendation_conversions
    ADD CONSTRAINT recommendation_conversions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.reminder_emails
    ADD CONSTRAINT reminder_emails_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.restaurant_cache
    ADD CONSTRAINT restaurant_cache_external_id_unique UNIQUE (external_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.restaurant_cache
    ADD CONSTRAINT restaurant_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.revenue_splits
    ADD CONSTRAINT revenue_splits_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.review_moderation_logs
    ADD CONSTRAINT review_moderation_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.review_ratings
    ADD CONSTRAINT review_ratings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.safety_cache
    ADD CONSTRAINT safety_cache_amadeus_id_unique UNIQUE (amadeus_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.safety_cache
    ADD CONSTRAINT safety_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.saved_items
    ADD CONSTRAINT saved_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.saved_items
    ADD CONSTRAINT saved_items_user_content_unique UNIQUE (user_id, content_type, content_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.saved_trips
    ADD CONSTRAINT saved_trips_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (migration_name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.search_analytics
    ADD CONSTRAINT search_analytics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.seasonal_opportunities
    ADD CONSTRAINT seasonal_opportunities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.serp_cache
    ADD CONSTRAINT serp_cache_cache_key_unique UNIQUE (cache_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.serp_cache
    ADD CONSTRAINT serp_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.serp_inquiries
    ADD CONSTRAINT serp_inquiries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.serp_provider_tracking
    ADD CONSTRAINT serp_provider_tracking_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.serp_provider_tracking
    ADD CONSTRAINT serp_provider_tracking_serp_provider_id_unique UNIQUE (serp_provider_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_bookings
    ADD CONSTRAINT service_bookings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_bookings
    ADD CONSTRAINT service_bookings_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_demand_requests
    ADD CONSTRAINT service_demand_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_demand_signals
    ADD CONSTRAINT service_demand_signals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_gap_analysis
    ADD CONSTRAINT service_gap_analysis_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_offering_types
    ADD CONSTRAINT service_offering_types_offering_type_key_key UNIQUE (offering_type_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_offering_types
    ADD CONSTRAINT service_offering_types_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_provider_forms
    ADD CONSTRAINT service_provider_forms_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_recommendations
    ADD CONSTRAINT service_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_reviews
    ADD CONSTRAINT service_reviews_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_reviews
    ADD CONSTRAINT service_reviews_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_subcategories
    ADD CONSTRAINT service_subcategories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_templates
    ADD CONSTRAINT service_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_itineraries
    ADD CONSTRAINT shared_itineraries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_itineraries
    ADD CONSTRAINT shared_itineraries_share_token_unique UNIQUE (share_token);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_trip_views
    ADD CONSTRAINT shared_trip_views_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_trips
    ADD CONSTRAINT shared_trips_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.spontaneous_opportunities
    ADD CONSTRAINT spontaneous_opportunities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.submit_itinerary_feedbacks
    ADD CONSTRAINT submit_itinerary_feedbacks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_category_matrix
    ADD CONSTRAINT template_category_matrix_pkey PRIMARY KEY (template_key, category_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.temporal_anchors
    ADD CONSTRAINT temporal_anchors_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_help_me_guide_activities
    ADD CONSTRAINT tourist_help_me_guide_activities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_help_me_guide_events
    ADD CONSTRAINT tourist_help_me_guide_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_place_category
    ADD CONSTRAINT tourist_place_category_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_place_category
    ADD CONSTRAINT tourist_place_category_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_place_results
    ADD CONSTRAINT tourist_place_results_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_places_searches
    ADD CONSTRAINT tourist_places_searches_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_preferences
    ADD CONSTRAINT tourist_preferences_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tracking_sequences
    ADD CONSTRAINT tracking_sequences_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tracking_sequences
    ADD CONSTRAINT tracking_sequences_prefix_year_month_unique UNIQUE (prefix, year_month);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.transfer_cache
    ADD CONSTRAINT transfer_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.transport_booking_options
    ADD CONSTRAINT transport_booking_options_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.transport_legs
    ADD CONSTRAINT transport_legs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_calendar_events
    ADD CONSTRAINT travel_pulse_calendar_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_cities
    ADD CONSTRAINT travel_pulse_cities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_city_alerts
    ADD CONSTRAINT travel_pulse_city_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_crowd_forecasts
    ADD CONSTRAINT travel_pulse_crowd_forecasts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_discovery_scores
    ADD CONSTRAINT travel_pulse_discovery_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_happening_now
    ADD CONSTRAINT travel_pulse_happening_now_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_hidden_gems
    ADD CONSTRAINT travel_pulse_hidden_gems_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_live_activity
    ADD CONSTRAINT travel_pulse_live_activity_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_live_scores
    ADD CONSTRAINT travel_pulse_live_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_trending
    ADD CONSTRAINT travel_pulse_trending_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_truth_checks
    ADD CONSTRAINT travel_pulse_truth_checks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travel_pulse_truth_checks
    ADD CONSTRAINT travel_pulse_truth_checks_query_hash_unique UNIQUE (query_hash);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travelpayouts_cache
    ADD CONSTRAINT travelpayouts_cache_cache_key_unique UNIQUE (cache_key);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.travelpayouts_cache
    ADD CONSTRAINT travelpayouts_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trending_experiences
    ADD CONSTRAINT trending_experiences_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_alerts
    ADD CONSTRAINT trip_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_analytics_enhanced
    ADD CONSTRAINT trip_analytics_enhanced_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_trip_id_user_id_key UNIQUE (trip_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_emergency_contacts
    ADD CONSTRAINT trip_emergency_contacts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_expert_advisors
    ADD CONSTRAINT trip_expert_advisors_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_items
    ADD CONSTRAINT trip_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_other_services
    ADD CONSTRAINT trip_other_services_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_participants
    ADD CONSTRAINT trip_participants_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_flights
    ADD CONSTRAINT trip_selected_flights_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_hotels
    ADD CONSTRAINT trip_selected_hotels_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_places
    ADD CONSTRAINT trip_selected_places_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_services
    ADD CONSTRAINT trip_selected_services_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_suggestions
    ADD CONSTRAINT trip_suggestions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_transactions
    ADD CONSTRAINT trip_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.upsell_expert_endorsements
    ADD CONSTRAINT upsell_expert_endorsements_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.upsell_impressions
    ADD CONSTRAINT upsell_impressions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.upsell_slot_config
    ADD CONSTRAINT upsell_slot_config_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.upsell_slot_config
    ADD CONSTRAINT upsell_slot_config_surface_key UNIQUE (surface);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_and_expert_chats
    ADD CONSTRAINT user_and_expert_chats_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_and_expert_chats
    ADD CONSTRAINT user_and_expert_chats_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_and_expert_contracts
    ADD CONSTRAINT user_and_expert_contracts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experience_items
    ADD CONSTRAINT user_experience_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experiences
    ADD CONSTRAINT user_experiences_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experiences
    ADD CONSTRAINT user_experiences_tracking_number_unique UNIQUE (tracking_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_filter_preferences
    ADD CONSTRAINT user_filter_preferences_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_saved_gems
    ADD CONSTRAINT user_saved_gems_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_spontaneity_preferences
    ADD CONSTRAINT user_spontaneity_preferences_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_assignments
    ADD CONSTRAINT vendor_assignments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_availability_slots
    ADD CONSTRAINT vendor_availability_slots_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_contracts
    ADD CONSTRAINT vendor_contracts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.visa_requirements_cache
    ADD CONSTRAINT visa_requirements_cache_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_unique UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.sessions USING btree (expire);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_id_unique ON public.bookings USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS concierge_requests_created_at_idx ON public.concierge_requests USING btree (created_at);

CREATE INDEX IF NOT EXISTS concierge_requests_status_idx ON public.concierge_requests USING btree (status);

CREATE INDEX IF NOT EXISTS concierge_requests_trip_id_idx ON public.concierge_requests USING btree (trip_id);

CREATE INDEX IF NOT EXISTS concierge_requests_user_id_idx ON public.concierge_requests USING btree (user_id);

CREATE INDEX IF NOT EXISTS content_impressions_city_type_idx ON public.content_impressions USING btree (city, content_type, created_at DESC);

CREATE INDEX IF NOT EXISTS content_impressions_session_content_idx ON public.content_impressions USING btree (session_id, content_type, content_id);

CREATE UNIQUE INDEX IF NOT EXISTS content_impressions_session_dedup ON public.content_impressions USING btree (session_id, content_type, content_id);

CREATE INDEX IF NOT EXISTS event_packages_event_type_idx ON public.event_packages USING btree (event_type) WHERE (status = 'active'::text);

CREATE INDEX IF NOT EXISTS event_packages_market_idx ON public.event_packages USING btree (market) WHERE (status = 'active'::text);

CREATE INDEX IF NOT EXISTS event_packages_status_idx ON public.event_packages USING btree (status);

CREATE INDEX IF NOT EXISTS idx_abr_expert_id ON public.affiliate_booking_requests USING btree (expert_id) WHERE (expert_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_abr_status ON public.affiliate_booking_requests USING btree (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_abr_user_id ON public.affiliate_booking_requests USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_clicked_at ON public.affiliate_clicks USING btree (clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_content ON public.affiliate_clicks USING btree (click_content_type, click_content_id) WHERE (click_content_type IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product ON public.affiliate_clicks USING btree (product_id) WHERE (product_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user ON public.affiliate_clicks USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_source_type_created ON public.ai_cost_tracking USING btree (source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_user_id_created ON public.ai_cost_tracking USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_city ON public.content_impressions USING btree (city, created_at DESC) WHERE (city IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_ci_content ON public.content_impressions USING btree (content_type, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_dedup_user_session ON public.content_impressions USING btree (content_type, content_id, user_id, session_id) WHERE ((user_id IS NOT NULL) AND (session_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_ci_user ON public.content_impressions USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_cpr_city_active ON public.content_placement_rules USING btree (city_name, is_active);

CREATE INDEX IF NOT EXISTS idx_cpr_source ON public.content_placement_rules USING btree (content_source, source_id);

CREATE INDEX IF NOT EXISTS idx_cse_city ON public.cross_sell_events USING btree (city);

CREATE INDEX IF NOT EXISTS idx_cse_created_at ON public.cross_sell_events USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_cse_event_type ON public.cross_sell_events USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_cse_target_service ON public.cross_sell_events USING btree (target_service_id);

CREATE INDEX IF NOT EXISTS idx_ds_destination_service ON public.demand_signals USING btree (destination, service_type);

CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON public.email_verification_tokens USING btree (expires_at) WHERE (used_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_email_verification_user ON public.email_verification_tokens USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_event_invites_email ON public.event_invites USING btree (guest_email);

CREATE INDEX IF NOT EXISTS idx_event_invites_experience ON public.event_invites USING btree (experience_id);

CREATE INDEX IF NOT EXISTS idx_event_invites_organizer ON public.event_invites USING btree (organizer_id);

CREATE INDEX IF NOT EXISTS idx_event_invites_rsvp_status ON public.event_invites USING btree (rsvp_status);

CREATE INDEX IF NOT EXISTS idx_event_invites_token ON public.event_invites USING btree (unique_token);

CREATE INDEX IF NOT EXISTS idx_expert_neighborhoods_expert ON public.expert_neighborhoods USING btree (expert_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expert_neighborhoods_one_lead_per ON public.expert_neighborhoods USING btree (neighborhood_id) WHERE (is_lead = true);

CREATE INDEX IF NOT EXISTS idx_expert_offering_types_active ON public.expert_offering_types USING btree (is_active) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_expert_offering_types_tier ON public.expert_offering_types USING btree (service_tier);

CREATE INDEX IF NOT EXISTS idx_fee_bands_active ON public.fee_bands USING btree (is_active) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_guest_travel_plans_invite ON public.guest_travel_plans USING btree (invite_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_travel_plans_invite_unique ON public.guest_travel_plans USING btree (invite_id);

CREATE INDEX IF NOT EXISTS idx_invite_send_log_invite ON public.invite_send_log USING btree (invite_id);

CREATE INDEX IF NOT EXISTS idx_invite_send_log_status ON public.invite_send_log USING btree (status);

CREATE INDEX IF NOT EXISTS idx_invite_templates_event_type ON public.invite_templates USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_invite_templates_user ON public.invite_templates USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_mi_report_entity ON public.market_intelligence USING btree (report_type, target_entity, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON public.password_reset_tokens USING btree (expires_at) WHERE (used_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON public.password_reset_tokens USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_pi_service_destination ON public.pricing_intelligence USING btree (service_type, destination);

CREATE INDEX IF NOT EXISTS idx_pnc_neighborhood_category ON public.provider_neighborhood_coverage USING btree (neighborhood_id, category_key);

CREATE INDEX IF NOT EXISTS idx_pnc_provider ON public.provider_neighborhood_coverage USING btree (provider_id);

CREATE INDEX IF NOT EXISTS idx_ppm_provider_period ON public.provider_performance_metrics USING btree (provider_id, period, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_provider_services_expert_offering_type ON public.provider_services USING btree (expert_offering_type_id) WHERE (expert_offering_type_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_rec_conv_recommendation ON public.recommendation_conversions USING btree (recommendation_id);

CREATE INDEX IF NOT EXISTS idx_review_moderation_logs_review_id ON public.review_moderation_logs USING btree (review_id);

CREATE INDEX IF NOT EXISTS idx_sdr_city_offering ON public.service_demand_requests USING btree (city, offering_type_key);

CREATE INDEX IF NOT EXISTS idx_sdr_created_at ON public.service_demand_requests USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sdr_user_id ON public.service_demand_requests USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_sds_city_service ON public.service_demand_signals USING btree (city, service_type);

CREATE INDEX IF NOT EXISTS idx_sds_demand_level ON public.service_demand_signals USING btree (demand_level, demand_score DESC);

CREATE INDEX IF NOT EXISTS idx_seasonal_opp_city_month ON public.seasonal_opportunities USING btree (city, month);

CREATE INDEX IF NOT EXISTS idx_seasonal_opp_service_type ON public.seasonal_opportunities USING btree (service_type, month);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_categories_category_key ON public.service_categories USING btree (category_key) WHERE (category_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_service_offering_types_active ON public.service_offering_types USING btree (is_active) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_service_offering_types_category_key ON public.service_offering_types USING btree (category_key);

CREATE INDEX IF NOT EXISTS idx_service_reviews_status ON public.service_reviews USING btree (status);

CREATE INDEX IF NOT EXISTS idx_sga_city_service ON public.service_gap_analysis USING btree (city, service_type);

CREATE INDEX IF NOT EXISTS idx_srec_status ON public.service_recommendations USING btree (status, opportunity_score DESC);

CREATE INDEX IF NOT EXISTS idx_srec_target ON public.service_recommendations USING btree (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_tbo_booking_type ON public.transport_booking_options USING btree (booking_type);

CREATE INDEX IF NOT EXISTS idx_tbo_is_multi_day ON public.transport_booking_options USING btree (is_multi_day_pass);

CREATE INDEX IF NOT EXISTS idx_tbo_source ON public.transport_booking_options USING btree (source);

CREATE INDEX IF NOT EXISTS idx_tbo_transport_leg_id ON public.transport_booking_options USING btree (transport_leg_id);

CREATE INDEX IF NOT EXISTS idx_tbo_variant_id ON public.transport_booking_options USING btree (variant_id);

CREATE INDEX IF NOT EXISTS idx_trip_collaborators_trip_id ON public.trip_collaborators USING btree (trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user_id ON public.trip_collaborators USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_upsell_endorsements_expert ON public.upsell_expert_endorsements USING btree (expert_id) WHERE (active = true);

CREATE INDEX IF NOT EXISTS idx_upsell_endorsements_offering_city ON public.upsell_expert_endorsements USING btree (offering_type_key, city_key) WHERE (active = true);

CREATE INDEX IF NOT EXISTS idx_upsell_endorsements_service ON public.upsell_expert_endorsements USING btree (service_id) WHERE ((active = true) AND (service_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_upsell_impressions_offering ON public.upsell_impressions USING btree (offering_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_upsell_impressions_surface_shown ON public.upsell_impressions USING btree (surface, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_upsell_impressions_trip ON public.upsell_impressions USING btree (trip_id) WHERE (trip_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS service_demand_requests_city_offering_idx ON public.service_demand_requests USING btree (city, offering_type_key);

CREATE UNIQUE INDEX IF NOT EXISTS service_demand_requests_user_uniq ON public.service_demand_requests USING btree (offering_type_key, city, user_id) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS trip_expert_advisors_trip_expert_unique ON public.trip_expert_advisors USING btree (trip_id, local_expert_id);

CREATE TRIGGER update_event_invites_updated_at BEFORE UPDATE ON public.event_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_guest_travel_plans_updated_at BEFORE UPDATE ON public.guest_travel_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invite_templates_updated_at BEFORE UPDATE ON public.invite_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  ALTER TABLE ONLY public.access_audit_logs
    ADD CONSTRAINT access_audit_logs_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.access_audit_logs
    ADD CONSTRAINT access_audit_logs_target_user_id_users_id_fk FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.activity_booking_analytics
    ADD CONSTRAINT activity_booking_analytics_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.activity_comments
    ADD CONSTRAINT activity_comments_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_booking_requests
    ADD CONSTRAINT affiliate_booking_requests_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_booking_requests
    ADD CONSTRAINT affiliate_booking_requests_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_booking_requests
    ADD CONSTRAINT affiliate_booking_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_partner_id_affiliate_partners_id_fk FOREIGN KEY (partner_id) REFERENCES public.affiliate_partners(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_clicks
    ADD CONSTRAINT affiliate_clicks_product_id_affiliate_products_id_fk FOREIGN KEY (product_id) REFERENCES public.affiliate_products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_earnings
    ADD CONSTRAINT affiliate_earnings_click_id_affiliate_clicks_id_fk FOREIGN KEY (click_id) REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_earnings
    ADD CONSTRAINT affiliate_earnings_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_earnings
    ADD CONSTRAINT affiliate_earnings_partner_id_affiliate_partners_id_fk FOREIGN KEY (partner_id) REFERENCES public.affiliate_partners(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_products
    ADD CONSTRAINT affiliate_products_partner_id_affiliate_partners_id_fk FOREIGN KEY (partner_id) REFERENCES public.affiliate_partners(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_scrape_jobs
    ADD CONSTRAINT affiliate_scrape_jobs_partner_id_affiliate_partners_id_fk FOREIGN KEY (partner_id) REFERENCES public.affiliate_partners(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.affiliate_trips
    ADD CONSTRAINT affiliate_trips_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_blueprints
    ADD CONSTRAINT ai_blueprints_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_blueprints
    ADD CONSTRAINT ai_blueprints_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_generated_itineraries
    ADD CONSTRAINT ai_generated_itineraries_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_generated_itineraries
    ADD CONSTRAINT ai_generated_itineraries_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_interactions
    ADD CONSTRAINT ai_interactions_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_interactions
    ADD CONSTRAINT ai_interactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.api_usage_logs
    ADD CONSTRAINT api_usage_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.booking_funnel_analytics
    ADD CONSTRAINT booking_funnel_analytics_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_custom_venue_id_custom_venues_id_fk FOREIGN KEY (custom_venue_id) REFERENCES public.custom_venues(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_service_id_provider_services_id_fk FOREIGN KEY (service_id) REFERENCES public.provider_services(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.city_media_cache
    ADD CONSTRAINT city_media_cache_city_id_travel_pulse_cities_id_fk FOREIGN KEY (city_id) REFERENCES public.travel_pulse_cities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.concierge_requests
    ADD CONSTRAINT concierge_requests_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.contact_submissions
    ADD CONSTRAINT contact_submissions_assigned_admin_id_users_id_fk FOREIGN KEY (assigned_admin_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_analytics
    ADD CONSTRAINT content_analytics_tracking_number_content_registry_tracking_num FOREIGN KEY (tracking_number) REFERENCES public.content_registry(tracking_number) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_reporter_id_users_id_fk FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_tracking_number_content_registry_tracking_number_ FOREIGN KEY (tracking_number) REFERENCES public.content_registry(tracking_number) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_invoices
    ADD CONSTRAINT content_invoices_customer_id_users_id_fk FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_invoices
    ADD CONSTRAINT content_invoices_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_invoices
    ADD CONSTRAINT content_invoices_tracking_number_content_registry_tracking_numb FOREIGN KEY (tracking_number) REFERENCES public.content_registry(tracking_number) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_registry
    ADD CONSTRAINT content_registry_flagged_by_users_id_fk FOREIGN KEY (flagged_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_registry
    ADD CONSTRAINT content_registry_moderator_id_users_id_fk FOREIGN KEY (moderator_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_registry
    ADD CONSTRAINT content_registry_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_versions
    ADD CONSTRAINT content_versions_changed_by_users_id_fk FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.content_versions
    ADD CONSTRAINT content_versions_tracking_number_content_registry_tracking_numb FOREIGN KEY (tracking_number) REFERENCES public.content_registry(tracking_number) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_bookings
    ADD CONSTRAINT coordination_bookings_availability_slot_id_vendor_availability_ FOREIGN KEY (availability_slot_id) REFERENCES public.vendor_availability_slots(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_bookings
    ADD CONSTRAINT coordination_bookings_coordination_id_coordination_states_id_fk FOREIGN KEY (coordination_id) REFERENCES public.coordination_states(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_bookings
    ADD CONSTRAINT coordination_bookings_service_id_provider_services_id_fk FOREIGN KEY (service_id) REFERENCES public.provider_services(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_bookings
    ADD CONSTRAINT coordination_bookings_vendor_id_users_id_fk FOREIGN KEY (vendor_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_states
    ADD CONSTRAINT coordination_states_assigned_expert_id_users_id_fk FOREIGN KEY (assigned_expert_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_states
    ADD CONSTRAINT coordination_states_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.coordination_states
    ADD CONSTRAINT coordination_states_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_wallet_id_wallets_id_fk FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.custom_venues
    ADD CONSTRAINT custom_venues_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.custom_venues
    ADD CONSTRAINT custom_venues_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.day_boundaries
    ADD CONSTRAINT day_boundaries_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_events
    ADD CONSTRAINT destination_events_contributor_id_users_id_fk FOREIGN KEY (contributor_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_events
    ADD CONSTRAINT destination_events_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.destination_search_patterns
    ADD CONSTRAINT destination_search_patterns_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_ai_tasks
    ADD CONSTRAINT ea_ai_tasks_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_client_relationships
    ADD CONSTRAINT ea_client_relationships_client_user_id_users_id_fk FOREIGN KEY (client_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_client_relationships
    ADD CONSTRAINT ea_client_relationships_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_communications
    ADD CONSTRAINT ea_communications_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_communications
    ADD CONSTRAINT ea_communications_executive_id_ea_executives_id_fk FOREIGN KEY (executive_id) REFERENCES public.ea_executives(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_events
    ADD CONSTRAINT ea_events_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_events
    ADD CONSTRAINT ea_events_executive_id_ea_executives_id_fk FOREIGN KEY (executive_id) REFERENCES public.ea_executives(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_executives
    ADD CONSTRAINT ea_executives_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_gifts
    ADD CONSTRAINT ea_gifts_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_gifts
    ADD CONSTRAINT ea_gifts_executive_id_ea_executives_id_fk FOREIGN KEY (executive_id) REFERENCES public.ea_executives(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_saved_venues
    ADD CONSTRAINT ea_saved_venues_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_travel_arrangements
    ADD CONSTRAINT ea_travel_arrangements_ea_user_id_users_id_fk FOREIGN KEY (ea_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.ea_travel_arrangements
    ADD CONSTRAINT ea_travel_arrangements_executive_id_ea_executives_id_fk FOREIGN KEY (executive_id) REFERENCES public.ea_executives(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.energy_tracking
    ADD CONSTRAINT energy_tracking_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES public.user_experiences(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_filter_options
    ADD CONSTRAINT experience_template_filter_options_filter_id_experience_templat FOREIGN KEY (filter_id) REFERENCES public.experience_template_filters(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_filters
    ADD CONSTRAINT experience_template_filters_tab_id_experience_template_tabs_id_ FOREIGN KEY (tab_id) REFERENCES public.experience_template_tabs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_steps
    ADD CONSTRAINT experience_template_steps_experience_type_id_experience_types_i FOREIGN KEY (experience_type_id) REFERENCES public.experience_types(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_template_tabs
    ADD CONSTRAINT experience_template_tabs_experience_type_id_experience_types_id FOREIGN KEY (experience_type_id) REFERENCES public.experience_types(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_universal_filter_options
    ADD CONSTRAINT experience_universal_filter_options_filter_id_experience_univer FOREIGN KEY (filter_id) REFERENCES public.experience_universal_filters(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.experience_universal_filters
    ADD CONSTRAINT experience_universal_filters_experience_type_id_experience_type FOREIGN KEY (experience_type_id) REFERENCES public.experience_types(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_ai_tasks
    ADD CONSTRAINT expert_ai_tasks_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_earnings
    ADD CONSTRAINT expert_earnings_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_experience_types
    ADD CONSTRAINT expert_experience_types_experience_type_id_experience_types_id_ FOREIGN KEY (experience_type_id) REFERENCES public.experience_types(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_experience_types
    ADD CONSTRAINT expert_experience_types_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_match_analytics
    ADD CONSTRAINT expert_match_analytics_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_match_analytics
    ADD CONSTRAINT expert_match_analytics_traveler_id_users_id_fk FOREIGN KEY (traveler_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_match_scores
    ADD CONSTRAINT expert_match_scores_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_match_scores
    ADD CONSTRAINT expert_match_scores_traveler_id_users_id_fk FOREIGN KEY (traveler_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_match_scores
    ADD CONSTRAINT expert_match_scores_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_neighborhoods
    ADD CONSTRAINT expert_neighborhoods_expert_id_fkey FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_neighborhoods
    ADD CONSTRAINT expert_neighborhoods_neighborhood_id_fkey FOREIGN KEY (neighborhood_id) REFERENCES public.city_neighborhoods(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_payouts
    ADD CONSTRAINT expert_payouts_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_referrals
    ADD CONSTRAINT expert_referrals_referred_id_users_id_fk FOREIGN KEY (referred_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_referrals
    ADD CONSTRAINT expert_referrals_referrer_id_users_id_fk FOREIGN KEY (referrer_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_requests
    ADD CONSTRAINT expert_requests_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_service_offerings
    ADD CONSTRAINT expert_service_offerings_category_id_expert_service_categories_ FOREIGN KEY (category_id) REFERENCES public.expert_service_categories(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_specializations
    ADD CONSTRAINT expert_specializations_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_templates
    ADD CONSTRAINT expert_templates_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_tips
    ADD CONSTRAINT expert_tips_booking_id_service_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.service_bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_tips
    ADD CONSTRAINT expert_tips_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_tips
    ADD CONSTRAINT expert_tips_traveler_id_users_id_fk FOREIGN KEY (traveler_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_updated_itineraries
    ADD CONSTRAINT expert_updated_itineraries_created_by_id_users_id_fk FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_updated_itineraries
    ADD CONSTRAINT expert_updated_itineraries_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_vendor_coordination
    ADD CONSTRAINT expert_vendor_coordination_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_vendor_coordination
    ADD CONSTRAINT expert_vendor_coordination_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.expert_vendor_coordination
    ADD CONSTRAINT expert_vendor_coordination_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.generated_itineraries
    ADD CONSTRAINT generated_itineraries_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.guest_travel_plans
    ADD CONSTRAINT guest_travel_plans_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.event_invites(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.help_guide_trips
    ADD CONSTRAINT help_guide_trips_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.hotel_offer_cache
    ADD CONSTRAINT hotel_offer_cache_hotel_cache_id_hotel_cache_id_fk FOREIGN KEY (hotel_cache_id) REFERENCES public.hotel_cache(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.influencer_curated_content
    ADD CONSTRAINT influencer_curated_content_influencer_id_users_id_fk FOREIGN KEY (influencer_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.influencer_referrals
    ADD CONSTRAINT influencer_referrals_influencer_id_users_id_fk FOREIGN KEY (influencer_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.influencer_referrals
    ADD CONSTRAINT influencer_referrals_referred_user_id_users_id_fk FOREIGN KEY (referred_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.invite_send_log
    ADD CONSTRAINT invite_send_log_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.event_invites(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.invite_templates
    ADD CONSTRAINT invite_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_changes
    ADD CONSTRAINT itinerary_changes_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_comparisons
    ADD CONSTRAINT itinerary_comparisons_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_comparisons
    ADD CONSTRAINT itinerary_comparisons_user_experience_id_user_experiences_id_fk FOREIGN KEY (user_experience_id) REFERENCES public.user_experiences(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_comparisons
    ADD CONSTRAINT itinerary_comparisons_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_items
    ADD CONSTRAINT itinerary_items_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_items
    ADD CONSTRAINT itinerary_items_vendor_contract_id_vendor_contracts_id_fk FOREIGN KEY (vendor_contract_id) REFERENCES public.vendor_contracts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_variant_items
    ADD CONSTRAINT itinerary_variant_items_provider_service_id_provider_services_i FOREIGN KEY (provider_service_id) REFERENCES public.provider_services(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_variant_items
    ADD CONSTRAINT itinerary_variant_items_variant_id_itinerary_variants_id_fk FOREIGN KEY (variant_id) REFERENCES public.itinerary_variants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_variant_metrics
    ADD CONSTRAINT itinerary_variant_metrics_variant_id_itinerary_variants_id_fk FOREIGN KEY (variant_id) REFERENCES public.itinerary_variants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.itinerary_variants
    ADD CONSTRAINT itinerary_variants_comparison_id_itinerary_comparisons_id_fk FOREIGN KEY (comparison_id) REFERENCES public.itinerary_comparisons(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.live_events
    ADD CONSTRAINT live_events_search_id_tourist_places_searches_id_fk FOREIGN KEY (search_id) REFERENCES public.tourist_places_searches(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.local_expert_forms
    ADD CONSTRAINT local_expert_forms_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.local_knowledge_nuggets
    ADD CONSTRAINT local_knowledge_nuggets_expert_user_id_users_id_fk FOREIGN KEY (expert_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.maps_export_cache
    ADD CONSTRAINT maps_export_cache_variant_id_itinerary_variants_id_fk FOREIGN KEY (variant_id) REFERENCES public.itinerary_variants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.neighborhood_coverage_target
    ADD CONSTRAINT neighborhood_coverage_target_neighborhood_id_fkey FOREIGN KEY (neighborhood_id) REFERENCES public.city_neighborhoods(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.page_view_analytics
    ADD CONSTRAINT page_view_analytics_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.platform_revenue
    ADD CONSTRAINT platform_revenue_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.platform_revenue
    ADD CONSTRAINT platform_revenue_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_availability_schedule
    ADD CONSTRAINT provider_availability_schedule_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_blackout_dates
    ADD CONSTRAINT provider_blackout_dates_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_booking_requests
    ADD CONSTRAINT provider_booking_requests_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_booking_requests
    ADD CONSTRAINT provider_booking_requests_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_booking_requests
    ADD CONSTRAINT provider_booking_requests_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_earnings
    ADD CONSTRAINT provider_earnings_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_neighborhood_coverage
    ADD CONSTRAINT provider_neighborhood_coverage_neighborhood_id_fkey FOREIGN KEY (neighborhood_id) REFERENCES public.city_neighborhoods(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_neighborhood_coverage
    ADD CONSTRAINT provider_neighborhood_coverage_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_payouts
    ADD CONSTRAINT provider_payouts_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_performance_metrics
    ADD CONSTRAINT provider_performance_metrics_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_services
    ADD CONSTRAINT provider_services_category_id_service_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.service_categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_services
    ADD CONSTRAINT provider_services_expert_offering_type_id_fkey FOREIGN KEY (expert_offering_type_id) REFERENCES public.expert_offering_types(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_services
    ADD CONSTRAINT provider_services_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_services
    ADD CONSTRAINT provider_services_subcategory_id_service_subcategories_id_fk FOREIGN KEY (subcategory_id) REFERENCES public.service_subcategories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_services
    ADD CONSTRAINT provider_services_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.provider_settings
    ADD CONSTRAINT provider_settings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.realtime_signals
    ADD CONSTRAINT realtime_signals_opportunity_id_spontaneous_opportunities_id_fk FOREIGN KEY (opportunity_id) REFERENCES public.spontaneous_opportunities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.recommendation_conversions
    ADD CONSTRAINT recommendation_conversions_recommendation_id_service_recommenda FOREIGN KEY (recommendation_id) REFERENCES public.service_recommendations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.recommendation_conversions
    ADD CONSTRAINT recommendation_conversions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.review_moderation_logs
    ADD CONSTRAINT review_moderation_logs_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.service_reviews(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.review_ratings
    ADD CONSTRAINT review_ratings_local_expert_id_users_id_fk FOREIGN KEY (local_expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.review_ratings
    ADD CONSTRAINT review_ratings_reviewer_id_users_id_fk FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.saved_items
    ADD CONSTRAINT saved_items_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.search_analytics
    ADD CONSTRAINT search_analytics_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_bookings
    ADD CONSTRAINT service_bookings_contract_id_user_and_expert_contracts_id_fk FOREIGN KEY (contract_id) REFERENCES public.user_and_expert_contracts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_bookings
    ADD CONSTRAINT service_bookings_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_bookings
    ADD CONSTRAINT service_bookings_service_id_provider_services_id_fk FOREIGN KEY (service_id) REFERENCES public.provider_services(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_bookings
    ADD CONSTRAINT service_bookings_traveler_id_users_id_fk FOREIGN KEY (traveler_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_bookings
    ADD CONSTRAINT service_bookings_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_provider_forms
    ADD CONSTRAINT service_provider_forms_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_recommendations
    ADD CONSTRAINT service_recommendations_demand_signal_id_service_demand_signals FOREIGN KEY (demand_signal_id) REFERENCES public.service_demand_signals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_reviews
    ADD CONSTRAINT service_reviews_booking_id_service_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.service_bookings(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_reviews
    ADD CONSTRAINT service_reviews_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_reviews
    ADD CONSTRAINT service_reviews_service_id_provider_services_id_fk FOREIGN KEY (service_id) REFERENCES public.provider_services(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_reviews
    ADD CONSTRAINT service_reviews_traveler_id_users_id_fk FOREIGN KEY (traveler_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_subcategories
    ADD CONSTRAINT service_subcategories_category_id_service_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.service_categories(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.service_templates
    ADD CONSTRAINT service_templates_category_id_service_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.service_categories(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_itineraries
    ADD CONSTRAINT shared_itineraries_shared_by_user_id_users_id_fk FOREIGN KEY (shared_by_user_id) REFERENCES public.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_itineraries
    ADD CONSTRAINT shared_itineraries_shared_with_user_id_users_id_fk FOREIGN KEY (shared_with_user_id) REFERENCES public.users(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_itineraries
    ADD CONSTRAINT shared_itineraries_variant_id_itinerary_variants_id_fk FOREIGN KEY (variant_id) REFERENCES public.itinerary_variants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_trip_views
    ADD CONSTRAINT shared_trip_views_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.shared_trips
    ADD CONSTRAINT shared_trips_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.submit_itinerary_feedbacks
    ADD CONSTRAINT submit_itinerary_feedbacks_contract_id_user_and_expert_contract FOREIGN KEY (contract_id) REFERENCES public.user_and_expert_contracts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.submit_itinerary_feedbacks
    ADD CONSTRAINT submit_itinerary_feedbacks_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_buyer_id_users_id_fk FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_template_id_expert_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.expert_templates(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_purchase_id_template_purchases_id_fk FOREIGN KEY (purchase_id) REFERENCES public.template_purchases(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_reviewer_id_users_id_fk FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_template_id_expert_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.expert_templates(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.temporal_anchors
    ADD CONSTRAINT temporal_anchors_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.temporal_anchors
    ADD CONSTRAINT temporal_anchors_user_experience_id_user_experiences_id_fk FOREIGN KEY (user_experience_id) REFERENCES public.user_experiences(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_help_me_guide_activities
    ADD CONSTRAINT tourist_help_me_guide_activities_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_help_me_guide_events
    ADD CONSTRAINT tourist_help_me_guide_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_place_results
    ADD CONSTRAINT tourist_place_results_search_id_tourist_places_searches_id_fk FOREIGN KEY (search_id) REFERENCES public.tourist_places_searches(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_preferences
    ADD CONSTRAINT tourist_preferences_preference_id_tourist_place_results_id_fk FOREIGN KEY (preference_id) REFERENCES public.tourist_place_results(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.tourist_preferences
    ADD CONSTRAINT tourist_preferences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.transport_booking_options
    ADD CONSTRAINT transport_booking_options_transport_leg_id_transport_legs_id_fk FOREIGN KEY (transport_leg_id) REFERENCES public.transport_legs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.transport_booking_options
    ADD CONSTRAINT transport_booking_options_variant_id_itinerary_variants_id_fk FOREIGN KEY (variant_id) REFERENCES public.itinerary_variants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.transport_legs
    ADD CONSTRAINT transport_legs_variant_id_itinerary_variants_id_fk FOREIGN KEY (variant_id) REFERENCES public.itinerary_variants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_alerts
    ADD CONSTRAINT trip_alerts_acknowledged_by_user_id_users_id_fk FOREIGN KEY (acknowledged_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_alerts
    ADD CONSTRAINT trip_alerts_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_analytics_enhanced
    ADD CONSTRAINT trip_analytics_enhanced_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_analytics_enhanced
    ADD CONSTRAINT trip_analytics_enhanced_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_emergency_contacts
    ADD CONSTRAINT trip_emergency_contacts_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_expert_advisors
    ADD CONSTRAINT trip_expert_advisors_local_expert_id_users_id_fk FOREIGN KEY (local_expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_expert_advisors
    ADD CONSTRAINT trip_expert_advisors_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_items
    ADD CONSTRAINT trip_items_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_other_services
    ADD CONSTRAINT trip_other_services_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_participants
    ADD CONSTRAINT trip_participants_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_participants
    ADD CONSTRAINT trip_participants_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_flights
    ADD CONSTRAINT trip_selected_flights_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_hotels
    ADD CONSTRAINT trip_selected_hotels_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_places
    ADD CONSTRAINT trip_selected_places_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_selected_services
    ADD CONSTRAINT trip_selected_services_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_suggestions
    ADD CONSTRAINT trip_suggestions_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_suggestions
    ADD CONSTRAINT trip_suggestions_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_transactions
    ADD CONSTRAINT trip_transactions_assigned_to_participant_id_trip_participants_ FOREIGN KEY (assigned_to_participant_id) REFERENCES public.trip_participants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_transactions
    ADD CONSTRAINT trip_transactions_paid_by_participant_id_trip_participants_id_f FOREIGN KEY (paid_by_participant_id) REFERENCES public.trip_participants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_transactions
    ADD CONSTRAINT trip_transactions_paid_to_vendor_contract_id_vendor_contracts_i FOREIGN KEY (paid_to_vendor_contract_id) REFERENCES public.vendor_contracts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trip_transactions
    ADD CONSTRAINT trip_transactions_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_expert_id_users_id_fk FOREIGN KEY (expert_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_managed_by_ea_id_users_id_fk FOREIGN KEY (managed_by_ea_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_primary_expert_id_fkey FOREIGN KEY (primary_expert_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.upsell_expert_endorsements
    ADD CONSTRAINT upsell_expert_endorsements_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.provider_services(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_and_expert_chats
    ADD CONSTRAINT user_and_expert_chats_contract_id_user_and_expert_contracts_id_ FOREIGN KEY (contract_id) REFERENCES public.user_and_expert_contracts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_and_expert_chats
    ADD CONSTRAINT user_and_expert_chats_itinerary_submit_id_submit_itinerary_feed FOREIGN KEY (itinerary_submit_id) REFERENCES public.submit_itinerary_feedbacks(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_and_expert_chats
    ADD CONSTRAINT user_and_expert_chats_receiver_id_users_id_fk FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_and_expert_chats
    ADD CONSTRAINT user_and_expert_chats_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experience_items
    ADD CONSTRAINT user_experience_items_provider_service_id_provider_services_id_ FOREIGN KEY (provider_service_id) REFERENCES public.provider_services(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experience_items
    ADD CONSTRAINT user_experience_items_step_id_experience_template_steps_id_fk FOREIGN KEY (step_id) REFERENCES public.experience_template_steps(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experience_items
    ADD CONSTRAINT user_experience_items_user_experience_id_user_experiences_id_fk FOREIGN KEY (user_experience_id) REFERENCES public.user_experiences(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experiences
    ADD CONSTRAINT user_experiences_experience_type_id_experience_types_id_fk FOREIGN KEY (experience_type_id) REFERENCES public.experience_types(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experiences
    ADD CONSTRAINT user_experiences_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_experiences
    ADD CONSTRAINT user_experiences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_filter_preferences
    ADD CONSTRAINT user_filter_preferences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_saved_gems
    ADD CONSTRAINT user_saved_gems_gem_id_ai_discovered_gems_id_fk FOREIGN KEY (gem_id) REFERENCES public.ai_discovered_gems(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.user_spontaneity_preferences
    ADD CONSTRAINT user_spontaneity_preferences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_assignments
    ADD CONSTRAINT vendor_assignments_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_assignments
    ADD CONSTRAINT vendor_assignments_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_availability_slots
    ADD CONSTRAINT vendor_availability_slots_provider_id_users_id_fk FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_availability_slots
    ADD CONSTRAINT vendor_availability_slots_service_id_provider_services_id_fk FOREIGN KEY (service_id) REFERENCES public.provider_services(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_contracts
    ADD CONSTRAINT vendor_contracts_assigned_to_participant_id_trip_participants_i FOREIGN KEY (assigned_to_participant_id) REFERENCES public.trip_participants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_contracts
    ADD CONSTRAINT vendor_contracts_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.vendor_contracts
    ADD CONSTRAINT vendor_contracts_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

--
--
