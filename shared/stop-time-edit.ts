/**
 * ST-1 — may the owner change this stop's time on the slip, and what does the row say (decision-maker,
 * Oct 12, 2026 — ledger `2026-10-12-st1-stop-time-edit`). ONE rule, read by the slip's time editor and by
 * the ⋯ → Swap edit form, so the two paths agree (ruling 5). Pure; no clock of its own.
 *
 *   1. A LOCKED stop stays editable by the owner (LD 61 stands: a lock binds machines, not the owner); the
 *      lock stays and the editor says so. A RIDE is the exception — its time is the operator's departure.
 *   2. A day that has passed is not editable (render-only; matches the frozen snapshot).
 *   3. A BOOKED stop is not editable — the booking's slot would not move with it.
 *   4. A stop with no time offers "Add a time" with the same editor.
 * Render rules only: the PATCH rail is unchanged and refuses none of these (rulings 1–3).
 */

export const STOP_TIME_RIDE_REASON = "Departure time comes from the operator — pick another departure";
export const STOP_TIME_PAST_REASON = "This day has passed.";
export const STOP_TIME_BOOKED_REASON = "Booked — change the time with the host.";
export const STOP_TIME_LOCKED_NOTE = "Kept — Optimize won't move it; you can.";
export const STOP_TIME_ADD_LABEL = "Add a time";

export type StopTimeRule = { editable: true; note: string | null } | { editable: false; reason: string };

/** Pure. A ride first (its time is not the plan's), then a past day, then a booking; a lock only adds a note. */
export function stopTimeRule(input: { ride: boolean; pastDay: boolean; booked: boolean; locked: boolean }): StopTimeRule {
  if (input.ride) return { editable: false, reason: STOP_TIME_RIDE_REASON };
  if (input.pastDay) return { editable: false, reason: STOP_TIME_PAST_REASON };
  if (input.booked) return { editable: false, reason: STOP_TIME_BOOKED_REASON };
  return { editable: true, note: input.locked ? STOP_TIME_LOCKED_NOTE : null };
}

/**
 * Pure. "HH:MM" rounded to the nearest 5 minutes (ruling: round on Save). Ties round up; a time that would
 * round past midnight stays at 23:55, never wrapping to another day. Null for anything that is not a
 * wall-clock time — the caller saves nothing then.
 */
export function roundToFiveMinutes(time: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const total = Math.min(Math.round((h * 60 + min) / 5) * 5, 23 * 60 + 55);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
