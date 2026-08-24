-- Migration 115: purge fabricated Fever mock events from the public calendar.
--
-- Without IMPACT_ACCOUNT_SID/IMPACT_AUTH_TOKEN, feverService.searchEvents returned GENERATED
-- MOCK events (ids 'mock-<city>-<n>', fake dates, fake ratings) and fever-cache.service wrote
-- them into destination_events as status='approved' on the daily cache-scheduler tick — the
-- public By-Date calendar then served them as real events (fabricated-content class, same
-- family as the §13 ratings fix). The companion code change guards the refresher
-- (fever-cache.service.ts: skip entirely when feverService.isReady() is false, matching the
-- Booking.com/OpenTable "not configured — skipping live fetch" pattern); this migration removes
-- the rows already written.
--
-- Scope: ONLY rows self-identified as mock (source_type='fever' AND source_id LIKE 'mock-%').
-- Real Fever events (non-mock source ids, once credentials exist) are untouched.

DELETE FROM destination_events
WHERE source_type = 'fever'
  AND source_id LIKE 'mock-%';
