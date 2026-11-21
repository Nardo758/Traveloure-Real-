/**
 * MOVING A STOP TO ANOTHER DAY (A2; Leon, Nov 20, 2026) - the Move sheet's words and its one write. PURE.
 *
 * The write is the EXISTING item PATCH: `{ dayNumber }` keeps the stop's time, `{ dayNumber, startTime }` sets a
 * new one, and the server re-sorts the day by time and queues the leg recompute. No new route.
 *
 * Every string below: "Wording approved - Leon" (Nov 20, 2026), as drawn on the R3_MovePhone board, minus Ideas
 * (which arrives with slice A4). The stop counts reuse the day header's own "N stops" form (`dayBlockStats`).
 */
import { parseTripDate } from "@/lib/calendar-date";
import { roundToFiveMinutes } from "@shared/stop-time-edit";

const WKD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MOVE_STOP_COPY = {
  /** The stop menu's entry. */
  menu: "Move",
  title: (stopName: string) => `Move ${stopName} to`,
  now: "now",
  keepTime: (time: string) => `Keep ${time}`,
  pickTime: "Pick a time",
  confirm: (dayLong: string) => `Move to ${dayLong}`,
  booked: "This stop is booked. Change the booking to move it.",
  /** The error toast's title when the save fails. NOT on the board: listed for Leon's wording stamp (A2 part 1). */
  failed: "Couldn't move that stop",
  /** Under the phone's day strip. */
  stripHint: "Tap a day to see it. Hold a stop to drag it onto a day above.",
} as const;

/** One day the stop can go to. */
export interface MoveDay {
  dayNumber: number;
  /** The day's machine date, or null on a plan with no dates. */
  dateIso: string | null;
  /** Stops on that day now. */
  stops: number;
}

/** "Wed 9"; a day with no date is the plan's own "Day 2" (never a guessed weekday). */
export function moveDayShort(day: Pick<MoveDay, "dayNumber" | "dateIso">): string {
  const d = parseTripDate(day.dateIso);
  return d ? `${WKD[d.getDay()]} ${d.getDate()}` : `Day ${day.dayNumber}`;
}

/** "Wed 9 Dec"; "Day 2" with no date. */
export function moveDayLong(day: Pick<MoveDay, "dayNumber" | "dateIso">): string {
  const d = parseTripDate(day.dateIso);
  return d ? `${WKD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}` : `Day ${day.dayNumber}`;
}

/** "Tue 8 · now" for the stop's own day, "Wed 9 · 2 stops" for another. */
export function moveDayOption(day: MoveDay, currentDay: number): string {
  const tail = day.dayNumber === currentDay ? MOVE_STOP_COPY.now : `${day.stops} ${day.stops === 1 ? "stop" : "stops"}`;
  return `${moveDayShort(day)} · ${tail}`;
}

/** The sentence shown in place of the sheet's choices, or null when the stop may move. */
export function moveStopRefusal(stop: { booked: boolean }): string | null {
  return stop.booked ? MOVE_STOP_COPY.booked : null;
}

/**
 * The PATCH body, or null when there is nothing to send: no day chosen, the stop's own day, or "Pick a time" with
 * no readable time. A picked time is rounded to five minutes, the stop-time editor's rule.
 */
export function moveStopBody(input: { currentDay: number; toDay: number | null; pickedTime: string | null }): { dayNumber: number; startTime?: string } | null {
  if (input.toDay == null || input.toDay === input.currentDay) return null;
  if (input.pickedTime == null) return { dayNumber: input.toDay };
  const startTime = roundToFiveMinutes(input.pickedTime);
  return startTime ? { dayNumber: input.toDay, startTime } : null;
}
