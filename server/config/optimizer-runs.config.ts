/**
 * TRACK A STEP A9 — optimizer run records — its switch (ledger `2026-09-30-a9-run-records`; product
 * map §N). OFF unless `OPTIMIZER_RUN_RECORDS_ENABLED=1` (R211). With it off no run row, no outcome
 * row and no `itinerary_variants.run_id` is written, and `GET /api/trips/:tripId/optimizer-runs`
 * answers 404 — today, unchanged. Requires migration 336.
 */
export function optimizerRunRecordsEnabled(): boolean {
  return process.env.OPTIMIZER_RUN_RECORDS_ENABLED === "1";
}
