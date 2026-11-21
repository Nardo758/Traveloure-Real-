/**
 * DRAGGING A STOP ON THE DESKTOP DAYS BOARD (A2 part 2; Leon, Nov 20, 2026; board R3_DaysBoard). PURE.
 *
 * A stop is dragged by its handle onto a day column and dropped after one of that day's stops. The drop is
 * two EXISTING writes, in order: the item PATCH moves it to the day (keeping its time), then the reorder route
 * puts that day's stops in the dropped order. A drop inside the stop's own day is the reorder alone. No new
 * route. The reorder list is only ever the target day's own stops, which is what that route accepts.
 *
 * "Drop here · Wed, after Tenryu-ji": "Wording approved - Leon" (Nov 20, 2026). A drop ahead of a day's first
 * stop has nothing to be "after" and reads the same line without that clause.
 */
import { parseTripDate } from "@/lib/calendar-date";

const WKD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One day column a stop can be dropped on, with its stops in drawn order. */
export interface DragDay {
  dayNumber: number;
  dateIso: string | null;
  items: readonly { id: string; name: string }[];
}

/** Where the dragged stop would land: on a day, after one of its stops - or ahead of them all (null). */
export interface DropTarget {
  dayNumber: number;
  afterId: string | null;
}

/** "Wed"; a day with no date is the plan's own "Day 2" (never a guessed weekday). */
export function dropDayName(day: Pick<DragDay, "dayNumber" | "dateIso">): string {
  const d = parseTripDate(day.dateIso);
  return d ? WKD[d.getDay()] : `Day ${day.dayNumber}`;
}

/** "Drop here · Wed, after Tenryu-ji"; "Drop here · Wed" ahead of the day's first stop. */
export function dropHereLabel(day: DragDay, afterId: string | null): string {
  const after = afterId == null ? null : day.items.find((i) => i.id === afterId)?.name ?? null;
  return after ? `Drop here · ${dropDayName(day)}, after ${after}` : `Drop here · ${dropDayName(day)}`;
}

/** The writes one drop makes. */
export interface DropPlan {
  /** The item PATCH's body, when the stop changes day. */
  move: { dayNumber: number } | null;
  /** The reorder route's body, when the target day's order changes. */
  reorder: { dayNumber: number; itemIds: string[] } | null;
}

/**
 * The writes for dropping `itemId` (now on `fromDay`) at `target`, or null when the drop changes nothing: no
 * such day, "after itself", or the place the stop already holds. A stop that arrives on a day with no other
 * stop needs no reorder.
 */
export function dropPlan(input: { itemId: string; fromDay: number; target: DropTarget | null; days: readonly DragDay[] }): DropPlan | null {
  const { itemId, fromDay, target } = input;
  if (!target || target.afterId === itemId) return null;
  const day = input.days.find((d) => d.dayNumber === target.dayNumber);
  if (!day) return null;
  const current = day.items.map((i) => i.id);
  const rest = current.filter((id) => id !== itemId);
  const at = target.afterId == null ? 0 : rest.indexOf(target.afterId) + 1;
  if (target.afterId != null && at === 0) return null;
  const itemIds = [...rest.slice(0, at), itemId, ...rest.slice(at)];
  const sameDay = target.dayNumber === fromDay;
  if (sameDay && itemIds.every((id, i) => id === current[i])) return null;
  return {
    move: sameDay ? null : { dayNumber: target.dayNumber },
    reorder: itemIds.length > 1 ? { dayNumber: target.dayNumber, itemIds } : null,
  };
}

/**
 * The stop the pointer's row stands for: the row itself when the pointer is in its lower half, the stop
 * drawn before it (null for the day's first) when in its upper half.
 */
export function afterIdForRow(input: { rowId: string; dayItemIds: readonly string[]; upperHalf: boolean }): string | null {
  if (!input.upperHalf) return input.rowId;
  const i = input.dayItemIds.indexOf(input.rowId);
  return i > 0 ? input.dayItemIds[i - 1] : null;
}
