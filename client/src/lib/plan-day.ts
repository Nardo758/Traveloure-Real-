/**
 * `DayBlock`'s header words — PURE (surface spec v1.2 §3, step 1; ledger
 * `2026-10-03-surface-step1-item-row`).
 *
 *   heading: "<Wkd> · <Mon d>"              e.g. "Wed · Nov 11"
 *   stats:   "N stops · <areas> · hours on K"  e.g. "5 stops · Higashiyama, Sakyo · hours on 4"
 *
 * §13 on every absence: no machine date ⇒ the plan's own "Day N" (never a guessed weekday); a slot
 * the events alone brought into being ⇒ "Undated"; no Google-located ward ⇒ the areas segment is
 * omitted; no hours on any stop ⇒ "hours on K" is omitted rather than printed as "hours on 0".
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

/** At most this many areas are named; the rest are not counted into the line. */
export const DAY_AREAS_MAX = 3;

export function dayBlockStats(input: { stops: number; areas: ReadonlyArray<string | null>; hoursOn: number }): string | null {
  if (input.stops <= 0) return null;
  const parts = [`${input.stops} ${input.stops === 1 ? "stop" : "stops"}`];
  const seen: string[] = [];
  for (const a of input.areas) if (a && !seen.includes(a)) seen.push(a);
  if (seen.length) parts.push(seen.slice(0, DAY_AREAS_MAX).join(", "));
  if (input.hoursOn > 0) parts.push(`hours on ${input.hoursOn}`);
  return parts.join(" · ");
}
