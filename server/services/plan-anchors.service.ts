/**
 * OPT-A (ledger 2026-11-01-opt-a-event-day-anchors): the Optimize anchors "event" and "day".
 *
 *   Event = an item already on the plan with a place (coordinates) and a start time. A fixed place and
 *           a fixed time; its day pivots on it; nothing moves it.
 *   Day   = one day of the trip locked exactly as built: every stop on that day keeps its place and
 *           time; the other days are rebuilt around it.
 *
 * Both resolve ONLY from the plan's own items. No Google Places, no catalog, no geocode. A point is the
 * item's own trusted coordinates, else its linked listing's (the optimizer baseline's durable point,
 * without the Places-fact fallback). No minutes are produced anywhere here (B8). Errors are machine
 * codes; the words are OPT-B's.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, providerServices, trips } from "@shared/schema";
import { itineraryItemIsMachineProtected } from "@shared/itinerary-item-lock";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import type { PinnedAnchorNotFoundDetail } from "@shared/custom-location-pin";
import type { FixedCommitment, ItineraryItem as OptimizerBaselineItem } from "../itinerary-optimizer";
import { scoreAnchor, type AnchorScore } from "./anchor-scoring";

const OPTIMIZABLE_STATUSES = ["in_planning", "ready_for_checkout"] as const;
const PLAN_STATUSES = [...OPTIMIZABLE_STATUSES, "purchased"] as const;

/** One plan item as the event/day anchors read it. */
export interface PlanAnchorItem {
  id: string;
  name: string;
  dayNumber: number;
  startTime: string | null;
  scheduledDate: string | null;
  lat: number | null;
  lng: number | null;
  location: string | null;
  providerServiceId: string | null;
  /** In the optimizer's baseline (re-plannable); false for purchased or machine-protected items. */
  optimizable: boolean;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

const HH_MM = /^\d{2}:\d{2}/;

/** The plan's items, in plan order, read the way the optimizer baseline reads them (same statuses). */
export async function loadPlanAnchorItems(tripId: string): Promise<PlanAnchorItem[]> {
  const rows = await db
    .select({ item: itineraryItems, service: providerServices })
    .from(itineraryItems)
    .leftJoin(providerServices, eq(itineraryItems.providerServiceId, providerServices.id))
    .where(and(eq(itineraryItems.tripId, tripId), inArray(itineraryItems.routingStatus, [...PLAN_STATUSES])))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder), asc(itineraryItems.createdAt));
  return rows.map(({ item, service }) => {
    const own = rowCoordinatesTrusted(item) ? { lat: num(item.latitude), lng: num(item.longitude) } : { lat: null, lng: null };
    const point = own.lat != null && own.lng != null ? own : { lat: num(service?.latitude), lng: num(service?.longitude) };
    const located = point.lat != null && point.lng != null;
    return {
      id: item.id,
      name: item.title,
      dayNumber: item.dayNumber,
      startTime: item.startTime ?? null,
      scheduledDate: (item as any).scheduledDate ?? null,
      lat: located ? point.lat : null,
      lng: located ? point.lng : null,
      location: item.locationName ?? null,
      providerServiceId: item.providerServiceId ?? null,
      optimizable:
        (OPTIMIZABLE_STATUSES as readonly string[]).includes(String(item.routingStatus)) &&
        !itineraryItemIsMachineProtected(item),
    };
  });
}

export interface PlanAnchorContext {
  startDate: string | Date | null;
  endDate: string | Date | null;
  items: PlanAnchorItem[];
}

/** The trip's dates and items, or null when the trip does not exist. */
export async function loadPlanAnchorContext(tripId: string): Promise<PlanAnchorContext | null> {
  const [trip] = await db
    .select({ startDate: trips.startDate, endDate: trips.endDate })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return null;
  return { startDate: trip.startDate as any, endDate: trip.endDate as any, items: await loadPlanAnchorItems(tripId) };
}

export function isEventAnchorable(item: PlanAnchorItem): boolean {
  return item.lat != null && item.lng != null && !!item.startTime && HH_MM.test(item.startTime);
}

export type PlanAnchorResolution =
  | { ok: true; name: string; lat: number; lng: number }
  | { ok: false; detail?: PinnedAnchorNotFoundDetail };

/** An event pin: the plan item with that id, which must carry coordinates and a start time. */
export function resolveEventAnchor(items: PlanAnchorItem[], id: string): PlanAnchorResolution {
  const item = items.find((i) => i.id === id);
  if (!item || !isEventAnchorable(item)) return { ok: false, detail: "event_not_anchorable" };
  return { ok: true, name: item.name, lat: item.lat as number, lng: item.lng as number };
}

/** Number of trip days, startDate..endDate inclusive, from two calendar dates. */
export function tripDayCount(startDate: string | Date | null | undefined, endDate: string | Date | null | undefined): number {
  const day = (d: string | Date | null | undefined) => {
    if (!d) return null;
    const s = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
    const t = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(t) ? t : null;
  };
  const a = day(startDate);
  const b = day(endDate);
  if (a == null || b == null || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** startDate + (n - 1) as YYYY-MM-DD; a calendar date, no time zone involved. */
export function tripDayDate(startDate: string | Date | null | undefined, dayNumber: number): string | null {
  if (!startDate) return null;
  const s = typeof startDate === "string" ? startDate.slice(0, 10) : startDate.toISOString().slice(0, 10);
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t + (dayNumber - 1) * 86_400_000).toISOString().slice(0, 10);
}

function parseDayNumber(id: string): number | null {
  if (!/^\d{1,3}$/.test(id.trim())) return null;
  const n = parseInt(id, 10);
  return n >= 1 ? n : null;
}

/** A day pin: the centroid of that day's located stops. The other days must hold something to rebuild. */
export function resolveDayAnchor(items: PlanAnchorItem[], id: string, dayCount: number): PlanAnchorResolution {
  const n = parseDayNumber(id);
  if (n == null || n > dayCount) return { ok: false };
  const onDay = items.filter((i) => i.dayNumber === n);
  const located = onDay.filter((i) => i.lat != null && i.lng != null);
  if (located.length === 0) return { ok: false, detail: "day_not_anchorable" };
  const optimizable = items.filter((i) => i.optimizable);
  if (optimizable.length > 0 && optimizable.every((i) => i.dayNumber === n)) return { ok: false, detail: "day_nothing_to_rebuild" };
  if (optimizable.length === 0) return { ok: false, detail: "day_nothing_to_rebuild" };
  const lat = located.reduce((s, i) => s + (i.lat as number), 0) / located.length;
  const lng = located.reduce((s, i) => s + (i.lng as number), 0) / located.length;
  return { ok: true, name: `Day ${n}`, lat, lng };
}

/** The id an event/day AnchorScore carries: "event:<itemId>" | "day:<n>". */
export function eventAnchorId(itemId: string): string {
  return `event:${itemId}`;
}
export function dayAnchorId(dayNumber: number | string): string {
  return `day:${dayNumber}`;
}

/** What one run fixes for an event/day anchor: extra fixed commitments and the plan item ids kept as built. */
export interface RunFixedForAnchor {
  extraCommitments: FixedCommitment[];
  fixedIds: Set<string>;
  /** For the event anchor line: its day and HH:MM. */
  event?: { name: string; dayNumber: number; startTime: string };
  day?: number;
}

function commitmentFrom(item: OptimizerBaselineItem): FixedCommitment {
  return {
    id: String(item.id),
    name: item.name,
    dayNumber: item.dayNumber ?? 1,
    startTime: item.startTime ?? undefined,
    location: item.location ?? undefined,
    providerServiceId: item.providerServiceId ?? undefined,
  };
}

const planIdOf = (item: OptimizerBaselineItem) => String(item.planItemId ?? item.id);

export function runFixedForAnchor(
  anchor: AnchorScore | undefined,
  baselineItems: OptimizerBaselineItem[],
  fixedCommitments: FixedCommitment[],
): RunFixedForAnchor {
  const out: RunFixedForAnchor = { extraCommitments: [], fixedIds: new Set() };
  if (!anchor) return out;
  const already = new Set(fixedCommitments.map((c) => c.id));
  if (anchor.type === "event" && anchor.anchorId.startsWith("event:")) {
    const itemId = anchor.anchorId.slice("event:".length);
    const base = baselineItems.find((b) => planIdOf(b) === itemId);
    if (base) {
      out.fixedIds.add(itemId);
      if (!already.has(itemId)) out.extraCommitments.push(commitmentFrom(base));
      if (base.startTime) out.event = { name: base.name, dayNumber: base.dayNumber ?? 1, startTime: base.startTime.slice(0, 5) };
    } else {
      const fixed = fixedCommitments.find((c) => c.id === itemId);
      if (fixed?.startTime) out.event = { name: fixed.name, dayNumber: fixed.dayNumber, startTime: fixed.startTime.slice(0, 5) };
    }
  }
  if (anchor.type === "day" && anchor.anchorId.startsWith("day:")) {
    const n = parseInt(anchor.anchorId.slice("day:".length), 10);
    if (Number.isFinite(n)) {
      out.day = n;
      for (const b of baselineItems) {
        if ((b.dayNumber ?? 1) !== n) continue;
        out.fixedIds.add(planIdOf(b));
        if (!already.has(planIdOf(b))) out.extraCommitments.push(commitmentFrom(b));
      }
    }
  }
  return out;
}

/**
 * Restores a run-fixed stop's day, start, end, name and coordinates from the baseline, after the
 * optimizer's sequencing. Matched by the plan item the stop keeps (`sourceItemId`).
 */
export function pinRunFixedItems<T extends { sourceItemId?: string | null; dayNumber?: number; startTime?: string | null; endTime?: string | null; name?: string; latitude?: unknown; longitude?: unknown }>(
  items: T[],
  baselineItems: OptimizerBaselineItem[],
  fixedIds: Set<string>,
): T[] {
  if (fixedIds.size === 0) return items;
  const byPlanId = new Map(baselineItems.map((b) => [planIdOf(b), b]));
  return items.map((item) => {
    const id = item.sourceItemId ? String(item.sourceItemId) : null;
    if (!id || !fixedIds.has(id)) return item;
    const base = byPlanId.get(id);
    if (!base) return item;
    return {
      ...item,
      dayNumber: base.dayNumber ?? item.dayNumber,
      startTime: base.startTime ?? null,
      endTime: base.endTime ?? null,
      name: base.name,
      latitude: base.latitude ?? item.latitude,
      longitude: base.longitude ?? item.longitude,
    };
  });
}

/** The prompt line for an event/day anchor. No minutes. */
export function eventDayAnchorLine(fixed: RunFixedForAnchor, anchor: AnchorScore): string | null {
  if (anchor.type === "event") {
    const e = fixed.event;
    if (!e) return null;
    return `\nBUILD THIS VERSION AROUND the event "${e.name}" on day ${e.dayNumber} at ${e.startTime}; it is fixed and does not move; cluster that day's other stops before and after it and let the trip radiate from it.`;
  }
  if (anchor.type === "day" && fixed.day != null) {
    return `\nDAY ${fixed.day} IS FIXED EXACTLY AS BUILT; do not include any of its stops; rebuild the other days around it, radiating from its stops.`;
  }
  return null;
}

/** One event candidate on the anchor-candidates read. No minutes (B8). */
export interface EventAnchorCandidate {
  anchorId: string;
  type: "event";
  name: string;
  dayNumber: number;
  scheduledDate: string | null;
  startTime: string;
  lat: number;
  lng: number;
  locatedStops: number;
  totalStops: number;
  medianMeters: number | null;
  within15MinCount: number;
}

/** One day candidate on the anchor-candidates read. */
export interface DayAnchorCandidate {
  anchorId: string;
  type: "day";
  name: string;
  dayNumber: number;
  date: string | null;
  stopCount: number;
  locatedStops: number;
  anchorable: boolean;
}

/**
 * The event and day candidates for a plan. Events: every plan item with a point and a start time,
 * purchased and locked included, ordered by day then start. Days: one per trip day.
 */
export function buildPlanAnchorCandidates(
  context: PlanAnchorContext | null,
  stops: Array<{ id: string; lat: number | null; lng: number | null }>,
): { event: EventAnchorCandidate[]; day: DayAnchorCandidate[] } {
  if (!context) return { event: [], day: [] };
  const event = context.items
    .filter(isEventAnchorable)
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber || (a.startTime as string).localeCompare(b.startTime as string))
    .map((item): EventAnchorCandidate => {
      const s = scoreAnchor(
        { id: eventAnchorId(item.id), type: "event", name: item.name, lat: item.lat as number, lng: item.lng as number },
        stops,
      );
      return {
        anchorId: s.anchorId,
        type: "event",
        name: s.name,
        dayNumber: item.dayNumber,
        scheduledDate: item.scheduledDate,
        startTime: (item.startTime as string).slice(0, 5),
        lat: s.lat,
        lng: s.lng,
        locatedStops: s.locatedStops,
        totalStops: s.totalStops,
        medianMeters: s.medianMeters,
        within15MinCount: s.within15MinCount,
      };
    });
  const dayCount = tripDayCount(context.startDate, context.endDate);
  const day: DayAnchorCandidate[] = [];
  for (let n = 1; n <= dayCount; n++) {
    const onDay = context.items.filter((i) => i.dayNumber === n);
    day.push({
      anchorId: dayAnchorId(n),
      type: "day",
      name: `Day ${n}`,
      dayNumber: n,
      date: tripDayDate(context.startDate, n),
      stopCount: onDay.length,
      locatedStops: onDay.filter((i) => i.lat != null && i.lng != null).length,
      anchorable: resolveDayAnchor(context.items, String(n), dayCount).ok,
    });
  }
  return { event, day };
}
