/**
 * blog-event-facts.service.ts — THE fact builder for the blog generator lane (ledger
 * `2026-09-30-blog-event-guide`; decision-maker dispatch, Sep 30, 2026). Every event post type reads
 * its facts here and nowhere else (§18 rule 1), and the drafted text is checked against exactly these
 * facts (`shared/draft-facts-check.ts`): a number or a link the facts do not carry refuses the draft.
 *
 * WHERE EACH FACT COMES FROM, and what is deliberately NOT a fact:
 *   · event     — the `city_events` row (not withdrawn), shaped by the ONE `toCityEventCard`. The
 *                 ticket link survives only when `ticketUrlRefusal` finds nothing wrong with it, so a
 *                 resale host (R208) or a partner host never reaches a post.
 *   · venue     — `place_facts` about this event (`place_ref_kind = 'event_id'`), current only, and ONLY
 *                 those `isPublishable` allows (platform-owned or expert-verified). Places, crawled and
 *                 partner facts are display-inside-a-plan only (LD 57) and are never read here.
 *   · stayNear  — the market's neighbourhoods in the ORDER the travel-time matrix ranks them from the
 *                 venue, matrix-backed cells only. THE MINUTES ARE DISCARDED HERE (decision-maker
 *                 ruling, Sep 30, 2026: "Posts may say 'closest' / 'a short ride' but never a number
 *                 derived from the matrix. The plan door is where minutes appear, inside the plan, under
 *                 the 30-day rule."). A venue with no coordinates, or a market with no matrix cells,
 *                 has no stay section — omitted, never estimated (§13).
 *   · alsoOn    — other live `city_events` rows in the same city starting within the event's week.
 * Nothing is crawled, and no affiliate listing is read by this builder yet (type 1 names none).
 */
import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { cityEvents, cityNeighborhoods, placeFacts, type CityEvent } from "@shared/schema";
import { isPublishable, asFactOrigin } from "@shared/content-facts";
import { ticketUrlRefusal } from "@shared/city-events";
import type { TravelTime } from "@shared/travel-time";
import { toCityEventCard } from "./city-events.service";
import { loadPartnerHosts } from "./partner-hosts.service";
import { loadMarketCentroids, loadMatrixReader } from "./travel-time-matrix.service";

export interface EventGuideFacts {
  event: {
    id: string;
    title: string;
    series: string | null;
    seriesKey: string | null;
    vertical: string | null;
    city: string;
    marketKey: string | null;
    venue: string;
    firstDate: string;
    lastDate: string;
    startTime: string;
    nights: number;
    /** The organiser's or primary seller's page; null when absent or refused (R208 / partner host). */
    ticketUrl: string | null;
  };
  /** Publishable facts about the venue/event, as plain text. Empty = none publishable yet. */
  venueFacts: Array<{ factType: string; text: string }>;
  /** Closest neighbourhoods first, by the matrix's ORDER only. No minutes, ever. */
  stayNear: Array<{ rank: number; neighbourhood: string }>;
  /** Other live events in the same city that week. */
  alsoOn: Array<{ title: string; firstDate: string; venue: string }>;
}

export const STAY_NEAR_MAX = 3;
export const ALSO_ON_MAX = 5;
/** "That week": events starting from 3 days before to 4 days after this one's start. */
const ALSO_ON_BEFORE_MS = 3 * 86_400_000;
const ALSO_ON_AFTER_MS = 4 * 86_400_000;

/** Pure. Neighbourhoods ranked by matrix-backed time from the venue; estimates dropped; minutes dropped. */
export function rankStayNear(
  times: ReadonlyArray<{ slug: string; name: string; time: TravelTime }>,
  max = STAY_NEAR_MAX,
): Array<{ rank: number; neighbourhood: string }> {
  return times
    .filter((t) => t.time.basis === "matrix")
    .sort((a, b) => a.time.minutes - b.time.minutes || a.slug.localeCompare(b.slug))
    .slice(0, max)
    .map((t, i) => ({ rank: i + 1, neighbourhood: t.name }));
}

/** Pure. A fact's jsonb value as one line of text: its string fields, in key order. */
export function factText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const parts: string[] = [];
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    if (k === "query") continue;
    const v = (value as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
    else if (Array.isArray(v)) parts.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return parts.join("; ");
}

export interface EventFactsDeps {
  partnerHosts?: () => Promise<string[]>;
  now?: Date;
}

/** The event's facts, or null when there is no live `city_events` row (the generators' refusal). */
export async function loadEventGuideFacts(eventId: string, deps: EventFactsDeps = {}): Promise<EventGuideFacts | null> {
  const now = deps.now ?? new Date();
  const [row] = await db.select().from(cityEvents).where(and(eq(cityEvents.id, eventId), isNull(cityEvents.withdrawnAt))).limit(1);
  if (!row) return null;
  const card = toCityEventCard(row, null, now);
  const hosts = await (deps.partnerHosts ?? loadPartnerHosts)();
  const ticketUrl = row.ticketUrl && ticketUrlRefusal(row.ticketUrl, hosts) === null ? row.ticketUrl : null;

  const factRows = await db
    .select()
    .from(placeFacts)
    .where(and(eq(placeFacts.placeRefKind, "event_id"), eq(placeFacts.placeRef, row.id), isNull(placeFacts.supersededBy)));
  const venueFacts = factRows
    .filter((f) => asFactOrigin(f.origin) !== null && isPublishable({ origin: f.origin as any, license: f.license, verifiedAt: f.verifiedAt }))
    .map((f) => ({ factType: f.factType, text: factText(f.value) }))
    .filter((f) => f.text !== "");

  let stayNear: EventGuideFacts["stayNear"] = [];
  if (card.marketKey && row.venueLat != null && row.venueLng != null) {
    const [centroids, reader, names] = await Promise.all([
      loadMarketCentroids(card.marketKey),
      loadMatrixReader(card.marketKey),
      db.select({ slug: cityNeighborhoods.slug, name: cityNeighborhoods.name }).from(cityNeighborhoods)
        .where(sql`lower(${cityNeighborhoods.city}) = lower(${row.city})`),
    ]);
    const nameOf = new Map(names.map((n) => [n.slug, n.name]));
    const venue = { lat: row.venueLat, lng: row.venueLng };
    stayNear = rankStayNear(
      centroids.map((c) => ({ slug: c.slug, name: nameOf.get(c.slug) ?? c.slug, time: reader(venue, c, "transit") })),
    );
  }

  const start = new Date(row.startsAt).getTime();
  const others: CityEvent[] = await db
    .select()
    .from(cityEvents)
    .where(and(
      eq(cityEvents.city, row.city),
      ne(cityEvents.id, row.id),
      isNull(cityEvents.withdrawnAt),
      gte(cityEvents.startsAt, new Date(start - ALSO_ON_BEFORE_MS)),
      lte(cityEvents.startsAt, new Date(start + ALSO_ON_AFTER_MS)),
    ))
    .orderBy(cityEvents.startsAt)
    .limit(ALSO_ON_MAX);
  const alsoOn = others.map((o) => {
    const c = toCityEventCard(o, null, now);
    return { title: c.title, firstDate: c.firstDate, venue: c.venue };
  });

  return {
    event: {
      id: row.id,
      title: row.title,
      series: row.series,
      seriesKey: row.seriesKey ?? null,
      vertical: row.vertical ?? null,
      city: row.city,
      marketKey: card.marketKey,
      venue: row.venue,
      firstDate: card.firstDate,
      lastDate: card.lastDate,
      startTime: card.startTime,
      nights: row.nights,
      ticketUrl,
    },
    venueFacts,
    stayNear,
    alsoOn,
  };
}
