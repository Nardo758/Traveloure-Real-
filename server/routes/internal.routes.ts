/**
 * internal.routes.ts — mount: app.use(internalRoutes).
 *
 * Machine-to-machine job runners for the scheduler-reliability lane (#1712). On Replit Autoscale
 * the instance scales to zero between requests, so an in-process `setInterval` is NOT a reliable
 * runner. Each MONEY/INTEGRITY job therefore has an idempotent internal endpoint here, fired by a
 * daily/hourly external trigger (the repository's GitHub Actions cron, `.github/workflows/jobs-cron.yml`),
 * on the SAME proven shape as the occasion-drafts runner (ledger 2026-08-27-plus-is-delivery):
 *
 *   - Authenticated by a shared secret (INTERNAL_JOB_SECRET), NOT a user session.
 *   - The endpoint is disabled (503) until the secret is configured.
 *   - Each handler is idempotent — a retry / double-fire / a pass racing the in-process
 *     defense-in-depth timer produces exactly one effect (§15 atomic conditionals / dedupe keys /
 *     DB-guarded mints already in each job).
 *
 * OVERLAP DEDUP: every handler runs its job through `runBackgroundJob(<name>, …)` using the SAME
 * name the in-process timer uses, so if a timer pass is mid-flight the endpoint call no-ops
 * (overlap skip → { ok:true, skipped:true }) rather than double-running. The concurrency cap
 * (MAX_CONCURRENT_BACKGROUND_JOBS) also protects the shared DB pool from a burst of cron calls.
 *
 * The in-process timers are KEPT as best-effort defense-in-depth (the occasions precedent); this
 * endpoint is the authoritative reliable trigger.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../infrastructure/logger";
import { runOccasionDrafts } from "../services/occasion-drafts.service";
import { runBackgroundJob, isBackgroundJobSkip } from "../services/background-job-runner";
import { storage } from "../storage";
import { runBookingAutoCompletion } from "../jobs/bookingAutoCompletion";
import { runFactsRecheck } from "../jobs/factsRecheck";
import { runContentExpiryCensus } from "../jobs/contentExpiryCensus";
import { runLiteapiSync } from "../jobs/liteapiSync";
import { runLegsDayofRecheck } from "../jobs/legsDayofRecheck";
import { runLegGoogleCoordsRefresh } from "../jobs/legGoogleCoordsRefresh";
import { runStripeReconciliation } from "../jobs/stripeReconciliation";
import { runPaymentSchedule } from "../automations/payments/runtime";
import { isScheduledAutomationSkip } from "../automations/scheduler-wrapper";
import { runCheckoutClaimSweepSchedule } from "../services/checkout-claim.service";
import { materializeAllServicesWithPatterns } from "../services/availability-materializer.service";
import { runBookingSchedule } from "../automations/bookings/runtime";
import { bookingExpiryScheduler } from "../services/booking-expiry-scheduler.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { itineraryGenerationSweepScheduler } from "../services/itinerary-generation-sweep-scheduler.service";
import { drainOutboxAndSweepPush } from "../services/email-outbox.service";
import { scorePendingClaims } from "../services/evidence-scorer.service";
import { z } from "zod";
import { refreshMarketMatrix } from "../services/travel-time-matrix.service";
import { EVIDENCE_SCORER_JOB_NAME } from "../services/evidence-scorer-scheduler.service";
import { runModerationSchedule } from "../automations/moderation/runtime";
import { mapsSpendToday } from "../services/maps-billing/maps-billing.service";
import {
  recordJobSuccess,
  computeJobHealth,
  isAnyJobUnhealthy,
  type JobCadence,
} from "../services/job-heartbeats.service";

const router = Router();

/**
 * Constant-time secret comparison (lane: internal-jobs-hardening, L7).
 *
 * The previous shape returned early on a length mismatch, which leaked the secret's LENGTH before
 * timingSafeEqual ever ran — the cheapest possible reduction of a guesser's search space, on a
 * public repository whose workflow file already publishes every route name. Hashing both sides
 * first makes the compared buffers a fixed 32 bytes, so length is no longer observable and the
 * early return disappears. Behaviour is otherwise identical: equal inputs compare equal.
 */
function safeEqual(a: string, b: string): boolean {
  const ah = crypto.createHash("sha256").update(a, "utf8").digest();
  const bh = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ah, bh);
}

/**
 * Shared machine-to-machine guard. 503 until INTERNAL_JOB_SECRET is configured, 401 on mismatch.
 * The secret is accepted from `x-internal-secret` OR `Authorization: Bearer <secret>`, exactly as
 * the original occasion-drafts runner accepted it — the cron workflow sends the header form.
 */
function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return res.status(503).json({ message: "Internal job endpoint disabled (INTERNAL_JOB_SECRET unset)" });
  }
  const headerSecret = req.get("x-internal-secret");
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = headerSecret || bearer || "";
  if (!provided || !safeEqual(provided, secret)) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * Run one job pass through the shared background-job runner (overlap dedup + pool-protection cap)
 * and map the outcome to an HTTP response the cron can read:
 *   - a thrown error             → 500 { ok:false, error }
 *   - an overlap/cap SENTINEL    → 200 { ok:true, skipped:true, reason }  (a pass was mid-flight)
 *   - a bare `undefined`         → 500 { ok:false, error: contract }      (see below)
 *   - a result flagged failed    → 500 { ok:false, error, result } (isFailure predicate)
 *   - otherwise                  → 200 { ok:true, result }
 *
 * `isFailure` lets jobs that catch internally and return a status/error field (rather than throw)
 * still surface as a visible 500 to the cron.
 *
 * WHY `undefined` IS AN ERROR, NOT A SKIP (lane: internal-jobs-hardening, L4): this mapping used to
 * read `result === undefined → skipped`, but `runBackgroundJob` returned `undefined` for BOTH a
 * skip and a job body that resolved void — so the two void-returning jobs (email-outbox,
 * travelpayouts-report-poll) answered `skipped: true` on every single call. A successful drain, an
 * overlap skip, and an outbox that had silently stopped draining were indistinguishable to the
 * operator, which is exactly what §17 rule 2 forbids. A skip is now an explicit sentinel; a job
 * that resolves `undefined` is violating the contract every job here already honours (return a
 * result object) and must say so loudly rather than borrow the skip's clothes.
 *
 * Exported for tests only — the contract-error branch has no endpoint that can reach it (by
 * design), so it is proven by calling this directly.
 */
export async function runJob(
  name: string,
  fn: () => Promise<unknown>,
  isFailure?: (result: any) => boolean,
  options: {
    isSkip?: (result: any) => boolean;
    useBackgroundJobRunner?: boolean;
  } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const result = options.useBackgroundJobRunner === false ? await fn() : await runBackgroundJob(name, fn);
    if (isBackgroundJobSkip(result)) {
      return { status: 200, body: { ok: true, skipped: true, reason: result.reason, job: name } };
    }
    if (isScheduledAutomationSkip(result)) {
      return { status: 200, body: { ok: true, skipped: true, reason: result.reason, job: name } };
    }
    if (options.isSkip?.(result)) {
      const reason = (result as any)?.skipReason ?? (result as any)?.reason ?? "action_reported_skip";
      return { status: 200, body: { ok: true, skipped: true, reason, job: name } };
    }
    if (result === undefined) {
      return {
        status: 500,
        body: {
          ok: false,
          job: name,
          error: `job ${name} resolved undefined — a job must return a result object (L4 contract)`,
        },
      };
    }
    if (isFailure?.(result)) {
      const error = (result as any)?.error ?? `job ${name} reported failure`;
      // SERVER-SIDE is where a job failure is DIAGNOSED (lane: internal-jobs-hardening, L5). A job
      // that catches internally and returns an { error } field never throws, so runBackgroundJob's
      // own logger.error never fires for it — this branch was the one failure path with no server
      // log at all, which is why the CI job log was the only place the message existed. Now that
      // the cron prints an allowlist instead of the body, this log is the record.
      logger.error({ job: name, error: String(error), result }, "[internal-jobs] job reported failure");
      return { status: 500, body: { ok: false, job: name, error: String(error), result } };
    }
    const body = { ok: true, job: name, result };
    // A REAL pass — stamp the heartbeat. Never on the skip branch above (L6/H2): a job stuck in
    // permanent overlap must go stale rather than look healthy. See job-heartbeats.service.ts for
    // why only the cron-driven path stamps and why that asymmetry must not be "fixed".
    await recordJobSuccess(name, body);
    return { status: 200, body };
  } catch (err: any) {
    // runBackgroundJob already logs a thrown pass, but log here too so the endpoint's own record is
    // self-sufficient and does not depend on the runner's internals (L5).
    logger.error({ err, job: name }, "[internal-jobs] job threw");
    return { status: 500, body: { ok: false, job: name, error: err?.message || String(err) } };
  }
}

// ── Cadence roster ─────────────────────────────────────────────────────────────────────────────
//
// The expected firing interval of every job below, derived from the bucket that fires it. ONE
// source of truth for staleness, and the roster the health endpoint ITERATES — a job with no
// heartbeat row is reported `never_succeeded` rather than silently absent (L6/A).
//
// ⚠ COUPLED TO .github/workflows/jobs-cron.yml (and occasion-drafts-daily.yml). If a bucket's cron
// expression or route list changes, this map changes in the SAME commit — otherwise staleness is
// measured against a schedule that no longer exists. A `check-cron-route-drift` guard that parses
// the workflow's route strings against these entries is filed in FOLLOWUPS.md; until it lands this
// comment is the coupling.
export const JOB_CADENCE: readonly JobCadence[] = [
  // jobs-cron.yml — backstops, */15 * * * *
  { job: "checkout-sweep", expectedIntervalSec: 15 * 60, bucket: "backstops" },
  { job: "itinerary-generation-sweep", expectedIntervalSec: 15 * 60, bucket: "backstops" },
  { job: "email-outbox", expectedIntervalSec: 15 * 60, bucket: "backstops" },
  // jobs-cron.yml — hourly, 0 * * * *
  { job: "earnings-release", expectedIntervalSec: 60 * 60, bucket: "hourly" },
  { job: "booking-auto-completion", expectedIntervalSec: 60 * 60, bucket: "hourly" },
  // expert field knowledge v2 Phase 2 — the scorer's authoritative runner (idempotent, key-gated).
  { job: "score-neighborhood-claims", expectedIntervalSec: 60 * 60, bucket: "hourly" },
  // Step 7b (R323): the handoff clocks — 24 h fallback, 48 h hold release (R-q), 7 d auto-approve (R-s).
  { job: "handoff-timers", expectedIntervalSec: 60 * 60, bucket: "hourly" },
  // Step 9b D6 (ledger `2026-10-07-step9b-optimizer-and-rechecks`): the day-of leg re-check — hourly,
  // acting only on plans whose local time is 06:00 on a trip day.
  { job: "legs-dayof-recheck", expectedIntervalSec: 60 * 60, bucket: "hourly" },
  // jobs-cron.yml — four-hourly, 0 */4 * * *
  { job: "booking-expiry", expectedIntervalSec: 4 * 60 * 60, bucket: "four-hourly" },
  // jobs-cron.yml — six-hourly, 0 */6 * * *
  { job: "travelpayouts-report-poll", expectedIntervalSec: 6 * 60 * 60, bucket: "six-hourly" },
  // jobs-cron.yml — daily, 0 9 * * *
  { job: "stripe-reconciliation", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  { job: "availability-materialization", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  // Track A A2 (R216) follow-up, ledger `2026-09-29-matrix-daily`: posted daily; a no-op
  // (`skipped: not_due`) while the matrix is fresh, a real refresh when due or the centroids move.
  { job: "travel-matrix-refresh", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  // TravelPulse weekly (ledger `2026-09-30-travelpulse-weekly-schedule`): posted daily; drafts once per
  // ISO week, and every other day answers `already_drafted` without a model call. Still a real pass.
  { job: "travelpulse-weekly", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  { job: "facts-recheck", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  // R313: refresh-or-clear Google coordinates on legs — daily, so none outlives the 30-day ceiling.
  { job: "leg-google-coords", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  // FD-2 ruling 8: the nightly count of expired local content (counts only).
  { job: "content-expiry-census", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  // S1-d-1 (ledger `2026-10-10-s1-d1-liteapi`): LiteAPI static content, Kyoto only, incremental.
  { job: "liteapi-sync", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  // occasion-drafts-daily.yml — its own workflow, daily
  { job: "run-occasion-drafts", expectedIntervalSec: 24 * 60 * 60, bucket: "occasion-drafts-daily" },
];

// ── The authoritative occasion-drafts runner (ledger 2026-08-27-plus-is-delivery) ──────────────
router.post("/internal/run-occasion-drafts", requireInternalSecret, async (req, res) => {
  try {
    const limit = typeof req.body?.limit === "number" && req.body.limit > 0 ? Math.floor(req.body.limit) : undefined;
    const result = await runOccasionDrafts({ limit });
    const body = { ok: true, job: "run-occasion-drafts", result };
    // This handler predates runJob and keeps its own shape (L9: no behavioural churn beyond the
    // lane). The stamp is purely additive so the job still appears in the health roster instead of
    // reading `never_succeeded` forever.
    await recordJobSuccess("run-occasion-drafts", body);
    return res.status(200).json(body);
  } catch (err: any) {
    console.error("[internal] run-occasion-drafts failed:", err);
    return res.status(500).json({ ok: false, message: "run failed" });
  }
});

// ── MONEY jobs ─────────────────────────────────────────────────────────────────────────────────
// earnings-release — flips matured earnings held→releasable (atomic conditional; §15). Idempotent.
router.post("/internal/jobs/earnings-release", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("earnings-release", () =>
    runPaymentSchedule(
      "payments.earnings-release",
      "earnings-release",
      () => storage.releaseMaturedEarnings(),
      { useBackgroundJobRunner: false },
    ),
  );
  res.status(status).json(body);
});

// booking-auto-completion — flips paid confirmed→completed and mints held earnings; payment-gated,
// atomic-conditional flip + DB-guarded idempotent mint (migration 203). Never double-pays.
router.post("/internal/jobs/booking-auto-completion", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob(
    "booking-auto-completion",
    () => runBookingAutoCompletion(),
    (r) => !!r?.error,
  );
  res.status(status).json(body);
});

// stripe-reconciliation — daily Stripe-vs-DB drift detector; append-only exceptions (dedupe_key).
// status "skipped" (no Stripe key) is an honest 200; "failed" surfaces as 500.
router.post("/internal/jobs/stripe-reconciliation", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob(
    "stripe-reconciliation",
    () => runPaymentSchedule(
      "payments.stripe-reconciliation",
      "stripe-reconciliation",
      () => runStripeReconciliation({ triggeredBy: "scheduled" }),
      { useBackgroundJobRunner: false },
    ),
    (r) => r?.status === "failed",
    { isSkip: (r) => r?.status === "skipped" },
  );
  res.status(status).json(body);
});

// checkout-sweep — voids un-authorized checkout claims after TTL and reclaims slot capacity; never
// voids a row whose PaymentIntent may exist (§15b). Idempotent. In-process timer stays 5-min PRIMARY;
// this is the 15-min cold-instance backstop.
router.post("/internal/jobs/checkout-sweep", requireInternalSecret, async (_req, res) => {
  // R164 (G2): the same job also reclaims STAMPED claims left unpaid (sweepStaleAuthorizedClaims).
  const { status, body } = await runJob("checkout-sweep",
    () => runCheckoutClaimSweepSchedule(),
    // A failed candidate scan in either sweep is a failed run, never a success heartbeat (R261).
    (result) => !!result?.error,
    { useBackgroundJobRunner: false },
  );
  res.status(status).json(body);
});

// ── INTEGRITY jobs ───────────────────────────────────────────────────────────────────────────────
// availability-materialization — extends the rolling 60-day availability horizon (ADD-ONLY,
// ON CONFLICT DO NOTHING). Calls the underlying service (which throws on failure → visible 500).
router.post("/internal/jobs/availability-materialization", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("availability-materialization", () =>
    runBookingSchedule(
      "bookings.availability-horizon-materialization",
      "availability-materialization",
      () => materializeAllServicesWithPatterns(),
    ),
  );
  res.status(status).json(body);
});

// booking-expiry — auto-cancels stale pending_payment legacy bookings (atomic conditional). Per-item
// failures are non-fatal and returned in the stats; a top-level throw surfaces as 500.
router.post("/internal/jobs/booking-expiry", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("booking-expiry", () => bookingExpiryScheduler.triggerManualRun());
  res.status(status).json(body);
});

// travelpayouts-report-poll — pulls commission action rows and auto-matches against affiliate
// earnings (idempotent for matched rows). No-ops gracefully without TRAVELPAYOUTS_TOKEN.
// (Partnerize's equivalent is intentionally NOT exposed here — held for Lane 4's 404 triage.)
router.post("/internal/jobs/travelpayouts-report-poll", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob(
    "travelpayouts-report-poll",
    () => runPaymentSchedule(
      "payments.travelpayouts-report-poll",
      "travelpayouts-report-poll",
      () => cacheSchedulerService.runTravelpayoutsReportPoll(),
      { useBackgroundJobRunner: false },
    ),
    (r) => !!r?.error,
  );
  res.status(status).json(body);
});

// ── Cold-instance backstops for the latency-sensitive 5-min jobs ─────────────────────────────────
// These keep their in-process 5-min timer as PRIMARY (latency when warm); the cron backstop fires
// every 15 min purely to bound the worst case on a scaled-to-zero instance (idempotent, so a pass
// racing the warm timer no-ops via overlap dedup).
router.post("/internal/jobs/itinerary-generation-sweep", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob(
    "itinerary-generation-sweep",
    () => itineraryGenerationSweepScheduler.runSweep(),
    (r) => !!r?.error,
  );
  res.status(status).json(body);
});

router.post("/internal/jobs/email-outbox", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("email-outbox", () => drainOutboxAndSweepPush(), (r) => !!r?.error);
  res.status(status).json(body);
});

// ── GET /internal/jobs/health ──────────────────────────────────────────────────────────────────
// Per-job staleness for ops and for the admin tile's server-side twin. Same secret guard and the
// same /internal rate limiter as every runner above.
//
// `ok` means THIS READ succeeded; `healthy` is the verdict about the jobs. They are separate on
// purpose — a monitor that conflated them would report the detector as broken whenever it correctly
// detected something.
//
// Iterates JOB_CADENCE, not the heartbeat table: a job that has never once succeeded is reported
// `never_succeeded`, never omitted (L6/A).
// score-neighborhood-claims — expert field knowledge v2 Phase 2 (ruling 2026-09-01-scorer-model).
// Scores every submitted, unflagged claim; idempotent on (claim_id, version); never writes
// expert_neighborhoods. The authoritative runner (§26 posture) — the in-process timer is defense.
router.post("/internal/jobs/score-neighborhood-claims", requireInternalSecret, async (req, res) => {
  const limit = typeof req.body?.limit === "number" && req.body.limit > 0 ? Math.floor(req.body.limit) : undefined;
  const { status, body } = await runJob(EVIDENCE_SCORER_JOB_NAME, () =>
    runModerationSchedule(
      "moderation.claim-score-hourly",
      EVIDENCE_SCORER_JOB_NAME,
      () => scorePendingClaims({ limit }),
      { limit, payload: req.body },
    ));
  res.status(status).json(body);
});

// travel-matrix-refresh — Track A step A2 (ledger `2026-09-29-a2-travel-time-matrix`). The ONLY
// way the launch-city travel-time matrix is refreshed: the operator's signal (first run — confirmed
// Sep 29, 2026), then the DAILY bucket of the jobs cron (ledger `2026-09-29-matrix-daily`), whose
// empty body means kyoto, not forced — a no-op (`skipped: not_due`) until the matrix is due. Runs only where GOOGLE_MAPS_API_KEY is set; with none it answers a skip
// and bills nothing. `{ market, force }` in a .strict() body — `market` must be an operating market
// key (default kyoto); `force` runs even when the matrix is fresh. A run over the configured
// ceiling is refused before any Routes call.
const travelMatrixBody = z.object({ market: z.string().trim().min(1).max(40).optional(), force: z.boolean().optional() }).strict();
router.post("/internal/jobs/travel-matrix-refresh", requireInternalSecret, async (req, res) => {
  const parsed = travelMatrixBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: "body must be { market?, force? }" });
  const market = parsed.data.market ?? "kyoto";
  const { status, body } = await runJob(
    "travel-matrix-refresh",
    () => refreshMarketMatrix({ marketSlug: market, force: parsed.data.force === true }),
    (r) => r?.status === "failed" || !!r?.refused,
  );
  res.status(status).json(body);
});

// travelpulse-weekly — TravelPulse PR 3's scheduled runner (ledger
// `2026-09-30-travelpulse-weekly-schedule`). DRAFTS ONLY: the admin publish rail is still the one way
// a post goes live. No body is read.
router.post("/internal/jobs/travelpulse-weekly", requireInternalSecret, async (_req, res) => {
  const { runTravelPulseWeeklyJob } = await import("../services/travelpulse-weekly.service");
  const { status, body } = await runJob("travelpulse-weekly", () => runTravelPulseWeeklyJob(), (r) => r?.status === "failed");
  res.status(status).json(body);
});

// Step 7b (R323): the handoff clocks. Every transition is an atomic conditional, so a re-run (or a
// second runner) changes nothing twice.
router.post("/internal/jobs/handoff-timers", requireInternalSecret, async (req, res) => {
  const { runHandoffTimers } = await import("../services/handoff.service");
  const { status, body } = await runJob("handoff-timers", () => runHandoffTimers());
  // Smoke 13 #9: the result body is logged on every pass (counts only — no ids, no amounts), with
  // the trigger `post-internal-jobs.sh` names (`x-jobs-trigger`: github-actions | replit-scheduled),
  // so the two triggers that call this route can be told apart in the log.
  logger.info(
    { job: "handoff-timers", status, body, trigger: req.get("x-jobs-trigger") ?? "unnamed" },
    "[internal-jobs] handoff-timers pass",
  );
  res.status(status).json(body);
});

// T-3 plan facts re-check: idempotent notices; candidate-scan errors must never
// stamp a success heartbeat. Per-plan failures remain counts, per the job contract.
router.post("/internal/jobs/facts-recheck", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("facts-recheck", () => runFactsRecheck(), (r) => !!r?.error);
  res.status(status).json(body);
});

// FD-2 ruling 8 (ledger `2026-10-09-fd2-content-tier-tags`): count expired local content, per table. Counts
// only — nothing is deleted or rewritten. A table it cannot read is an error and never stamps a success.
router.post("/internal/jobs/content-expiry-census", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("content-expiry-census", () => runContentExpiryCensus(), (r) => Object.keys(r?.errors ?? {}).length > 0);
  res.status(status).json(body);
});

// S1-d-1: the nightly LiteAPI sync. A target that failed part-way is an error (its watermark did not move).
router.post("/internal/jobs/liteapi-sync", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("liteapi-sync", () => runLiteapiSync(), (r) => !!r?.error);
  res.status(status).json(body);
});

// Step 9b D6 (ledger `2026-10-07-step9b-optimizer-and-rechecks`; R-aw): the day-of leg re-check. Hourly;
// a plan is re-checked once, at 06:00 in its own zone on each trip day — idempotent per plan-day. It
// writes leg check statuses and deduped findings, never a leg. A failed candidate scan never stamps.
router.post("/internal/jobs/legs-dayof-recheck", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("legs-dayof-recheck", () => runLegsDayofRecheck(), (r) => !!r?.error);
  res.status(status).json(body);
});

// R313 (ledger `2026-10-04-leg-google-coords-refresh`): refresh a leg's Google coordinate from the
// stay's live point, or delete the leg past the max age. Per-plan failures are counts; only a failed
// candidate scan is an error, which never stamps a success heartbeat.
router.post("/internal/jobs/leg-google-coords", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("leg-google-coords", () => runLegGoogleCoordsRefresh(), (r) => !!r?.error);
  res.status(status).json(body);
});

router.get("/internal/jobs/health", requireInternalSecret, async (_req, res) => {
  try {
    const jobs = await computeJobHealth(JOB_CADENCE);
    return res.status(200).json({
      ok: true,
      healthy: !isAnyJobUnhealthy(jobs),
      staleCount: jobs.filter((j) => j.status !== "ok").length,
      // Every surface that renders this must say LAST CRON-DRIVEN SUCCESS, not "job health": the
      // in-process timers deliberately do not stamp (job-heartbeats.service.ts).
      measures: "last cron-driven success",
      jobs,
      // Step 9a ruling 8 (ledger `2026-10-07-step9a-routing-engine`): each Maps caller's calls, failures
      // and RECORDED spend since 00:00 UTC, beside its cap and switch. Tenths of a cent, as the gate
      // records them; null = the read failed (never a zero). Not part of `healthy`.
      maps: { since: "00:00 UTC", unit: "tenths_of_cent", callers: await mapsSpendToday() },
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: "failed to read job health" });
  }
});

export default router;
