/**
 * FB-1 step 5d — the Kyoto busy-bus day, per plan day (ledger `2026-10-19-fb1-busy-bus`).
 *
 * Kyoto plans with CONFIRMED dates only (ruling 4: a placeholder window is not the traveler's). Every plan tier and
 * every viewer the plancard admits. Holidays come from the committed Cabinet Office list — no live fetch, no guess
 * beyond the years it covers (ruling 2); weekends count only inside the admin-entered season windows. Never fails the
 * read: a failure is no key on any day (§13).
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { trips, itineraryItems } from "@shared/schema";
import { BUSY_BUS_MARKETS, busyBusCityName, busyBusReason, type BusyBusReason, type JapanHoliday } from "@shared/busy-bus";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { planDayIso } from "@shared/coverage-targets";
import { getSeasonWindows } from "./platform-flags";
import holidayList from "../data/japan-holidays.json";

export const JAPAN_HOLIDAYS: readonly JapanHoliday[] = (holidayList as { holidays: JapanHoliday[] }).holidays;

export async function busyBusForTrip(tripId: string): Promise<Map<number, { reason: BusyBusReason; cityName: string }>> {
  const out = new Map<number, { reason: BusyBusReason; cityName: string }>();
  try {
    const [trip] = await db
      .select({ marketSlug: trips.marketSlug, startDate: trips.startDate, endDate: trips.endDate, datesConfirmedAt: trips.datesConfirmedAt })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    const market = (trip?.marketSlug ?? "").toLowerCase();
    if (!trip || !(BUSY_BUS_MARKETS as readonly string[]).includes(market) || !planDatesAreConfirmed(trip.datesConfirmedAt)) return out;
    const cityName = busyBusCityName(market);
    if (!cityName) return out;
    const isoOf = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : v instanceof Date ? v.toISOString().slice(0, 10) : null);
    const start = isoOf(trip.startDate);
    if (!start) return out;
    const windows = await getSeasonWindows(market);
    // The plan's days: its date window, and any day number an item sits on beyond it.
    const end = isoOf(trip.endDate);
    const span = end ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1 : 1;
    const [row] = await db
      .select({ maxDay: sql<number | null>`max(${itineraryItems.dayNumber})` })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId));
    const days = Math.max(span, Number(row?.maxDay ?? 0) || 0);
    for (let d = 1; d <= days; d++) {
      const iso = planDayIso(start, d);
      const reason = iso ? busyBusReason(iso, JAPAN_HOLIDAYS, windows) : null;
      if (reason) out.set(d, { reason, cityName });
    }
  } catch (err) {
    console.error(`[busy-bus] failed plan_id=${tripId}:`, (err as Error)?.message ?? err);
    return new Map();
  }
  return out;
}
