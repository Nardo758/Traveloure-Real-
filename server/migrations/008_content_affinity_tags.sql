-- Add content_affinity_tags to provider_services (task: provider content-affinity tagging).
-- text[] column stores canonical affinity slugs, e.g. '{hotel_arrival,photo_shoot}'.
-- DEFAULT '{}' means existing rows have no tags (system falls back to serviceType inference).

ALTER TABLE "provider_services"
  ADD COLUMN IF NOT EXISTS "content_affinity_tags" text[] NOT NULL DEFAULT '{}';
