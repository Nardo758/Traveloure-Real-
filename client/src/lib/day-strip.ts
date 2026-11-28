/**
 * THE PHONE'S DAY STRIP (A2; Leon, Nov 20, 2026; board R3_MovePhone, minus Ideas) - which day it shows. PURE.
 *
 * On a phone a plan with more than one day shows ONE day at a time, picked from a strip of day chips. The
 * day shown is the chip the traveler tapped; until they tap one it is the day a linked stop is on, else the
 * plan's default open day - the same two rules the collapsible cards open by.
 */
import { moveDayShort, stopCount } from "@/lib/move-stop";
import { SLIP_UNDATED_SLOT_HEADING } from "@/lib/slip-events";

export interface StripDay {
  key: string;
  /** The plan's day number, or null for a slot only an undated event brought into being. */
  dayNum: number | null;
  dateIso: string | null;
  stops: number;
  itemIds: readonly string[];
}

/** "Tue 8"; "Day 2" with no date; the slip's own "Undated" for a slot with no day number. */
export function stripDayLabel(day: Pick<StripDay, "dayNum" | "dateIso">): string {
  return day.dayNum == null && !day.dateIso ? SLIP_UNDATED_SLOT_HEADING : moveDayShort({ dayNumber: day.dayNum ?? 0, dateIso: day.dateIso });
}

/** The chip's spoken name: "Tue 8 · 2 stops". */
export function stripDayAria(day: Pick<StripDay, "dayNum" | "dateIso" | "stops">): string {
  return `${stripDayLabel(day)} · ${stopCount(day.stops)}`;
}

/** The key of the day the strip shows, or null for a plan with no days. */
export function stripDayKey(input: { days: readonly StripDay[]; chosenKey: string | null; highlightItemId: string | null | undefined; defaultIndex: number }): string | null {
  const { days } = input;
  if (days.length === 0) return null;
  if (input.chosenKey != null && days.some((d) => d.key === input.chosenKey)) return input.chosenKey;
  const linked = input.highlightItemId ? days.find((d) => d.itemIds.includes(input.highlightItemId!)) : undefined;
  if (linked) return linked.key;
  return (days[input.defaultIndex] ?? days[0]).key;
}
