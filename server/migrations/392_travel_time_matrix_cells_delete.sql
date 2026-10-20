-- 392 — delete the stored Google Route Matrix cells (LG-2; ledger `2026-10-18-lg2-route-matrix-delete`).
--
-- Why: travel_time_matrix holds Google Route Matrix durations and distances (the Kyoto refresh of 2026-09-29 on).
-- Google's terms do not allow storing them, and 9b-b (ledger `2026-10-16-9b-b-legs-off-google`) already retired every
-- writer and reader: the refresh job answers 410 and the estimate reader looks up no cells. This removes the rows.
--
-- DATA ONLY: no DROP, no ALTER, no CHECK, no index — the empty table and its declaration in shared/schema.ts stay, so
-- the deploy push has nothing to add or drop. travel_time_matrix_refreshes keeps its run rows (market, modes, counts,
-- cost) — they record what was billed, not Google content. A second run deletes nothing.
DELETE FROM travel_time_matrix;
