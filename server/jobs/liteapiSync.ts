/**
 * `liteapi-sync` — the nightly LiteAPI static-content sync (S1-d-1; ledger `2026-10-10-s1-d1-liteapi`).
 * Registered in three places, like `facts-recheck`: `runJob` on the authenticated internal route, the
 * daily `JOB_CADENCE` roster (server/routes/internal.routes.ts), and the cron script's daily
 * `BUCKET_ROUTES` (scripts/ci/post-internal-jobs.sh). Kyoto only. With no key or no `LITEAPI_ENV` the
 * pass answers `skipped: not_configured` — a real pass that calls nothing, so the heartbeat still stamps.
 */
export { runLiteapiSync } from "../services/liteapi-sync.service";
