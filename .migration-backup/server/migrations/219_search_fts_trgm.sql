-- 219: search quality (task: fuzzy matching + relevance ranking).
-- Enables pg_trgm for trigram similarity fallback + "did you mean" suggestions,
-- and adds GIN indexes backing the new tsvector full-text search in unifiedSearch.
-- Name is weighted 'A', description 'B' — name matches rank above description matches.
-- All statements idempotent (IF NOT EXISTS) per AUTHORING.md.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_provider_services_fts
  ON provider_services USING GIN (
    (setweight(to_tsvector('english', coalesce(service_name, '')), 'A') ||
     setweight(to_tsvector('english', coalesce(description, '')), 'B'))
  );

CREATE INDEX IF NOT EXISTS idx_provider_services_name_trgm
  ON provider_services USING GIN (service_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_expert_templates_fts
  ON expert_templates USING GIN (
    (setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
     setweight(to_tsvector('english', coalesce(destination, '')), 'A') ||
     setweight(to_tsvector('english', coalesce(description, '')), 'B'))
  );
