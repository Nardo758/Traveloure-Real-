/**
 * `DayBlock`'s header words — PURE (surface spec v1.2 §3, step 1; ledger
 * `2026-10-03-surface-step1-item-row`).
 *
 *   heading: "<Wkd> · <Mon d>"              e.g. "Wed · Nov 11"
 *   stats:   "N stops · hours on K"           e.g. "5 stops · hours on 4"
 *
 * §13 on every absence: no machine date ⇒ the plan's own "Day N" (never a guessed weekday); a slot
 * the events alone brought into being ⇒ "Undated"; no hours on any stop ⇒ "hours on K" is omitted rather than printed as "hours on 0".
 */
import { parseTripDate } from "@/lib/calendar-date";
import { SLIP_UNDATED_SLOT_HEADING } from "@/lib/slip-events";

const WKD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayBlockHeading(day: { dayNum: number | null; date?: string | null; dateIso?: string | null }): string {
  const d = parseTripDate(day.dateIso ?? null);
  if (d) return `${WKD[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`;
  if (day.dayNum == null) return SLIP_UNDATED_SLOT_HEADING;
  return `Day ${day.dayNum}${day.date ? ` · ${day.date}` : ""}`;
}

/**
 * Smoke 10 S10-8 (ledger `2026-10-04-smoke10-fixes`): NO ward names on a day header, any day. A day
 * listing "Kita Ward, Sakyo Ward" read as a claim about where the day goes, drawn from whichever stops
 * happened to have a Google area — some days had them and others did not. Each stop's own place line
 * still names its area.
 */
export function dayBlockStats(input: { stops: number; hoursOn: number }): string | null {
  // S12-3: an empty day reads "0 stops" like any other day — it IS a day of the plan with no stop yet.
  if (input.stops < 0) return null;
  const parts = [`${input.stops} ${input.stops === 1 ? "stop" : "stops"}`];
  if (input.hoursOn > 0) parts.push(`hours on ${input.hoursOn}`);
  return parts.join(" · ");
}

/**
 * S12-3, pure: the machine day ("YYYY-MM-DD") of day `dayNum`, counted from a sibling day that has
 * one — the SAME producer's own date, so an empty day reads the same header as a filled one. No
 * sibling with a date ⇒ null (§13: the plan's own "Day N", never a guessed weekday).
 */
export function siblingDayIso(
  dayNum: number,
  days: ReadonlyArray<{ dayNum: number | null; dateIso?: string | null }>,
): string | null {
  const anchor = days.find((d) => d.dayNum != null && parseTripDate(d.dateIso ?? null));
  if (!anchor || anchor.dayNum == null) return null;
  const base = parseTripDate(anchor.dateIso ?? null)!;
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (dayNum - anchor.dayNum));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
