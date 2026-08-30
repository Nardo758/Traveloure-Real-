-- 218_hot_query_column_indexes.sql
-- Task: add missing B-tree indexes on high-traffic FK/query columns discovered by
-- cross-referencing the baseline schema against storage.ts / route query patterns.
-- All statements are idempotent (CREATE INDEX IF NOT EXISTS). Every index here is
-- ALSO declared in shared/schema.ts (deploy-push durability rule — the publish-time
-- drizzle push drops indexes it does not find declared there).

-- service_bookings: booking lookups by service / traveler / provider / trip
CREATE INDEX IF NOT EXISTS idx_service_bookings_service_id ON public.service_bookings (service_id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_traveler_id_status ON public.service_bookings (traveler_id, status);
CREATE INDEX IF NOT EXISTS idx_service_bookings_provider_id_status ON public.service_bookings (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_service_bookings_trip_id ON public.service_bookings (trip_id);

-- itinerary_items: per-trip loads/deletes + planning/purchased routing predicates
CREATE INDEX IF NOT EXISTS idx_itinerary_items_trip_id_routing_status ON public.itinerary_items (trip_id, routing_status);

-- notifications: user-scoped unread reads ordered by recency
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read_created_at ON public.notifications (user_id, is_read, created_at);

-- provider_services: provider-owned service lookups / browse predicate
CREATE INDEX IF NOT EXISTS idx_provider_services_user_id_status ON public.provider_services (user_id, status);

-- service_reviews: service-scoped approved reads + provider-scoped reads
CREATE INDEX IF NOT EXISTS idx_service_reviews_service_id_status ON public.service_reviews (service_id, status);
CREATE INDEX IF NOT EXISTS idx_service_reviews_provider_id ON public.service_reviews (provider_id);
