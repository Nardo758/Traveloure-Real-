-- Add transport booking options table for Transport Hub
CREATE TABLE IF NOT EXISTS transport_booking_options (
  id VARCHAR(36) PRIMARY KEY,

  -- References
  transport_leg_id VARCHAR(36) REFERENCES transport_legs(id) ON DELETE CASCADE,
  variant_id VARCHAR(36) REFERENCES itinerary_variants(id) ON DELETE CASCADE,

  -- Booking channel and source
  booking_type TEXT NOT NULL, -- "platform", "affiliate", "deep_link", "info_only"
  source TEXT NOT NULL, -- "traveloure", "12go", "viator", "uber", "walking", etc.

  -- Display information
  title TEXT NOT NULL,
  description TEXT,
  mode_type TEXT NOT NULL,
  icon_type TEXT,

  -- Pricing
  price_display TEXT,
  price_cents_low INTEGER,
  price_cents_high INTEGER,
  price_per_person BOOLEAN DEFAULT FALSE,
  currency TEXT DEFAULT 'USD',

  -- Timing
  estimated_minutes INTEGER,
  estimated_minutes_high INTEGER,

  -- Provider and external links
  provider_id INTEGER,
  external_url TEXT,
  affiliate_code TEXT,
  deep_link_scheme TEXT,

  -- Booking and pass metadata
  booking_status TEXT DEFAULT 'available', -- "available", "booked", "confirmed", "cancelled"
  booking_id INTEGER,
  is_multi_day_pass BOOLEAN DEFAULT FALSE,
  pass_valid_days INTEGER,
  savings_vs_individual_cents INTEGER,

  -- Rating and reviews
  rating DOUBLE PRECISION,
  review_count INTEGER,

  -- Sorting and recommendation
  sort_order INTEGER DEFAULT 0,
  is_recommended BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tbo_transport_leg_id ON transport_booking_options(transport_leg_id);
CREATE INDEX IF NOT EXISTS idx_tbo_variant_id ON transport_booking_options(variant_id);
CREATE INDEX IF NOT EXISTS idx_tbo_booking_type ON transport_booking_options(booking_type);
CREATE INDEX IF NOT EXISTS idx_tbo_source ON transport_booking_options(source);
CREATE INDEX IF NOT EXISTS idx_tbo_is_multi_day ON transport_booking_options(is_multi_day_pass);
