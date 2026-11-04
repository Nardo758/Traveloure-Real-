/**
 * 9b-c LB8 on the Trip Card (ledger `2026-10-18-lb8-lb9-card-wiring`): the plan's flight DEPARTURES as stops the
 * card's leave-by can measure against. Each carries the R-i buffered time — take-off minus its buffer, the moment
 * the traveler must be at the airport — through the ONE `flightAnchorClock` the engine's airport legs use, so the
 * card and the engine cannot disagree on it. `id` is the leg-end id an engine airport leg stores
 * (`anchor:<anchorId>`), so the card finds the leg into it by its pair. `located` = the anchor carries an airport
 * point, which is stamped only from an IATA code; a typed airport name has none and reads "Not on the map yet".
 * An arrival is not a leave-by target (the traveler leaves the airport, they do not travel to it). Timed entries
 * have no item link on `temporal_anchors`, so none is wired here (§13: stated, not guessed).
 *
 * ENTRY-1s (ledger `2026-11-03-entry1s-presets-and-draft-order`): the Reservation preset generator
 * (`generatePresetsForTrip`) writes `temporal_anchors`, never items, so its anchors (ceremony, photographer arrival,
 * dinner reservation …) were invisible in "Your plan". They now join as timed stops the way flight departures already
 * do: every anchor type a preset can write (`PRESET_ANCHOR_TYPES`, read from the generator's own table) except the
 * arrival. A preset anchor's time is its own wall-clock time — the reservation's time, not a buffered one — and its
 * name is the preset's label (when it passes the never-say list), else the row's description, else its location. An
 * anchor outside the plan's days is skipped and counted in the log line, never moved onto a day; one with no words to
 * name it is skipped the same way rather than given an invented name.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { temporalAnchors, trips } from "@shared/schema";
import { flightAnchorClock } from "./plan-legs";
import { PRESET_ANCHOR_TYPES, presetAnchorLabel } from "../logistics-presets.service";

export interface CardAnchorStop {
  id: string;
  name: string;
  bufferedTime: string | null;
  located: boolean;
}

/** The anchor types that become stops: every preset type plus the departure flight; the arrival never does. */
export const CARD_ANCHOR_STOP_TYPES: readonly string[] = Array.from(new Set(["flight_departure", ...Array.from(PRESET_ANCHOR_TYPES)])).filter(
  (t) => t !== "flight_arrival",
);

function finite(v: unknown): boolean {
  return v != null && v !== "" && Number.isFinite(Number(v));
}

function planDayCount(tripStart: string, tripEnd: unknown): number | null {
  const end = tripEnd instanceof Date ? tripEnd.toISOString().slice(0, 10) : typeof tripEnd === "string" ? tripEnd.slice(0, 10) : null;
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const n = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${tripStart}T00:00:00Z`)) / 86_400_000) + 1;
  return n >= 1 ? n : null;
}

/** A preset anchor's day and its own wall-clock time (the row is the plan's wall clock — R316/R318). */
function presetAnchorClock(anchorDatetime: Date | string, tripStart: string): { dayNumber: number; wallClock: string | null } {
  const iso = new Date(anchorDatetime).toISOString();
  const dayNumber = Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${tripStart}T00:00:00Z`)) / 86_400_000) + 1;
  return { dayNumber, wallClock: iso.slice(11, 16) };
}

export async function departureAnchorStopsByDay(tripId: string, tripStart: string | null | undefined): Promise<Map<number, CardAnchorStop[]>> {
  const out = new Map<number, CardAnchorStop[]>();
  if (!tripStart || !/^\d{4}-\d{2}-\d{2}$/.test(tripStart)) return out;
  const [trip] = await db.select({ endDate: trips.endDate }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const lastDay = planDayCount(tripStart, trip?.endDate);
  const rows = await db
    .select()
    .from(temporalAnchors)
    .where(and(eq(temporalAnchors.tripId, tripId), inArray(temporalAnchors.anchorType, [...CARD_ANCHOR_STOP_TYPES])));
  let outsideWindow = 0;
  let unnamed = 0;
  for (const a of rows) {
    if (!a.anchorDatetime) continue;
    const isFlight = a.anchorType === "flight_departure";
    const c = isFlight ? flightAnchorClock(a, tripStart) : presetAnchorClock(a.anchorDatetime, tripStart);
    // A departure keeps its rule unchanged (before day 1 ⇒ skipped). A preset anchor must fall inside the plan's days.
    if (c.dayNumber < 1 || (!isFlight && lastDay != null && c.dayNumber > lastDay)) {
      if (!isFlight) outsideWindow++;
      continue;
    }
    const name = isFlight ? (a.location ?? "Airport") : presetAnchorLabel(a.anchorType, a.description) ?? a.description ?? a.location ?? null;
    if (!name) {
      unnamed++;
      continue;
    }
    const stop: CardAnchorStop = {
      id: `anchor:${a.id}`,
      name,
      bufferedTime: c.wallClock,
      located: finite(a.latitude) && finite(a.longitude),
    };
    out.set(c.dayNumber, [...(out.get(c.dayNumber) ?? []), stop]);
  }
  if (outsideWindow || unnamed) {
    console.info(`[card-anchor-stops] trip=${tripId} preset anchors skipped: outside_window=${outsideWindow} unnamed=${unnamed}`);
  }
  return out;
}
