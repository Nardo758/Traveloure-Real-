-- ================================================
-- TRAVELOURE DATABASE MIGRATIONS
-- Run these in order on your PostgreSQL database
-- ================================================

-- ================================================
-- 1. TRIPS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    
    -- Trip details
    destinations JSONB NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    experience_type VARCHAR(20) NOT NULL,
    travelers INT NOT NULL DEFAULT 1,
    special_requests TEXT,
    
    -- AI-generated itinerary
    itinerary JSONB,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft',
    
    -- Expert assignment
    expert_id UUID,
    expert_notes TEXT,
    expert_modified_at TIMESTAMP,
    
    -- Booking
    booking_reference VARCHAR(50) UNIQUE,
    
    -- Sharing
    is_public BOOLEAN DEFAULT FALSE,
    share_token VARCHAR(64) UNIQUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_trips_share ON trips(share_token);

-- ================================================
-- 2. TRIP ITEMS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS trip_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    
    -- Item details
    item_type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Scheduling
    date DATE NOT NULL,
    time TIME,
    duration VARCHAR(50),
    day_number INT,
    order_in_day INT DEFAULT 0,
    
    -- Pricing
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_price_estimated BOOLEAN DEFAULT TRUE,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Location
    location_name VARCHAR(255),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    address TEXT,
    
    -- Provider linkage
    provider_id UUID,
    booking_type VARCHAR(20),
    
    -- External booking
    external_url TEXT,
    affiliate_partner VARCHAR(50),
    
    -- Booking status
    booking_status VARCHAR(20) DEFAULT 'not_booked',
    confirmation_code VARCHAR(100),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_items_trip ON trip_items(trip_id, date);
CREATE INDEX IF NOT EXISTS idx_trip_items_provider ON trip_items(provider_id, booking_status);

-- ================================================
-- 3. BOOKINGS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    trip_id UUID,
    trip_item_id UUID,
    
    -- Provider/Expert
    provider_id UUID,
    expert_id UUID,
    
    -- Booking details
    booking_type VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Service details
    title VARCHAR(255) NOT NULL,
    booking_date DATE NOT NULL,
    booking_time TIME,
    travelers INT NOT NULL,
    
    -- Pricing
    service_amount DECIMAL(10,2) NOT NULL,
    platform_fee DECIMAL(10,2) NOT NULL,
    expert_fee DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    provider_payout DECIMAL(10,2),
    
    -- Payment method
    payment_method VARCHAR(20),
    deposit_amount DECIMAL(10,2),
    deposit_paid BOOLEAN DEFAULT FALSE,
    balance_amount DECIMAL(10,2),
    balance_paid BOOLEAN DEFAULT FALSE,
    balance_due_date DATE,
    
    -- Stripe integration
    stripe_payment_intent_id VARCHAR(255),
    stripe_deposit_intent_id VARCHAR(255),
    stripe_balance_intent_id VARCHAR(255),
    payment_status VARCHAR(50),
    
    -- Confirmation
    confirmation_code VARCHAR(50) UNIQUE,
    confirmed_at TIMESTAMP,
    
    -- Cancellation
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(20),
    refund_amount DECIMAL(10,2),
    refund_status VARCHAR(50),
    refunded_at TIMESTAMP,
    
    -- Metadata
    special_requests TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_payment ON bookings(stripe_payment_intent_id);

-- ================================================
-- 4. BOOKING REQUESTS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS booking_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    trip_item_id UUID,
    provider_id UUID NOT NULL,
    
    -- Request details
    status VARCHAR(50) DEFAULT 'pending_provider',
    requested_date DATE NOT NULL,
    requested_time TIME,
    travelers INT NOT NULL,
    special_requests TEXT,
    
    -- Provider response
    provider_response TEXT,
    responded_at TIMESTAMP,
    response_expires_at TIMESTAMP,
    
    -- Counter offer
    counter_date DATE,
    counter_time TIME,
    counter_price DECIMAL(10,2),
    counter_message TEXT,
    
    -- Conversion
    booking_id UUID,
    
    -- Expiration
    expires_at TIMESTAMP NOT NULL,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_provider ON booking_requests(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_user ON booking_requests(user_id, status);

-- ================================================
-- 5. PROVIDER AVAILABILITY TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS provider_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    service_id UUID,
    
    -- Availability type
    availability_type VARCHAR(20) NOT NULL,
    
    -- Calendar-based
    blocked_dates JSONB DEFAULT '[]',
    available_dates JSONB DEFAULT '[]',
    
    -- Toggle-based
    is_available BOOLEAN DEFAULT TRUE,
    
    -- Inventory-based
    daily_capacity INT,
    current_bookings INT DEFAULT 0,
    
    -- Time slots
    time_slots JSONB,
    
    -- Recurring rules
    recurring_unavailable JSONB,
    
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_availability ON provider_availability(provider_id);

-- ================================================
-- 6. PROVIDER PRICING TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS provider_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    service_id UUID,
    
    -- Pricing type
    pricing_type VARCHAR(20) NOT NULL,
    
    -- Fixed pricing
    base_price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Dynamic pricing
    seasonal_pricing JSONB,
    date_overrides JSONB,
    
    -- Quote-based
    requires_quote BOOLEAN DEFAULT FALSE,
    estimated_range_min DECIMAL(10,2),
    estimated_range_max DECIMAL(10,2),
    
    -- Per-person pricing
    per_person BOOLEAN DEFAULT FALSE,
    group_discounts JSONB,
    
    -- Deposit requirements
    requires_deposit BOOLEAN DEFAULT FALSE,
    deposit_type VARCHAR(20),
    deposit_amount DECIMAL(10,2),
    deposit_percentage INT,
    
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_pricing ON provider_pricing(provider_id);

-- ================================================
-- 7. PLATFORM FEES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS platform_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Fee configuration
    fee_type VARCHAR(20) NOT NULL,
    
    -- Category-specific
    category VARCHAR(50),
    
    -- Provider-specific
    provider_id UUID,
    
    -- Fee structure
    fee_type_method VARCHAR(20) DEFAULT 'percentage',
    fee_percentage DECIMAL(5,2),
    fee_fixed_amount DECIMAL(10,2),
    
    -- Minimum/maximum
    min_fee DECIMAL(10,2),
    max_fee DECIMAL(10,2),
    
    -- Active status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Priority
    priority INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_fees ON platform_fees(fee_type, category, provider_id);

-- ================================================
-- 8. EXPERT HANDOFFS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS expert_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    expert_id UUID NOT NULL,
    user_id UUID NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Itinerary versions
    original_itinerary JSONB NOT NULL,
    modified_itinerary JSONB,
    
    -- Communication
    expert_notes TEXT,
    user_feedback TEXT,
    
    -- Booking assistance
    can_book_on_behalf BOOLEAN DEFAULT FALSE,
    bookings_made JSONB DEFAULT '[]',
    
    -- Fees
    expert_fee DECIMAL(10,2),
    fee_paid BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    accepted_at TIMESTAMP,
    completed_at TIMESTAMP,
    user_approved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expert_handoffs ON expert_handoffs(expert_id, status);
CREATE INDEX IF NOT EXISTS idx_expert_handoffs_trip ON expert_handoffs(trip_id);

-- ================================================
-- 9. UPDATE SERVICE PROVIDERS TABLE
-- ================================================
-- Note: Adjust table name if yours is different
ALTER TABLE service_providers 
ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_account_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS can_receive_payments BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS availability_type VARCHAR(20) DEFAULT 'toggle',
ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS instant_booking_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS request_booking_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS requires_deposit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deposit_percentage INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_payout DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_bookings INT DEFAULT 0;

-- ================================================
-- 10. UPDATE LOCAL EXPERTS TABLE
-- ================================================
-- Note: Adjust table name if yours is different
ALTER TABLE local_experts 
ADD COLUMN IF NOT EXISTS can_book_on_behalf BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_personal_assistant BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS booking_fee_type VARCHAR(20) DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS booking_fee_percentage DECIMAL(5,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS booking_fee_fixed DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS booking_fee_hourly DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_handoffs INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_bookings_assisted INT DEFAULT 0;

-- ================================================
-- 11. SEED DEFAULT PLATFORM FEES
-- ================================================
INSERT INTO platform_fees (fee_type, category, fee_percentage, is_active, priority)
VALUES
    ('global', NULL, 15.00, true, 0),
    ('category', 'accommodation', 7.50, true, 10),
    ('category', 'activity', 15.00, true, 10),
    ('category', 'meal', 5.00, true, 10),
    ('category', 'transport', 10.00, true, 10)
ON CONFLICT DO NOTHING;

-- ================================================
-- MIGRATION COMPLETE
-- ================================================
-- Run these commands to verify:
-- SELECT COUNT(*) FROM trips;
-- SELECT COUNT(*) FROM bookings;
-- SELECT * FROM platform_fees;