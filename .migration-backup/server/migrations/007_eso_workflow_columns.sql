-- Migration 007: Add workflow/lifecycle columns to expert_service_offerings
-- These columns mirror expert_custom_services so ESO can be the sole write target
-- for new service creation. Nullable so existing platform template rows are unaffected.
ALTER TABLE expert_service_offerings
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS duration VARCHAR(50),
  ADD COLUMN IF NOT EXISTS deliverables JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS lead_time VARCHAR(50),
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS experience_types JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS category_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Index for admin pending queue (status lookups on expert-owned rows)
CREATE INDEX IF NOT EXISTS idx_eso_expert_status ON expert_service_offerings (expert_id, status)
  WHERE expert_id IS NOT NULL;
