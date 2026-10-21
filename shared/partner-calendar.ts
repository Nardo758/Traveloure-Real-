/**
 * Dated partner-catalog events on the /events calendar
 * (ledger `2026-10-21-event-card-partner-area`). PURE.
 *
 * A Fever catalog date is the YYYY-MM-DD prefix of the instant the catalog stored. The clock on
 * those rows is a shared sentinel, so it is not converted into the city's zone and it is not shown
 * as a start time. A run longer than PARTNER_STATED_RUN_MAX_DAYS is the listing window (the
 * catalog expiration), not the nights the event runs, and the calendar keeps the start day only.
 * An unstated launch date is not painted. No price, currency, or partner URL is carried.
 */
import { calendarDaysBetween } from "./city-events";
import { monthLast, type CalendarEvent } from "./events-calendar";
import { namedArea } from "./fever-area";
import { feverTitleBlocked } from "./fever-title-filter";

/** Inclusive days. A longer span is the catalog's listing window, not a stated run. */
export const PARTNER_STATED_RUN_MAX_DAYS = 7;

export interface PartnerCalendarSource {
  id: string;
  title: string;
  city: string;
  marketKey: string;
  /** Catalog start instant. The calendar day is its date prefix. */
  date: string | null;
  endDate: string | null;
  /** False when the catalog stated no launch date. Omitted means the date was stated. */
  dateStated?: boolean;
  areaName?: string | null;
  imageUrl?: string | null;
  partnerName?: string | null;
  /** Today's calendar day in this event's city (YYYY-MM-DD). */
  today: string;
}

/** The calendar day stated by an instant's date prefix, or null when that prefix is not a real day. */
export function statedCalendarDay(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** The start day, and the end day when the catalog span is a short stated run. */
export function partnerRunDays(start: string, end: string | null): { firstDate: string; lastDate: string; nights: number } {
  if (!end || end < start) return { firstDate: start, lastDate: start, nights: 1 };
  const nights = calendarDaysBetween(start, end) + 1;
  if (nights > PARTNER_STATED_RUN_MAX_DAYS) return { firstDate: start, lastDate: start, nights: 1 };
  return { firstDate: start, lastDate: end, nights };
}

function httpsImage(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  return url.startsWith("https://") ? url : null;
}

/**
 * Partner rows that overlap the window and have not ended, soonest first.
 * One row per id. A row with no stated date, no title, or no city is left out.
 */
export function composePartnerCalendarEvents(
  rows: readonly PartnerCalendarSource[],
  months: readonly string[],
): CalendarEvent[] {
  const windowEnd = months.length > 0 ? monthLast(months[months.length - 1]) : "";
  const out: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.dateStated === false) continue;
    const title = row.title.trim();
    if (feverTitleBlocked(title)) continue;
    const id = row.id.trim();
    const city = row.city.trim();
    const marketKey = row.marketKey.trim();
    const today = statedCalendarDay(row.today);
    const first = statedCalendarDay(row.date);
    if (!title || !id || !city || !marketKey || !today || !first || !windowEnd) continue;
    const end = statedCalendarDay(row.endDate);
    const run = partnerRunDays(first, end);
    if (run.lastDate < today || run.firstDate > windowEnd) continue;
    const key = `partner:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const area = namedArea(row.areaName);
    out.push({
      id: key,
      series: null,
      title,
      city,
      marketKey,
      neighbourhood: area,
      venue: area ?? "",
      startsAt: `${run.firstDate}T00:00:00.000Z`,
      endsAt: run.lastDate === run.firstDate ? null : `${run.lastDate}T00:00:00.000Z`,
      nights: run.nights,
      daysUntil: calendarDaysBetween(today, run.firstDate),
      firstDate: run.firstDate,
      lastDate: run.lastDate,
      startTime: null,
      ticketUrl: null,
      blurb: null,
      imagePath: httpsImage(row.imageUrl),
      vertical: null,
      venueLocality: null,
      outsideCity: false,
      venueCity: null,
      seriesKey: null,
      sourceId: id,
      partner: true,
      partnerName: namedArea(row.partnerName),
    });
  }
  return out.sort((a, b) => (a.firstDate === b.firstDate ? a.startsAt.localeCompare(b.startsAt) : a.firstDate < b.firstDate ? -1 : 1));
}
