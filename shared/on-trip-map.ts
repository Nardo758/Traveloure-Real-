/**
 * Row 185 J5 — the Trip Card's on-trip map, ONE projection.
 *
 * Three layers, and nothing else:
 *   1. today's confirmed stops, from coordinates stored on the item
 *   2. the chosen stay anchor
 *   3. the current leg, with its leave-by time
 *
 * Today is `calendarDayOf(now, trips.timezone)` (row 172a). A stop with no stored coordinate is
 * omitted. A Google-derived point is not a stored point: NULL coord_source reads as Google (GC-1),
 * and `places` / `geocode_google` / `google` are Google. This function takes no Places facts, no
 * geocode result, and no device position — a coordinate that is not already on the row is never filled.
 *
 * Leave-by is `deriveLeaveBy` / `leaveByHero` (the card's one formula). The returned time is
 * "HH:MM". No sentence is returned.
 *
 * Pure: no db, no clock of its own, no I/O. `now` is an argument.
 */
import { isNonGoogleCoordSource } from "./item-coord-source";
import { deriveLeaveBy, leaveByHero, leaveByModeDecision, wallClockToMinute, type LeaveByLeg } from "./leave-by";
import { addCalendarDays, calendarDayOf, calendarParts, zonedMinuteOfDay } from "./plan-timing";

export interface OnTripMapStop {
  id: string;
  lat: number;
  lng: number;
}

export interface OnTripMapStay {
  itemId: string;
  lat: number;
  lng: number;
}

export interface OnTripMapLeg {
  id: string;
  fromItemId: string | null;
  toItemId: string;
  /** "HH:MM" in the plan's zone. The leave-by formula's time, not its sentence. */
  leaveBy: string;
}

export interface OnTripMap {
  /** Calendar day the projection was built for, "YYYY-MM-DD" in the plan's zone. */
  day: string;
  stops: OnTripMapStop[];
  stay: OnTripMapStay | null;
  leg: OnTripMapLeg | null;
}

export interface OnTripMapItem {
  id: string;
  status?: string | null;
  itemType?: string | null;
  dayNumber?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | string | null;
  sortOrder?: number | null;
  latitude?: unknown;
  longitude?: unknown;
  coordSource?: string | null;
}

export interface OnTripMapLegRow {
  id: string;
  dayNumber?: number | null;
  fromActivityId?: string | null;
  toActivityId?: string | null;
  estimatedDurationMinutes?: number | string | null;
  recommendedMode?: string | null;
  userSelectedMode?: string | null;
  authorTip?: string | null;
  /**
   * `legIsRouted` (`server/services/routing/plan-legs.ts`) — the one routed answer.
   * Passed in so this module does not restate it and does not import the server.
   */
  routed?: boolean;
}

const GOOGLE_POINT_SOURCES = new Set(["places", "geocode_google", "google"]);

/** A point stored on the row that is not a Google source. Anything else is omitted, never filled. */
export function storedMapPoint(
  lat: unknown,
  lng: unknown,
  coordSource: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!isNonGoogleCoordSource(coordSource)) return null;
  if (GOOGLE_POINT_SOURCES.has(coordSource as string)) return null;
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

function startIso(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m && calendarParts(m[1]) ? m[1] : null;
}

function dayIso(start: string | null, dayNumber: number | null | undefined): string | null {
  if (!start || dayNumber == null || !Number.isFinite(dayNumber) || dayNumber < 1) return null;
  return addCalendarDays(start, dayNumber - 1);
}

function durationMin(item: OnTripMapItem): number | null {
  const own = Number(item.durationMinutes);
  if (Number.isFinite(own) && own > 0) return own;
  const s = wallClockToMinute(item.startTime);
  const e = wallClockToMinute(item.endTime);
  return s != null && e != null && e > s ? e - s : null;
}

function leaveByLeg(row: OnTripMapLegRow): LeaveByLeg | null {
  const minutes = Number(row.estimatedDurationMinutes);
  const { mode, modeChosen } = leaveByModeDecision(row);
  const routed = row.routed === true && Number.isFinite(minutes) && minutes > 0;
  return {
    routed,
    durationMin: Number.isFinite(minutes) ? minutes : null,
    mode,
    modeChosen,
    provenanceLine: null,
  };
}

/**
 * The on-trip map. `chosenStayItemId` is the accommodation option set the traveler chose
 * (`chosenStayItemId` in the stay reader) — an unchosen lodging row is not the anchor.
 */
export function projectOnTripMap(input: {
  now: Date;
  timezone: string | null | undefined;
  startDate: string | Date | null | undefined;
  chosenStayItemId: string | null;
  items: readonly OnTripMapItem[];
  legs: readonly OnTripMapLegRow[];
}): OnTripMap {
  const day = calendarDayOf(input.now, input.timezone);
  const start = startIso(input.startDate);
  const onDay = (dayNumber: number | null | undefined) => dayIso(start, dayNumber) === day;

  const stayItem = input.chosenStayItemId
    ? input.items.find((i) => i.id === input.chosenStayItemId) ?? null
    : null;
  const stayPoint = stayItem ? storedMapPoint(stayItem.latitude, stayItem.longitude, stayItem.coordSource) : null;
  const stay: OnTripMapStay | null = stayItem && stayPoint ? { itemId: stayItem.id, ...stayPoint } : null;

  const stopItems = input.items
    .filter((i) => i.status === "confirmed" && i.itemType !== "accommodation" && i.id !== input.chosenStayItemId && onDay(i.dayNumber))
    .map((i) => ({ item: i, point: storedMapPoint(i.latitude, i.longitude, i.coordSource) }))
    .filter((row): row is { item: OnTripMapItem; point: { lat: number; lng: number } } => row.point != null)
    .sort((a, b) => {
      const as = wallClockToMinute(a.item.startTime);
      const bs = wallClockToMinute(b.item.startTime);
      if (as == null && bs != null) return 1;
      if (as != null && bs == null) return -1;
      if (as != null && bs != null && as !== bs) return as - bs;
      const ao = a.item.sortOrder ?? 0;
      const bo = b.item.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.item.id.localeCompare(b.item.id);
    });

  const stops: OnTripMapStop[] = stopItems.map((row) => ({ id: row.item.id, lat: row.point.lat, lng: row.point.lng }));

  const todayLegs = input.legs.filter((l) => onDay(l.dayNumber));
  const into = (stopId: string, fromId: string | null, first: boolean): OnTripMapLegRow | null =>
    todayLegs.find(
      (l) => l.toActivityId === stopId && (first ? l.fromActivityId == null || l.fromActivityId === fromId : l.fromActivityId === fromId),
    ) ?? null;

  const rows = deriveLeaveBy({
    stops: stopItems.map((row) => ({
      id: row.item.id,
      name: row.item.id,
      start: row.item.startTime ?? null,
      durationMin: durationMin(row.item),
      located: true,
    })),
    legs: stopItems.map((row, k) => {
      const fromId = k === 0 ? (stay?.itemId ?? null) : stopItems[k - 1].item.id;
      const raw = into(row.item.id, fromId, k === 0);
      return raw ? leaveByLeg(raw) : null;
    }),
    stayLocated: stay != null,
  });
  const hero = leaveByHero(rows, zonedMinuteOfDay(input.now, input.timezone));
  let leg: OnTripMapLeg | null = null;
  if (hero) {
    const k = stopItems.findIndex((row) => row.item.id === hero.stopId);
    if (k >= 0) {
      const fromId = k === 0 ? (stay?.itemId ?? null) : stopItems[k - 1].item.id;
      const raw = into(hero.stopId, fromId, k === 0);
      if (raw) leg = { id: raw.id, fromItemId: raw.fromActivityId ?? null, toItemId: hero.stopId, leaveBy: hero.time };
    }
  }

  return { day, stops, stay, leg };
}
