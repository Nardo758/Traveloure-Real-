/**
 * FB-1 step 4b — a free plan's retime fix, applied on tap (decision-maker, Oct 19, 2026; ledger
 * `2026-10-19-fb1-free-retime`). PURE.
 *
 * Only `retime` is a tap (ruling): the stop moves to its window's bound, keeping its length, and a later stop on the
 * same day moves later only where it would otherwise overlap. Nothing moves earlier than it was, except the stop the
 * fix names when its window says "by". A move that would collide with the stop before, run past midnight, or touch a
 * stop no traveler tap may move (booked, locked, an expert's) is not offered: the finding stays a flag with its fix in
 * words.
 */

export interface DayStop {
  id: string;
  title: string;
  startMin: number;
  /** The stop's end; equal to its start when it states no length. */
  endMin: number;
  /** False for a booked, locked or expert stop — a tap never moves it. */
  movable: boolean;
}
export interface RetimeWindow {
  notBeforeMin?: number;
  notAfterMin?: number;
}
export interface RetimeMove {
  itemId: string;
  title: string;
  fromMin: number;
  toMin: number;
  /** The stop's new end (its length kept). */
  endMin: number;
}

/**
 * The moves a tap on one stop's retime fix makes on its day, or null when the fix cannot be applied by tap.
 * `stops` is the day's timed stops in start order.
 */
export function planRetimeFix(stops: readonly DayStop[], targetId: string, window: RetimeWindow): RetimeMove[] | null {
  const i = stops.findIndex((s) => s.id === targetId);
  if (i < 0) return null;
  const t = stops[i];
  let to: number | null = null;
  if (window.notBeforeMin != null && t.startMin < window.notBeforeMin) to = window.notBeforeMin;
  else if (window.notAfterMin != null && t.startMin > window.notAfterMin) to = window.notAfterMin;
  if (to == null || to < 0 || !t.movable) return null;
  if (window.notAfterMin != null && to > window.notAfterMin) return null; // the window cannot be met
  const len = Math.max(0, t.endMin - t.startMin);
  // Moving earlier must not collide with the stop before.
  if (to < t.startMin && i > 0 && stops[i - 1].endMin > to) return null;
  const moves: RetimeMove[] = [{ itemId: t.id, title: t.title, fromMin: t.startMin, toMin: to, endMin: to + len }];
  let cursor = to + len;
  for (let j = i + 1; j < stops.length; j++) {
    const s = stops[j];
    if (s.startMin >= cursor) {
      cursor = Math.max(cursor, s.endMin);
      continue;
    }
    if (!s.movable) return null;
    const sLen = Math.max(0, s.endMin - s.startMin);
    moves.push({ itemId: s.id, title: s.title, fromMin: s.startMin, toMin: cursor, endMin: cursor + sLen });
    cursor += sLen;
  }
  if (moves.some((m) => m.endMin > 24 * 60)) return null;
  return moves;
}

/** "9:30 AM" — the stored convention for an itinerary item's time (`server/utils/itinerary-time.ts`). */
export function formatItemTime(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
