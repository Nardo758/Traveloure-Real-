-- Migration 011: Add missing columns to provider_services
-- These columns exist in schema.ts but were never applied to the DB.

-- Core missing columns
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved';

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS lead_time VARCHAR(50);

-- Approval workflow columns
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS deliverables JSONB DEFAULT '[]';

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS experience_types JSONB DEFAULT '[]';

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]';

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Logistics columns
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS meeting_point TEXT;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS pickup_available BOOLEAN DEFAULT false;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS pickup_address TEXT;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS service_radius INTEGER;

-- Additional columns
ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS short_description VARCHAR(150);

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS what_included JSONB DEFAULT '[]';

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]';

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]';

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS content_affinity_tags TEXT[] DEFAULT '{}';
