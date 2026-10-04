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

export type FindingKind = "closed_on_arrival" | "timed_entry_conflict" | "city_crossing" | "walking_saved_km" | "pace_over";

export interface Finding {
  kind: FindingKind;
  /** Stops, conflicts or days — or, for `walking_saved_km`, whole kilometres. */
  count: number;
  days: number[];
  /** Straight-line figures say so. */
  est?: true;
  /** R-v: hours read more than 14 days before the trip carry this. */
  caveat?: string;
}

/** Problems first, then gains — the order the card reads them in (spec §8). */
export const FINDING_ORDER: readonly FindingKind[] = ["closed_on_arrival", "timed_entry_conflict", "city_crossing", "walking_saved_km", "pace_over"];
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

export interface TimedItem {
  id: string;
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
export function closedOnArrival(items: readonly TimedItem[], hours: ReadonlyMap<string, HoursFact>, tripStartIso: string | null): Finding | null {
  const days = new Set<number>();
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
    let shut: boolean;
    if (h.kind === "closed") {
      if (!fact.official) continue; // R-p: a hard closure needs an official seasonal source
      shut = true;
    } else {
      shut = !h.ranges.some(([s, e]) => at >= s && at < e);
    }
    if (!shut) continue;
    count += 1;
    days.add(it.dayNumber);
    const checked = fact.checkedAt ? Date.parse(fact.checkedAt) : NaN;
    if (!Number.isFinite(checked) || !Number.isFinite(tripStart) || tripStart - checked > HOURS_STALE_DAYS * 86_400_000) stale = true;
  }
  if (!count) return null;
  return { kind: "closed_on_arrival", count, days: Array.from(days).sort((x, y) => x - y), ...(stale ? { caveat: HOURS_CAVEAT } : {}) };
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
 * Pure. Items overlapping an anchor's buffer window — THE rule `POST /api/trips/:tripId/validate-schedule`
 * applies (moved here so the preview and that route read one implementation, §18 rule 1). Times are
 * read as written; an item with no time or no date is not checked.
 */
export function anchorConflicts(anchors: readonly AnchorWindow[], items: readonly ScheduledItem[]): Array<{ anchorId: string; anchorType: string; conflict: string; dayNumber: number | null }> {
  const out: Array<{ anchorId: string; anchorType: string; conflict: string; dayNumber: number | null }> = [];
  for (const anchor of anchors) {
    const anchorTime = new Date(anchor.anchorDatetime).getTime();
    const bufferStart = anchorTime - (anchor.bufferBefore || 0) * 60000;
    const bufferEnd = anchorTime + (anchor.bufferAfter || 0) * 60000;
    for (const item of items) {
      if (!item.startTime || !item.dayNumber) continue;
      const itemStart = new Date(`${item.date || ""}T${item.startTime}`).getTime();
      const itemEnd = item.endTime ? new Date(`${item.date || ""}T${item.endTime}`).getTime() : itemStart + (item.durationMinutes || 60) * 60000;
      if (itemStart < bufferEnd && itemEnd > bufferStart) {
        out.push({
          anchorId: anchor.id,
          anchorType: anchor.anchorType,
          conflict: `Activity "${item.title}" overlaps with ${anchor.anchorType} buffer zone (${anchor.description || ""})`,
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
    case "closed_on_arrival":
      return `${n(f.count, "stop is", "stops are")} reached when ${f.count === 1 ? "it's" : "they're"} closed`;
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

export const LEAD_EYEBROW = "What Optimize found in this draft";
export const LEAD_ZERO = "This draft already works · Optimize builds three versions around where you stay";
export const LEAD_VERSIONS = "three versions built around where you stay";

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
