/**
 * An unaccepted concierge booking past CONCIERGE_ACCEPT_HOURS declines through the
 * existing owner-decline path. A captured charge is refunded with that path's
 * existing keys. The traveler notice is the decline path's existing
 * booking_cancelled notification. No new copy.
 *
 * The window is the env var and nothing else (CN-1 OPEN call E is Leon's): unset,
 * empty, 0 or not a positive number DISABLES the job. A pass then declines
 * nothing and logs one line. There is no default in code.
 *
 * The one runner is POST /internal/jobs/concierge-accept-timeout (JOB_CADENCE,
 * hourly). There is no in-process timer.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { applyOwnerDecline } from "./booking-owner-decline.service";

/** The accept window in hours, or null when the job is disabled (unset, empty, 0 or invalid). */
export function conciergeAcceptHours(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.CONCIERGE_ACCEPT_HOURS;
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function runConciergeAcceptTimeout(
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  scanned: number;
  declined: number;
  errors: number;
  disabled?: true;
}> {
  const hours = conciergeAcceptHours(env);
  if (hours === null) {
    logger.info("[concierge-accept-timeout] CONCIERGE_ACCEPT_HOURS is not set to a positive number; job disabled, nothing declined");
    return { scanned: 0, declined: 0, errors: 0, disabled: true };
  }
  const cut = new Date(now.getTime() - hours * 3_600_000);
  const found = await db.execute(sql`
    SELECT sb.id
    FROM service_bookings sb
    JOIN provider_services ps ON ps.id = sb.service_id
    WHERE ps.service_type = 'concierge'
      AND sb.status = 'pending'
      AND sb.created_at < ${cut}
    ORDER BY sb.created_at ASC
    LIMIT 200
  `);
  let declined = 0;
  let errors = 0;
  for (const raw of (found.rows ?? []) as { id: string }[]) {
    try {
      const booking = await storage.getServiceBooking(raw.id);
      if (!booking || booking.status !== "pending") continue;
      const outcome = await applyOwnerDecline({
        booking,
        bookingId: booking.id,
        reason: null,
        actorUserId: booking.providerId ?? "",
        role: "provider",
      });
      if (outcome.status === 200) declined += 1;
      else errors += 1;
    } catch (err) {
      errors += 1;
      logger.error({ err, bookingId: raw.id }, "[concierge-accept-timeout] decline failed");
    }
  }
  return { scanned: (found.rows ?? []).length, declined, errors };
}
