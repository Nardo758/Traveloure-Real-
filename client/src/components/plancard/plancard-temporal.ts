/**
 * Shared temporal engine for the Trip Card mobile command-center (CLAUDE.md §18).
 *
 * Extracted verbatim from ActivitiesSection.tsx so the "Up Next" hero (item 2) and the
 * per-row FAB/badges can share ONE computation of "what's next right now" — no divergent
 * copies of the same date math. Behavior is unchanged from the pre-extraction version;
 * this is a pure refactor (dedupe), not a logic change.
 */
import { useEffect, useState } from "react";
import type { PlanCardActivity, PlanCardDay, InlineTransportLegData } from "./plancard-types";
import { wallClockMinutes } from "@shared/leg-reachability";
import type { TraveloureMode } from "@/lib/navigate";
// Ledger `2026-09-07-trip-card-one-page`, reconciled onto lane L10's `shared/plan-timing.ts`
// (ledger `2026-09-07-home-time-axis`): ONE zone module, so `isUsableTimeZone` is the ONE answer
// to "may a zone-dependent claim be made about this plan" and `calendarDayOf` the ONE reading of
// "what day is it there". Neither is restated here (§18 rule 1).
import { calendarDayOf, isUsableTimeZone, zonedWallClockToInstant } from "@shared/plan-timing";
import { planInstantIsClaimable } from "@shared/plan-dates";
import {
  deriveLeaveBy,
  leaveByBuffer,
  leaveByConfig,
  leaveByHero,
  type LeaveByConfig,
  type LeaveByLeg,
  type LeaveByMode,
  type LeaveByRow,
  type LeaveByStop,
} from "@shared/leave-by";
import { routeProvenanceLabel } from "@shared/routing-engine";
import type { FactView } from "@shared/content-facts";
import { stopEntryLimit } from "@/lib/place-facts";

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
/**
 * R321 (S11-2): the stay is not a stop. A plan's stay is its `accommodation`-type item — the slip's own
 * test (`SlipView`, where-to-stay). It renders as the day's anchor ("Staying at …"), never in the stop
 * list and never as Up next.
 */
export function isStayActivity(a: Pick<PlanCardActivity, "type">): boolean {
  return a.type === "accommodation";
}

/** One hour, the now-line's margin either side of the day (R321 S11-3). */
const NOW_LINE_MARGIN_MS = 60 * 60 * 1000;

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
    } else if (!foundUpcoming && starts[i] != null && !isStayActivity(act)) {
      // R321 (S11-2): Up next is the next TIMED stop — never the stay, never an untimed row.
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
  /**
   * R321 (S11-3): where the now-line draws, as the index of the row it sits ABOVE (`activities.length`
   * = below the last row); null = no line. It draws whenever now is within [first stop's start − 1 h,
   * last stop's end + 1 h] on the live day: above the first stop before it starts, between stops
   * during, below the last after. Stays and untimed rows do not set the window.
   */
  nowLineIndex: number | null;
  /** = nowLineIndex !== null (kept for callers). */
  showNowLine: boolean;
  /**
   * 9b-c (LB1–LB9, ledger `2026-10-17-9b-c-leave-by`; replaces D7): "HH:MM" — the up-next stop's leave-by,
   * from `shared/leave-by.ts`, on the live day only. Null when the leg into it is unrouted, transit, an
   * ineligible mode, or an input is missing (§13 — never a guessed time).
   */
  leaveBy: string | null;
  /** 9b-c: one leave-by row per stop of the live day (stays excluded); empty off the live day. */
  leaveByRows: LeaveByRow[];
  /** 9b-c LB4: the hero's "LEAVE BY · NEXT" — the first leave-by strictly after now in the plan's zone; null when none. */
  heroLeaveBy: Extract<LeaveByRow, { kind: "leave_by" }> | null;
  /** 9b-c: now as minutes of the day in the plan's zone (the device's when no zone was captured); null off the live day. */
  nowMinute: number | null;
}

/**
 * Pure. 9b-c (Phase 0 ruling 3, sanctioned V1 edit): a stop's start minus the leg's minutes minus the mode's
 * buffer (walk 0, taxi 5 — config by name), rounded down to 5 (the planning tier), as "HH:MM". Any other mode,
 * an unknown input, or a time before midnight ⇒ null.
 */
export function leaveByTime(startTime: string | null | undefined, legMinutes: number | null | undefined, mode: string = "walk", config: LeaveByConfig = leaveByConfig()): string | null {
  const start = wallClockMinutes(startTime);
  const m = Number(legMinutes);
  if (start == null || !Number.isFinite(m) || m <= 0) return null;
  const buffer = leaveByBuffer({ mode: leaveByModeOf(mode), modeChosen: true }, config);
  if (buffer == null) return null;
  const t = Math.floor((start - Math.round(m) - buffer) / 5) * 5;
  if (t < 0) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** 9b-c: a stored mode spelling as a leave-by mode. */
export function leaveByModeOf(raw: string | null | undefined): LeaveByMode {
  const m = String(raw ?? "").toLowerCase().trim();
  if (m === "walk" || m === "walking") return "walk";
  if (m === "taxi" || m === "rideshare" || m === "ride_hail") return "taxi";
  if (m === "private_car" || m === "car" || m === "private car") return "private_car";
  if (m === "transit" || m === "train" || m === "bus" || m === "subway" || m === "metro" || m === "tram" || m === "rail") return "transit";
  if (m === "drive" || m === "driving") return "drive";
  if (m === "cycle" || m === "bike" || m === "cycling") return "cycle";
  return "other";
}

/** 9b-c: a card leg as the leave-by core reads it — routed (the engine's own answer), its mode and who chose it. */
export function leaveByLegOf(leg: any, timezone?: string | null): LeaveByLeg | null {
  if (!leg) return null;
  const minutes = Number(leg.estimatedDurationMinutes ?? leg.duration);
  const authorTaxi = typeof leg.authorTip === "string" && /\btaxi\b/i.test(leg.authorTip);
  const picked = leg.userSelectedMode ? leaveByModeOf(leg.userSelectedMode) : null;
  let mode = leaveByModeOf(leg.userSelectedMode ?? leg.recommendedMode ?? leg.mode ?? null);
  if (authorTaxi && (mode === "drive" || mode === "other")) mode = "taxi";
  const modeChosen = authorTaxi || picked === "taxi" || picked === "private_car";
  const routed = !!leg.routed && Number.isFinite(minutes) && minutes > 0;
  return {
    routed,
    durationMin: Number.isFinite(minutes) ? minutes : null,
    mode,
    modeChosen,
    provenanceLine: routed ? routeProvenanceLabel(leg.routed?.provenance ?? null, timezone ?? null) : null,
    live: leg.liveTier && Number(leg.liveTier.minutes) > 0 ? { minutes: Number(leg.liveTier.minutes), checkedLabel: String(leg.liveTier.checkedLabel ?? "") } : null,
  };
}

/** 9b-c: a stop's length in minutes — its own duration, else end − start; null when neither is known. */
function stopDuration(a: PlanCardActivity): number | null {
  const own = Number((a as any).durationMinutes);
  if (Number.isFinite(own) && own > 0) return own;
  const s = wallClockMinutes(a.time);
  const e = wallClockMinutes(a.endTime ?? null);
  return s != null && e != null && e > s ? e - s : null;
}

const located = (a: any) => Number.isFinite(Number(a?.lat)) && Number.isFinite(Number(a?.lng)) && a?.lat != null && a?.lng != null;

/**
 * 9b-c: the live day's leave-by rows — every stop (stays excluded), each with the leg INTO it (LB3b for stop 1).
 * LB9 (ledger `2026-10-18-lb8-lb9-card-wiring`): a stop's last entry, else its closing time, from `placeFacts`
 * through the ONE `stopEntryLimit` the slip's closing warning shares. LB8: the day's flight departures
 * (`day.anchorStops`) join the list at their buffered time, measured against it with no mode buffer; the leg into
 * one is the engine's airport leg, found by its end (it leaves the stay, else the day's last stop).
 */
export function leaveByRowsForDay(
  day: PlanCardDay | undefined,
  legs: readonly any[],
  timezone?: string | null,
  config?: LeaveByConfig,
  placeFacts?: Record<string, FactView[]> | null,
): LeaveByRow[] {
  const acts = day?.activities ?? [];
  const stay = acts.find((a) => isStayActivity(a)) ?? null;
  const stops = acts.filter((a) => !isStayActivity(a));
  const anchors = (day?.anchorStops ?? []).filter((a) => a && typeof a.id === "string");
  if (!stops.length && !anchors.length) return [];
  const dateIso = machineDay(day);
  const into = (stopId: string, fromId: string | null) =>
    legs.find((l) => (l?.toActivityId ?? l?.to) === stopId && (fromId == null || (l?.fromActivityId ?? l?.from) === fromId)) ?? null;
  type Entry = { stop: LeaveByStop; leg: LeaveByLeg | null; at: number | null; seq: number };
  const entries: Entry[] = stops.map((s, k) => ({
    stop: {
      id: s.id,
      name: s.name,
      start: s.time ?? null,
      durationMin: stopDuration(s),
      located: located(s),
      lastEntry: stopEntryLimit(placeFacts?.[s.id], dateIso, s.time ?? null),
    },
    leg: leaveByLegOf(k === 0 ? (stay ? into(s.id, stay.id) : null) : into(s.id, stops[k - 1].id), timezone),
    at: wallClockMinutes(s.time ?? null),
    seq: k,
  }));
  anchors.forEach((a, i) => {
    entries.push({
      stop: { id: a.id, name: a.name, start: null, durationMin: null, located: !!a.located, anchorBuffered: a.bufferedTime ?? null },
      leg: leaveByLegOf(into(a.id, null), timezone),
      at: wallClockMinutes(a.bufferedTime ?? null),
      seq: stops.length + i,
    });
  });
  // A departure sorts by its buffered time among the stops; an untimed one goes last (stable otherwise).
  if (anchors.length) entries.sort((x, y) => (x.at ?? Infinity) - (y.at ?? Infinity) || x.seq - y.seq);
  return deriveLeaveBy({
    stops: entries.map((e) => e.stop),
    legs: entries.map((e) => e.leg),
    stayLocated: !!stay && located(stay),
    config,
  });
}

/** 9b-c: now as minutes of the day in the plan's zone; the device's clock when no usable zone was captured. */
export function nowMinuteIn(now: Date, timezone?: string | null): number {
  if (isUsableTimeZone(timezone)) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone!, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return h * 60 + m;
  }
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Single source of truth for "what's next right now" on a given day — shared by
 * ActivitiesSection (row states + FAB) and UpNextHero (the top-of-card summary).
 * Generic over the leg shape so a caller passing the richer PlanCardLegData (which
 * carries the mode-aware primary action's forward-compat booking fields) gets
 * `upNextLeg` typed with those fields intact, instead of widened to the base type.
 */
/** R297: a plan day's machine date — `dateIso`, else `date` when it is already "YYYY-MM-DD". */
export function machineDay(day: { date?: string | null; dateIso?: string | null } | null | undefined): string | null {
  if (!day) return null;
  if (day.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(day.dateIso)) return day.dateIso;
  return day.date && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : null;
}

export function getUpNextInfo<TLeg extends InlineTransportLegData = InlineTransportLegData>(
  day: PlanCardDay | undefined,
  legs: TLeg[],
  now: Date,
  visited: Set<string>,
  /** `trips.timezone` — Locked Decision 30. NULL ⇒ the device's date/clock, stated in `parseActivityTime`. */
  timezone?: string | null,
  /** 9b-c LB9: the plancard's `placeFacts` (keyed by item id) — a stop's last entry or closing time. Absent ⇒ none. */
  placeFacts?: Record<string, FactView[]> | null,
): UpNextInfo<TLeg> {
  // "Today" is the plan's zone's today when a zone was captured; the DEVICE's otherwise — the
  // pre-existing behaviour, kept explicitly at the call site. (`calendarDayOf` answers UTC for an
  // unzoned plan, which is right for L10's calendar-date question and wrong for "is the traveler
  // looking at today's day list", so the fallback is chosen here rather than inside it.)
  const today = isUsableTimeZone(timezone) ? calendarDayOf(now, timezone) : todayIso(now);
  // R297: the day's MACHINE date. The plancard's `date` is its DISPLAY label ("Wed, Nov 11"), which
  // never equalled an ISO day — so no card day was ever "today" and neither the now-line nor the
  // Up-next panel could draw. `dateIso` first; `date` only for a producer that carries no ISO day.
  const dayIso = machineDay(day);
  const isLiveDay = !!day && dayIso === today;
  const activities = day?.activities ?? [];

  const states = isLiveDay
    ? computeTemporalStates(activities, dayIso!, now, visited, timezone)
    : ({} as Record<string, TemporalState>);

  const upNextIndex = isLiveDay ? activities.findIndex((a) => states[a.id] === "upcoming") : -1;

  const lastPastIndex = isLiveDay
    ? activities.reduce((mx, a, i) => (states[a.id] === "past" ? i : mx), -1)
    : -1;

  const nowLineIndex = isLiveDay ? nowLinePosition(activities, dayIso!, now, timezone) : null;
  const showNowLine = nowLineIndex !== null;

  const upNextActivity = upNextIndex >= 0 ? activities[upNextIndex] : null;
  const upNextLeg = upNextIndex > 0 ? legs[upNextIndex - 1] ?? null : null;
  const upNextMode: TraveloureMode = canonicalMode(
    upNextLeg
      ? (upNextLeg.userSelectedMode || upNextLeg.recommendedMode || "walk")
      : "walk"
  );

  // D7: the leg INTO the up-next stop, matched by its pair (the leg's `toActivityId`) where the leg
  // carries one, else the positional leg above.
  const intoLeg = upNextActivity
    ? ((legs as any[]).find((l) => l?.toActivityId === upNextActivity.id) ?? upNextLeg)
    : null;
  // 9b-c (LB1–LB9): every stop's row from the ONE core, on the live day only; the up-next stop's time is its row's.
  void intoLeg;
  const leaveByRows = isLiveDay ? leaveByRowsForDay(day, legs as any[], timezone, undefined, placeFacts) : [];
  const upNextRow = upNextActivity ? leaveByRows.find((r) => r.stopId === upNextActivity.id) : undefined;
  const leaveBy = upNextRow?.kind === "leave_by" ? upNextRow.time : null;
  const nowMinute = isLiveDay ? nowMinuteIn(now, timezone) : null;
  const heroLeaveBy = nowMinute != null ? leaveByHero(leaveByRows, nowMinute) : null;

  return { isLiveDay, states, upNextIndex, upNextActivity, upNextLeg, upNextMode, lastPastIndex, nowLineIndex, showNowLine, leaveBy, leaveByRows, heroLeaveBy, nowMinute };
}

/** Pure. R321 (S11-3): the now-line's position on a live day, or null outside the day's window. */
export function nowLinePosition(
  activities: readonly PlanCardActivity[],
  dateStr: string,
  now: Date,
  timezone?: string | null,
): number | null {
  const timed = activities
    .map((a, i) => {
      if (isStayActivity(a)) return null;
      const start = parseActivityTime(a.time, dateStr, timezone);
      if (!start) return null;
      const end = a.endTime ? parseActivityTime(a.endTime, dateStr, timezone) : null;
      return { i, start, end: end && end > start ? end : start };
    })
    .filter((x): x is { i: number; start: Date; end: Date } => x !== null);
  if (!timed.length) return null;
  const dayStart = timed[0].start.getTime();
  const dayEnd = Math.max(...timed.map((t) => t.end.getTime()));
  const t = now.getTime();
  if (t < dayStart - NOW_LINE_MARGIN_MS || t > dayEnd + NOW_LINE_MARGIN_MS) return null;
  // The line sits above the first stop not yet over. A stop with no end time of its own runs until
  // the next timed stop starts — the same reading `computeTemporalStates` takes of "past".
  const current = timed.find((x, k) => {
    const over = x.end > x.start ? x.end.getTime() : timed[k + 1]?.start.getTime() ?? x.start.getTime();
    return over > t;
  });
  return current ? current.i : activities.length;
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
  datesConfirmed: boolean = true,
): string | null {
  // TWO HALVES OF ONE FACT, ANSWERED IN ONE PLACE (`planInstantIsClaimable`, `shared/plan-dates.ts`,
  // §18 rule 1). A countdown is a claim about an INSTANT, and an instant needs a real ZONE (Locked
  // Decision 30) AND a real DAY (migration 302, ledger `2026-09-15-d22-dates-confirmed`). `dateStr`
  // is derived from `trips.start_date`, which is NOT NULL and is therefore filled in for a
  // ready-made clone and an authoring build whether or not anyone chose it — so with a zone alone,
  // "In 2h 15m" would count down, to the minute, to a day the fulfilment job picked.
  //
  // The parameter DEFAULTS TO TRUE, and that is a compatibility default rather than a claim: this
  // function's existing callers were written before the fact existed, and flipping every one of
  // them to "no countdown" on a silent default would remove the chip from confirmed plans too. The
  // caller that renders the chip passes the plan's own answer.
  if (!planInstantIsClaimable(isUsableTimeZone(timezone), datesConfirmed)) return null;
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
