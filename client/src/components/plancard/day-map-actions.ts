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
import { buildDayIcs, dayIcsDate } from "./day-ics";

export { buildDayIcs, dayIcsDate };

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
