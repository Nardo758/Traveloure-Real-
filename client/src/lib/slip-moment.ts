/**
 * THE MOMENT BOARD'S WORDS, derived from the plan's own facts (slip conformance, boards rev 15;
 * ledger `2026-10-08-slip-moment-board`). Pure; one home for each sentence (§18 rule 1).
 *
 * §13 holds throughout: "evening" is said only when every timed stop starts at or after 17:00, and
 * "fixed" only when the anchor is locked. With no anchor there is no "around your reservation".
 */
import { parseTripDate } from "@/lib/calendar-date";

/** Hour at or after which a stop counts as evening. */
export const EVENING_FROM_HOUR = 17;

function hourOf(time: string | null | undefined): number | null {
  const m = typeof time === "string" ? time.trim().match(/^(\d{1,2}):\d{2}/) : null;
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h < 24 ? h : null;
}

/**
 * "evening" — a one-day plan whose timed stops all start at or after 17:00; "day" — any other
 * one-day plan; null — a plan longer than a day, or one whose window does not parse.
 */
export function momentSpanWord(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  activities: ReadonlyArray<{ time?: string | null }>,
): "evening" | "day" | null {
  const start = parseTripDate(startDate);
  const end = parseTripDate(endDate);
  if (!start || !end || start.getTime() !== end.getTime()) return null;
  const hours = activities.map((a) => hourOf(a.time)).filter((h): h is number => h !== null);
  return hours.length > 0 && hours.every((h) => h >= EVENING_FROM_HOUR) ? "evening" : "day";
}

/** The optimizer card's title on a Moment. */
export function momentLeadTitle(span: "evening" | "day" | null): string {
  return span ? `Make the ${span} flow` : "Make it flow";
}

/**
 * The optimizer card's one sentence on a Moment, or null. It is said only when the anchor has a time
 * AND is locked (R-ah): only then does Optimize keep it fixed and order the rest around it. The
 * closing clause is the closed-on-arrival check the card already counts.
 */
export function momentLeadIntro(anchor: { time?: string | null; locked?: true } | null | undefined): string | null {
  const h = anchor ? hourOf(anchor.time) : null;
  if (!anchor || h === null || anchor.locked !== true) return null;
  const time = String(anchor.time).trim().slice(0, 5);
  return `Optimize orders the before and after around ${time}, which stays fixed, and flags anything that's closed when you get there.`;
}

/** The header's line beside the "AI starting sketch" chip on a Moment with an anchor. */
export function momentSketchLine(stopCount: number): string | null {
  if (!Number.isFinite(stopCount) || stopCount <= 0) return null;
  return `${stopCount} ${stopCount === 1 ? "stop" : "stops"} · around your reservation`;
}

const WKD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The Moment board's evening card heading — "Fri evening · Nov 13" — for the one day of an evening
 * plan (ledger `2026-10-08-slip-main-rows`). Null when the day's date does not parse; the day then
 * keeps its ordinary heading.
 */
export function momentEveningHeading(dateIso: string | null | undefined): string | null {
  const d = parseTripDate(dateIso ?? null);
  if (!d) return null;
  return `${WKD_SHORT[d.getDay()]} evening · ${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/**
 * "17:00 → 23:00": the first stop's start to the last stop's end (or, with no end, its start). Null
 * with fewer than two timed points. The board's "all within Gion on foot" is NOT drawn — nothing on
 * the plan measures that.
 */
export function momentTimeSpan(items: ReadonlyArray<{ time?: string | null; endTime?: string | null }>): string | null {
  const hhmm = (t: string | null | undefined) => {
    const m = typeof t === "string" ? t.trim().match(/^(\d{1,2}):(\d{2})/) : null;
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
  };
  const starts = items.map((a) => hhmm(a.time)).filter((t): t is string => !!t).sort();
  if (starts.length === 0) return null;
  const ends = items.map((a) => hhmm(a.endTime) ?? hhmm(a.time)).filter((t): t is string => !!t).sort();
  const first = starts[0];
  const last = ends[ends.length - 1];
  return first !== last ? `${first} → ${last}` : null;
}
