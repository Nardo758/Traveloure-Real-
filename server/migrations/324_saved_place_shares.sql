-- Migration 324: A TRAVELER MAY SHARE ONE CITY'S SAVED PLACES AS A READ-ONLY LINK.
--
-- Ledger `2026-09-24-saved-places-plan-and-share` (board #329; decision-maker, Sep 24, 2026:
-- "go with your recommendations" — a "Plan this city" button plus a read-only share link, no
-- CSV export). §13, §14, §19, §20.
--
-- ONE additive table. A row is a share of ONE city's saved places (`saved_items`, matched by the
-- same case- and whitespace-insensitive city key the Saved places shelf groups by). It stores NO
-- place: the public page reads the owner's CURRENT saved places for that city, so removing a place
-- removes it from the link, and revoking the row ends the link.
--   * `token` is 32 random bytes, hex — the whole address of the public read. UNIQUE.
--   * ONE ACTIVE SHARE per (user, city): a partial UNIQUE on revoked_at IS NULL, so "share" is
--     idempotent at the statement and a revoked row is kept as history, never reused.
--   * NO DB DEFAULT on `id` (the app supplies it, as `shared/schema.ts` declares), NO CHECK.
-- Table and both indexes are declared in shared/schema.ts in the same commit (deploy-push rule).
CREATE TABLE IF NOT EXISTS saved_place_shares (
  id          VARCHAR PRIMARY KEY,
  user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_key    VARCHAR(100) NOT NULL,
  city_label  VARCHAR(100) NOT NULL,
  token       VARCHAR(64) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS saved_place_shares_token_uniq
  ON saved_place_shares (token);

CREATE UNIQUE INDEX IF NOT EXISTS saved_place_shares_one_active_uniq
  ON saved_place_shares (user_id, city_key)
  WHERE revoked_at IS NULL;
