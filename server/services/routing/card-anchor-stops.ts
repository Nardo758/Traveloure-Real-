/**
 * 9b-c LB8 on the Trip Card (ledger `2026-10-18-lb8-lb9-card-wiring`): the plan's flight DEPARTURES as stops the
 * card's leave-by can measure against. Each carries the R-i buffered time — take-off minus its buffer, the moment
 * the traveler must be at the airport — through the ONE `flightAnchorClock` the engine's airport legs use, so the
 * card and the engine cannot disagree on it. `id` is the leg-end id an engine airport leg stores
 * (`anchor:<anchorId>`), so the card finds the leg into it by its pair. `located` = the anchor carries an airport
 * point, which is stamped only from an IATA code; a typed airport name has none and reads "Not on the map yet".
 * An arrival is not a leave-by target (the traveler leaves the airport, they do not travel to it). Timed entries
 * have no item link on `temporal_anchors`, so none is wired here (§13: stated, not guessed).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { temporalAnchors } from "@shared/schema";
import { flightAnchorClock } from "./plan-legs";

export interface CardAnchorStop {
  id: string;
  name: string;
  bufferedTime: string | null;
  located: boolean;
}

function finite(v: unknown): boolean {
  return v != null && v !== "" && Number.isFinite(Number(v));
}

export async function departureAnchorStopsByDay(tripId: string, tripStart: string | null | undefined): Promise<Map<number, CardAnchorStop[]>> {
  const out = new Map<number, CardAnchorStop[]>();
  if (!tripStart || !/^\d{4}-\d{2}-\d{2}$/.test(tripStart)) return out;
  const rows = await db
    .select()
    .from(temporalAnchors)
    .where(and(eq(temporalAnchors.tripId, tripId), eq(temporalAnchors.anchorType, "flight_departure")));
  for (const a of rows) {
    if (!a.anchorDatetime) continue;
    const c = flightAnchorClock(a, tripStart);
    if (c.dayNumber < 1) continue;
    const stop: CardAnchorStop = {
      id: `anchor:${a.id}`,
      name: a.location ?? "Airport",
      bufferedTime: c.wallClock,
      located: finite(a.latitude) && finite(a.longitude),
    };
    out.set(c.dayNumber, [...(out.get(c.dayNumber) ?? []), stop]);
  }
  return out;
}
