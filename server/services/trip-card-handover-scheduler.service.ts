/**
 * Trip Card T-48h auto-handover nudge — Console Realign ruling R-F (DEFAULT when Finalize was
 * never pressed). Governing doc: docs/briefs/CONSOLE_REALIGN_BRIEF.md, R-F.
 *
 * Mirrors the same primary-surface date arm the client reads (shared/trip-primary-surface.ts
 * `TRIP_CARD_HANDOVER_WINDOW_MS`, 48h): a trip whose `startDate` has entered that window while
 * `finalized_at` is still NULL gets the SAME `trip_card_ready` notification Finalize fires — the
 * "last-call, review your Trip Card" nudge. It does NOT write `finalized_at` (the rendering flip
 * stays date-derived via the helper; this is a notify-only side effect, never a state write) and
 * writes NO diary row (not a `plan_finalized`/`plan_reopened` transition — nothing on the trip's
 * own state changed).
 *
 * IDEMPOTENT ACROSS TICKS by construction, not by an extra table/column: the candidate query
 * itself excludes any trip that already has a `trip_card_ready` notification for that
 * (userId, tripId) pair (`NOT EXISTS` against `notifications.data->>'tripId'`), so a second tick
 * — or a retried failed tick — finds nothing left to do for a trip already nudged.
 *
 * §13: candidates are read straight off real `trips` rows (`start_date IS NOT NULL` — the column
 * is NOT NULL so this is always true; stated for clarity) and real `finalized_at`/`user_id`
 * values — never fabricated or inferred.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { TRIP_CARD_HANDOVER_WINDOW_MS } from "@shared/trip-primary-surface";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — matches earningsReleaseScheduler's cadence
const FIRST_RUN_DELAY_MS = 3 * 60 * 1000; // stagger slightly after the other startup schedulers
const HANDOVER_WINDOW_HOURS = TRIP_CARD_HANDOVER_WINDOW_MS / (60 * 60 * 1000); // derived, not hand-rolled

interface HandoverStats {
  nudged: number;
  ranAt: Date;
  error?: string;
}

interface HandoverCandidate {
  id: string;
  userId: string;
  destination: string | null;
}

class TripCardHandoverSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private lastStats: HandoverStats | null = null;

  start(): void {
    if (this.timer) {
      console.log("[TripCardHandover] Scheduler already running");
      return;
    }
    console.log("[TripCardHandover] Starting T-48h auto-handover scheduler");
    setTimeout(() => { void this.runPass(); }, FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => { void this.runPass(); }, CHECK_INTERVAL_MS);
    console.log(`[TripCardHandover] Scheduled to run every ${CHECK_INTERVAL_MS / (60 * 1000)} minutes`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[TripCardHandover] Scheduler stopped");
    }
  }

  /** Run one pass. Safe to call ad-hoc. */
  async runPass(): Promise<HandoverStats> {
    try {
      const candidates = await this.findUnnudgedCandidates();
      let nudged = 0;
      for (const trip of candidates) {
        // Best-effort per-trip: one failed notification must not abort the rest of the pass.
        try {
          await storage.createNotification({
            userId: trip.userId,
            type: "trip_card_ready",
            title: "Your Trip Card is ready",
            message: `Your Trip Card for ${trip.destination || "your trip"} is ready to view.`,
            relatedId: trip.id,
            relatedType: "trip",
            data: { tripId: trip.id, workspacePath: `/trip/${trip.id}?tab=itinerary` },
          } as any);
          nudged++;
        } catch (err) {
          logger.error({ err, tripId: trip.id }, "[TripCardHandover] nudge notification failed (non-fatal)");
        }
      }
      const stats: HandoverStats = { nudged, ranAt: new Date() };
      if (nudged > 0) console.log(`[TripCardHandover] Sent ${nudged} last-call nudge(s)`);
      this.lastStats = stats;
      return stats;
    } catch (err: any) {
      const stats: HandoverStats = { nudged: 0, ranAt: new Date(), error: err?.message || String(err) };
      console.error("[TripCardHandover] Pass failed:", err);
      this.lastStats = stats;
      return stats;
    }
  }

  /**
   * Trips entering the T-48h window (start_date <= now + 48h, window derived from the SAME
   * shared/trip-primary-surface.ts TRIP_CARD_HANDOVER_WINDOW_MS constant the client reads —
   * never hand-rolled here) that haven't started too long ago (start_date >= now - 7d, a bound
   * against scanning the whole historic table — not a correctness rule, just keeps the query
   * cheap), never finalized, with a real owner, and with NO existing `trip_card_ready`
   * notification for that (userId, tripId) pair yet (the dedup).
   *
   * `start_date` is pinned to UTC (`AT TIME ZONE 'UTC'`) to match the client's UTC-midnight
   * parse of the same date string in trip-primary-surface.ts — without the pin, `::timestamp`
   * is interpreted in the DB session's local zone, which can disagree with the client's UTC
   * read by up to a day and drift which trips fall inside the window.
   */
  private async findUnnudgedCandidates(): Promise<HandoverCandidate[]> {
    const result = await db.execute(sql`
      SELECT t.id, t.user_id, t.destination
      FROM trips t
      WHERE t.finalized_at IS NULL
        AND t.user_id IS NOT NULL
        AND t.start_date IS NOT NULL
        AND (t.start_date::timestamp AT TIME ZONE 'UTC') <= now() + (interval '1 hour' * ${HANDOVER_WINDOW_HOURS})
        AND (t.start_date::timestamp AT TIME ZONE 'UTC') >= now() - interval '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = t.user_id
            AND n.type = 'trip_card_ready'
            AND n.data ->> 'tripId' = t.id
        )
    `);
    const rows: any[] = (result as any).rows ?? [];
    return rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      destination: r.destination ?? null,
    }));
  }

  getLastStats(): HandoverStats | null {
    return this.lastStats;
  }
}

export const tripCardHandoverScheduler = new TripCardHandoverSchedulerService();
