-- 326 — THE ONE RECORDED EXCEPTION TO MIGRATION 089's APPEND-ONLY funnel_events (decision-maker,
-- Sep 27, 2026): (A) purge plan share tokens (and every other raw `refToken`) and (B) flag the
-- unpaid `revenue` rows void. After this file the table is append-only again; no later migration
-- may rewrite its rows. Ledgers `2026-09-27-funnel-share-token-purged` (A) and
-- `2026-09-27-funnel-revenue-on-paid` (B).
--
-- WHY THIS FILE EXISTS
-- ────────────────────
-- `POST /api/trips/:id/share` fired a T7 `viral_share` funnel event with `refToken: shareToken`, and
-- `server/utils/funnelTracker.ts` folded it into `funnel_events.properties->'refToken'`. A plan share
-- token is a LIVE 90-day read grant (`GET /api/trips/shared/:token`), so anyone able to read
-- funnel_events could open the plan. The code now records `properties->'sharedTripId'` (the
-- non-secret `shared_trips.id`) instead and never writes a raw `refToken` (signup's free-text `?ref=`
-- code is stored only as its SHA-256, `refTokenSha256`). This file converts the rows already on disk
-- to those same two forms.
--
-- WHAT IT DOES, in order (every statement guarded by `properties ? 'refToken'`):
--  1. `viral_share` rows whose token names a `shared_trips` row: the token is replaced by that row's
--     id as `sharedTripId` — the exact shape the fixed route now writes.
--  2. `viral_share` rows whose token names NO share row (the route used to log the freshly generated
--     token even when an older row already held the canonical one): the key is REMOVED. There is no
--     id to record, and no reference is invented (§13).
--  3. Every other event (signup's `account_created`) carrying a non-empty string `refToken`: replaced by
--     its SHA-256 hex as `refTokenSha256` — the tracker's own form. A non-string/empty value is removed.
--
-- WHAT THIS FILE IS NOT
-- ─────────────────────
--  • NOT DDL. No ALTER, no CHECK, no index, no DEFAULT. The deploy push has nothing to offer (§20).
--  4. (B) `revenue` rows with no `paidStatus` key are flagged `void: true, voidReason:
--     "unpaid_at_emission"`. Until ledger `2026-09-27-funnel-revenue-on-paid` the ONLY revenue emitter
--     fired when a booking REQUEST was created (status `pending`, nothing charged), so every such row
--     reports money that was never paid. The rows are KEPT (append-only; §13 — nothing is deleted),
--     only marked. A paid-transition row carries `paidStatus`, so it is never voided here whichever
--     order this file and that lane's code reach a database.
--
--  • NOT a general rewrite of funnel_events. 089 calls the table append-only; this is the one ruled
--    exception. It touches only the `refToken` key and adds the two void keys; every other column and
--    key is left as it is.
--
-- Idempotent: after one run no row carries `refToken` and every unpaid revenue row carries `void`,
-- so a second run matches nothing.

UPDATE funnel_events fe
   SET properties = (fe.properties - 'refToken') || jsonb_build_object('sharedTripId', st.id::text)
  FROM shared_trips st
 WHERE fe.event_type = 'viral_share'
   AND fe.properties ? 'refToken'
   AND jsonb_typeof(fe.properties -> 'refToken') = 'string'
   AND st.share_token = fe.properties ->> 'refToken';

UPDATE funnel_events
   SET properties = properties - 'refToken'
 WHERE event_type = 'viral_share'
   AND properties ? 'refToken';

UPDATE funnel_events
   SET properties = (properties - 'refToken')
                    || jsonb_build_object(
                         'refTokenSha256',
                         encode(sha256(convert_to(properties ->> 'refToken', 'UTF8')), 'hex'))
 WHERE properties ? 'refToken'
   AND jsonb_typeof(properties -> 'refToken') = 'string'
   AND length(properties ->> 'refToken') > 0;

UPDATE funnel_events
   SET properties = properties - 'refToken'
 WHERE properties ? 'refToken';

-- (B) unpaid revenue rows are flagged void, never deleted.
UPDATE funnel_events
   SET properties = COALESCE(properties, '{}'::jsonb)
                    || jsonb_build_object('void', true, 'voidReason', 'unpaid_at_emission')
 WHERE event_type = 'revenue'
   AND NOT (COALESCE(properties, '{}'::jsonb) ? 'paidStatus')
   AND NOT (COALESCE(properties, '{}'::jsonb) ? 'void');
