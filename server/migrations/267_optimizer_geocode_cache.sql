-- 267_optimizer_geocode_cache.sql
--
-- Persistent Google Geocoding cache for optimizer-created activities. Additive and
-- idempotent; table and unique index are also declared in shared/schema.ts per the
-- publish-trap rule. Status vocabulary is app-enforced — deliberately NO CHECK.

CREATE TABLE IF NOT EXISTS optimizer_geocode_cache (
  id varchar PRIMARY KEY,
  provider varchar(32) NOT NULL DEFAULT 'google',
  query_hash varchar(64) NOT NULL,
  normalized_query text NOT NULL,
  status varchar(20) NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  formatted_address text,
  location_type varchar(40),
  result_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS optimizer_geocode_cache_provider_query_hash_uniq
  ON optimizer_geocode_cache (provider, query_hash);