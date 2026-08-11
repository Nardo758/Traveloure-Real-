/**
 * Booking auto-complete scheduler — task 1091 (earnings mint path).
 *
 * Earnings ledger rows (expert + provider, born `held`) are minted ONLY on the first transition of
 * a service_booking to `completed` (storage.updateServiceBookingStatus). The traveler can drive
 * that transition explicitly via POST /api/bookings/:id/confirm-completion, but most travelers
 * never click anything after their trip — so without this job, a normally paid booking would sit
 * in `confirmed` forever and the earner would never be credited.
 *
 * This scheduler flips PAID `confirmed` bookings to `completed` once the service is safely in the
 * past: COALESCE(slot date end-of-day, confirmed_at) + BOOKING_AUTO_COMPLETE_DAYS (default 3).
 * The minted earnings are born `held` and still mature through the normal clearance window
 * (earnings-release-scheduler + holdWindowDays), during which the traveler can dispute — so
 * auto-completion never shortcuts escrow protection, it only starts the clock.
 *
 * Payment gate: a `confirmed` request-rail booking can be unpaid (or carry a never-charged PI),
 * and earnings must never mint without money in. Each candidate's PaymentIntent is verified
 * `succeeded` against Stripe before completion.
 *
 * Concurrency: the atomic guarded UPDATE inside updateServiceBookingStatus(['confirmed']) is the
 * guard — a concurrent traveler confirm, cancel, or refund wins the race and this pass mints
 * nothing for that booking. Overlapping runs are therefore safe and idempotent.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — grace windows are day-scale
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // after startup settles (and after the release job's first pass)
const BATCH_LIMIT = 50; // per pass; hourly cadence drains any backlog

function graceDays(): number {
  const raw = Number(process.env.BOOKING_AUTO_COMPLETE_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3;
}

interface AutoCompleteStats {
  scanned: number;
  completed: number;
  skippedUnpaid: number;
  ranAt: Date;
  error?: string;
}

class BookingAutoCompleteService {
  private timer: NodeJS.Timeout | null = null;
  private lastStats: AutoCompleteStats | null = null;

  start(): void {
    if (this.timer) {
      console.log("[BookingAutoComplete] Scheduler already running");
      return;
    }
    console.log("[BookingAutoComplete] Starting booking auto-complete scheduler");
    setTimeout(() => { void this.runPass(); }, FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => { void this.runPass(); }, CHECK_INTERVAL_MS);
    console.log(`[BookingAutoComplete] Scheduled to run every ${CHECK_INTERVAL_MS / (60 * 1000)} minutes (grace ${graceDays()}d)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[BookingAutoComplete] Scheduler stopped");
    }
  }

  /** Run one auto-complete pass. Safe to call ad-hoc (e.g. an admin trigger or a test). */
  async runPass(now: Date = new Date()): Promise<AutoCompleteStats> {
    try {
      const days = graceDays();
      // Reference moment per booking: the availability-slot date (end of that day) when the
      // booking claimed one, else confirmed_at. Grace days are added on top.
      const result = await db.execute(sql`
        SELECT sb.id, sb.stripe_payment_intent_id
        FROM service_bookings sb
        LEFT JOIN vendor_availability_slots vas ON vas.id = sb.slot_id
        WHERE sb.status = 'confirmed'
          AND sb.stripe_payment_intent_id IS NOT NULL
          AND COALESCE(vas.date::timestamp + interval '1 day', sb.confirmed_at, sb.created_at)
              + (${days} || ' days')::interval < ${now.toISOString()}::timestamptz
        ORDER BY sb.confirmed_at ASC NULLS LAST
        LIMIT ${BATCH_LIMIT}
      `);
      const rows = (result.rows ?? []) as Array<{ id: string; stripe_payment_intent_id: string }>;

      let completed = 0;
      let skippedUnpaid = 0;
      if (rows.length > 0) {
        const { stripe } = await import("./stripe-payment.service");
        for (const row of rows) {
          try {
            const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
            if (pi.status !== "succeeded") {
              skippedUnpaid++;
              continue; // never mint earnings for an uncharged booking
            }
          } catch (piErr) {
            console.error(`[BookingAutoComplete] PI lookup failed for booking ${row.id}, skipping:`, piErr);
            skippedUnpaid++;
            continue;
          }
          const updated = await storage.updateServiceBookingStatus(row.id, "completed", undefined, ["confirmed"]);
          if (updated) completed++;
        }
      }

      const stats: AutoCompleteStats = { scanned: rows.length, completed, skippedUnpaid, ranAt: now };
      if (completed > 0 || skippedUnpaid > 0) {
        console.log(`[BookingAutoComplete] Completed ${completed} booking(s) (${skippedUnpaid} skipped unpaid) of ${rows.length} candidates`);
      }
      this.lastStats = stats;
      return stats;
    } catch (err: any) {
      const stats: AutoCompleteStats = { scanned: 0, completed: 0, skippedUnpaid: 0, ranAt: now, error: err?.message || String(err) };
      console.error("[BookingAutoComplete] Pass failed:", err);
      this.lastStats = stats;
      return stats;
    }
  }

  getLastStats(): AutoCompleteStats | null {
    return this.lastStats;
  }
}

export const bookingAutoCompleteScheduler = new BookingAutoCompleteService();
