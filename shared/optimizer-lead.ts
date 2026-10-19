/**
 * WHAT OPTIMIZE FOUND IN THIS DRAFT (surface step 4, spec v1.2 §8; rulings R-f, R-l, R-v; ledger
 * `2026-10-03-surface-step4-optimizer-lead`). Pure — the free preview's findings, computed from what
 * the plan already holds: its draft times, its stored opening-hours facts, its anchors, its stops'
 * coordinates and its energy rows. No model call, no network, no secret.
 *
 * R-f: a finding is a KIND and a COUNT (and the days it was seen on) — never the re-sequenced order a
 * paid run would produce. Every distance is straight-line and labelled "est."; nothing here prices
 * anything. Zero findings is an answer ("this draft already works"), never a reason to invent one.
 */
import { haversineMeters } from "./geo";
import { anchorWallClockMs } from "./anchor-time";
import { LEAVE_BY_COPY } from "./leave-by";

/**
 * `leg_unreachable` (Slice A2, ledger `2026-10-05-reachability-from-legs`): a stop the plan's OWN leg
 * cannot reach in time — `unreachableStops` in `shared/leg-reachability.ts`, the one reachability rule.
 */
export type FindingKind =
  | "leg_unreachable"
  | "closed_on_arrival"
  // FD-3 (ledger `2026-10-10-fd3-feasibility`, rulings 1/3/6): two checks against stored OFFICIAL facts and
  // the visit's own end — can you still get in, will you be put out — and the last ride back.
  | "after_last_admission"
  | "closes_before_visit_end"
  | "last_service_missed"
  | "timed_entry_conflict"
  | "city_crossing"
  | "walking_saved_km"
  | "pace_over";

export interface Finding {
  kind: FindingKind;
  /** Stops, conflicts or days — or, for `walking_saved_km`, whole kilometres. */
  count: number;
  days: number[];
  /** Straight-line figures say so. */
  est?: true;
  /** R-v: hours read more than 14 days before the trip carry this. */
  caveat?: string;
  /** FD-3: `last_service_missed` only — a counted ride was inferred (no stored leg); the line hedges. */
  inferred?: true;
  /**
   * S12-4: the stops a finding counts, by name and day, so a card can name them — `leg_unreachable`, and
   * (P0-e item 2) the three hours findings, which also carry WHY and the time that tripped it.
   */
  stops?: Array<{ itemId: string; title: string; day: number; reason?: HoursStopReason; atMin?: number; startMin?: number; /** FB-1 step 5b: `closed_date` only — the stop's own date. */ dateIso?: string }>;
  /**
   * Step 9b (L9 as amended, ledger `2026-10-07-step9b-optimizer-and-rechecks`): present ONLY on a
   * finding that reads leg durations (`leg_unreachable`) — true when every leg it counts was routed.
   * `city_crossing` and `walking_saved_km` never read a duration and never carry it; they stay "est.".
   */
  routed?: boolean;
}

/** Problems first, then gains — the order the card reads them in (spec §8). */
export const FINDING_ORDER: readonly FindingKind[] = [
  "leg_unreachable",
  "closed_on_arrival",
  "after_last_admission",
  "closes_before_visit_end",
  "last_service_missed",
  "timed_entry_conflict",
  "city_crossing",
  "walking_saved_km",
  "pace_over",
];
export const MAX_FINDINGS = 3;

/** R-v: hours older than this, relative to the trip's first day, still count — with the caveat. */
export const HOURS_STALE_DAYS = 14;
export const HOURS_CAVEAT = "based on current hours · re-checked 3 days before your trip";

/** A day "crosses the city" when it reverses direction more than this many times. */
export const CITY_CROSSING_REVERSALS = 1;
/** A move counts toward a reversal only when it is at least this long (straight line) — not jitter. */
export const CITY_CROSSING_MIN_LEG_M = 1500;
/** Walking saved is shown only from this many kilometres (est.). */
export const WALKING_SAVED_MIN_KM = 1;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── a. closed_on_arrival ───────────────────────────────────────────────────────────────────────

function minutesOf(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? h * 60 + mi : null;
}

/** "9:00 AM" / "9:00" (meridiem inherited) → minutes after midnight. */
function clock(text: string, meridiem: "AM" | "PM" | null): { min: number; meridiem: "AM" | "PM" | null } | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] ?? "0");
  const mer = (m[3]?.toUpperCase() as "AM" | "PM" | undefined) ?? meridiem;
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return { min: h * 60 + mi, meridiem: mer ?? null };
}

export type DayHours = { kind: "closed" } | { kind: "open24" } | { kind: "ranges"; ranges: Array<[number, number]> };

/**
 * Pure. Google's `weekdayDescriptions` line for one weekday → the day's hours, or null when the line
 * is absent or unreadable (§13 — an unreadable line is no finding, never a guessed closing time).
 * Handles "Closed", "Open 24 hours", Google's narrow spaces and dashes, several ranges, and a first
 * time that inherits the second's AM/PM ("5:00 – 9:00 PM" — Google omits it only when both share it).
 */
export function parseDayHours(descriptions: readonly string[] | null | undefined, weekday: number): DayHours | null {
  const line = (descriptions ?? []).find((d) => d.normalize("NFKC").trim().startsWith(`${WEEKDAYS[weekday]}:`));
  if (!line) return null;
  const body = line.normalize("NFKC").replace(/[   ]/g, " ").slice(line.indexOf(":") + 1).trim();
  if (/^closed$/i.test(body)) return { kind: "closed" };
  if (/open 24 hours/i.test(body)) return { kind: "open24" };
  const ranges: Array<[number, number]> = [];
  for (const part of body.split(",")) {
    const [a, b] = part.split(/[–—-]/).map((x) => x.trim());
    if (!a || !b) return null;
    const end = clock(b, null);
    const start = clock(a, /AM|PM/i.test(a) ? null : end?.meridiem ?? null);
    if (!start || !end) return null;
    ranges.push([start.min, end.min <= start.min ? end.min + 24 * 60 : end.min]);
  }
  return ranges.length ? { kind: "ranges", ranges } : null;
}

/** P0-e item 2: why an hours finding counts a stop. */
export type HoursStopReason = "before_opening" | "after_closing" | "closed_day" | "closed_date" | "closes_early" | "after_last_entry";

export interface TimedItem {
  id: string;
  /** The stop's own title — named on the finding (P0-e item 2); absent ⇒ "This stop". */
  title?: string;
  dayNumber: number;
  /** The plan day's calendar date, YYYY-MM-DD. */
  dateIso: string | null;
  startTime: string | null;
}

export interface HoursFact {
  weekdayDescriptions: readonly string[];
  /** When the hours were read; null = not recorded (treated as not fresh — the caveat applies). */
  checkedAt: string | null;
  /** A hard closure (a "Closed" day) counts only from an official seasonal source (R-p). */
  official?: boolean;
}

/**
 * a. A stop the draft reaches before it opens or at/after it closes, on that date's weekday. A whole
 * "Closed" day is a HARD closure, which counts only from an official seasonal source (R-p) — from
 * Places it is omitted. R-v: hours read more than 14 days before the trip's first day still count,
 * and the finding then carries the caveat.
 */
/** Pure. A stop reached outside every range: before the next opening that day, else after the last close. */
function shutReason(ranges: ReadonlyArray<[number, number]>, at: number): { reason: HoursStopReason; atMin: number } {
  const next = ranges.filter(([s]) => s > at).sort((x, y) => x[0] - y[0])[0];
  if (next) return { reason: "before_opening", atMin: next[0] };
  const ended = ranges.filter(([, e]) => e <= at).sort((x, y) => y[1] - x[1])[0] ?? ranges[ranges.length - 1];
  return { reason: "after_closing", atMin: ended[1] };
}

export function closedOnArrival(items: readonly TimedItem[], hours: ReadonlyMap<string, HoursFact>, tripStartIso: string | null): Finding | null {
  const days = new Set<number>();
  const stops: NonNullable<Finding["stops"]> = [];
  let count = 0;
  let stale = false;
  const tripStart = tripStartIso ? Date.parse(`${tripStartIso}T00:00:00Z`) : NaN;
  for (const it of items) {
    const fact = hours.get(it.id);
    const at = minutesOf(it.startTime);
    if (!fact || at === null || !it.dateIso) continue;
    const weekday = new Date(`${it.dateIso}T00:00:00Z`).getUTCDay();
    const h = parseDayHours(fact.weekdayDescriptions, weekday);
    if (!h || h.kind === "open24") continue;
    let stop: { reason: HoursStopReason; atMin?: number } | null;
    if (h.kind === "closed") {
      if (!fact.official) continue; // R-p: a hard closure needs an official seasonal source
      stop = { reason: "closed_day" };
    } else {
      stop = h.ranges.some(([s, e]) => at >= s && at < e) ? null : shutReason(h.ranges, at);
    }
    if (!stop) continue;
    count += 1;
    days.add(it.dayNumber);
    stops.push({ itemId: it.id, title: it.title ?? "This stop", day: it.dayNumber, ...stop, startMin: at });
    const checked = fact.checkedAt ? Date.parse(fact.checkedAt) : NaN;
    if (!Number.isFinite(checked) || !Number.isFinite(tripStart) || tripStart - checked > HOURS_STALE_DAYS * 86_400_000) stale = true;
  }
  if (!count) return null;
  return { kind: "closed_on_arrival", count, days: Array.from(days).sort((x, y) => x - y), stops, ...(stale ? { caveat: HOURS_CAVEAT } : {}) };
}

// ── a2. FD-3: the visit's own end, the last entry and the last ride (ledger `2026-10-10-fd3-feasibility`) ──

/** A stop's start and the minute its visit ends: its own end time, else start + its planned duration. */
export interface VisitItem extends TimedItem {
  endTime?: string | null;
  durationMinutes?: number | null;
}

/** Pure. The visit's end minute (may pass midnight), or null when neither an end time nor a duration is stated (§13). */
export function visitEndMinutes(it: VisitItem): number | null {
  const start = minutesOf(it.startTime);
  if (start === null) return null;
  const end = minutesOf(it.endTime ?? null);
  if (end !== null) return end <= start ? end + 24 * 60 : end;
  const d = it.durationMinutes;
  return d != null && Number.isFinite(d) && d > 0 ? start + Math.round(d) : null;
}

/**
 * Ruling 6, check 2 — "will you be put out": a stop open when the visit starts whose opening range ends
 * before the visit does. A stop already closed on arrival is `closed_on_arrival`'s, never counted twice.
 * Same hours facts, same stale caveat (R-v).
 */
export function closesBeforeVisitEnd(items: readonly VisitItem[], hours: ReadonlyMap<string, HoursFact>, tripStartIso: string | null): Finding | null {
  const days = new Set<number>();
  const stops: NonNullable<Finding["stops"]> = [];
  let count = 0;
  let stale = false;
  const tripStart = tripStartIso ? Date.parse(`${tripStartIso}T00:00:00Z`) : NaN;
  for (const it of items) {
    const fact = hours.get(it.id);
    const at = minutesOf(it.startTime);
    const end = visitEndMinutes(it);
    if (!fact || at === null || end === null || !it.dateIso) continue;
    const h = parseDayHours(fact.weekdayDescriptions, new Date(`${it.dateIso}T00:00:00Z`).getUTCDay());
    if (!h || h.kind !== "ranges") continue;
    const range = h.ranges.find(([s, e]) => at >= s && at < e);
    if (!range || end <= range[1]) continue;
    count += 1;
    days.add(it.dayNumber);
    stops.push({ itemId: it.id, title: it.title ?? "This stop", day: it.dayNumber, reason: "closes_early", atMin: range[1], startMin: at });
    const checked = fact.checkedAt ? Date.parse(fact.checkedAt) : NaN;
    if (!Number.isFinite(checked) || !Number.isFinite(tripStart) || tripStart - checked > HOURS_STALE_DAYS * 86_400_000) stale = true;
  }
  if (!count) return null;
  return { kind: "closes_before_visit_end", count, days: Array.from(days).sort((x, y) => x - y), stops, ...(stale ? { caveat: HOURS_CAVEAT } : {}) };
}

/**
 * Ruling 6, check 1 — "can you still get in": a stop whose ARRIVAL is after the last entry stated for that
 * date by a stored official `last_admission` fact. The minute is resolved by the caller from the fact
 * (`lastAdmissionMinutes`, shared/feasibility-facts.ts); a stop with none is unchecked, never "fine".
 */
export function afterLastAdmission(items: readonly TimedItem[], lastEntry: ReadonlyMap<string, number>): Finding | null {
  const days = new Set<number>();
  const stops: NonNullable<Finding["stops"]> = [];
  let count = 0;
  for (const it of items) {
    const limit = lastEntry.get(it.id);
    const at = minutesOf(it.startTime);
    if (limit == null || at === null) continue;
    if (at <= limit) continue;
    count += 1;
    days.add(it.dayNumber);
    stops.push({ itemId: it.id, title: it.title ?? "This stop", day: it.dayNumber, reason: "after_last_entry", atMin: limit, startMin: at });
  }
  return count ? { kind: "after_last_admission", count, days: Array.from(days).sort((x, y) => x - y), stops } : null;
}

/** One transit ride the plan takes, with its departure on the service day and the last departures that apply. */
export interface RideCheck {
  dayNumber: number;
  /** Minutes on the service day (a ride after midnight is past 24:00). */
  departMin: number;
  /** The applicable last departures (`lastServiceMinutes`) at a station by the ride's start. Empty ⇒ unchecked. */
  lastDepartures: readonly number[];
  /**
   * The ride was INFERRED by the engine's default-mode rule (no stored leg for the pair). A finding that counts
   * any inferred ride carries `inferred` and reads hedged ("may leave"); a stored leg keeps the plain form.
   */
  inferred?: boolean;
}

/**
 * Ruling 3, with the review's decision rule: every stored last departure within 1.2 km of the ride's start is
 * considered. None stored ⇒ not checked (no finding). Any still running at departure ⇒ no finding. Only when ALL
 * have passed ⇒ the ride counts. Coverage depends on which operators are registered, so this under-reports until
 * every operator in the market is.
 */
export function lastServiceMissed(rides: readonly RideCheck[]): Finding | null {
  const days = new Set<number>();
  let count = 0;
  let inferred = false;
  for (const r of rides) {
    if (!r.lastDepartures.length) continue;
    if (r.lastDepartures.some((m) => r.departMin <= m)) continue;
    count += 1;
    days.add(r.dayNumber);
    if (r.inferred) inferred = true;
  }
  return count ? { kind: "last_service_missed", count, days: Array.from(days).sort((x, y) => x - y), ...(inferred ? { inferred: true as const } : {}) } : null;
}

// ── b. timed_entry_conflict (the ONE overlap rule, shared with validate-schedule) ───────────────

export interface AnchorWindow {
  id: string;
  anchorType: string;
  anchorDatetime: string | Date;
  bufferBefore?: number | null;
  bufferAfter?: number | null;
  description?: string | null;
}

export interface ScheduledItem {
  title?: string | null;
  dayNumber?: number | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
}

/**
 * ONE frame for the overlap rule (R315, ledger `2026-10-05-anchor-overlap-wall-clock`). An anchor's
 * `anchor_datetime` is a plain timestamp holding the plan's WALL-CLOCK (R-aa writes "YYYY-MM-DDTHH:MM:00";
 * `anchorWallTime` reads it back the same way), and drizzle hands it over as a Date whose UTC parts ARE
 * that wall-clock. An item's `date` + `startTime` are wall-clock strings too (LD 30). So both sides are
 * read as UTC-naive milliseconds: a zone-less string is read as UTC, never in the server's own zone —
 * which is what made the rule depend on the machine's TZ (an item at 13:00 against a 14:00 take-off
 * passed on a Tokyo or US server and failed only on a UTC one). The anchor side is read by the ONE
 * convention module, `anchorWallClockMs` in `./anchor-time` (R316); the item side below.
 */

/** An item's wall-clock instant on its own date ("HH:MM" or "HH:MM:SS"); NaN when either is missing. */
function itemWallClockMs(date: string | null | undefined, time: string | null | undefined): number {
  const d = /^\d{4}-\d{2}-\d{2}/.exec(String(date ?? ""))?.[0];
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time ?? "").trim());
  if (!d || !t) return NaN;
  return Date.parse(`${d}T${t[1].padStart(2, "0")}:${t[2]}:${t[3] ?? "00"}Z`);
}

/**
 * Pure. Items overlapping an anchor's buffer window — THE rule `POST /api/trips/:tripId/validate-schedule`
 * applies (moved here so the preview and that route read one implementation, §18 rule 1). Anchor and
 * item are compared in ONE wall-clock frame (`anchorWallClockMs`), whatever the server's TZ; an item with no
 * time, no date or an unreadable one is not checked.
 */
export function anchorConflicts(anchors: readonly AnchorWindow[], items: readonly ScheduledItem[]): Array<{ anchorId: string; anchorType: string; conflict: string; dayNumber: number | null }> {
  const out: Array<{ anchorId: string; anchorType: string; conflict: string; dayNumber: number | null }> = [];
  for (const anchor of anchors) {
    const anchorTime = anchorWallClockMs(anchor.anchorDatetime);
    if (!Number.isFinite(anchorTime)) continue;
    const bufferStart = anchorTime - (anchor.bufferBefore || 0) * 60000;
    const bufferEnd = anchorTime + (anchor.bufferAfter || 0) * 60000;
    for (const item of items) {
      if (!item.startTime || !item.dayNumber) continue;
      const itemStart = itemWallClockMs(item.date, item.startTime);
      if (!Number.isFinite(itemStart)) continue;
      const end = item.endTime ? itemWallClockMs(item.date, item.endTime) : NaN;
      const itemEnd = Number.isFinite(end) ? end : itemStart + (item.durationMinutes || 60) * 60000;
      // A flight is a one-way edge, not only a window (R-aa, step 6): nothing may start before you are
      // out of the arrival airport, and nothing may run past the time to leave for a departure — a stop
      // AFTER take-off is a conflict too, not only one overlapping the buffer.
      const isArrival = anchor.anchorType === "flight_arrival";
      const isDeparture = anchor.anchorType === "flight_departure";
      const conflicts = isDeparture
        ? itemEnd > bufferStart
        : isArrival
          ? itemStart < bufferEnd
          : itemStart < bufferEnd && itemEnd > bufferStart;
      if (conflicts) {
        out.push({
          anchorId: anchor.id,
          anchorType: anchor.anchorType,
          conflict:
            isDeparture && itemStart >= anchorTime
              ? `Activity "${item.title}" starts after take-off (${anchor.description || ""})`
              : isArrival && itemStart < anchorTime
                ? `Activity "${item.title}" starts before landing (${anchor.description || ""})`
                : `Activity "${item.title}" overlaps with ${anchor.anchorType} buffer zone (${anchor.description || ""})`,
          dayNumber: item.dayNumber ?? null,
        });
      }
    }
  }
  return out;
}

export function timedEntryConflicts(anchors: readonly AnchorWindow[], items: readonly ScheduledItem[]): Finding | null {
  const c = anchorConflicts(anchors, items);
  if (!c.length) return null;
  const days = Array.from(new Set(c.map((x) => x.dayNumber).filter((d): d is number => d != null))).sort((x, y) => x - y);
  return { kind: "timed_entry_conflict", count: c.length, days };
}

// ── c / d. the day's path (straight line, est.) ────────────────────────────────────────────────

export interface DayPath {
  dayNumber: number;
  /** The day's LOCATED stops, in the draft's own order. */
  points: ReadonlyArray<{ lat: number; lng: number }>;
}

/**
 * Pure. How many times a day's path reverses direction across the city: legs are projected on the
 * day's widest axis (north–south or east–west), legs shorter than `CITY_CROSSING_MIN_LEG_M` are
 * ignored as jitter, and each sign change between consecutive kept legs is one reversal.
 */
export function directionReversals(points: DayPath["points"]): number {
  if (points.length < 3) return 0;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const nsSpan = haversineMeters(Math.min(...lats), lngs[0], Math.max(...lats), lngs[0]);
  const ewSpan = haversineMeters(midLat, Math.min(...lngs), midLat, Math.max(...lngs));
  const axis: "lat" | "lng" = nsSpan >= ewSpan ? "lat" : "lng";
  let prevSign = 0;
  let reversals = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const along = axis === "lat" ? haversineMeters(a.lat, a.lng, b.lat, a.lng) : haversineMeters(a.lat, a.lng, a.lat, b.lng);
    if (along < CITY_CROSSING_MIN_LEG_M) continue;
    const sign = Math.sign(axis === "lat" ? b.lat - a.lat : b.lng - a.lng);
    if (prevSign !== 0 && sign !== prevSign) reversals += 1;
    prevSign = sign;
  }
  return reversals;
}

/**
 * FB-1 step 1 (decision-maker, Oct 17, 2026 — ledger `2026-10-17-fb1-checker-open-coords`): the two path findings
 * (`city_crossing`, `walking_saved_km`) read a stop's point ONLY when it is an open, non-Google coordinate (LG-1's
 * `open_place_coords` / `admin_place_coords`, `openCoordsForItemIds` / `openCoordsForPlaceIds`). A day is checked only when EVERY stop on it has
 * one; any other day is NOT CHECKED, and says so — never read as "fine" (§13).
 */
export const PATH_FINDING_KINDS = ["city_crossing", "walking_saved_km"] as const;
export type NotCheckedReason = "no_open_coordinates";

export interface NotChecked {
  kind: FindingKind;
  reason: NotCheckedReason;
  /** The days the finding could not be checked on. */
  days: number[];
}

/** Pure. Splits the plan's stops into the days the path findings may read and the days they may not. */
export function openPathDays(
  stops: ReadonlyArray<{ dayNumber: number; open: { lat: number; lng: number } | null }>,
): { days: DayPath[]; notCheckedDays: number[] } {
  const byDay = new Map<number, Array<{ lat: number; lng: number } | null>>();
  for (const s of stops) {
    const list = byDay.get(s.dayNumber) ?? [];
    list.push(s.open);
    byDay.set(s.dayNumber, list);
  }
  const days: DayPath[] = [];
  const notCheckedDays: number[] = [];
  for (const [dayNumber, pts] of Array.from(byDay.entries()).sort((a, b) => a[0] - b[0])) {
    if (pts.every((p) => p != null)) days.push({ dayNumber, points: pts as Array<{ lat: number; lng: number }> });
    else notCheckedDays.push(dayNumber);
  }
  return { days, notCheckedDays };
}

/** Pure. The path findings' "not checked" entries — one per kind, naming the days; none when every day was checked. */
export function pathNotChecked(notCheckedDays: readonly number[]): NotChecked[] {
  if (notCheckedDays.length === 0) return [];
  const days = [...notCheckedDays].sort((a, b) => a - b);
  return PATH_FINDING_KINDS.map((kind) => ({ kind, reason: "no_open_coordinates" as const, days }));
}

/** c. Days that cross the city more than once (straight line, est.). */
export function cityCrossings(days: readonly DayPath[]): Finding | null {
  const hit = days.filter((d) => directionReversals(d.points) > CITY_CROSSING_REVERSALS).map((d) => d.dayNumber);
  return hit.length ? { kind: "city_crossing", count: hit.length, days: hit.sort((x, y) => x - y), est: true } : null;
}

function pathMeters(points: DayPath["points"]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  return m;
}

/** Pure. A nearest-neighbour order of the day's stops, starting from the draft's own first stop. */
function nearestNeighbour(points: DayPath["points"]): Array<{ lat: number; lng: number }> {
  if (points.length < 3) return [...points];
  const left = points.slice(1);
  const out = [points[0]];
  while (left.length) {
    const cur = out[out.length - 1];
    let bi = 0;
    let bm = Infinity;
    left.forEach((p, i) => {
      const m = haversineMeters(cur.lat, cur.lng, p.lat, p.lng);
      if (m < bm) {
        bm = m;
        bi = i;
      }
    });
    out.push(left.splice(bi, 1)[0]);
  }
  return out;
}

/**
 * d. Kilometres of walking a re-sequence would save — the draft order's straight-line total minus a
 * nearest-neighbour order's, per day (a day where it would not help counts 0), summed. Only the TOTAL
 * leaves this function; the re-sequenced order never does (R-f). Shown only from 1 km.
 */
export function walkingSavedKm(days: readonly DayPath[]): Finding | null {
  let saved = 0;
  const helped: number[] = [];
  for (const d of days) {
    const diff = pathMeters(d.points) - pathMeters(nearestNeighbour(d.points));
    if (diff > 0) {
      saved += diff;
      helped.push(d.dayNumber);
    }
  }
  const km = Math.floor(saved / 1000);
  return km >= WALKING_SAVED_MIN_KM ? { kind: "walking_saved_km", count: km, days: helped.sort((x, y) => x - y), est: true } : null;
}

// ── e. pace_over ───────────────────────────────────────────────────────────────────────────────

/**
 * e. Days over the plan's pace, from its OWN energy rows (`energy_tracking`): a day counts when its
 * row says recovery is needed. No rows ⇒ no pace was set ⇒ no finding (§13).
 */
export function paceOver(rows: ReadonlyArray<{ dayNumber: number; recoveryNeeded: boolean | null }>): Finding | null {
  const hit = Array.from(new Set(rows.filter((r) => r.recoveryNeeded === true).map((r) => r.dayNumber))).sort((x, y) => x - y);
  return hit.length ? { kind: "pace_over", count: hit.length, days: hit } : null;
}

// ── the card's list and lines ──────────────────────────────────────────────────────────────────

/** Pure. The findings in the card's order (problems, then gains), at most three. */
export function leadFindings(all: ReadonlyArray<Finding | null>): Finding[] {
  return all
    .filter((f): f is Finding => !!f && f.count > 0)
    .sort((a, b) => FINDING_ORDER.indexOf(a.kind) - FINDING_ORDER.indexOf(b.kind))
    .slice(0, MAX_FINDINGS);
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** The words for one finding — ONE author, read by the card and its tests. */
export function findingLine(f: Finding): string {
  switch (f.kind) {
    case "leg_unreachable":
      return `${n(f.count, "stop", "stops")} can't be reached in time with the plan's travel times${f.est ? " (est.)" : ""}`;
    case "closed_on_arrival":
      return `${n(f.count, "stop is", "stops are")} reached when ${f.count === 1 ? "it's" : "they're"} closed`;
    case "after_last_admission":
      return `${n(f.count, "stop is", "stops are")} reached after last entry`;
    case "closes_before_visit_end":
      return `${n(f.count, "stop closes", "stops close")} before your visit ends`;
    case "last_service_missed":
      return f.inferred
        ? `${n(f.count, "ride may leave", "rides may leave")} after the last train or bus`
        : `${n(f.count, "ride leaves", "rides leave")} after the last train or bus`;
    case "timed_entry_conflict":
      return `${n(f.count, "timed entry clashes", "timed entries clash")} with your fixed times`;
    case "city_crossing":
      return `${n(f.count, "day crosses", "days cross")} the city more than once (est.)`;
    case "walking_saved_km":
      return `about ${f.count} km less walking by re-ordering (est.)`;
    case "pace_over":
      return `${n(f.count, "day is", "days are")} over your pace`;
  }
}

/** Pure. Minutes after midnight (may pass 24h) → "5:00 PM". */
/**
 * P0-e addition 7 (ledger `2026-10-12-p0e-findings-and-gaps`): the closing minute a stop's row warns
 * about — the SAME two rules the findings use: reached after the day's last close (`closed_on_arrival`'s
 * `after_closing`), or open on arrival and closing before the visit ends (`closes_before_visit_end`).
 * Pure; an unreadable line, a closed or 24-hour day, or arriving before opening ⇒ null (§13).
 */
export function rowClosingMinute(
  descriptions: readonly string[] | null | undefined,
  weekday: number,
  startMin: number,
  endMin: number | null,
): number | null {
  const h = parseDayHours(descriptions, weekday);
  if (!h || h.kind !== "ranges") return null;
  const range = h.ranges.find(([s, e]) => startMin >= s && startMin < e);
  if (range) return endMin != null && endMin > range[1] ? range[1] : null;
  const shut = shutReason(h.ranges, startMin);
  return shut.reason === "after_closing" ? shut.atMin ?? null : null;
}

/** Pure. Minutes after midnight → "17:10" (the plan's own 24-hour form for a stop's start). */
export function clock24(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function clockLabel(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * P0-e item 2 (decision-maker, Oct 12, 2026 — the five lines approved as written): one line per stop an
 * hours finding counts, naming the stop, its day and the time that tripped it. Pure; a finding without
 * stops (or another kind) has no lines.
 */
/**
 * FB-1 step 5b (Marketing's wording, FOUNDER WORDING REVIEW on the PR): "Closed on [date]. Move this stop to another day."
 * The date reads "Monday, November 8"; a stop with no date reads "Closed that date".
 */
export function closedOnDateLine(dateIso: string | null | undefined): string {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "Closed that date. Move this stop to another day.";
  const label = new Date(`${dateIso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  return `Closed on ${label}. Move this stop to another day.`;
}

export function findingStopLines(f: Finding): string[] {
  return (f.stops ?? [])
    .filter((s) => s.reason)
    .map((s) => {
      // AP-1 (smoke on 2b9a05b8a): the stop's own start time, 24-hour, after the day — "Day 2 · 17:10".
      const head = `${s.title} · Day ${s.day}${s.startMin != null ? ` · ${clock24(s.startMin)}` : ""}`;
      const at = s.atMin != null ? clockLabel(s.atMin) : null;
      switch (s.reason) {
        case "after_closing":
          return `${head} starts after closing${at ? ` (${at})` : ""}`;
        case "before_opening":
          return `${head} starts before opening${at ? ` (${at})` : ""}`;
        case "closed_day":
          return `${head} is closed that day`;
        // FB-1 step 5b: Marketing's line (FOUNDER WORDING REVIEW on the PR).
        case "closed_date":
          return `${head}: ${closedOnDateLine(s.dateIso)}`;
        case "closes_early":
          return at ? `${head} closes at ${at}, before your visit ends` : `${head} closes before your visit ends`;
        case "after_last_entry":
          return `${head} arrives after last entry${at ? ` (${at})` : ""}`;
        default:
          return head;
      }
    });
}

export const LEAD_EYEBROW = "What Optimize found in this draft";
/** Smoke 9 S9-4: the card on a plan with no draft yet — Optimize is disabled, nothing is claimed. */
export const LEAD_DRAFT_FIRST = "Draft first — Optimize works on a drafted plan";
export const LEAD_ZERO = "This draft already works · Optimize builds three versions around where you stay";
export const LEAD_VERSIONS = "three versions built around where you stay";

// ── P0-d item 1: the all-clear is earned by the legs, not by an empty findings list ───────────────
// (ledger `2026-10-12-p0d-coverage-bridges`). An empty findings list said "This draft already works"
// on a plan whose travel times were never checked — the 330f594a smoke: routed bridges around eight
// unlocated stops, no finding, and an all-clear. The zero line now also needs every consecutive pair
// of stops on every day not yet past to have a ROUTED leg; a free plan never gets it (ruling 1).

export interface LegCoverage {
  /** Every consecutive pair on every day not yet past has a routed leg of its own. */
  complete: boolean;
  /** The stops on those days that are not on the map, in day order ("Day 2 · Soba Restaurant"). */
  unlocated: Array<{ day: number; title: string; placeholder?: true }>;
}

/**
 * Pure. `stops` are the engine's own stop list (day order, the stay excluded); a pair is covered only
 * by a routed leg FROM the first TO the second — a bridge around an unlocated stop covers no pair of
 * its own, so a day with an unlocated stop is never complete. A past day is not judged (its legs are
 * frozen). A day with one stop has no pair and is vacuously complete.
 */
export function planLegCoverage(
  stops: ReadonlyArray<{ id: string; title: string; dayNumber: number; located: boolean; placeholder?: boolean }>,
  legs: ReadonlyArray<{ dayNumber: number; fromId: string | null; toId: string | null; routed: boolean }>,
  isPastDay: (dayNumber: number) => boolean,
): LegCoverage {
  const routedPairs = new Set(legs.filter((l) => l.routed && l.fromId && l.toId).map((l) => `${l.dayNumber}|${l.fromId}|${l.toId}`));
  const byDay = new Map<number, typeof stops[number][]>();
  for (const s of stops) {
    if (isPastDay(s.dayNumber)) continue;
    byDay.set(s.dayNumber, [...(byDay.get(s.dayNumber) ?? []), s]);
  }
  let complete = true;
  const unlocated: LegCoverage["unlocated"] = [];
  for (const day of Array.from(byDay.keys()).sort((a, b) => a - b)) {
    const list = byDay.get(day)!;
    for (const s of list) if (!s.located) unlocated.push({ day, title: s.title, ...(s.placeholder ? { placeholder: true as const } : {}) });
    for (let i = 0; i < list.length - 1; i++) {
      if (!routedPairs.has(`${day}|${list[i].id}|${list[i + 1].id}`)) complete = false;
    }
  }
  return { complete, unlocated };
}

/** The free plan's line — the Getting around header's words, one home (ruling 1). */
export const TRAVEL_TIMES_COME_WITH_OPTIMIZE = "Travel times come with Optimize";
export const SOME_TRAVEL_TIMES_UNCHECKED = "Some travel times aren't checked yet";

/**
 * Pure. What the card says in place of the all-clear, or null when the all-clear is earned. A free
 * plan says travel times come with Optimize; stops off the map are counted ("— 3 stops aren't on the
 * map"); otherwise the unchecked line stands alone. Never "0 stops" (§13).
 */
export function leadCoverageLine(coverage: LegCoverage, routedPlan: boolean): string | null {
  if (!routedPlan) return TRAVEL_TIMES_COME_WITH_OPTIMIZE;
  if (coverage.complete && coverage.unlocated.length === 0) return null;
  const n = coverage.unlocated.length;
  if (n === 0) return SOME_TRAVEL_TIMES_UNCHECKED;
  return `${SOME_TRAVEL_TIMES_UNCHECKED} — ${n} ${n === 1 ? "stop isn't" : "stops aren't"} on the map`;
}

/** Pure. The stops behind the count, one line each ("Day 2 · Soba Restaurant"). */
export function unlocatedStopLines(coverage: LegCoverage | null | undefined): string[] {
  return (coverage?.unlocated ?? []).map((s) => `Day ${s.day} · ${s.title}`);
}

// ── P0-e item 4 (decision-maker, Oct 12, 2026): the gap list splits by kind ────────────────────────
/** A stop that names a real place the lookup has not placed yet. */
export const UNLOCATED_PLACES_HEAD = "We'll put these on the map";
/** A placeholder — a title that names no place ("Late Dinner in Shimogyo"), per `unnamedPlaceReason`. */
export const UNLOCATED_PLACEHOLDERS_HEAD = "Pick a spot, or let Optimize suggest one nearby";
/** Under the gap list on a free plan, whose legs are straight lines. */
export const FREE_PLAN_COVERAGE_FOOTER = "Checked with straight-line distances. Optimize checks real travel times.";

/** Pure. The off-map stops in two groups — real places, then placeholders — each omitted when empty (§13). */
export function unlocatedStopGroups(coverage: LegCoverage | null | undefined): Array<{ kind: "place" | "placeholder"; heading: string; lines: string[] }> {
  const all = coverage?.unlocated ?? [];
  const line = (s: { day: number; title: string }) => `Day ${s.day} · ${s.title}`;
  const places = all.filter((s) => !s.placeholder).map(line);
  const placeholders = all.filter((s) => s.placeholder).map(line);
  return [
    ...(places.length ? [{ kind: "place" as const, heading: UNLOCATED_PLACES_HEAD, lines: places }] : []),
    ...(placeholders.length ? [{ kind: "placeholder" as const, heading: UNLOCATED_PLACEHOLDERS_HEAD, lines: placeholders }] : []),
  ];
}

/**
 * The ONE delta line — the COST delta (spec §8: "Cost delta only when ≥ 1 priced item exists;
 * otherwise omitted, never estimated"). Before a run no cost delta is known, so none is stated (the
 * walking gain is already a finding, and repeating it would count it twice). After a paid run it is
 * the REALISED delta from the run record — and only when the plan holds at least one priced item.
 * No range ("$200–400") is ever produced. Null ⇒ the card omits the line.
 */
export function leadDeltaLine(input: {
  hasPricedItems: boolean;
  realised?: { savings?: number | null; savingsPercent?: number | null } | null;
  formatMoney: (amount: number) => string;
}): string | null {
  const r = input.realised;
  if (!r || !input.hasPricedItems) return null;
  const s = r.savings;
  if (s == null || !Number.isFinite(s) || s === 0) return null;
  const pct = r.savingsPercent;
  const pctPart = pct != null && Number.isFinite(pct) && pct !== 0 ? ` (${Math.abs(Math.round(pct))}%)` : "";
  return s > 0
    ? `After Optimize: ${input.formatMoney(s)} less than the draft${pctPart}`
    : `After Optimize: ${input.formatMoney(-s)} more than the draft${pctPart}`;
}

// ── Step 6 R-ay: the free plan's prompt at Finalize and on its card ───────────────────────────────
// Ledger `2026-10-18-teaser-copy-events`: the ruled words live ONCE in `LEAVE_BY_COPY` (shared/leave-by.ts).
export const ADD_TRAVEL_TIMES = LEAVE_BY_COPY.needsRoutedLegDoor;

/**
 * Pure. On Finalize, a plan with no run sees its free findings once more as the prompt ("2 stops may
 * not be reachable in time · Add drive and walk times"); the card carries the same line under its day strip.
 * Slice A2 (ledger `2026-10-05-reachability-from-legs`): "reachable in time" counts ONLY the stops the
 * plan's own legs cannot reach (`leg_unreachable` — the leg's confirmed minutes against the draft's
 * gap). A stop reached while closed or a clashing timed entry is not a travel-time fact and is no
 * longer counted as one; it is read with its own words. No findings ⇒ null (nothing claimed, §13).
 */
/**
 * S12-4, pure: the stops behind "N stops may not be reachable in time", one line each with its day
 * ("Day 2 · Yasaka Shrine"), in the finding's own order. Empty when the finding carries none (§13).
 */
export function unreachableStopLines(findings: readonly Finding[] | null | undefined): string[] {
  const f = findings?.find((x) => x.kind === "leg_unreachable");
  return (f?.stops ?? []).map((s) => `Day ${s.day} · ${s.title}`);
}

export function freeFindingsPromptLine(findings: readonly Finding[] | null | undefined): string | null {
  if (!findings?.length) return null;
  const reach = findings.filter((f) => f.kind === "leg_unreachable").reduce((n, f) => n + f.count, 0);
  if (reach > 0) return `${reach} ${reach === 1 ? "stop" : "stops"} may not be reachable in time · ${ADD_TRAVEL_TIMES}`;
  return `${findingLine(findings[0])} · ${ADD_TRAVEL_TIMES}`;
}
