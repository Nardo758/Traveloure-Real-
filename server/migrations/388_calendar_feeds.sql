-- 388 — calendar feeds and phone-delivery choices (§8 phone delivery; ledger `2026-10-17-phone-delivery-calendar`;
-- bots' review Part C ratified by Leon Oct 16, 2026, D2: "token 32+ random bytes, one per trip and owner, stored
-- hashed"; "Every opt-in/opt-out stored with a timestamp per channel per trip"). Held for founder comment on #1500.
--
-- TWO new tables, born empty. Additive only: nothing existing is altered. No DEFAULT, no CHECK, no FK (app-enforced:
-- the ONE writer is server/services/phone-delivery.service.ts). Both are declared in shared/schema.ts with their
-- indexes (deploy-push durability rule). IF NOT EXISTS throughout, so a second run is a no-op.
--
-- calendar_feeds: one row per minted link. Only the SHA-256 of the token is kept (the token itself is shown once).
-- A reset revokes the live row (`revoked_at`) and inserts a new one in the same transaction. The UNIQUE index on the
-- hash is the lookup a calendar app's fetch uses, and is safe because the table is born empty.
CREATE TABLE IF NOT EXISTS calendar_feeds (
  id              varchar PRIMARY KEY,
  trip_id         varchar,
  user_id         varchar,
  token_sha256    varchar(64),
  created_at      timestamp,
  revoked_at      timestamp,
  last_fetched_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_feeds_token_sha256 ON calendar_feeds (token_sha256);
CREATE INDEX IF NOT EXISTS idx_calendar_feeds_trip_user ON calendar_feeds (trip_id, user_id);

-- phone_delivery_choices: an append-only log of what a person chose for a trip, per channel, with its time.
-- `channel` and `choice` are app-enforced value sets (shared/phone-delivery.ts).
CREATE TABLE IF NOT EXISTS phone_delivery_choices (
  id         varchar PRIMARY KEY,
  trip_id    varchar,
  user_id    varchar,
  channel    varchar(32),
  choice     varchar(16),
  created_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_phone_delivery_choices_trip ON phone_delivery_choices (trip_id, user_id, channel);
