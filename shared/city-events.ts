/**
 * city-events.ts — the value sets and the pure rules for `city_events`, the table behind the
 * landing page's "Coming up in our cities" strip and the /events "Coming up" block (ledger
 * `2026-09-28-city-events`, migration 330).
 *
 * Every derived number (nights, countdown, whether the strip shows at all) is decided HERE and
 * nowhere else (§18 rule 1). The server passes the market's IANA zone in; this module holds no
 * city list and no zone map of its own.
 *
 * §13, the rules that must not be weakened:
 *   - An event with no venue or no start date is never rendered.
 *   - `neighbourhood_id` is the nearest `city_neighborhoods` row IN THE SAME CITY, and only when
 *     both the venue and that row have coordinates. Otherwise it is NULL, never a guess.
 *   - A `ticket_url` whose host is on a partner's domain is refused: this strip links the
 *     organiser's own page, never a commission link (§16 governs affiliate outbound elsewhere). The
 *     partner domains are the registry's (`affiliate_partners`), read by the ONE loader the blog
 *     uses too — never a list typed here (ledger `2026-09-28-landing-doors`).
 *   - A `ticket_url` on a RESALE marketplace is refused too: an event's ticket link is the
 *     organiser's or primary seller's page only. That is our POLICY, not a partner relationship, so
 *     its hosts are typed here (`RESALE_TICKET_HOSTS`) and never go in `affiliate_partners`
 *     (ledger `2026-09-28-resale-ticket-hosts`).
 *   - The strip is absent below CITY_EVENTS_STRIP_MIN events in the window. It is never padded.
 */
import { isOnPartnerHost } from "./partner-hosts";

/** Where a row came from. `ticketmaster` is reserved: nothing writes it yet (probe script only). */
export const CITY_EVENT_SOURCES = ["manual", "ticketmaster"] as const;
export type CityEventSource = (typeof CITY_EVENT_SOURCES)[number];

/** The window the strip and the /events block read, in days from now. */
export const CITY_EVENTS_WINDOW_DAYS = 180;
/** Below this many events in the window the strip is not rendered at all. */
export const CITY_EVENTS_STRIP_MIN = 3;
/** The strip shows at most this many cards. */
export const CITY_EVENTS_STRIP_MAX = 4;

export function ticketHost(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/**
 * True when the URL is well-formed http(s) and its host is not on a partner's domain. The partner
 * hosts are the registry's (`loadPartnerHosts`, `server/services/partner-hosts.service.ts`) — the
 * SAME source the blog's source admission reads — passed in, never typed here (ledger
 * `2026-09-28-landing-doors`). The rule itself is `shared/partner-hosts.ts`.
 */
export function isAcceptableTicketUrl(url: string, partnerHosts: readonly string[]): boolean {
  return ticketUrlRefusal(url, partnerHosts) === null;
}

/**
 * Resale ticket marketplaces. An event's ticket link is the organiser's or the primary seller's
 * page, never a resale listing (ledger `2026-09-28-resale-ticket-hosts`). This list is typed by
 * hand ON PURPOSE: it states our rule, it is not a registry of anyone we have a relationship with,
 * so it does not belong in `affiliate_partners` and is not read from there. Matching is the shared
 * exact-suffix rule (`isOnPartnerHost`): a host matches when it is one of these or a subdomain of
 * one, so a domain that merely CONTAINS a name ("notstubhub.example") does not.
 *
 * Negative space, stated: a resale seller not named here, or a country domain of one not named
 * here, is NOT refused. Ticketmaster itself is a primary seller and is allowed; only its resale
 * hosts are listed.
 */
export const RESALE_TICKET_HOSTS: readonly string[] = [
  // StubHub
  "stubhub.com",
  "stubhub.co.uk",
  "stubhub.ca",
  "stubhub.ie",
  "stubhub.de",
  "stubhub.fr",
  "stubhub.es",
  "stubhub.it",
  "stubhub.com.au",
  // Viagogo
  "viagogo.com",
  "viagogo.co.uk",
  "viagogo.de",
  "viagogo.fr",
  "viagogo.es",
  "viagogo.it",
  "viagogo.com.au",
  "viagogo.jp",
  // Vivid Seats, SeatGeek, TickPick, Gametime
  "vividseats.com",
  "seatgeek.com",
  "tickpick.com",
  "gametime.co",
  // Ticketmaster's resale hosts (not Ticketmaster's primary pages)
  "resale.ticketmaster.com",
  "ticketexchangebyticketmaster.com",
  "ticketsnow.com",
  "getmein.com",
  "seatwave.com",
];

/**
 * Why a ticket link is refused, or null when it is acceptable. Malformed or non-http(s) first,
 * then resale (our policy), then a partner's domain (the registry).
 */
export function ticketUrlRefusal(
  url: string,
  partnerHosts: readonly string[],
): "bad_ticket_url" | "resale_ticket_url" | "affiliate_ticket_url" | null {
  const host = ticketHost(url);
  if (!host) return "bad_ticket_url";
  if (isOnPartnerHost(host, RESALE_TICKET_HOSTS)) return "resale_ticket_url";
  if (isOnPartnerHost(host, partnerHosts)) return "affiliate_ticket_url";
  return null;
}

/** The calendar date (YYYY-MM-DD) an instant falls on in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The wall-clock time (HH:MM, 24h) an instant falls on in `timeZone`. */
export function localTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** Whole calendar days from date `a` to date `b` (YYYY-MM-DD), DST-proof (UTC midnights). */
export function calendarDaysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Nights an event spans in its city: the number of local calendar days from the start to the
 * end, inclusive. A single evening is one night; an end before the start, or no end, counts one.
 */
export function deriveNights(startsAt: Date, endsAt: Date | null, timeZone: string): number {
  if (!endsAt || endsAt.getTime() <= startsAt.getTime()) return 1;
  return Math.max(1, calendarDaysBetween(localDate(startsAt, timeZone), localDate(endsAt, timeZone)) + 1);
}

/** Whole local days from `now` until the event starts (0 = today). Negative once started. */
export function daysUntil(startsAt: Date, now: Date, timeZone: string): number {
  return calendarDaysBetween(localDate(now, timeZone), localDate(startsAt, timeZone));
}

/** The card's tag: `FESTIVAL · N NIGHTS` for two or more nights, else `ONE NIGHT`. */
export function cityEventTag(nights: number): string {
  return nights >= 2 ? `Festival · ${nights} nights` : "One night";
}

/** The countdown line. Never a negative number: an event under way reads "On now". */
export function countdownLabel(days: number): string {
  if (days < 0) return "On now";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/**
 * The slip split for "Plan around it" (the dispatch's ruling): one night → Moments, two or
 * more → Trips. Decided per EVENT from its nights, never from the occasion row.
 */
export function cityEventPlanShape(nights: number): "moment" | "trip" {
  return nights >= 2 ? "trip" : "moment";
}

export interface RenderableCityEvent {
  venue: string | null;
  startsAt: Date | string | null;
  withdrawnAt?: Date | string | null;
}

/** An event renders only with a venue and a start date, and never once withdrawn. */
export function isRenderableCityEvent(e: RenderableCityEvent): boolean {
  return !!e.venue && e.venue.trim().length > 0 && !!e.startsAt && !e.withdrawnAt;
}

/** The strip shows only at CITY_EVENTS_STRIP_MIN or more renderable events in the window. */
export function showCityEventsStrip(count: number): boolean {
  return count >= CITY_EVENTS_STRIP_MIN;
}

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface NeighbourhoodCandidate {
  id: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

/**
 * The nearest neighbourhood in the SAME city (case-insensitive) that has coordinates, or null
 * when the venue has none, or no candidate in that city does. Never a guess across cities.
 */
export function nearestNeighbourhoodId(
  venue: { city: string; lat: number | null; lng: number | null },
  candidates: readonly NeighbourhoodCandidate[],
): string | null {
  if (venue.lat === null || venue.lng === null || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return null;
  const city = venue.city.trim().toLowerCase();
  let best: { id: string; d: number } | null = null;
  for (const c of candidates) {
    if (c.city.trim().toLowerCase() !== city) continue;
    if (c.lat === null || c.lng === null || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const d = haversineKm(venue.lat, venue.lng, c.lat, c.lng);
    if (!best || d < best.d) best = { id: c.id, d };
  }
  return best?.id ?? null;
}

/**
 * A city's OWN repo fallback photo, used when an event has no `image_path`. Keyed by market; a
 * city absent here gets no photo — never another city's image, and never an organiser's, venue's
 * or artist's official image. Each file must have an ATTRIBUTION.json entry.
 */
export const CITY_EVENT_FALLBACK_IMAGES: Readonly<Record<string, string>> = {
  kyoto: "/images/landing/hero-kyoto-temple.jpg",
  bogota: "/images/landing/hero-bogota.jpg",
};

/** The photo a card shows: the event's own, else its city's fallback, else none. */
export function cityEventPhoto(imagePath: string | null, marketKey: string | null): { src: string; fallback: boolean } | null {
  if (imagePath && imagePath.trim()) return { src: imagePath, fallback: false };
  const fb = marketKey ? CITY_EVENT_FALLBACK_IMAGES[marketKey] : undefined;
  return fb ? { src: fb, fallback: true } : null;
}

/** One card as the API sends it — every value rendered from a row, nothing typed on the page. */
export interface CityEventCard {
  id: string;
  series: string | null;
  title: string;
  city: string;
  marketKey: string | null;
  neighbourhood: string | null;
  venue: string;
  startsAt: string;
  endsAt: string | null;
  nights: number;
  daysUntil: number;
  /** Start and end as local calendar dates in the city (YYYY-MM-DD); end = start for one night. */
  firstDate: string;
  lastDate: string;
  /** Local wall-clock start (HH:MM) in the city. */
  startTime: string;
  ticketUrl: string | null;
  blurb: string | null;
  imagePath: string | null;
}

export interface CityEventsPayload {
  windowDays: number;
  /** Renderable events in the window — the strip reads this against CITY_EVENTS_STRIP_MIN. */
  total: number;
  events: CityEventCard[];
}
