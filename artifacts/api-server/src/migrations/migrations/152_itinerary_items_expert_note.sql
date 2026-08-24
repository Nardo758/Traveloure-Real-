-- 152: durable per-item expert notes (Workstation audit C-1, Jul 28 2026).
-- PlanCard already RENDERS an expertNote per activity (ActivitiesSection.tsx), but the
-- builder had no authoring surface and itinerary_items had no column — per-item tips only
-- existed ephemerally via the share-for-review expert_diff flow or got shoved into the
-- description. Additive nullable, no DEFAULT, no CHECK → no publish-time drizzle-push trap
-- (the migration-129 posture). NULL = no note (every existing row).
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS expert_note TEXT;
