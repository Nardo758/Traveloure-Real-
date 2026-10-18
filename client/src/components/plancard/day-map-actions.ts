/**
 * Shared "open this day in Maps / add to calendar" actions.
 *
 * Extracted from MapControlCenter.tsx (pure refactor, no logic change) so the new
 * collapsed "Map preview" section (CLAUDE.md §18, item 4) can offer the same real
 * Google/Apple Maps deep-links + .ics export without duplicating the waypoint-building
 * and VCALENDAR-writing logic, and without re-mounting the (heavy, API-key-gated)
 * interactive map just to show a lightweight teaser.
 */
import { openInMaps } from "@/lib/navigate";
import type { PlanCardActivity, PlanCardDay } from "./plancard-types";

export function getActivityLoc(a: PlanCardActivity, tripDestination: string): string {
  if (a.lat != null && a.lng != null) return `${a.lat},${a.lng}`;
  return a.location || a.name || tripDestination;
}

export function getDominantRawMode(transports: PlanCardDay["transports"] | undefined): string {
  if (!transports || transports.length === 0) return "walk";
  const counts: Record<string, number> = {};
  transports.forEach((t) => {
    counts[t.mode] = (counts[t.mode] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function buildWaypoints(acts: PlanCardActivity[]) {
  return acts.map((a) => {
    if (a.lat != null && a.lng != null) return { lat: a.lat, lng: a.lng, name: a.name };
    return { name: a.location || a.name };
  });
}

export function openDayInMaps(day: PlanCardDay | undefined, tripDestination: string, app: "google" | "apple") {
  const acts = (day?.activities || []).filter((a) => a.location || a.name || (a.lat != null && a.lng != null));
  const mode = getDominantRawMode(day?.transports);
  if (acts.length === 0) {
    openInMaps({ destination: { name: tripDestination }, app });
    return;
  }
  openInMaps({ waypoints: buildWaypoints(acts), mode, app });
}

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

export function addDayToCalendar(day: PlanCardDay | undefined, tripDestination: string) {
  if (!day) return;
  const activities = day.activities || [];
  if (activities.length === 0) return;

  const dateStr = dayIcsDate(day);
  if (!dateStr) {
    console.warn(`[calendar] day ${day.dayNum} has no date; no .ics written rather than filing it under today`);
    return;
  }
  const ics = buildDayIcs(activities, dateStr, tripDestination);

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `traveloure-day${day.dayNum}-${tripDestination.toLowerCase().replace(/\s+/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
