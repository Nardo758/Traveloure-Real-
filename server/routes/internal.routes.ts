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
import { runStripeReconciliation } from "../jobs/stripeReconciliation";
import { sweepExpiredCheckoutClaims } from "../services/checkout-claim.service";
import { materializeAllServicesWithPatterns } from "../services/availability-materializer.service";
import { bookingExpiryScheduler } from "../services/booking-expiry-scheduler.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { itineraryGenerationSweepScheduler } from "../services/itinerary-generation-sweep-scheduler.service";
import { drainOutbox } from "../services/email-outbox.service";
import { scorePendingClaims } from "../services/evidence-scorer.service";
import { EVIDENCE_SCORER_JOB_NAME } from "../services/evidence-scorer-scheduler.service";
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
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const result = await runBackgroundJob(name, fn);
    if (isBackgroundJobSkip(result)) {
      return { status: 200, body: { ok: true, skipped: true, reason: result.reason, job: name } };
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
  // jobs-cron.yml — four-hourly, 0 */4 * * *
  { job: "booking-expiry", expectedIntervalSec: 4 * 60 * 60, bucket: "four-hourly" },
  // jobs-cron.yml — six-hourly, 0 */6 * * *
  { job: "travelpayouts-report-poll", expectedIntervalSec: 6 * 60 * 60, bucket: "six-hourly" },
  // jobs-cron.yml — daily, 0 9 * * *
  { job: "stripe-reconciliation", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
  { job: "availability-materialization", expectedIntervalSec: 24 * 60 * 60, bucket: "daily" },
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
  const { status, body } = await runJob("earnings-release", () => storage.releaseMaturedEarnings());
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
    () => runStripeReconciliation({ triggeredBy: "scheduled" }),
    (r) => r?.status === "failed",
  );
  res.status(status).json(body);
});

// checkout-sweep — voids un-authorized checkout claims after TTL and reclaims slot capacity; never
// voids a row whose PaymentIntent may exist (§15b). Idempotent. In-process timer stays 5-min PRIMARY;
// this is the 15-min cold-instance backstop.
router.post("/internal/jobs/checkout-sweep", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("checkout-sweep", () => sweepExpiredCheckoutClaims());
  res.status(status).json(body);
});

// ── INTEGRITY jobs ───────────────────────────────────────────────────────────────────────────────
// availability-materialization — extends the rolling 60-day availability horizon (ADD-ONLY,
// ON CONFLICT DO NOTHING). Calls the underlying service (which throws on failure → visible 500).
router.post("/internal/jobs/availability-materialization", requireInternalSecret, async (_req, res) => {
  const { status, body } = await runJob("availability-materialization", () => materializeAllServicesWithPatterns());
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
    () => cacheSchedulerService.runTravelpayoutsReportPoll(),
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
  const { status, body } = await runJob("email-outbox", () => drainOutbox(), (r) => !!r?.error);
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
  const { status, body } = await runJob(EVIDENCE_SCORER_JOB_NAME, () => scorePendingClaims({ limit }));
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
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: "failed to read job health" });
  }
});

export default router;
