/**
 * Drafting consistency (R-aa, step 6 — ledger `2026-10-04-step6-trip-card`): ONE way every drafting
 * path drops stops outside the flight windows — nothing before arrival + buffer on the arrival day,
 * nothing past departure − buffer on the departure day; the AI's own travel rows are kept (they ARE the
 * flight's rows, adopted as travel rows). The free-draft route, the shared snapshot writer (Plus
 * occasion drafts, save-as-trip) and the trip generate route all call this — never a copy of the rule
 * (§18 rule 1). Pure.
 */
import { withinFlightWindows } from "../services/smart-sequencing.service";
import { travelItemKind } from "@shared/getting-there";

type Anchors = Parameters<typeof withinFlightWindows>[1];

const isTravelRow = (title: unknown, location: unknown): boolean =>
  travelItemKind({ name: String(title ?? ""), location: String(location ?? ""), origin: "ai" }) !== null;

const minutesOf = (d: unknown): number | null => {
  if (typeof d === "number" && Number.isFinite(d)) return d;
  const m = /(\d+)/.exec(String(d ?? ""));
  return m ? Number(m[1]) : null;
};

/** Canonical items (`dayNumber`, `time`, `durationMinutes`, `title`, `location`). */
export function canonicalWithinFlightWindows<T extends Record<string, any>>(items: readonly T[], anchors: Anchors, startIso: string | Date | null | undefined): { kept: T[]; dropped: T[] } {
  if (!anchors?.length || !startIso) return { kept: [...items], dropped: [] };
  return withinFlightWindows(items, anchors, startIso, {
    day: (it) => Number(it.dayNumber),
    time: (it) => it.time ?? it.startTime,
    duration: (it) => it.durationMinutes,
    isTravelRow: (it) => isTravelRow(it.title ?? it.name, it.location ?? it.locationName),
  });
}

/** A stored plan's days (`{ day, activities: [{ name, time, duration, location }] }`). */
export function daysWithinFlightWindows<D extends Record<string, any>>(days: readonly D[], anchors: Anchors, startIso: string | Date | null | undefined): D[] {
  if (!anchors?.length || !startIso) return [...days];
  return days.map((d) => ({
    ...d,
    activities: Array.isArray(d.activities)
      ? withinFlightWindows(d.activities, anchors, startIso, {
          day: () => Number(d.day),
          time: (a: any) => a.time,
          duration: (a: any) => minutesOf(a.duration ?? a.durationMinutes),
          isTravelRow: (a: any) => isTravelRow(a.name ?? a.title, a.location ?? a.locationName),
        }).kept
      : d.activities,
  }));
}
