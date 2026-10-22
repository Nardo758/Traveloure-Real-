/**
 * event-page.ts — the payload of an event's own page (ledger `2026-10-06-event-page`, events-page
 * brief 2b, rulings E2/E3). Public, read-only. Every value is the server's; the page derives nothing
 * it could disagree with.
 *
 * What is deliberately NOT here (§13):
 *   · locals' notes and traveler comments — 2c, not armed; the page has no such section at all;
 *   · a "checked" date for the dates and venue — the row stores none (E4);
 *   · a coordinate — the page draws no map, so no OpenStreetMap attribution is needed on it;
 *   · a verified-locals line of 0 — the count is null and the line is absent.
 */
import { formatDayShort, type CalendarEvent } from "./events-calendar";
import type { CityEventCard } from "./city-events";

/** A "Good to know" line: an official, public_ok, attributable fact (ruling R-p). */
export interface EventPageFact {
  factType: string;
  text: string;
  /** "from <source name>" — links to `sourceUrl`. */
  label: string;
  sourceUrl: string;
  /** "checked <date>". */
  checked: string;
}

/**
 * One "More in <city>" row: a live event in the same city that has not ended. SH-1 Launch item 13 (architect, Oct 22,
 * 2026): composed server-side as the city-events card, with its source id — fields added, none removed — so the row is
 * the shared EventRow with its countdown chip. Every card field is optional on the type so a row from before this change
 * still reads.
 */
export type EventPageMoreRow = {
  sourceId: string;
  title: string;
  venue: string;
  firstDate: string;
  lastDate: string;
} & Partial<Omit<CityEventCard, "title" | "venue" | "firstDate" | "lastDate">>;

export interface EventPagePayload {
  /** The event, shaped by the same card the calendar uses, with its address. */
  event: CalendarEvent;
  /** "Starts in N days", "Today", "Tomorrow" or "On now" (`countdownLabel`). */
  countdown: string;
  /**
   * The organizer's page and its host, only where the link passes `ticketUrlRefusal`; null otherwise
   * and the "Dates and venue from …" line is absent.
   */
  organizer: { url: string; host: string } | null;
  /** Empty = the "Good to know" section is absent. */
  goodToKnow: EventPageFact[];
  /** Soonest first; empty = the section is absent. */
  moreInCity: EventPageMoreRow[];
  /**
   * Locals in the event's market (SH-1 item 1): a count only while the market is in `expert_hook_cities` and the
   * count is above zero; null = the line is absent (never "0 locals").
   */
  cityLocals: number | null;
  /**
   * SH-1 item 5: the series' show dates (local YYYY-MM-DD, sorted) when the event is one show of a series stated as
   * sibling rows — two or more live rows on the same `series_key`; absent otherwise. When present, `countdown` is the
   * series label ("On now" / "Next show <date>").
   */
  showDates?: string[];
  /**
   * SH-1 Launch Q14.3 (ledger `2026-10-22-sh1-launch-pr5`): the event has fully ended in its market (every show, for a
   * series of shows). The page then says "This event has ended", shows no countdown and offers no "Plan around it";
   * the mint refuses it server-side. Absent = not ended.
   */
  ended?: true;
}

/** SH-1 Launch Q14.3: what a page for an ended event says (FOUNDER WORDING REVIEW on the PR). */
export const EVENT_ENDED_LINE = "This event has ended";

/** The longest source id the page will look up; anything longer is answered 404 without a read. */
export const EVENT_SOURCE_ID_MAX = 200;

/** Pure. Whether a requested source id is worth a read at all (no read for a malformed one). */
export function isLookupableSourceId(sourceId: string): boolean {
  return sourceId.length > 0 && sourceId.length <= EVENT_SOURCE_ID_MAX && sourceId.trim() === sourceId;
}

/** Pure. The organizer host shown on "Dates and venue from <host>", without a leading "www.". */
export function organizerHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host ? host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/** Pure. "N <City> locals" ("1 Kyoto local") — or null when there is none (the line is absent). */
export function cityLocalsLine(count: number | null, city: string): string | null {
  if (count == null || count <= 0) return null;
  return `${count} ${city} ${count === 1 ? "local" : "locals"}`;
}

/** "Starts in N days" on the page; the list's shorter "In N days" reads oddly as a headline. */
export function eventPageCountdown(label: string): string {
  return /^In \d+ days$/.test(label) ? `Starts ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
}

/**
 * SH-1 item 5 (ledger `2026-10-19-sh1-show-dates`): A SERIES OF SHOWS IS SIBLING ROWS. A run with separate
 * performances (IMAGINE NOH: four evenings) is stored as one `city_events` row per show, every row on the same
 * `series_key`; nothing stores the dates twice. These two helpers are the ONE reading of that shape — the event page,
 * the events card (Launch item 13) and the night picker (Launch item 14) all call them.
 */
export interface SeriesSibling {
  seriesKey?: string | null;
  /** The show's local date in its city (YYYY-MM-DD) — the card's `firstDate`. */
  firstDate: string;
}

/**
 * Pure. The show dates of `seriesKey` among `rows` (the caller passes live rows only): local dates, sorted, each once.
 * No series key ⇒ none. A series is a series of SHOWS only with two or more dates (`isShowSeries`).
 */
export function seriesShowDates(rows: readonly SeriesSibling[], seriesKey: string | null | undefined): string[] {
  const key = seriesKey?.trim();
  if (!key) return [];
  return Array.from(new Set(rows.filter((r) => r.seriesKey?.trim() === key).map((r) => r.firstDate))).sort();
}

/** Pure. Two or more show dates make a series of shows; one row is an ordinary event. */
export function isShowSeries(showDates: readonly string[]): boolean {
  return showDates.length >= 2;
}

/**
 * Pure. The series line for `today` (the city's local date, YYYY-MM-DD): "On now" on a show day only; on any other
 * day "Next show <Wkd d Mon>" for the next show; null once the last show has passed (the series stops showing — no
 * "N-day run", and nothing claims a show that is over).
 */
export function seriesShowLabel(showDates: readonly string[], today: string): string | null {
  const dates = Array.from(new Set(showDates)).sort();
  if (dates.includes(today)) return "On now";
  const next = dates.find((d) => d > today);
  return next ? `Next show ${formatDayShort(next)}` : null;
}

/** Pure. The show dates still to come, today included — what a night picker offers for a series of shows. */
export function upcomingShowDates(showDates: readonly string[], today: string): string[] {
  return Array.from(new Set(showDates)).sort().filter((d) => d >= today);
}
