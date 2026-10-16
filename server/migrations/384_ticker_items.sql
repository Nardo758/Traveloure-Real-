-- 384 — ticker items (LW-1f; ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A, launch session brief rulings
-- 2 and 3). Migration 384 SQL approved by Leon — comment 18:26Z on #1481.
--
-- ONE new table, born with the four seed rows below and nothing else. Additive only: no DEFAULT, no CHECK, no FK,
-- no index, nothing altered. Every column but the primary key is nullable; the ONE writer
-- (server/services/ticker.service.ts) supplies id, market, order and timestamps itself. The rules are app-enforced
-- once in shared/ticker.ts: `text` 1..90 characters; `href` NULL (no link) or a relative internal path that is a
-- client route; a `/blog/:slug` href only while that post is published. `market_slug` is the launch market the
-- writer reads from platform_settings.launch_market_slug (no DB default). `active` NULL or false = off.
-- `starts_at` / `ends_at` NULL = no bound. `updated_by` is the admin's users.id (no FK, kept as written).
-- Declared in shared/schema.ts (deploy-push durability rule). IF NOT EXISTS / ON CONFLICT DO NOTHING throughout,
-- so a second run is a no-op.
CREATE TABLE IF NOT EXISTS ticker_items (
  id          varchar PRIMARY KEY,
  text        text,
  href        text,
  market_slug varchar(64),
  sort_order  integer,
  active      boolean,
  starts_at   timestamp,
  ends_at     timestamp,
  updated_by  varchar,
  updated_at  timestamp
);

-- Marketing Bot's four lines (hand-off Part A item 10), word for word. Stable ids, so a re-run inserts nothing and
-- an admin's later edit is never overwritten. Two are born inactive, as the brief specifies: the waitlist line (an
-- admin turns it on in /admin/ticker; brief ruling 2 dropped the "page live" check, so nothing blocks it) and the
-- foliage-post line. That post's slug is not known to this migration, so its row has NO link; an admin sets it,
-- and the save refuses to turn the row on until that post is published. `updated_by` NULL = seeded, never edited.
INSERT INTO ticker_items (id, text, href, market_slug, sort_order, active, starts_at, ends_at, updated_by, updated_at) VALUES
  ('ticker-kyoto-beta',      'Now in beta in Kyoto',                                            NULL,                    'kyoto', 1, true,  NULL, NULL, NULL, NOW()),
  ('ticker-kyoto-waitlist',  'Kyoto waitlist now open: be first to book when Kyoto opens',      '/kyoto',                'kyoto', 2, false,  NULL, NULL, NULL, NOW()),
  ('ticker-kyoto-providers', 'Know Kyoto? Guides and providers can join now',                   '/signup?intent=supply', 'kyoto', 3, true,  NULL, NULL, NULL, NOW()),
  ('ticker-kyoto-foliage',   'Kyoto in Foliage Season: Closing Time Isn''t Last Entry',          NULL,                    'kyoto', 4, false, NULL, NULL, NULL, NOW())
ON CONFLICT (id) DO NOTHING;
