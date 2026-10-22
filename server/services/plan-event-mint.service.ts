/**
 * SH-1 Launch Q14.3/Q15.3 (ledger `2026-10-22-sh1-launch-pr5`): the event a new plan is built around, checked at the
 * mint. `POST /api/trips` reads this when the body's `entry.eventSourceId` names a `city_events.source_id`: an unknown or
 * withdrawn row, or one whose run (every show, for a series of shows) has ended in its market, is REFUSED; otherwise the
 * plan's start moves to the later of itself and the market's today — the same `clampToMarketToday` the night picker
 * reads (§18 rule 1). Read only; nothing here writes.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { cityEvents } from "@shared/schema";
import { isRenderableCityEvent } from "@shared/city-events";
import { eventHasEnded } from "@shared/market-today";
import { toCityEventCard } from "./city-events.service";
import { pickLiveEvent } from "./event-page.service";

export type MintEventVerdict = { ok: true; marketKey: string | null } | { ok: false; reason: "event_not_found" | "event_ended" };

export async function checkMintEvent(eventSourceId: string, now: Date = new Date()): Promise<MintEventVerdict> {
  // The address the event page reads: one live, renderable row for the source id, or none (`pickLiveEvent`).
  const picked = pickLiveEvent(await db.select().from(cityEvents).where(eq(cityEvents.sourceId, eventSourceId)));
  if ("none" in picked) return { ok: false, reason: "event_not_found" };
  const row = picked.row;
  const card = toCityEventCard(row, null, now);
  // A series of shows (sibling rows on one series_key) has ended only when its last show has.
  const siblings = row.seriesKey
    ? (await db.select().from(cityEvents).where(and(eq(cityEvents.seriesKey, row.seriesKey), isNull(cityEvents.withdrawnAt))))
        .filter((r) => isRenderableCityEvent(r))
        .map((r) => toCityEventCard(r, null, now).lastDate)
    : [card.lastDate];
  if (eventHasEnded(siblings, card.marketKey, now)) return { ok: false, reason: "event_ended" };
  return { ok: true, marketKey: card.marketKey };
}
