/**
 * An EA event's date and time are the wall clock the assistant typed.
 *
 * The form used to send `2026-11-11T19:00` with no offset. A UTC server reads that as 19:00 UTC,
 * and a browser in America/New_York (UTC−5 after the November change) shows 2:00 PM. The offset
 * is the browser's own, taken from a local `Date` of those same numbers, so the stored instant
 * is 19:00 in the assistant's zone and `toLocaleString` shows 7:00 PM there.
 *
 * Existing rows are not rewritten (§13 — a timestamp already stored was stored).
 */
export function wallClockIso(date: string, time: string | null | undefined): string | null {
  const day = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = (time && time.trim() ? time.trim() : "00:00").match(/^(\d{2}):(\d{2})$/);
  if (!day || !clock) return null;
  const year = Number(day[1]);
  const month = Number(day[2]);
  const dateNum = Number(day[3]);
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  if (hours > 23 || minutes > 59) return null;
  const local = new Date(year, month - 1, dateNum, hours, minutes, 0, 0);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== dateNum ||
    local.getHours() !== hours ||
    local.getMinutes() !== minutes
  ) {
    return null;
  }
  const offsetMinutes = -local.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(abs / 60)).padStart(2, "0");
  const offsetMins = String(abs % 60).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `${day[1]}-${day[2]}-${day[3]}T${hh}:${mm}:00${sign}${offsetHours}:${offsetMins}`;
}
