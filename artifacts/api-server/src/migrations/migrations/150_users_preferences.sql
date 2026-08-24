-- 150: users.preferences — the settings persistence store (backoffice B6).
-- The Settings console's notifications/preferences tabs were useState theater with no
-- backend; the B6 audit confirmed users has never carried a preferences column (no
-- migration ever added one). Additive nullable-with-default jsonb, no CHECK, no
-- backfill → no publish-time drizzle-push trap (the migration-124/129 posture).
-- App-layer contract: GET/PATCH /api/me/preferences (storefront.routes.ts) reads and
-- shallow-merges the `settings` key only — the column stays open for other namespaced
-- uses without schema churn.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;
