/**
 * Shared temporal engine for the Trip Card mobile command-center (CLAUDE.md §18).
 *
 * Extracted verbatim from ActivitiesSection.tsx so the "Up Next" hero (item 2) and the
 * per-row FAB/badges can share ONE computation of "what's next right now" — no divergent
 * copies of the same date math. Behavior is unchanged from the pre-extraction version;
 * this is a pure refactor (dedupe), not a logic change.
 */
import { useEffect, useState } from "react";
import type { PlanCardActivity, PlanCardDay } from "./plancard-types";
import type { InlineTransportLegData } from "@/components/itinerary/InlineTransportSelector";
import type { TraveloureMode } from "@/lib/navigate";

export type TemporalState = "past" | "upcoming" | "future";

export function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayIso(d: Date): string {
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

export function nowHHMM(d: Date): string {
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`;
}

export function parseActivityTime(timeStr: string, dateStr: string): Date | null {
  if (!timeStr || !dateStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const parts = dateStr.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], h, min, 0, 0);
}

export function computeTemporalStates(
  activities: PlanCardActivity[],
  dateStr: string,
  now: Date,
  visited: Set<string>,
): Record<string, TemporalState> {
  const out: Record<string, TemporalState> = {};
  let foundUpcoming = false;
  for (const act of activities) {
    if (visited.has(act.id)) {
      out[act.id] = "past";
      continue;
    }
    const t = parseActivityTime(act.time, dateStr);
    const end = t ? new Date(t.getTime() + 90 * 60_000) : null;
    if (end && now > end) {
      out[act.id] = "past";
    } else if (!foundUpcoming) {
      out[act.id] = "upcoming";
      foundUpcoming = true;
    } else {
      out[act.id] = "future";
    }
  }
  return out;
}

export const MODE_ALIASES: Record<string, TraveloureMode> = {
  walking: "walk",
  foot: "walk",
  pedestrian: "walk",
  cycling: "bicycle",
  biking: "bicycle",
  bike: "bicycle",
  car: "drive",
  auto: "drive",
  automobile: "drive",
  driving: "drive",
  bus: "transit",
  train: "transit",
  subway: "transit",
  metro: "transit",
  cab: "taxi",
  "ride-share": "rideshare",
  lyft: "rideshare",
  uber: "rideshare",
};

export function canonicalMode(raw: string): TraveloureMode {
  return (MODE_ALIASES[raw.toLowerCase()] as TraveloureMode) ?? (raw as TraveloureMode);
}

export function hasValidCoords(lat?: number, lng?: number): boolean {
  return (
    lat != null &&
    lng != null &&
    isFinite(lat) &&
    isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

/** Re-evaluates every 60s, matching the original ActivitiesSection interval. */
export function useLiveNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Per-trip/day/activity "marked visited" set, persisted to localStorage (unchanged
 *  storage key shape from the original ActivitiesSection implementation). */
export function useVisitedActivities(
  tripId: string,
  day: PlanCardDay | undefined,
): [Set<string>, (activityId: string) => void] {
  const [visited, setVisited] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!day?.dayNum || !day.activities) {
      setVisited(new Set());
      return;
    }
    const newVisited = new Set<string>();
    for (const a of day.activities) {
      const key = `traveloure_visited_${tripId}_${day.dayNum}_${a.id}`;
      try {
        if (localStorage.getItem(key) === "1") newVisited.add(a.id);
      } catch {}
    }
    setVisited(newVisited);
  }, [tripId, day?.dayNum]);

  const toggleVisited = (actId: string) => {
    setVisited((prev) => {
      const next = new Set(prev);
      const key = `traveloure_visited_${tripId}_${day!.dayNum}_${actId}`;
      try {
        if (next.has(actId)) {
          next.delete(actId);
          localStorage.removeItem(key);
        } else {
          next.add(actId);
          localStorage.setItem(key, "1");
        }
      } catch {}
      return next;
    });
  };

  return [visited, toggleVisited];
}

export interface UpNextInfo<TLeg extends InlineTransportLegData = InlineTransportLegData> {
  isLiveDay: boolean;
  states: Record<string, TemporalState>;
  upNextIndex: number;
  upNextActivity: PlanCardActivity | null;
  upNextLeg: TLeg | null;
  upNextMode: TraveloureMode;
  lastPastIndex: number;
  showNowLine: boolean;
}

/**
 * Single source of truth for "what's next right now" on a given day — shared by
 * ActivitiesSection (row states + FAB) and UpNextHero (the top-of-card summary).
 * Generic over the leg shape so a caller passing the richer PlanCardLegData (which
 * carries the mode-aware primary action's forward-compat booking fields) gets
 * `upNextLeg` typed with those fields intact, instead of widened to the base type.
 */
export function getUpNextInfo<TLeg extends InlineTransportLegData = InlineTransportLegData>(
  day: PlanCardDay | undefined,
  legs: TLeg[],
  now: Date,
  visited: Set<string>,
): UpNextInfo<TLeg> {
  const isLiveDay = !!day && day.date === todayIso(now);
  const activities = day?.activities ?? [];

  const states = isLiveDay
    ? computeTemporalStates(activities, day!.date, now, visited)
    : ({} as Record<string, TemporalState>);

  const upNextIndex = isLiveDay ? activities.findIndex((a) => states[a.id] === "upcoming") : -1;

  const lastPastIndex = isLiveDay
    ? activities.reduce((mx, a, i) => (states[a.id] === "past" ? i : mx), -1)
    : -1;

  const showNowLine = lastPastIndex >= 0 && upNextIndex > lastPastIndex;

  const upNextActivity = upNextIndex >= 0 ? activities[upNextIndex] : null;
  const upNextLeg = upNextIndex > 0 ? legs[upNextIndex - 1] ?? null : null;
  const upNextMode: TraveloureMode = canonicalMode(
    upNextLeg
      ? (upNextLeg.userSelectedMode || upNextLeg.recommendedMode || "walk")
      : "walk"
  );

  return { isLiveDay, states, upNextIndex, upNextActivity, upNextLeg, upNextMode, lastPastIndex, showNowLine };
}

/** Real countdown to a real startTime — "Now" once started/passed, else "In Xm"/"In Xh Ym". */
export function formatCountdown(activity: PlanCardActivity, dateStr: string, now: Date): string | null {
  const start = parseActivityTime(activity.time, dateStr);
  if (!start) return null;
  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 0) return "Now";
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `In ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `In ${h}h ${m}m` : `In ${h}h`;
}
