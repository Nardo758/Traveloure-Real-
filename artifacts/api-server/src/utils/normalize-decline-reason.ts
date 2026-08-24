/**
 * Server-side normalisation for the optional decline `reason` field on
 * PATCH /api/expert/bookings/:id/status.
 *
 * Rules:
 * - Absent / null → treated as no reason (ok, reason: undefined)
 * - Non-string   → 400 error
 * - Blank string → treated as no reason (ok, reason: undefined)
 * - > 500 chars  → 400 error
 * - Otherwise    → trimmed string
 */
export type NormaliseReasonOk = { ok: true; reason: string | undefined };
export type NormaliseReasonErr = { ok: false; status: 400; message: string };
export type NormaliseReasonResult = NormaliseReasonOk | NormaliseReasonErr;

export const DECLINE_REASON_MAX_LENGTH = 500;

export function normalizeDeclineReason(raw: unknown): NormaliseReasonResult {
  if (raw === undefined || raw === null) {
    return { ok: true, reason: undefined };
  }
  if (typeof raw !== "string") {
    return { ok: false, status: 400, message: "reason must be a string" };
  }
  const trimmed = raw.trim();
  if (trimmed.length > DECLINE_REASON_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `reason must be ${DECLINE_REASON_MAX_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, reason: trimmed || undefined };
}
