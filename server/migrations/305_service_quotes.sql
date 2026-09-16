-- Migration 305: A CUSTOM QUOTE IS A CHILD ROW WITH AN EXPIRY.
-- Decision-maker ruling 2026-09-15 — punchlist D-28 / D-29 / D-30 / D-31, all option A; ledger
-- `2026-09-15-d28-d31-service-quotes`. Content of record: `docs/design/CUSTOM_QUOTE_BRIEF.md`
-- (the D-8 ruling `2026-09-15-d8-quotes-with-expiry`, whose columns this migration decides).
--
-- Every object below is ADDITIVE, with NO DEFAULT on any decision-bearing column and NO DB CHECK
-- (the migration-181/195/273/275/276/277/279/280/281/282/284/287/295/297/301/302/303 posture — a
-- CHECK or a DEFAULT here is exactly the publish-time drizzle-push failure CLAUDE.md's Coordination
-- Prevention rules warn about; the status vocabulary is APP-enforced in `shared/service-quotes.ts`),
-- and NO BACKFILL. Every object is ALSO declared in `shared/schema.ts` in this same commit — the
-- table, its UNIQUE and its two indexes — per the deploy-push durability rule: an object `schema.ts`
-- does not declare is dropped by Replit's publish-time push and NEVER recreated, because the
-- migration is already stamped.
--
-- No CHECK is added or changed, so `scripts/preflight-prod-constraints.cjs` needs no new
-- `CONSTRAINT_MANIFEST` entry and the publish-time push has nothing to fail on.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-28 — A CHILD TABLE, NOT COLUMNS ON A REQUEST ROW
-- ─────────────────────────────────────────────────────────────────────────────
-- `service_quotes` follows the `service_route_points` / `dmo_extracted_places` /
-- `booking_revision_requests` pattern: FK -> the LISTING quoted (`provider_services`, ON DELETE
-- CASCADE) and the requesting TRAVELER (`users`), UNIQUE (service_id, traveler_id, "position").
-- A quote is a SEQUENCE of offers between one traveler and one listing: the ruling's own required
-- behaviour is that an expired quote is RE-QUOTED — a NEW row, with `superseded_by` stamped on the
-- old — so a row edited in place would destroy the record of what expired and when. Neither legacy
-- table is extended (`booking_requests.counter_price` is dormant; `provider_booking_requests.
-- counter_offer` is the expert's vendor rail): a third meaning for "a price a provider proposed" is
-- the drift class §18 rule 1 names.
--
-- `amount_cents` is an INTEGER: every quote is minted integer-exact and only the existing checkout
-- derivations round. NULL = NOT YET QUOTED (the `requested` state) and is never rendered as $0.00
-- (§13). It is PROVIDER-ENTERED on an owner-gated rail with a `.strict()` pick body and never a fee,
-- a rate or a band (§8/§18 untouched). `currency` is carried so the column is honest; every quote is
-- USD until a currency decision exists, and a quote is never converted.
--
-- `expires_at` is the ruling's non-negotiable: a quote with no expiry is not a quote. It is derived
-- at ISSUE from `QUOTE_VALIDITY_DAYS` (config) or the provider's choice under
-- `QUOTE_VALIDITY_CEILING_DAYS` (D-29), never a literal, and it is PART OF THE ACCEPT CLAIM'S WHERE
-- CLAUSE (§15) — expiry is enforced by the transition itself, not by a prior read. "Expired" is
-- therefore DERIVED (`status = 'quoted' AND expires_at <= now()`), never stored as a status: a stored
-- `expired` would be a second authority that disagrees with the column the moment a clock differs.
--
-- `accepted_at` is written ONLY by the traveler-gated accept claim, `booking_id` is stamped by the
-- same transaction after the mint through the EXISTING birth-rail writer (D-30), and `superseded_by`
-- is a self-FK stamped ONLY by the owner's re-quote (ON DELETE SET NULL — deleting a later quote
-- never deletes the history of the earlier one).
--
-- `status` is `varchar(20)` with NO CHECK (the LD 44(e) posture): the value set
-- requested | quoted | accepted | declined | withdrawn | superseded is app-enforced, so a new state
-- is a code change and not a publish trap. A `withdrawn` (provider) and a `declined` (traveler) quote
-- are DIFFERENT FACTS and are named differently; neither is ever re-offered automatically.

CREATE TABLE IF NOT EXISTS service_quotes (
  id VARCHAR PRIMARY KEY,
  service_id VARCHAR NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  traveler_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount_cents INTEGER,
  currency VARCHAR(3),
  request_note TEXT,
  note TEXT,
  quoted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  quoted_at TIMESTAMP,
  expires_at TIMESTAMP,
  accepted_at TIMESTAMP,
  declined_at TIMESTAMP,
  withdrawn_at TIMESTAMP,
  superseded_by VARCHAR REFERENCES service_quotes(id) ON DELETE SET NULL,
  booking_id VARCHAR REFERENCES service_bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_quotes_service_traveler_position_unique
  ON service_quotes (service_id, traveler_id, "position");

CREATE INDEX IF NOT EXISTS service_quotes_service_idx
  ON service_quotes (service_id);

CREATE INDEX IF NOT EXISTS service_quotes_traveler_idx
  ON service_quotes (traveler_id);

COMMENT ON TABLE service_quotes IS
  'One row per OFFER between a traveler and a listing (punchlist D-28, ledger 2026-09-15-d28-d31-service-quotes). A re-quote is a NEW row with superseded_by stamped on the old; a row is never edited in place. amount_cents NULL = not yet quoted, never $0.00. Expired is DERIVED (status=quoted AND expires_at <= now()), never stored. Status vocabulary is app-enforced in shared/service-quotes.ts (no CHECK).';
COMMENT ON COLUMN service_quotes.amount_cents IS
  'The provider-entered quoted amount in CENTS (integer-exact). Written only by the owner-gated issue rail through a .strict() pick body (§19); the accepted amount is the SERVER-derived total of the booking acceptance mints (§14). NULL while requested.';
COMMENT ON COLUMN service_quotes.expires_at IS
  'The quote''s validity end, derived at issue from QUOTE_VALIDITY_DAYS or the provider''s choice under QUOTE_VALIDITY_CEILING_DAYS (D-29, never a literal). Part of the accept claim''s WHERE clause (§15). A quote with no expiry is not a quote.';
COMMENT ON COLUMN service_quotes.accepted_at IS
  'When the TRAVELER accepted, written only by the atomic accept claim (UPDATE … WHERE status=quoted AND accepted_at IS NULL AND superseded_by IS NULL AND expires_at > now()). The same transaction mints the booking and stamps booking_id.';
COMMENT ON COLUMN service_quotes.superseded_by IS
  'The NEWER quote that replaced this one (a re-quote). Stamped only by the owner''s issue rail on a quoted row; the old row keeps its amount and expiry as the record of what was offered and when it died.';
