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
import type { CalendarEvent } from "./events-calendar";

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

/** One "More in <city>" row: a live event in the same city that has not ended. */
export interface EventPageMoreRow {
  sourceId: string;
  title: string;
  venue: string;
  firstDate: string;
  lastDate: string;
}

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
  /** Verified locals in the event's market; null = the line is absent (never "0 verified"). */
  verifiedLocals: number | null;
}

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

/** Pure. "N verified in <city>" — or null when there is no verified local (the line is absent). */
export function verifiedLocalsLine(count: number | null, city: string): string | null {
  if (count == null || count <= 0) return null;
  return `${count} verified ${count === 1 ? "local" : "locals"} in ${city}`;
}

/** "Starts in N days" on the page; the list's shorter "In N days" reads oddly as a headline. */
export function eventPageCountdown(label: string): string {
  return /^In \d+ days$/.test(label) ? `Starts ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
}
