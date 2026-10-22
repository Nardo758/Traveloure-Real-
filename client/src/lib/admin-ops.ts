/**
 * Ops gap 8 (ledger `2026-10-22-admin-ops-screens`): the three ops tabs on /admin/system — their words (FOUNDER
 * WORDING REVIEW on the PR) and the pure rules the tabs read. Each write the tabs send is audited server-side
 * through `recordAdminDecisionAudit`; nothing here decides money.
 */
export const ADMIN_OPS_COPY = {
  tabSettings: "Settings",
  tabEmailOutbox: "Email outbox",
  tabOutOfBandRefunds: "Refunds outside the platform",
  tabAutoCancel: "Auto-cancel",

  outboxTitle: "Email outbox",
  outboxDescription: "Emails the platform queued, newest first. Retry sends a failed or dead email again.",
  outboxFilter: "Status",
  outboxFilterAll: "All statuses",
  outboxEmpty: "No emails in the outbox",
  outboxEmptyFiltered: "No emails with this status",
  outboxColCreated: "Queued",
  outboxColType: "Type",
  outboxColStatus: "Status",
  outboxColAttempts: "Attempts",
  outboxColLastError: "Last error",
  outboxNoError: "—",
  outboxRetry: "Retry",
  outboxRetried: "Queued to send again",
  outboxRetryFailed: "Could not retry this email",
  outboxLoadFailed: "Could not load the email outbox",

  refundsTitle: "Refunds outside the platform",
  refundsDescription:
    "Bookings refunded in Stripe without going through the platform. They cannot complete or pay the seller until resolved.",
  refundsClearExplainer:
    "Clear only when the seller should still be paid. Clearing records a refund that was already paid; it does not move money.",
  refundsEmpty: "No bookings are marked as refunded outside the platform",
  refundsColBooking: "Booking",
  refundsColStatus: "Status",
  refundsColRefunded: "Refunded",
  refundsColSeen: "Last seen",
  refundsOpen: "Open booking",
  refundsClear: "Clear",
  refundsNoteLabel: "Why should the seller still be paid?",
  refundsNoteHint: "At least 10 characters. Saved on the booking and in the audit log.",
  refundsConfirm: "Clear mark",
  refundsCancel: "Cancel",
  refundsCleared: "Mark cleared",
  refundsClearFailed: "Could not clear the mark",
  refundsLoadFailed: "Could not load bookings refunded outside the platform",

  autoTitle: "Auto-cancel",
  autoDescription: "Cancels legacy bookings still waiting for payment after the set number of hours.",
  autoThreshold: "Cancel after (hours)",
  autoThresholdHint: "1 to 720 hours. This setting returns to its default when the server restarts.",
  autoSave: "Save",
  autoSaved: "Auto-cancel setting saved",
  autoSaveFailed: "Could not save the setting",
  autoLastRun: "Last run",
  autoNeverRun: "Not run since the server started",
  autoRunning: "Running now",
  autoRunNow: "Run now",
  autoCounting: "Counting bookings…",
  autoConfirmTitle: "Run auto-cancel now?",
  autoConfirmRun: "Cancel these bookings",
  autoConfirmNone: "Run anyway",
  autoConfirmCancel: "Cancel",
  autoConfirmNotices: "The run also sends the 48-hour no-response notices to sellers.",
  autoRan: "Auto-cancel run finished",
  autoRunFailed: "Auto-cancel run failed",
  autoLoadFailed: "Could not load auto-cancel settings",
} as const;

/** The outbox statuses the list endpoint filters on. */
export const OUTBOX_STATUSES = ["pending", "failed", "dead", "sent"] as const;

/** Mirrors the retry endpoint's own WHERE (`status IN ('failed','dead')`); the server is the guard. */
export function outboxRetryable(status: string | null | undefined): boolean {
  return status === "failed" || status === "dead";
}

export function outboxListUrl(status: string): string {
  return (OUTBOX_STATUSES as readonly string[]).includes(status)
    ? `/api/admin/email-outbox?status=${status}`
    : "/api/admin/email-outbox";
}

export function emailCountLabel(n: number): string {
  return n === 1 ? "1 email" : `${n} emails`;
}

/** Same minimum as the clear route's `.strict()` body. */
export const OUT_OF_BAND_NOTE_MIN = 10;
export function outOfBandNoteReady(note: string): boolean {
  return note.trim().length >= OUT_OF_BAND_NOTE_MIN;
}

/** Out-of-band marks live on `service_bookings`, so every row opens the service booking detail. */
export function outOfBandBookingHref(bookingId: string): string {
  return `/admin/bookings/service/${encodeURIComponent(bookingId)}`;
}

/** "$X of $Y" from the marker's own cents; the charge half is omitted when the marker does not carry it. */
export function outOfBandRefundedLabel(marker: { amountCents?: unknown; chargeAmountCents?: unknown } | null | undefined): string | null {
  const amount = typeof marker?.amountCents === "number" ? marker.amountCents : null;
  if (amount == null) return null;
  const charge = typeof marker?.chargeAmountCents === "number" ? marker.chargeAmountCents : null;
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  return charge == null ? usd(amount) : `${usd(amount)} of ${usd(charge)}`;
}

/** The threshold the PATCH accepts (`z.number().min(1).max(720)`). */
export function parseThresholdHours(raw: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 1 && n <= 720 ? n : null;
}

/** The confirm step's sentence, from the dry run's count. */
export function autoCancelConfirmLine(count: number, hours: number): string {
  if (count === 0) return `No bookings have waited more than ${hours} hours for payment. Nothing will be cancelled.`;
  const noun = count === 1 ? "1 booking has" : `${count} bookings have`;
  return `${noun} waited more than ${hours} hours for payment and will be cancelled.`;
}

export function autoCancelRanLine(cancelled: number): string {
  return cancelled === 1 ? "1 booking cancelled" : `${cancelled} bookings cancelled`;
}
