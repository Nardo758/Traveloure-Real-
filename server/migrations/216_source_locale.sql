-- 216: listing source language (ruling 115 — providers can publish in their native language).
-- ONE additive-nullable column on provider_services: source_locale ('en' | 'ja', app-enforced —
-- NO DB CHECK per the publish-trap rule). NULL = never declared = English (every pre-216 row was
-- authored under the "source is English" assumption ruling 60 baked in, so NULL→en is a fact,
-- not a guess). Declared in shared/schema.ts the same commit (publish-trap rule).
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS source_locale varchar;
