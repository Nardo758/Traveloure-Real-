/**
 * event-page.service.ts — the ONE read behind an event's own page, `/events/<source_id>` (ledger
 * `2026-10-06-event-page`; events-page brief 2b; rulings E2 address, E3 door). Public, read-only.
 *
 *   1. The address resolves to EXACTLY ONE live row (`city_events.source_id`, not withdrawn,
 *      renderable). None ⇒ 404. Two or more ⇒ 404 and a logged warning (E2): the page never picks
 *      one of several rows that share an id across sources.
 *   2. The row's facts come from `loadEventGuideFacts` — the blog generator's fact builder — and from
 *      nowhere else (brief item 21: no second reader). The page uses its refusal-checked organizer
 *      link and its ATTRIBUTED facts only (`attributedFacts`, ruling R-p).
 *   3. "More in <city>": other live events in the same city that have not ended, soonest first.
 *   4. "N verified in <city>": the size of the billboard's own verified-locals set, `verifiedLocalIds`
 *      — a verified neighbourhood in the market INTERSECTED with R343's `routableUserIds` (approved
 *      application, Identity verified, Connect complete, never a seed account, never the concierge
 *      pool); ledgers `2026-10-06-event-page`, `2026-10-06-billboard-locals-routable`. Zero ⇒ null.
 *
 * Pure composers below a thin loader, so the shaping is testable without a database.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { cityEvents, type CityEvent } from "@shared/schema";
import { countdownLabel, isCityEventVertical, isRenderableCityEvent, localDate } from "@shared/city-events";
import type { CalendarEvent } from "@shared/events-calendar";
import {
  eventPageCountdown,
  isLookupableSourceId,
  organizerHost,
  type EventPageMoreRow,
  type EventPagePayload,
} from "@shared/event-page";
import { logger } from "../infrastructure/logger";
import { timezoneForMarket } from "./trend-engine/operating-markets";
import { toCityEventCard } from "./city-events.service";
import { loadEventGuideFacts, type EventGuideFacts } from "./blog-event-facts.service";
import { verifiedLocalIds } from "./landing-billboard.service";

export const MORE_IN_CITY_MAX = 6;

/** Pure. The one live, renderable row an address names — or why there is none. */
export function pickLiveEvent(rows: readonly CityEvent[]): { row: CityEvent } | { none: "unknown" | "ambiguous" } {
  const live = rows.filter((r) => !r.withdrawnAt && isRenderableCityEvent(r));
  if (live.length === 1) return { row: live[0] };
  return { none: live.length === 0 ? "unknown" : "ambiguous" };
}

/** Pure. The page's card: the calendar's own shape, with its address. */
export function eventPageCard(row: CityEvent, now: Date): CalendarEvent {
  const card = toCityEventCard(row, null, now);
  return { ...card, vertical: isCityEventVertical(row.vertical) ? row.vertical : null, venueLocality: row.venueLocality ?? null, sourceId: row.sourceId };
}

/** Pure. Other live events in the city that have not ended (local last date ≥ today), soonest first. */
export function composeMoreInCity(rows: readonly CityEvent[], selfId: string, now: Date, max = MORE_IN_CITY_MAX): EventPageMoreRow[] {
  const out: Array<EventPageMoreRow & { startsAt: string }> = [];
  for (const r of rows) {
    if (r.id === selfId || r.withdrawnAt || !isRenderableCityEvent(r)) continue;
    const card = toCityEventCard(r, null, now);
    if (card.lastDate < localDate(now, timezoneForMarket(card.marketKey))) continue;
    out.push({ sourceId: r.sourceId, title: card.title, venue: card.venue, firstDate: card.firstDate, lastDate: card.lastDate, startsAt: card.startsAt });
  }
  return out
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title))
    .slice(0, max)
    .map(({ startsAt: _s, ...row }) => row);
}

/** Pure. The payload from the row, its facts, the city's other events and the verified count. */
export function composeEventPage(
  row: CityEvent,
  facts: Pick<EventGuideFacts, "event" | "attributedFacts">,
  moreInCity: EventPageMoreRow[],
  verifiedCount: number,
  now: Date,
): EventPagePayload {
  const event = eventPageCard(row, now);
  const url = facts.event.ticketUrl;
  const host = url ? organizerHost(url) : null;
  return {
    event,
    countdown: eventPageCountdown(countdownLabel(event.daysUntil)),
    organizer: url && host ? { url, host } : null,
    goodToKnow: facts.attributedFacts.map((f) => ({ factType: f.factType, text: f.text, label: f.label, sourceUrl: f.sourceUrl, checked: f.checked })),
    moreInCity,
    verifiedLocals: verifiedCount > 0 ? verifiedCount : null,
  };
}

/**
 * "N verified in <city>": the size of the ONE verified-locals set the billboard also reads
 * (`verifiedLocalIds` — candidates ∩ R343 routable; ledger `2026-10-06-billboard-locals-routable`).
 */
export async function countVerifiedLocals(marketKey: string, deps: Parameters<typeof verifiedLocalIds>[1] = {}): Promise<number> {
  return (await verifiedLocalIds(marketKey, deps)).length;
}

export interface EventPageDeps {
  facts?: typeof loadEventGuideFacts;
  verifiedCount?: (marketKey: string) => Promise<number>;
  now?: Date;
}

/** The page, or null for an unknown, withdrawn, non-renderable or ambiguous address (all one 404). */
export async function loadEventPage(sourceId: string, deps: EventPageDeps = {}): Promise<EventPagePayload | null> {
  if (!isLookupableSourceId(sourceId)) return null;
  const now = deps.now ?? new Date();
  const rows = await db.select().from(cityEvents).where(eq(cityEvents.sourceId, sourceId));
  const picked = pickLiveEvent(rows);
  if ("none" in picked) {
    if (picked.none === "ambiguous") {
      logger.warn({ sourceId, rows: rows.map((r) => ({ id: r.id, source: r.source })) }, "[event-page] source id names more than one live event; answered 404");
    }
    return null;
  }
  const row = picked.row;
  const facts = await (deps.facts ?? loadEventGuideFacts)(row.id, { now });
  if (!facts) return null;
  const others = await db
    .select()
    .from(cityEvents)
    .where(and(eq(cityEvents.city, row.city), isNull(cityEvents.withdrawnAt)))
    .orderBy(asc(cityEvents.startsAt));
  const marketKey = facts.event.marketKey;
  const verified = marketKey ? await (deps.verifiedCount ?? countVerifiedLocals)(marketKey) : 0;
  return composeEventPage(row, facts, composeMoreInCity(others, row.id, now), verified, now);
}
