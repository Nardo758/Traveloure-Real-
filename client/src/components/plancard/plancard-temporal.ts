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
// Ledger `2026-09-07-trip-card-one-page`, reconciled onto lane L10's `shared/plan-timing.ts`
// (ledger `2026-09-07-home-time-axis`): ONE zone module, so `isUsableTimeZone` is the ONE answer
// to "may a zone-dependent claim be made about this plan" and `calendarDayOf` the ONE reading of
// "what day is it there". Neither is restated here (§18 rule 1).
import { calendarDayOf, isUsableTimeZone, zonedWallClockToInstant } from "@shared/plan-timing";

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

/** "9:00 AM" / "09:00" / "21:15" → "HH:MM" (24h), or null for anything else. */
export function activityTimeToWallClock(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${padTwo(h)}:${padTwo(min)}`;
}

/**
 * The instant an activity's wall clock falls on.
 *
 * WITH a plan zone (`trips.timezone`, Locked Decision 30): the wall clock is read in THAT zone,
 * through the one shared derivation (`shared/plan-timing.ts`).
 * WITHOUT one (NULL = never captured): the DEVICE's local clock — the stated fallback, not a
 * claim about the plan. It keeps "Live today" and the row states working for a plan whose zone
 * is unknown; the COUNTDOWN is withheld separately (`formatCountdown`), because a countdown is a
 * claim about an instant and this fallback is not one.
 */
export function parseActivityTime(timeStr: string, dateStr: string, timezone?: string | null): Date | null {
  if (!timeStr || !dateStr) return null;
  const wall = activityTimeToWallClock(timeStr);
  if (!wall) return null;
  if (isUsableTimeZone(timezone)) return zonedWallClockToInstant(dateStr, wall, timezone);
  const parts = dateStr.split("-").map(Number);
  const [h, min] = wall.split(":").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], h, min, 0, 0);
}

/**
 * Row states for the live day.
 *
 * Ledger `2026-09-07-trip-card-one-page` (brief §7 "New · timezone"): the "90 minutes per item"
 * assumption is GONE. An item is past when it was marked visited, when its OWN `endTime` has
 * passed, or — for an item with no end time — when a LATER item on the same day has already
 * STARTED (the successor's real start bounds it; no duration is invented). An item with no end
 * time and no started successor stays "upcoming" until the traveler marks it, which is the
 * honest reading of a row that never said how long it runs (§13).
 */
export function computeTemporalStates(
  activities: PlanCardActivity[],
  dateStr: string,
  now: Date,
  visited: Set<string>,
  timezone?: string | null,
): Record<string, TemporalState> {
  const out: Record<string, TemporalState> = {};
  let foundUpcoming = false;
  const starts = activities.map((a) => parseActivityTime(a.time, dateStr, timezone));
  for (let i = 0; i < activities.length; i++) {
    const act = activities[i];
    if (visited.has(act.id)) {
      out[act.id] = "past";
      continue;
    }
    const end = act.endTime ? parseActivityTime(act.endTime, dateStr, timezone) : null;
    const endedByOwnClock = !!end && now > end;
    const laterHasStarted =
      !end && starts.slice(i + 1).some((s) => s != null && now >= s);
    if (endedByOwnClock || laterHasStarted) {
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
  /** `trips.timezone` — Locked Decision 30. NULL ⇒ the device's date/clock, stated in `parseActivityTime`. */
  timezone?: string | null,
): UpNextInfo<TLeg> {
  // "Today" is the plan's zone's today when a zone was captured; the DEVICE's otherwise — the
  // pre-existing behaviour, kept explicitly at the call site. (`calendarDayOf` answers UTC for an
  // unzoned plan, which is right for L10's calendar-date question and wrong for "is the traveler
  // looking at today's day list", so the fallback is chosen here rather than inside it.)
  const today = isUsableTimeZone(timezone) ? calendarDayOf(now, timezone) : todayIso(now);
  const isLiveDay = !!day && day.date === today;
  const activities = day?.activities ?? [];

  const states = isLiveDay
    ? computeTemporalStates(activities, day!.date, now, visited, timezone)
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

/**
 * Real countdown to a real startTime — "Now" once started/passed, else "In Xm"/"In Xh Ym".
 *
 * RENDERS ONLY WHEN THE PLAN CARRIES A TIMEZONE (Locked Decision 30; ledger
 * `2026-09-07-trip-card-one-page`). A countdown is a claim about an instant, and a plan whose zone
 * was never captured has no instant to count to — the device clock presented as the plan's would
 * be wrong by whole hours and look authoritative. NULL ⇒ the caller shows the time and no countdown.
 */
export function formatCountdown(
  activity: PlanCardActivity,
  dateStr: string,
  now: Date,
  timezone: string | null | undefined,
): string | null {
  if (!isUsableTimeZone(timezone)) return null;
  const start = parseActivityTime(activity.time, dateStr, timezone);
  if (!start) return null;
  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 0) return "Now";
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `In ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `In ${h}h ${m}m` : `In ${h}h`;
}
