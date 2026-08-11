/**
 * D8 completion windows — the TIME constants ruling 63 names, as CONFIG rather than literals
 * (the `earnings-hold.config.ts` posture one lane over). These are DAY COUNTS, not fees, not
 * rates and not amounts: nothing here multiplies money, it only decides WHEN a completion event
 * fires. §8 is untouched by this module.
 *
 * There is deliberately NO second dispute window here. Ruling 63's async row says "disputable
 * window" and the build charter says to REUSE the one that already exists — that is
 * `holdWindowDays('service_booking')` in `earnings-hold.config.ts`, which the escrow spine
 * already applies from `completedAt` on BOTH sides (the earning's `availableAt`, and the
 * `POST /api/bookings/:id/dispute` cutoff). A booking completed by any D8 rule inherits it for
 * free precisely because every rule ends at the SAME `updateServiceBookingStatus('completed')`
 * flip. Do not add a parallel constant.
 */

function envDays(key: string, dflt: number): number {
  const v = parseInt(process.env[key] || "", 10);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}

/**
 * Ruling 63's pdf row: "auto-complete at 7 days (7 days after FIRST download, or 7 days
 * UNDOWNLOADED post-delivery)". One window, both arms — the ruling names a single number.
 */
export const ARTIFACT_AUTO_COMPLETE_DAYS = envDays("BOOKING_AUTO_COMPLETE_DAYS_ARTIFACT", 7);

/**
 * Ruling 63's property row: "checkout date". A stay is complete when its checkout DAY has fully
 * passed — the grace is 0 days by default (the day boundary itself is the event) and exists only
 * so an operator can widen it without a code change. Deliberately NOT the artifact window.
 */
export const PROPERTY_AUTO_COMPLETE_GRACE_DAYS = envDays("BOOKING_AUTO_COMPLETE_GRACE_PROPERTY", 0);

export const DAY_MS = 24 * 60 * 60 * 1000;
