/**
 * Outbox expiry (fix queue row 167; Z-03 in
 * `2026-10-24-traveler-automation-rulings`).
 *
 * Z-03 names category lifetimes — marketing at the next step's due time or 3
 * days from enqueue, whichever is first; security and must-have with no time
 * expiry; link-bearing at the link's own expiry — and it does not name a
 * lifetime per template type. Until that table is confirmed, every newly
 * enqueued type uses OUTBOX_ROW_LIFETIME_MS (the 3 days Z-03 writes).
 */

/** Default lifetime for every template type. 3 days is the only duration Z-03 writes. */
export const OUTBOX_ROW_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Per-template lifetimes, in milliseconds. Empty on purpose: Z-03 did not write
 * a number per template type. A type that is not listed uses OUTBOX_ROW_LIFETIME_MS.
 */
export const OUTBOX_ROW_LIFETIME_BY_TYPE: Readonly<Record<string, number>> = {};

/** last_error and metadata.expiryReason written when a row is past expires_at. */
export const OUTBOX_EXPIRY_REASON = "expired";

/** When this template's outbox row stops being sendable. */
export function outboxExpiresAt(emailType: string | null | undefined, enqueuedAt: Date): Date {
  const named = typeof emailType === "string" ? OUTBOX_ROW_LIFETIME_BY_TYPE[emailType] : undefined;
  return new Date(enqueuedAt.getTime() + (named ?? OUTBOX_ROW_LIFETIME_MS));
}

export function outboxExpiryInstant(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const at = value instanceof Date ? value : new Date(typeof value === "string" || typeof value === "number" ? value : "");
  return Number.isNaN(at.getTime()) ? null : at;
}

/** NULL and an unreadable value are not expired. A past instant is. */
export function outboxRowIsExpired(value: unknown, now = Date.now()): boolean {
  const at = outboxExpiryInstant(value);
  return at != null && at.getTime() <= now;
}
