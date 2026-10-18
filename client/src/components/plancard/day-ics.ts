/**
 * The day's .ics text for the plan card's "Add to Calendar" download. Pure — no browser globals —
 * so it is testable in Node; `addDayToCalendar` (day-map-actions.ts) does the download.
 */
import type { PlanCardActivity, PlanCardDay } from "./plancard-types";

/** A YYYYMMDD date plus a minute offset, as "YYYYMMDDTHHMMSS" floating time (no zone, LD 30). */
function floatingStamp(dateStr: string, minutes: number): string {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6));
  const d = Number(dateStr.slice(6, 8));
  const iso = new Date(Date.UTC(y, m - 1, d, 0, minutes)).toISOString();
  return `${iso.slice(0, 10).replace(/-/g, "")}T${iso.slice(11, 13)}${iso.slice(14, 16)}00`;
}

/** The calendar day after a YYYYMMDD date, as YYYYMMDD (all-day DTEND is exclusive, RFC 5545). */
function nextDateStr(dateStr: string): string {
  return floatingStamp(dateStr, 24 * 60).slice(0, 8);
}

/**
 * Builds the day's VCALENDAR text. Nothing is invented (§13):
 * - an item with no "HH:MM" time is an ALL-DAY event on its date (`DTSTART;VALUE=DATE`);
 * - a timed item with a known duration ends at start + duration;
 * - a timed item with no duration carries DTSTART only — no made-up end.
 */
export function buildDayIcs(activities: PlanCardActivity[], dateStr: string, tripDestination: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Traveloure//PlanCard//EN"];

  activities.forEach((act) => {
    const timeMatch = act.time?.match(/(\d{1,2}):(\d{2})/);
    lines.push("BEGIN:VEVENT");
    if (timeMatch) {
      const startMinutes = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
      lines.push(`DTSTART:${floatingStamp(dateStr, startMinutes)}`);
      const duration = act.durationMinutes;
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        lines.push(`DTEND:${floatingStamp(dateStr, startMinutes + duration)}`);
      }
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateStr}`, `DTEND;VALUE=DATE:${nextDateStr(dateStr)}`);
    }
    lines.push(
      `SUMMARY:${act.name}`,
      `LOCATION:${act.location}`,
      `DESCRIPTION:${act.type} - ${tripDestination}`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** The day's date as YYYYMMDD, or null when the day has none — never today's date in its place. */
export function dayIcsDate(day: PlanCardDay): string | null {
  const dateStr = day.date?.replace(/-/g, "") ?? "";
  return /^\d{8}$/.test(dateStr) ? dateStr : null;
}
