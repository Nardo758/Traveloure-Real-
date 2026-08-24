-- 190: Reviews — provider public replies (CLAUDE.md §06d, decision-maker ratified Aug 9 2026).
-- Adds service_reviews.provider_reply / provider_replied_at. Additive nullable, idempotent, no
-- CHECK (house posture). Declared in shared/schema.ts in the same commit (publish-trap rule).
--
-- NOTE: service_reviews already carries a legacy responseText/responseAt pair ("Provider
-- response"). This migration deliberately does not repurpose it — §06d names provider_reply /
-- provider_replied_at explicitly as the ratified public-reply feature; the legacy pair is
-- untouched and out of scope here.

ALTER TABLE service_reviews ADD COLUMN IF NOT EXISTS provider_reply text;
ALTER TABLE service_reviews ADD COLUMN IF NOT EXISTS provider_replied_at timestamp;

COMMENT ON COLUMN service_reviews.provider_reply IS
  '§06d (ratified Aug 9 2026): ONE public reply by the service owner; write-gated to the '
  'listing''s owner; rendered traveler-side beside the review; visible to admin '
  'review-moderation.';
COMMENT ON COLUMN service_reviews.provider_replied_at IS
  '§06d (ratified Aug 9 2026): ONE public reply by the service owner; write-gated to the '
  'listing''s owner; rendered traveler-side beside the review; visible to admin '
  'review-moderation.';
