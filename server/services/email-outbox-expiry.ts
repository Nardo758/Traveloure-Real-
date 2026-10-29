/**
 * Outbox expiry (Z-03, ledger `2026-10-24-traveler-automation-rulings`).
 *
 * expires_at is computed once, at enqueue. A type with no stated window stays
 * null. The drain does not invent a window and does not backfill one.
 *
 * Marketing (the itinerary follow-up sequence): the row expires at the next
 * step's due time or 3 days from enqueue, whichever is first. The next step is
 * the following notice, measured from metadata.readyAt. itinerary_reengagement_5d
 * has no following step, and the 3-day cap is earlier than its own 120-hour due
 * time, so it stays null — a number that would cancel the notice before it is
 * due is not stored.
 *
 * Link-bearing security mail (password_reset, email_verification): expires_at
 * is the issued link's own expiry when the enqueue already carries
 * metadata.linkExpiresAt. No separate TTL is invented. Security and must-have
 * rows otherwise have no time expiry.
 */

export const OUTBOX_EXPIRED_REASON = "expired";

/** Z-03: marketing rows do not outlive 3 days from enqueue. */
export const MARKETING_EXPIRY_CAP_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Following notice, as an offset from metadata.readyAt.
 * itinerary_nudge_2h is followed by the 24-hour notice.
 * itinerary_followup_24h is followed by the 5-day notice.
 */
const MARKETING_NEXT_STEP_FROM_READY_MS: Record<string, number> = {
  itinerary_nudge_2h: 24 * 60 * 60 * 1000,
  itinerary_followup_24h: 120 * 60 * 60 * 1000,
};

const LINK_EXPIRY_TYPES = new Set(["password_reset", "email_verification"]);

/**
 * Types the inventory names that Z-03 does not give a window. expires_at stays
 * null. itinerary_reengagement_5d is here on purpose (see the file comment).
 */
export const UNWINDOWED_EMAIL_TYPES = [
  "activity_advisor_invite",
  "activity_booking_cancelled",
  "activity_new_message",
  "activity_quote_request",
  "activity_review_received",
  "admin_daily_digest",
  "admin_digest_24h",
  "admin_test_email",
  "ai_upstream_alert",
  "booking_confirmation",
  "booking_decline",
  "cancellation_refund",
  "canonical_booking_confirmation",
  "earner_no_response",
  "expert_application_approved",
  "expert_application_rejected",
  "expired_claim",
  "generic",
  // No Z-03 window of its own. Row 207 stores expires_at only when the enqueue
  // passes rsvpBy or eventDate. Without those, computeOutboxExpiresAt still
  // returns null, which is what the unwindowed proof checks. The drain still
  // holds an unlisted row before it reads expires_at, so a past guest_invite
  // stays held until the type is allowlisted.
  "guest_invite",
  "itinerary_failed",
  "itinerary_ready",
  "itinerary_reengagement_5d",
  "late_success_refund",
  "liteapi_stay_voucher",
  "manual_send_test",
  "new_suggestion",
  "nightly_qa",
  "occasion_reminder",
  "payment_failed",
  "plan_approved",
  "plan_changes_requested",
  "plan_delivered",
  "provider_application_approved",
  "provider_application_rejected",
  "provider_booking_alert",
  "ready_made_purchase_delivered",
  "ready_made_revision_requested",
  "signup_welcome",
  "vendor_bulk_email",
  "verification_decision",
  "waitlist_apply_invite",
  "waitlist_open",
] as const;

export function outboxRowExpired(
  expiresAt: Date | string | null | undefined,
  now = Date.now(),
): boolean {
  if (expiresAt == null || expiresAt === "") return false;
  const at = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isFinite(at) && at <= now;
}

function instantOf(value: unknown): number | null {
  if (value instanceof Date) {
    const at = value.getTime();
    return Number.isFinite(at) ? at : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : null;
  }
  return null;
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A DATE column as a UTC calendar day, or null when the value is not one.
 * The same convention `formatEventDateForEmail` uses: a calendar date has no
 * zone, and reading it in a local zone is how the day slides.
 */
export function asGuestInviteCalendarDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim().slice(0, 10);
  if (!CALENDAR_DAY.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== date) {
    return null;
  }
  return day;
}

/**
 * When a guest_invite row expires. rsvp_by when that day is usable, otherwise
 * the event date, otherwise null (no window — nothing is invented).
 *
 * The instant is the first moment of the next UTC day, so `expires_at <= now()`
 * becomes true as that calendar date ends. A DATE has no time of day.
 */
export function guestInviteExpiresAt(
  rsvpBy: unknown,
  eventDate: unknown,
): Date | null {
  const day = asGuestInviteCalendarDay(rsvpBy) ?? asGuestInviteCalendarDay(eventDate);
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1));
}

/**
 * The expires_at to store on a new outbox row. Null means this enqueue has
 * no stated window. Never reads the database and never changes a row that
 * already exists. guest_invite is the exception that reads rsvpBy / eventDate
 * off the metadata the guest-invite enqueue itself supplied; without those
 * the result is still null.
 */
export function computeOutboxExpiresAt(
  emailType: string,
  metadata: {
    linkExpiresAt?: unknown;
    readyAt?: unknown;
    rsvpBy?: unknown;
    eventDate?: unknown;
  } | null | undefined,
  enqueuedAt: Date,
): Date | null {
  if (LINK_EXPIRY_TYPES.has(emailType)) {
    const at = instantOf(metadata?.linkExpiresAt);
    return at == null ? null : new Date(at);
  }
  if (emailType === "guest_invite") {
    return guestInviteExpiresAt(metadata?.rsvpBy, metadata?.eventDate);
  }
  const nextOffset = MARKETING_NEXT_STEP_FROM_READY_MS[emailType];
  if (nextOffset == null) return null;
  const cap = enqueuedAt.getTime() + MARKETING_EXPIRY_CAP_MS;
  const ready = instantOf(metadata?.readyAt);
  if (ready == null) return new Date(cap);
  return new Date(Math.min(ready + nextOffset, cap));
}

export interface OutboxHoldSummary {
  /** Rows cancelled with reason `expired`. They are not retried. */
  expired: number;
  /** Current `held` rows, grouped by the reason already stored on the row. */
  held: { reason: string; count: number }[];
}

export const EMAIL_OUTBOX_EXPIRY_BOOT_MESSAGE =
  "[email-outbox] expiry: a due allowlisted row past expires_at is cancelled with reason expired and is not sent or retried; null expires_at is unchanged";
