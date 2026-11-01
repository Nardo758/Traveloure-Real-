/**
 * 9b-c — LEAVE-BY on the Trip Card's today view (9b spec v1.0 §2–§3, LB1–LB9; Phase 0 ruling 3: replaces D7's
 * `leaveByTime`; ledger `2026-10-17-9b-c-leave-by`). Pure: no I/O, no clock of its own — the caller passes the
 * minute of day in the PLAN's zone, so "now" is never the device's (LB4).
 *
 *   leave_by(k) = start(k) − duration(leg into k) − buffer(mode)          (LB1: derived at read, never stored)
 *
 * The rules, in the order a row is decided:
 *   LB3   no leave-by — and the row says why — when the stop is not on the map, the leg into it is transit, or
 *         the leg is unrouted; other missing inputs (no start, an ineligible mode) draw no time and no line.
 *   LB3b  the stay is stop 0 only with coordinates AND a routed leg to stop 1.
 *   LB8   a flight or timed entry measures against its R-i buffered time; only that buffer applies.
 *   LB9   where a last-entry time is known (else closing time) and the stop starts after it, the leave-by
 *         measures against it and says "Last entry 4:30 PM".
 *   LB3a  end(k−1) = start(k−1) + its duration; unknown ⇒ no leave-by; end(k−1) > leave_by(k) ⇒ the conflict line.
 *   LB2   a planning-tier time is rounded DOWN to 5 minutes ("leave by about 10:10 · <provenance>"); a live-tier
 *         time is exact ("leave by 10:14 · checked today 9:40 AM").
 *   LB4   the hero is the first leave-by strictly after now; before the first stop it is stop 1's; after the
 *         last it is omitted. LB5: a missed row is struck with "missed · next: HH:MM"; the hero never shows one.
 *   LB6   "TRAVEL · PLANNED" sums routed legs only, labelled "routed legs only" when any leg that day is unrouted.
 *
 * Buffers and thresholds are CONFIG BY NAME (§3), never literals at a call site: `LEAVE_BY_CONFIG_DEFAULTS`
 * holds the ruled defaults and `leaveByConfig()` merges any setting the server sends; an absent setting is the
 * default.
 */

export const LEAVE_BY_CONFIG_DEFAULTS = {
  leave_by_buffer_walk_min: 0,
  leave_by_buffer_taxi_min: 5,
  live_link_min_walk_m: 1200,
  routing_recheck_max_per_plan_day: 1,
} as const;
export type LeaveByConfigName = keyof typeof LEAVE_BY_CONFIG_DEFAULTS;
export type LeaveByConfig = Record<LeaveByConfigName, number>;

/** The ruled defaults with any provided setting over them; a missing or non-finite setting keeps its default. */
export function leaveByConfig(over?: Partial<Record<string, unknown>> | null): LeaveByConfig {
  const out = { ...LEAVE_BY_CONFIG_DEFAULTS } as LeaveByConfig;
  for (const k of Object.keys(out) as LeaveByConfigName[]) {
    const v = Number(over?.[k]);
    if (over && over[k] != null && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** The ONE closing string set, shared with the slip (P0-e). */
export const LEAVE_BY_COPY = {
  needsRoutedLeg: "Leave-by needs a routed leg",
  needsRoutedLegDoor: "Add drive and walk times",
  transit: "Transit times in Google Maps",
  notOnMap: "Not on the map yet — no travel time for this stop",
  heroLabel: "LEAVE BY · NEXT",
  travelPlannedLabel: "TRAVEL · PLANNED",
  routedOnly: "routed legs only",
} as const;

export type LeaveByMode = "walk" | "taxi" | "private_car" | "drive" | "transit" | "cycle" | "other";

/** A stored mode spelling as a leave-by mode. One mapping — the card's leg reader uses this. */
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

/**
 * Which mode a stored leg is, and whether the traveler (or an author taxi tip) chose it.
 * Walk's buffer does not depend on `modeChosen`; taxi and private car do.
 */
export function leaveByModeDecision(leg: {
  userSelectedMode?: string | null;
  recommendedMode?: string | null;
  mode?: string | null;
  authorTip?: string | null;
}): { mode: LeaveByMode; modeChosen: boolean } {
  const authorTaxi = typeof leg.authorTip === "string" && /\btaxi\b/i.test(leg.authorTip);
  const picked = leg.userSelectedMode ? leaveByModeOf(leg.userSelectedMode) : null;
  let mode = leaveByModeOf(leg.userSelectedMode ?? leg.recommendedMode ?? leg.mode ?? null);
  if (authorTaxi && (mode === "drive" || mode === "other")) mode = "taxi";
  const modeChosen = authorTaxi || picked === "taxi" || picked === "private_car";
  return { mode, modeChosen };
}

export interface LeaveByStop {
  id: string;
  name: string;
  /** Wall clock in the plan's zone ("HH:MM" or "h:mm AM"); null = no start time. */
  start: string | null;
  /** Minutes the stop lasts; null = unknown (LB3a: its end is then unknown). */
  durationMin: number | null;
  located: boolean;
  /** LB8: a flight or timed entry's R-i buffered time — measured against INSTEAD of `start`, with no mode buffer. */
  anchorBuffered?: string | null;
  /** LB9: a last-entry time, else closing time (`kind` says which). */
  lastEntry?: { time: string; kind: "last_entry" | "closing" } | null;
}

export interface LeaveByLeg {
  /** Routed = the engine wrote it (`source` set) with real minutes. A dashed "est." leg is unrouted. */
  routed: boolean;
  durationMin: number | null;
  mode: LeaveByMode;
  /** The traveler chose the mode, or the author's pick names it (`author_tip` taxi, `user_selected_mode` taxi). */
  modeChosen: boolean;
  /** Planning tier's provenance, e.g. "© OpenStreetMap contributors · checked 12 Oct". */
  provenanceLine: string | null;
  /** Live tier (9b-d): today's re-checked minutes and when. */
  live?: { minutes: number; checkedLabel: string } | null;
}

export type LeaveByReason = "not_on_map" | "transit" | "needs_routed_leg" | "missing_input" | "ineligible_mode";

export type LeaveByRow =
  | { kind: "leave_by"; stopId: string; minute: number; time: string; tier: "planning" | "live"; line: string; anchor: boolean; lastEntryNote: string | null }
  | { kind: "none"; stopId: string; reason: LeaveByReason; line: string | null }
  | { kind: "conflict"; stopId: string; line: string; anchor: boolean };

export function wallClockToMinute(text: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\s*$/i.exec(String(text ?? ""));
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const mer = m[3]?.toUpperCase();
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === "AM" && h === 12) h = 0;
    if (mer === "PM" && h !== 12) h += 12;
  }
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? h * 60 + mi : null;
}

export function minuteToClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function minuteTo12h(minute: number): string {
  const h = Math.floor(minute / 60);
  const mi = minute % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The mode buffer (§3, B1): walk and a chosen taxi/private car only; null = no leave-by for this mode. */
export function leaveByBuffer(leg: Pick<LeaveByLeg, "mode" | "modeChosen">, config: LeaveByConfig): number | null {
  if (leg.mode === "walk") return config.leave_by_buffer_walk_min;
  if ((leg.mode === "taxi" || leg.mode === "private_car") && leg.modeChosen) return config.leave_by_buffer_taxi_min;
  return null;
}

/**
 * One row per stop of the day. `legs[i]` is the leg INTO `stops[i]`; `legs[0]` is the stay → stop 1 leg when the
 * stay qualifies (LB3b), else null. `stayLocated` = the stay has coordinates.
 */
export function deriveLeaveBy(input: {
  stops: readonly LeaveByStop[];
  legs: readonly (LeaveByLeg | null)[];
  stayLocated: boolean;
  config?: LeaveByConfig;
}): LeaveByRow[] {
  const config = input.config ?? leaveByConfig();
  return input.stops.map((stop, k): LeaveByRow => {
    if (!stop.located) return { kind: "none", stopId: stop.id, reason: "not_on_map", line: LEAVE_BY_COPY.notOnMap };
    const leg = input.legs[k] ?? null;
    if (k === 0 && !input.stayLocated) return { kind: "none", stopId: stop.id, reason: "needs_routed_leg", line: LEAVE_BY_COPY.needsRoutedLeg };
    if (leg?.mode === "transit") return { kind: "none", stopId: stop.id, reason: "transit", line: LEAVE_BY_COPY.transit };
    if (!leg || !leg.routed) return { kind: "none", stopId: stop.id, reason: "needs_routed_leg", line: LEAVE_BY_COPY.needsRoutedLeg };
    const anchor = stop.anchorBuffered != null;
    let target = wallClockToMinute(anchor ? stop.anchorBuffered : stop.start);
    if (target == null) return { kind: "none", stopId: stop.id, reason: "missing_input", line: null };
    let lastEntryNote: string | null = null;
    const lastEntry = stop.lastEntry ? wallClockToMinute(stop.lastEntry.time) : null;
    if (!anchor && lastEntry != null && target > lastEntry) {
      target = lastEntry;
      lastEntryNote = `${stop.lastEntry!.kind === "last_entry" ? "Last entry" : "Closes"} ${minuteTo12h(lastEntry)}`;
    }
    const live = leg.live && Number.isFinite(leg.live.minutes) && leg.live.minutes > 0 ? leg.live : null;
    const minutes = live ? live.minutes : Number(leg.durationMin);
    if (!Number.isFinite(minutes) || minutes <= 0) return { kind: "none", stopId: stop.id, reason: "missing_input", line: null };
    const buffer = anchor ? 0 : leaveByBuffer(leg, config);
    if (buffer == null) return { kind: "none", stopId: stop.id, reason: "ineligible_mode", line: null };
    let at = target - Math.round(minutes) - buffer;
    if (at < 0) return { kind: "none", stopId: stop.id, reason: "missing_input", line: null };
    if (!live) at = Math.floor(at / 5) * 5;
    if (k > 0) {
      const prev = input.stops[k - 1];
      const prevStart = wallClockToMinute(prev.start);
      if (prevStart == null || prev.durationMin == null || !Number.isFinite(prev.durationMin)) {
        return { kind: "none", stopId: stop.id, reason: "missing_input", line: null };
      }
      if (prevStart + prev.durationMin > at) {
        return { kind: "conflict", stopId: stop.id, line: `Not enough time to get here from ${prev.name}`, anchor };
      }
    }
    const time = minuteToClock(at);
    const tail = live ? `checked today ${live.checkedLabel}` : leg.provenanceLine;
    const line = `${live ? "leave by" : "leave by about"} ${time}${tail ? ` · ${tail}` : ""}${lastEntryNote ? ` · ${lastEntryNote}` : ""}`;
    return { kind: "leave_by", stopId: stop.id, minute: at, time, tier: live ? "live" : "planning", line, anchor, lastEntryNote };
  });
}

/** LB4: the first leave-by strictly after now (minute of day, plan zone); null when none is left. */
export function leaveByHero(rows: readonly LeaveByRow[], nowMinute: number): Extract<LeaveByRow, { kind: "leave_by" }> | null {
  for (const r of rows) if (r.kind === "leave_by" && r.minute > nowMinute) return r;
  return null;
}

/** LB5: a planning or live leave-by already passed. An anchor's missed leave-by is a conflict banner instead. */
export function leaveByMissed(row: LeaveByRow, nowMinute: number): boolean {
  return row.kind === "leave_by" && row.minute <= nowMinute;
}

/** LB5's struck-row note: "missed · next: HH:MM", or "missed" when nothing later is left. */
export function missedLine(rows: readonly LeaveByRow[], nowMinute: number): string {
  const next = leaveByHero(rows, nowMinute);
  return next ? `missed · next: ${next.time}` : "missed";
}

/** LB8: an anchor whose leave-by has passed reads as a conflict banner, never a soft strike. */
export function anchorMissedBanner(row: LeaveByRow, nowMinute: number, stopName: string): string | null {
  return row.kind === "leave_by" && row.anchor && row.minute <= nowMinute ? `You may miss ${stopName} — the time to leave has passed` : null;
}

/** LB6: the day's planned travel — routed legs only; null when no leg is routed. */
export function travelPlanned(legs: readonly (LeaveByLeg | null)[]): { minutes: number; routedOnly: boolean } | null {
  const present = legs.filter((l): l is LeaveByLeg => !!l);
  const routed = present.filter((l) => l.routed && Number.isFinite(Number(l.durationMin)) && Number(l.durationMin) > 0);
  if (!routed.length) return null;
  return { minutes: routed.reduce((s, l) => s + Math.round(Number(l.durationMin)), 0), routedOnly: routed.length < present.length };
}
