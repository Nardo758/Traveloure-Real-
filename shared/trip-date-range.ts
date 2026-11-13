/**
 * R4-8 (QA round 4) — a trip's window may never be saved reversed.
 *
 * The rule lives here, beside nothing else, so the LIVE `PATCH /api/trips/:id` (`server/routes.ts`)
 * and its test read the same function. It takes the MERGED window: the body over what the row already
 * holds, because a PATCH that moves only one end is otherwise judged against nothing, and "end before
 * start" becomes reachable one field at a time.
 *
 * Calendar days are compared as their `YYYY-MM-DD` prefix and never through a `Date`, so no timezone
 * can shift the verdict. SAME-DAY is a one-day trip and is valid.
 *
 * The message is the one the create rail already returns (`server/routes/trips.routes.ts`), so this
 * adds no copy; `code` is the stable handle callers can branch on.
 */
export const END_BEFORE_START_CODE = "end_before_start";
export const END_BEFORE_START_MESSAGE = "End date must be on or after start date";

export type TripDateRefusal = { code: typeof END_BEFORE_START_CODE; message: string };

function day(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * `null` means "save it"; a refusal means 400. A window missing either end states no range (§13) and
 * is never refused here — the column's own nullability decides that, not this guard.
 */
export function tripDateRangeRefusal(nextStart: unknown, nextEnd: unknown): TripDateRefusal | null {
  const start = day(nextStart);
  const end = day(nextEnd);
  if (!start || !end) return null;
  return end < start ? { code: END_BEFORE_START_CODE, message: END_BEFORE_START_MESSAGE } : null;
}
