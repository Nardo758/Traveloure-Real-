-- 399 — the IMAGINE NOH continuous-run row is withdrawn (SH-1 item 5; ledger `2026-10-19-sh1-show-dates`).
--
-- Why: IMAGINE NOH is four evening performances (14, 22, 28 Oct and 5 Nov 2026), not a 23-day run. The four shows are
-- seeded as one row each on the series key `kyoto-kanze-noh` (server/seeds/city-events.manual.ts). The old row, keyed
-- `manual` / `imagine-noh-2026`, carried one run from 14 Oct to 5 Nov and drew "23-day run" and "On now" on every day.
--
-- DATA ONLY: no ALTER, no CHECK, no index, no DEFAULT, nothing deleted. The row is matched by its source and source id,
-- and only while it is still live (`withdrawn_at IS NULL`), so a second run, or a database without the row (CI, dev),
-- changes nothing.
UPDATE city_events
SET withdrawn_at = now()
WHERE source = 'manual'
  AND source_id = 'imagine-noh-2026'
  AND withdrawn_at IS NULL;
