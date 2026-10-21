/**
 * Dated Fever catalog events for the /events calendar
 * (ledger `2026-10-21-event-card-partner-area`).
 *
 * Read only when the live catalog is ready, so a development mock list is never painted onto
 * the calendar. One failure, including a timeout, leaves the city-events calendar intact.
 * A timeout is not cached. Area lookup reads the geocode cache and does not call Nominatim.
 */
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { localDate } from "@shared/city-events";
import { composePartnerCalendarEvents, type PartnerCalendarSource } from "@shared/partner-calendar";
import type { CalendarEvent } from "@shared/events-calendar";
import type { FeverEvent } from "./fever.service";
import { feverService } from "./fever.service";
import { resolveFeverAreas, type FeverArea } from "./fever-area";
import { approvedFeverPartnerName } from "./fever-partner-name";
import { timezoneForMarket } from "./trend-engine/operating-markets";

const CACHE_MS = 5 * 60 * 1000;
const DEADLINE_MS = 8_000;

export interface PartnerCalendarCity {
  name: string;
  marketKey: string;
}

export interface PartnerCalendarDeps {
  catalogReady: () => boolean;
  cities: readonly PartnerCalendarCity[];
  search: (city: string) => Promise<readonly FeverEvent[] | null>;
  areas: (events: readonly FeverEvent[]) => Promise<readonly FeverArea[]>;
  partnerName: () => Promise<string | null>;
  nowMs: () => number;
  deadlineMs: number;
}

interface CacheEntry {
  at: number;
  key: string;
  events: CalendarEvent[];
}

let cache: CacheEntry | null = null;

export function operatingFeverCities(): PartnerCalendarCity[] {
  const rows = OPERATING_MARKETS.filter((m) => feverService.findCity(m.cityName));
  const kyoto = rows.filter((m) => m.marketKey === "kyoto");
  const rest = rows.filter((m) => m.marketKey !== "kyoto");
  return [...kyoto, ...rest].map((m) => ({ name: m.cityName, marketKey: m.marketKey }));
}

function defaultDeps(): PartnerCalendarDeps {
  return {
    catalogReady: () => feverService.isCatalogReady(),
    cities: operatingFeverCities(),
    search: async (city) => {
      const result = await feverService.searchEvents({ city, limit: 30 });
      return result ? result.events : null;
    },
    areas: (events) => resolveFeverAreas(events, { contactEmail: null }),
    partnerName: () => approvedFeverPartnerName(),
    nowMs: () => Date.now(),
    deadlineMs: DEADLINE_MS,
  };
}

async function withinDeadline<T>(work: Promise<T>, deadlineAt: number, nowMs: () => number): Promise<T | "timeout"> {
  const left = deadlineAt - nowMs();
  if (left <= 0) return "timeout";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), left);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toSource(
  event: FeverEvent,
  area: FeverArea | undefined,
  city: PartnerCalendarCity,
  today: string,
  partnerName: string | null,
): PartnerCalendarSource {
  return {
    id: String(event.id ?? ""),
    title: event.title ?? "",
    city: city.name,
    marketKey: city.marketKey,
    date: event.dates?.startDate ?? null,
    endDate: event.dates?.endDate ?? null,
    dateStated: event.dates?.stated,
    areaName: area?.areaName ?? null,
    imageUrl: event.imageUrl ?? null,
    partnerName,
    today,
  };
}

async function collect(
  now: Date,
  months: readonly string[],
  deps: PartnerCalendarDeps,
): Promise<{ events: CalendarEvent[]; cacheable: boolean }> {
  const deadlineAt = deps.nowMs() + deps.deadlineMs;
  let partnerName: string | null = null;
  try {
    const named = await withinDeadline(deps.partnerName(), deadlineAt, deps.nowMs);
    if (named === "timeout") return { events: [], cacheable: false };
    partnerName = named;
  } catch {
    partnerName = null;
  }
  const sources: PartnerCalendarSource[] = [];
  let cacheable = true;
  for (const city of deps.cities) {
    let found: readonly FeverEvent[] | null | "timeout";
    try {
      found = await withinDeadline(deps.search(city.name), deadlineAt, deps.nowMs);
    } catch (err) {
      console.warn(`[events-calendar] partner search skipped for ${city.marketKey}`, err);
      cacheable = false;
      continue;
    }
    if (found === "timeout") return { events: composePartnerCalendarEvents(sources, months), cacheable: false };
    if (!found) {
      cacheable = false;
      continue;
    }
    let areas: readonly FeverArea[] | "timeout";
    try {
      areas = await withinDeadline(deps.areas(found), deadlineAt, deps.nowMs);
    } catch (err) {
      console.warn(`[events-calendar] partner areas skipped for ${city.marketKey}`, err);
      cacheable = false;
      continue;
    }
    if (areas === "timeout") return { events: composePartnerCalendarEvents(sources, months), cacheable: false };
    const today = localDate(now, timezoneForMarket(city.marketKey));
    found.forEach((event, i) => sources.push(toSource(event, areas[i], city, today, partnerName)));
  }
  return { events: composePartnerCalendarEvents(sources, months), cacheable };
}

/** Dated partner events in the calendar window. Empty when the live catalog is not ready. */
export async function loadDatedPartnerEvents(
  now: Date,
  months: readonly string[],
  deps?: PartnerCalendarDeps,
): Promise<CalendarEvent[]> {
  const d = deps ?? defaultDeps();
  if (!d.catalogReady()) return [];
  const key = months[0] ?? "";
  if (!deps && cache && cache.key === key && d.nowMs() - cache.at < CACHE_MS) return cache.events;
  try {
    const { events, cacheable } = await collect(now, months, d);
    if (!deps && cacheable) cache = { at: d.nowMs(), key, events };
    return events;
  } catch (err) {
    console.warn("[events-calendar] partner events omitted", err);
    return [];
  }
}
