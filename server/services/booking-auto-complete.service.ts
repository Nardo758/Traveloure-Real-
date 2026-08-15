/**
 * Booking auto-complete scheduler — task 1091 (earnings mint path).
 *
 * Earnings ledger rows (expert + provider, born `held`) are minted ONLY on a service_booking's
 * transition to `completed` (storage.updateServiceBookingStatus → mintCompletionEarningsForBooking).
 * The traveler can drive that transition explicitly via POST /api/bookings/:id/confirm-completion,
 * but most travelers never click anything after their trip — so without this job, a normally paid
 * booking would sit in `confirmed` forever and the earner would never be credited.
 *
 * PASS 1 — auto-complete: flips PAID `confirmed` bookings to `completed` once the service is
 * safely in the past: COALESCE(slot date end-of-day, confirmed_at) + BOOKING_AUTO_COMPLETE_DAYS
 * (default 3). Minted earnings are born `held` and still mature through the normal clearance
 * window (earnings-release-scheduler + holdWindowDays), during which the traveler can dispute —
 * auto-completion never shortcuts escrow protection, it only starts the clock.
 *
 * Payment gate: a `confirmed` request-rail booking can be unpaid (or carry a never-charged PI),
 * and earnings must never mint without money in. Each candidate's PaymentIntent is verified
 * `succeeded` against Stripe before completion.
 *
 * NO HEAD-OF-LINE BLOCKING (task 1091 review): the pass keyset-paginates through ALL due
 * candidates (bounded by MAX_PI_LOOKUPS_PER_PASS Stripe calls), and every candidate whose PI is
 * not verifiably succeeded is STAMPED (bookingMetadata.autoCompleteUnpaidRecheckAt, +24h) and
 * excluded from subsequent passes until the stamp expires. A backlog of stale unpaid request-rail
 * bookings therefore costs each pass at most one Stripe lookup per stale row per day and can
 * never starve paid bookings behind it.
 *
 * PASS 2 — reconciliation: the completed transition and its ledger side-effects are not one DB
 * transaction, so a crash mid-mint can leave a booking `completed` with ledger rows missing
 * (and retries of confirm-completion would release nothing). This pass finds recent `completed`
 * bookings missing any expected ledger row and re-runs the idempotent mint, healing partial
 * failures without ever double-minting.
 *
 * Concurrency: the atomic guarded UPDATE inside updateServiceBookingStatus(['confirmed']) is the
 * completion guard — a concurrent traveler confirm, cancel, or refund wins the race. The mint
 * itself is idempotent (ledger-existence guards). Overlapping runs are safe.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { availableAtFor, holdWindowDays } from "../config/earnings-hold.config";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — grace windows are day-scale
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // after startup settles (and after the release job's first pass)
const PAGE_SIZE = 50; // keyset page size — the pass loops pages until done or the lookup budget is spent
const MAX_PI_LOOKUPS_PER_PASS = 200; // Stripe-call budget per pass; stamped skips make the next pass cheap
const UNPAID_RECHECK_HOURS = 24; // how long a non-succeeded-PI candidate stays excluded
const RECONCILE_WINDOW_DAYS = 30; // how far back the missing-ledger reconciliation looks
const RECONCILE_LIMIT = 50;

function graceDays(): number {
  const raw = Number(process.env.BOOKING_AUTO_COMPLETE_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3;
}

/** PI verifier — injectable for tests; defaults to a live Stripe lookup. */
export type PiVerifier = (paymentIntentId: string) => Promise<boolean>;

const stripeVerifier: PiVerifier = async (paymentIntentId) => {
  const { stripe } = await import("./stripe-payment.service");
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return pi.status === "succeeded";
};

interface AutoCompleteStats {
  scanned: number;
  completed: number;
  skippedUnpaid: number;
  reconciled: number;
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

  /** Run one pass (auto-complete + reconciliation). Safe to call ad-hoc (admin trigger, tests). */
  async runPass(now: Date = new Date(), verifyPi: PiVerifier = stripeVerifier): Promise<AutoCompleteStats> {
    try {
      const days = graceDays();
      const nowIso = now.toISOString();
      let scanned = 0;
      let completed = 0;
      let skippedUnpaid = 0;
      let lookups = 0;

      // ── Pass 1: auto-complete due paid bookings ─────────────────────────────────────────────
      // Keyset cursor on (confirmed_at, id) so skipped-but-not-yet-stamped rows can never make the
      // loop spin; the recheck stamp keeps FUTURE passes from re-paying their Stripe lookup.
      let cursor: { confirmedAt: string | null; id: string } | null = null;
      while (lookups < MAX_PI_LOOKUPS_PER_PASS) {
        const result = await db.execute(sql`
          SELECT sb.id, sb.stripe_payment_intent_id, sb.confirmed_at,
                 sb.traveler_id, sb.provider_id
          FROM service_bookings sb
          LEFT JOIN vendor_availability_slots vas ON vas.id = sb.slot_id
          WHERE sb.status = 'confirmed'
            AND sb.stripe_payment_intent_id IS NOT NULL
            AND COALESCE(vas.date::timestamp + interval '1 day', sb.confirmed_at, sb.created_at)
                + (${days} || ' days')::interval < ${nowIso}::timestamptz
            AND (
              sb.booking_metadata->>'autoCompleteUnpaidRecheckAt' IS NULL
              OR (sb.booking_metadata->>'autoCompleteUnpaidRecheckAt')::timestamptz <= ${nowIso}::timestamptz
            )
            ${cursor ? sql`AND (COALESCE(sb.confirmed_at, 'epoch'::timestamp), sb.id) > (COALESCE(${cursor.confirmedAt}::timestamp, 'epoch'::timestamp), ${cursor.id})` : sql``}
          ORDER BY COALESCE(sb.confirmed_at, 'epoch'::timestamp) ASC, sb.id ASC
          LIMIT ${PAGE_SIZE}
        `);
        const rows = (result.rows ?? []) as Array<{ id: string; stripe_payment_intent_id: string; confirmed_at: string | null; traveler_id: string | null; provider_id: string | null }>;
        if (rows.length === 0) break;

        for (const row of rows) {
          if (lookups >= MAX_PI_LOOKUPS_PER_PASS) break;
          scanned++;
          lookups++;
          let paid = false;
          try {
            paid = await verifyPi(row.stripe_payment_intent_id);
          } catch (piErr) {
            console.error(`[BookingAutoComplete] PI lookup failed for booking ${row.id}, deferring:`, piErr);
          }
          if (!paid) {
            skippedUnpaid++;
            // Stamp so later passes skip this row until the recheck window elapses — this is what
            // prevents a stale-unpaid backlog from head-of-line blocking paid bookings.
            const recheckAt = new Date(now.getTime() + UNPAID_RECHECK_HOURS * 60 * 60 * 1000).toISOString();
            await db.execute(sql`
              UPDATE service_bookings
              SET booking_metadata = COALESCE(booking_metadata, '{}'::jsonb)
                    || jsonb_build_object('autoCompleteUnpaidRecheckAt', ${recheckAt}::text)
              WHERE id = ${row.id} AND status = 'confirmed'
            `);
            continue;
          }
          // Build idempotent notifications for earner and traveler so money
          // movement is never silent. Each notification is deduped by its own
          // key (ON CONFLICT DO NOTHING in the same transaction as the flip),
          // so a crash-retry never sends a duplicate.
          const earningsAvailableAt = availableAtFor("booking", now);
          const holdDays = holdWindowDays("booking");
          const availableDateStr = earningsAvailableAt.toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          const notifyList = [];
          if (row.provider_id) {
            notifyList.push({
              userId: row.provider_id,
              type: "booking_auto_completed_earner",
              title: "Your earnings are on the way",
              message: `Your booking has been marked complete and your earnings are now held in escrow. They will be available to withdraw on ${availableDateStr}.`,
              data: { bookingId: row.id, availableAt: earningsAvailableAt.toISOString() },
              dedupeKey: `booking:${row.id}:auto_completed:earner`,
            });
          }
          if (row.traveler_id) {
            notifyList.push({
              userId: row.traveler_id,
              type: "booking_auto_completed_traveler",
              title: "Booking marked complete",
              message: `Your booking has been automatically marked complete. You have ${holdDays} day${holdDays === 1 ? "" : "s"} to raise a dispute if there is an issue.`,
              data: { bookingId: row.id, holdWindowDays: holdDays },
              dedupeKey: `booking:${row.id}:auto_completed:traveler`,
            });
          }
          const updated = await storage.updateServiceBookingStatus(
            row.id, "completed", undefined, ["confirmed"],
            notifyList.length > 0 ? notifyList : undefined,
          );
          if (updated) completed++;
        }
        cursor = { confirmedAt: rows[rows.length - 1].confirmed_at, id: rows[rows.length - 1].id };
        if (rows.length < PAGE_SIZE) break;
      }

      // ── Pass 2: reconcile completed bookings missing ledger rows ────────────────────────────
      const reconciled = await this.reconcileMissingLedgerRows(now);

      const stats: AutoCompleteStats = { scanned, completed, skippedUnpaid, reconciled, ranAt: now };
      if (completed > 0 || skippedUnpaid > 0 || reconciled > 0) {
        console.log(`[BookingAutoComplete] Completed ${completed}, skipped unpaid ${skippedUnpaid}, reconciled ${reconciled} (scanned ${scanned})`);
      }
      this.lastStats = stats;
      return stats;
    } catch (err: any) {
      const stats: AutoCompleteStats = { scanned: 0, completed: 0, skippedUnpaid: 0, reconciled: 0, ranAt: now, error: err?.message || String(err) };
      console.error("[BookingAutoComplete] Pass failed:", err);
      this.lastStats = stats;
      return stats;
    }
  }

  /**
   * Heal `completed` bookings whose ledger side-effects are (partially) missing — the crash
   * window between the guarded status UPDATE and the mint. The mint is idempotent per effect,
   * so only the missing pieces are created. Scoped to recent completions to keep the scan cheap
   * and to avoid re-litigating ancient (possibly manually adjusted) bookings.
   */
  async reconcileMissingLedgerRows(now: Date = new Date()): Promise<number> {
    const since = new Date(now.getTime() - RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.execute(sql`
      SELECT sb.id
      FROM service_bookings sb
      WHERE sb.status = 'completed'
        AND sb.completed_at >= ${since}::timestamptz
        AND (
          (COALESCE(sb.provider_earnings, '0')::numeric > 0 AND (
            NOT EXISTS (SELECT 1 FROM provider_earnings pe WHERE pe.source_type = 'booking' AND pe.source_id = sb.id)
            OR NOT EXISTS (SELECT 1 FROM expert_earnings ee WHERE ee.reference_type = 'service_booking' AND ee.reference_id = sb.id)
          ))
          OR (COALESCE(sb.platform_fee, '0')::numeric > 0 AND
            NOT EXISTS (SELECT 1 FROM platform_revenue pr WHERE pr.source_type = 'booking_commission' AND pr.source_id = sb.id)
          )
        )
      ORDER BY sb.completed_at ASC
      LIMIT ${RECONCILE_LIMIT}
    `);
    const rows = (result.rows ?? []) as Array<{ id: string }>;
    let healed = 0;
    for (const row of rows) {
      const booking = await storage.getServiceBooking(row.id);
      if (!booking || booking.status !== "completed") continue; // moved on (e.g. refunded) since select
      const applied = await storage.mintCompletionEarningsForBooking(booking);
      if (applied) {
        healed++;
        console.warn(`[BookingAutoComplete] Reconciled missing ledger rows for completed booking ${row.id}`);
      }
    }
    return healed;
  }

  getLastStats(): AutoCompleteStats | null {
    return this.lastStats;
  }
}

export const bookingAutoCompleteScheduler = new BookingAutoCompleteService();
