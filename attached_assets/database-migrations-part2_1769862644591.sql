-- ================================================
-- TRAVELOURE DATABASE MIGRATIONS - PART 2
-- Updates to existing tables
-- ================================================

-- ================================================
-- 1. UPDATE EXISTING TRIPS TABLE
-- Add booking-related columns (preserves existing data)
-- ================================================
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS experience_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS travelers INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS special_requests TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS expert_id UUID,
ADD COLUMN IF NOT EXISTS expert_notes TEXT,
ADD COLUMN IF NOT EXISTS expert_modified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS booking_reference VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_expert ON trips(expert_id);
CREATE INDEX IF NOT EXISTS idx_trips_share_token ON trips(share_token);

-- ================================================
-- 2. UPDATE SERVICE_PROVIDER_FORMS TABLE
-- Add Stripe, availability, pricing, and earnings tracking
-- ================================================
ALTER TABLE service_provider_forms 
ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_account_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS can_receive_payments BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stripe_onboarding_completed_at TIMESTAMP,

-- Availability settings
ADD COLUMN IF NOT EXISTS availability_type VARCHAR(20) DEFAULT 'toggle',
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE,

-- Pricing settings
ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS base_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',

-- Booking preferences
ADD COLUMN IF NOT EXISTS instant_booking_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS request_booking_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS requires_deposit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deposit_percentage INT DEFAULT 30,

-- Earnings tracking
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_payout DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_bookings INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_bookings INT DEFAULT 0,

-- Business details
ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS business_type VARCHAR(50),

-- Metadata
ADD COLUMN IF NOT EXISTS booking_settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS payout_schedule VARCHAR(20) DEFAULT 'weekly';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_service_provider_stripe ON service_provider_forms(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_service_provider_available ON service_provider_forms(is_available);

-- ================================================
-- 3. UPDATE LOCAL_EXPERT_FORMS TABLE
-- Add booking assistance, fees, and earnings tracking
-- ================================================
ALTER TABLE local_expert_forms 
ADD COLUMN IF NOT EXISTS can_book_on_behalf BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_personal_assistant BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pa_access_granted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS pa_access_granted_by UUID,

-- Fee structure
ADD COLUMN IF NOT EXISTS booking_fee_type VARCHAR(20) DEFAULT 'percentage',
ADD COLUMN IF NOT EXISTS booking_fee_percentage DECIMAL(5,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS booking_fee_fixed DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS booking_fee_hourly DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS min_booking_fee DECIMAL(10,2),

-- Stripe for expert payouts
ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_account_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS can_receive_payments BOOLEAN DEFAULT FALSE,

-- Earnings tracking
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_payout DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_handoffs INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_handoffs INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_bookings_assisted INT DEFAULT 0,

-- Service preferences
ADD COLUMN IF NOT EXISTS handoff_response_time_hours INT DEFAULT 24,
ADD COLUMN IF NOT EXISTS max_concurrent_handoffs INT DEFAULT 5,
ADD COLUMN IF NOT EXISTS accepts_new_handoffs BOOLEAN DEFAULT TRUE,

-- Metadata
ADD COLUMN IF NOT EXISTS fee_settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS payout_schedule VARCHAR(20) DEFAULT 'weekly';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_local_expert_stripe ON local_expert_forms(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_local_expert_pa ON local_expert_forms(is_personal_assistant);
CREATE INDEX IF NOT EXISTS idx_local_expert_accepts ON local_expert_forms(accepts_new_handoffs);

-- ================================================
-- 4. ADD FOREIGN KEY CONSTRAINTS
-- Link tables properly
-- ================================================

-- Link trip_items to trips
ALTER TABLE trip_items 
DROP CONSTRAINT IF EXISTS fk_trip_items_trip,
ADD CONSTRAINT fk_trip_items_trip 
    FOREIGN KEY (trip_id) 
    REFERENCES trips(id) 
    ON DELETE CASCADE;

-- Link trip_items to service_provider_forms (via user_id)
ALTER TABLE trip_items
DROP CONSTRAINT IF EXISTS fk_trip_items_provider,
ADD CONSTRAINT fk_trip_items_provider 
    FOREIGN KEY (provider_id) 
    REFERENCES service_provider_forms(user_id) 
    ON DELETE SET NULL;

-- Link bookings to trips
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS fk_bookings_trip,
ADD CONSTRAINT fk_bookings_trip 
    FOREIGN KEY (trip_id) 
    REFERENCES trips(id) 
    ON DELETE SET NULL;

-- Link bookings to trip_items
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS fk_bookings_trip_item,
ADD CONSTRAINT fk_bookings_trip_item 
    FOREIGN KEY (trip_item_id) 
    REFERENCES trip_items(id) 
    ON DELETE SET NULL;

-- Link bookings to users
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS fk_bookings_user,
ADD CONSTRAINT fk_bookings_user 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

-- Link bookings to service_provider_forms (via user_id)
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS fk_bookings_provider,
ADD CONSTRAINT fk_bookings_provider 
    FOREIGN KEY (provider_id) 
    REFERENCES service_provider_forms(user_id) 
    ON DELETE SET NULL;

-- Link bookings to local_expert_forms (via user_id)
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS fk_bookings_expert,
ADD CONSTRAINT fk_bookings_expert 
    FOREIGN KEY (expert_id) 
    REFERENCES local_expert_forms(user_id) 
    ON DELETE SET NULL;

-- Link booking_requests to users
ALTER TABLE booking_requests
DROP CONSTRAINT IF EXISTS fk_booking_requests_user,
ADD CONSTRAINT fk_booking_requests_user 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

-- Link booking_requests to trip_items
ALTER TABLE booking_requests
DROP CONSTRAINT IF EXISTS fk_booking_requests_trip_item,
ADD CONSTRAINT fk_booking_requests_trip_item 
    FOREIGN KEY (trip_item_id) 
    REFERENCES trip_items(id) 
    ON DELETE CASCADE;

-- Link booking_requests to service_provider_forms (via user_id)
ALTER TABLE booking_requests
DROP CONSTRAINT IF EXISTS fk_booking_requests_provider,
ADD CONSTRAINT fk_booking_requests_provider 
    FOREIGN KEY (provider_id) 
    REFERENCES service_provider_forms(user_id) 
    ON DELETE CASCADE;

-- Link booking_requests to bookings
ALTER TABLE booking_requests
DROP CONSTRAINT IF EXISTS fk_booking_requests_booking,
ADD CONSTRAINT fk_booking_requests_booking 
    FOREIGN KEY (booking_id) 
    REFERENCES bookings(id) 
    ON DELETE SET NULL;

-- Link expert_handoffs to trips
ALTER TABLE expert_handoffs
DROP CONSTRAINT IF EXISTS fk_expert_handoffs_trip,
ADD CONSTRAINT fk_expert_handoffs_trip 
    FOREIGN KEY (trip_id) 
    REFERENCES trips(id) 
    ON DELETE CASCADE;

-- Link expert_handoffs to users
ALTER TABLE expert_handoffs
DROP CONSTRAINT IF EXISTS fk_expert_handoffs_user,
ADD CONSTRAINT fk_expert_handoffs_user 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

-- Link expert_handoffs to local_expert_forms (via user_id)
ALTER TABLE expert_handoffs
DROP CONSTRAINT IF EXISTS fk_expert_handoffs_expert,
ADD CONSTRAINT fk_expert_handoffs_expert 
    FOREIGN KEY (expert_id) 
    REFERENCES local_expert_forms(user_id) 
    ON DELETE CASCADE;

-- Link trips to local_expert_forms (via user_id)
ALTER TABLE trips
DROP CONSTRAINT IF EXISTS fk_trips_expert,
ADD CONSTRAINT fk_trips_expert 
    FOREIGN KEY (expert_id) 
    REFERENCES local_expert_forms(user_id) 
    ON DELETE SET NULL;

-- Link provider_availability to service_provider_forms (via user_id)
ALTER TABLE provider_availability
DROP CONSTRAINT IF EXISTS fk_provider_availability_provider,
ADD CONSTRAINT fk_provider_availability_provider 
    FOREIGN KEY (provider_id) 
    REFERENCES service_provider_forms(user_id) 
    ON DELETE CASCADE;

-- Link provider_pricing to service_provider_forms (via user_id)
ALTER TABLE provider_pricing
DROP CONSTRAINT IF EXISTS fk_provider_pricing_provider,
ADD CONSTRAINT fk_provider_pricing_provider 
    FOREIGN KEY (provider_id) 
    REFERENCES service_provider_forms(user_id) 
    ON DELETE CASCADE;

-- Link platform_fees to service_provider_forms (via user_id) - for provider-specific overrides
ALTER TABLE platform_fees
DROP CONSTRAINT IF EXISTS fk_platform_fees_provider,
ADD CONSTRAINT fk_platform_fees_provider 
    FOREIGN KEY (provider_id) 
    REFERENCES service_provider_forms(user_id) 
    ON DELETE CASCADE;

-- ================================================
-- 5. CREATE HELPER VIEWS (OPTIONAL BUT USEFUL)
-- Makes it easier to query providers and experts
-- ================================================

-- View: Active service providers with full details
CREATE OR REPLACE VIEW active_service_providers AS
SELECT 
    u.id as user_id,
    u.email,
    u.first_name,
    u.last_name,
    sp.business_name,
    sp.website,
    sp.country,
    sp.address,
    sp.stripe_account_id,
    sp.stripe_account_status,
    sp.can_receive_payments,
    sp.availability_type,
    sp.is_available,
    sp.pricing_type,
    sp.base_price,
    sp.currency,
    sp.instant_booking_enabled,
    sp.request_booking_enabled,
    sp.total_earnings,
    sp.total_bookings,
    u.created_at
FROM users u
JOIN service_provider_forms sp ON u.id = sp.user_id
WHERE u.role = 'service_provider' 
  AND u.is_active = true;

-- View: Active local experts with full details
CREATE OR REPLACE VIEW active_local_experts AS
SELECT 
    u.id as user_id,
    u.email,
    u.first_name,
    u.last_name,
    le.languages,
    le.years_in_city,
    le.offer_service,
    le.can_book_on_behalf,
    le.is_personal_assistant,
    le.booking_fee_type,
    le.booking_fee_percentage,
    le.booking_fee_fixed,
    le.stripe_account_id,
    le.can_receive_payments,
    le.total_earnings,
    le.total_handoffs,
    le.completed_handoffs,
    le.accepts_new_handoffs,
    u.created_at
FROM users u
JOIN local_expert_forms le ON u.id = le.user_id
WHERE u.role = 'local_expert' 
  AND u.is_active = true;

-- ================================================
-- VERIFICATION QUERIES
-- Run these to verify everything is set up correctly
-- ================================================

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'trips', 'trip_items', 'bookings', 'booking_requests',
    'provider_availability', 'provider_pricing', 'platform_fees',
    'expert_handoffs', 'service_provider_forms', 'local_expert_forms'
  )
ORDER BY table_name;

-- Check platform fees are seeded
SELECT * FROM platform_fees ORDER BY priority DESC;

-- Check new columns were added to service_provider_forms
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'service_provider_forms' 
  AND column_name IN ('stripe_account_id', 'total_earnings', 'instant_booking_enabled')
ORDER BY column_name;

-- Check new columns were added to local_expert_forms
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'local_expert_forms' 
  AND column_name IN ('can_book_on_behalf', 'booking_fee_percentage', 'total_earnings')
ORDER BY column_name;

-- ================================================
-- MIGRATION COMPLETE!
-- ================================================
-- Next steps:
-- 1. Verify all queries above return expected results
-- 2. Test views: SELECT * FROM active_service_providers LIMIT 5;
-- 3. Start building the booking APIs
-- ================================================