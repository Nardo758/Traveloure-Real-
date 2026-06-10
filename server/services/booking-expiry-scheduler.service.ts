import { db } from "../db";
import { bookings, notifications } from "@shared/schema";
import { sql, and, eq, lt } from "drizzle-orm";

const DEFAULT_STALE_THRESHOLD_HOURS = 48;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours

interface AutoCancelConfig {
  staleThresholdHours: number;
}

interface AutoCancelStats {
  cancelledCount: number;
  bookingIds: string[];
  errors: string[];
  ranAt: Date;
}

class BookingExpirySchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastStats: AutoCancelStats | null = null;
  private config: AutoCancelConfig = {
    staleThresholdHours: DEFAULT_STALE_THRESHOLD_HOURS,
  };

  start(): void {
    if (this.timer) {
      console.log("[BookingExpiry] Scheduler already running");
      return;
    }

    console.log("[BookingExpiry] Starting booking expiry scheduler");

    // First run 2 minutes after startup so DB is settled
    setTimeout(() => this.runCancellation(), 2 * 60 * 1000);

    this.timer = setInterval(() => {
      this.runCancellation();
    }, CHECK_INTERVAL_MS);

    console.log(`[BookingExpiry] Scheduled to run every ${CHECK_INTERVAL_MS / (60 * 60 * 1000)} hours`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[BookingExpiry] Scheduler stopped");
    }
  }

  getConfig(): AutoCancelConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AutoCancelConfig>): AutoCancelConfig {
    if (updates.staleThresholdHours !== undefined) {
      const hours = Number(updates.staleThresholdHours);
      if (!isFinite(hours) || hours < 1) {
        throw new Error("staleThresholdHours must be a positive number");
      }
      this.config.staleThresholdHours = hours;
    }
    console.log("[BookingExpiry] Config updated:", this.config);
    return { ...this.config };
  }

  getLastStats(): AutoCancelStats | null {
    return this.lastStats;
  }

  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  async triggerManualRun(): Promise<AutoCancelStats> {
    return this.runCancellation();
  }

  private async runCancellation(): Promise<AutoCancelStats> {
    if (this.isRunning) {
      console.log("[BookingExpiry] Already running, skipping");
      return this.lastStats ?? { cancelledCount: 0, bookingIds: [], errors: [], ranAt: new Date() };
    }

    this.isRunning = true;
    const stats: AutoCancelStats = {
      cancelledCount: 0,
      bookingIds: [],
      errors: [],
      ranAt: new Date(),
    };

    console.log(`[BookingExpiry] Running auto-cancel sweep (threshold: ${this.config.staleThresholdHours}h)`);

    try {
      // Find stale bookings
      const staleRows = await db.execute(sql`
        SELECT b.id, b.user_id, b.title, b.total_amount, b.created_at
        FROM bookings b
        WHERE b.status = 'pending_payment'
          AND b.created_at < NOW() - (${this.config.staleThresholdHours} || ' hours')::interval
        LIMIT 500
      `);

      const staleBookings = staleRows.rows as {
        id: string;
        user_id: string | null;
        title: string | null;
        total_amount: string | null;
        created_at: Date;
      }[];

      if (staleBookings.length === 0) {
        console.log("[BookingExpiry] No stale bookings found");
        this.lastStats = stats;
        return stats;
      }

      console.log(`[BookingExpiry] Found ${staleBookings.length} stale booking(s) to cancel`);

      for (const booking of staleBookings) {
        try {
          const reason = `Auto-cancelled: payment not received within ${this.config.staleThresholdHours} hours`;

          await db.execute(sql`
            UPDATE bookings
            SET
              status = 'canceled',
              payment_status = 'expired',
              cancelled_at = NOW(),
              cancellation_reason = ${reason},
              cancelled_by = 'system'
            WHERE id = ${booking.id}
              AND status = 'pending_payment'
          `);

          stats.cancelledCount++;
          stats.bookingIds.push(booking.id);

          console.log(`[BookingExpiry] Cancelled booking ${booking.id} (user: ${booking.user_id ?? "unknown"})`);

          // Notify the user if we have a user_id
          if (booking.user_id) {
            try {
              await db.insert(notifications).values({
                userId: booking.user_id,
                type: "booking_cancelled",
                title: "Booking automatically cancelled",
                message: `Your booking "${booking.title ?? "Untitled"}" was automatically cancelled because payment was not completed within ${this.config.staleThresholdHours} hours. Please create a new booking if you still wish to proceed.`,
                relatedId: booking.id,
                relatedType: "booking",
                data: {
                  bookingId: booking.id,
                  reason: "payment_expired",
                  thresholdHours: this.config.staleThresholdHours,
                  totalAmount: booking.total_amount,
                },
              });
            } catch (notifErr) {
              console.error(`[BookingExpiry] Failed to create notification for booking ${booking.id}:`, notifErr);
              stats.errors.push(`notification:${booking.id}`);
            }
          }
        } catch (bookingErr) {
          console.error(`[BookingExpiry] Failed to cancel booking ${booking.id}:`, bookingErr);
          stats.errors.push(`cancel:${booking.id}`);
        }
      }

      console.log(
        `[BookingExpiry] Sweep complete — cancelled: ${stats.cancelledCount}, errors: ${stats.errors.length}`
      );
    } catch (err) {
      console.error("[BookingExpiry] Sweep failed:", err);
      stats.errors.push(String(err));
    } finally {
      this.isRunning = false;
      this.lastStats = stats;
    }

    return stats;
  }
}

export const bookingExpiryScheduler = new BookingExpirySchedulerService();
