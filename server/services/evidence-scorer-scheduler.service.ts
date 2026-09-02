/**
 * Evidence scorer scheduler — expert field knowledge v2, Phase 2.
 *
 * DEFENSE-IN-DEPTH ONLY (§26 posture, mirrors occasion-drafts-scheduler.service.ts). On Autoscale
 * the app scales to zero between requests, so the authoritative runner is the idempotent internal
 * endpoint POST /internal/score-neighborhood-claims fired by the external cron; this timer is a
 * best-effort second rail while an instance is warm. scoreClaim is idempotent on
 * (claim_id, version) and every flip is an atomic conditional, so the timer and the endpoint
 * racing produce exactly one score.
 */
import { scorePendingClaims, type ScorePendingResult } from "./evidence-scorer.service";
import { runBackgroundJob } from "./background-job-runner";
import { jitteredStartupDelay } from "./startup-delay";
import { EVIDENCE_SCORER_CHECK_INTERVAL_MS, EVIDENCE_SCORER_FIRST_RUN_DELAY_MS } from "../config/evidence-scorer.config";

export const EVIDENCE_SCORER_JOB_NAME = "score-neighborhood-claims";

class EvidenceScorerSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private lastResult: (ScorePendingResult & { ranAt: Date; error?: string }) | null = null;

  start(): void {
    if (this.timer) return;
    if (process.env.NODE_ENV === "test") return;
    setTimeout(() => {
      void runBackgroundJob(EVIDENCE_SCORER_JOB_NAME, () => this.runOnce()).catch((err) =>
        console.error("[EvidenceScorer] scheduled pass failed:", err),
      );
    }, jitteredStartupDelay(EVIDENCE_SCORER_FIRST_RUN_DELAY_MS));
    this.timer = setInterval(() => {
      void runBackgroundJob(EVIDENCE_SCORER_JOB_NAME, () => this.runOnce()).catch((err) =>
        console.error("[EvidenceScorer] scheduled pass failed:", err),
      );
    }, EVIDENCE_SCORER_CHECK_INTERVAL_MS);
    console.log("[EvidenceScorer] Scheduler started (defense-in-depth; POST /internal/score-neighborhood-claims is authoritative)");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<ScorePendingResult & { ranAt: Date; error?: string }> {
    try {
      const r = await scorePendingClaims();
      this.lastResult = { ...r, ranAt: new Date() };
    } catch (err: any) {
      this.lastResult = { scanned: 0, scored: 0, failed: 0, skipped: 0, results: [], ranAt: new Date(), error: err?.message || String(err) };
      console.error("[EvidenceScorer] pass failed:", err);
    }
    return this.lastResult;
  }

  getLastResult() {
    return this.lastResult;
  }
}

export const evidenceScorerScheduler = new EvidenceScorerSchedulerService();
