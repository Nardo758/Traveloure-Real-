/**
 * Defense-in-depth timer for the concierge accept window. The authoritative
 * runner is POST /internal/jobs/concierge-accept-timeout. Both use the same
 * background-job name, so a racing pass no-ops.
 */
import { runBackgroundJob } from "./background-job-runner";
import { jitteredStartupDelay } from "./startup-delay";
import { runConciergeAcceptTimeout } from "./concierge-accept-timeout.service";

export const CONCIERGE_ACCEPT_TIMEOUT_JOB = "concierge-accept-timeout";
const INTERVAL_MS = 60 * 60 * 1000;

class ConciergeAcceptTimeoutScheduler {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer || process.env.NODE_ENV === "test") return;
    const run = () =>
      runBackgroundJob(CONCIERGE_ACCEPT_TIMEOUT_JOB, () => runConciergeAcceptTimeout()).catch((err) =>
        console.error("[concierge-accept-timeout] scheduled pass failed:", err),
      );
    setTimeout(() => void run(), jitteredStartupDelay(5 * 60 * 1000));
    this.timer = setInterval(() => void run(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const conciergeAcceptTimeoutScheduler = new ConciergeAcceptTimeoutScheduler();
