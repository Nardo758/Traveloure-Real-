/**
 * DMO ingestion scheduler — D3, Kyoto-first.
 *
 * OFF BY DEFAULT. Only runs when BOTH:
 *   - DMO_INGEST_ENABLED=1  (explicit opt-in — controls automatic Tavily spend), and
 *   - TAVILY_API_KEY is set (isDmoIngestReady()).
 *
 * When enabled, it enriches the born-hidden Kyoto DMO stubs on a daily cadence (the content is
 * slow-moving, so daily is ample). The admin trigger (POST /api/admin/dmo/ingest-kyoto) runs the
 * same pass on demand regardless of this flag. All writes stay D1a-gated (born-hidden) and §13-safe
 * (no key ⇒ no writes) — see dmo-ingestion.service.ts.
 */
import { ingestKyotoHeritage, isDmoIngestReady } from "./dmo-ingestion.service";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // 5 min after startup, once seeding has settled

class DmoIngestSchedulerService {
  private timer: NodeJS.Timeout | null = null;

  /** Starts the daily pass only if opted in via env AND a Tavily key is present. No-op otherwise. */
  start(): void {
    if (this.timer) {
      console.log("[DMOIngest] Scheduler already running");
      return;
    }
    if (process.env.DMO_INGEST_ENABLED !== "1") {
      console.log("[DMOIngest] Scheduler disabled (set DMO_INGEST_ENABLED=1 to enable)");
      return;
    }
    if (!isDmoIngestReady()) {
      console.log("[DMOIngest] Scheduler enabled but TAVILY_API_KEY not set — staying idle");
      return;
    }
    console.log("[DMOIngest] Starting Kyoto DMO ingestion scheduler (daily)");
    setTimeout(() => { void this.run(); }, FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => { void this.run(); }, CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[DMOIngest] Scheduler stopped");
    }
  }

  private async run(): Promise<void> {
    try {
      const stats = await ingestKyotoHeritage();
      if (!stats.ready) {
        console.log(`[DMOIngest] Skipped: ${stats.reason}`);
      }
    } catch (err) {
      console.error("[DMOIngest] Scheduled pass failed:", err);
    }
  }
}

export const dmoIngestScheduler = new DmoIngestSchedulerService();
