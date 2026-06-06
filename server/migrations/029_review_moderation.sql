-- REV-MOD: Add review moderation status + log table
ALTER TABLE service_reviews
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS flag_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP;

-- Backfill: existing reviews are considered approved so they stay visible
UPDATE service_reviews SET status = 'approved' WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS review_moderation_logs (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  review_id VARCHAR(255) NOT NULL REFERENCES service_reviews(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_reviews_status ON service_reviews(status);
CREATE INDEX IF NOT EXISTS idx_review_moderation_logs_review_id ON review_moderation_logs(review_id);
