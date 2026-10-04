/**
 * Smoke 10 S10-5 (ledger `2026-10-04-smoke10-fixes`): after a TIME edit the day reads in time order.
 * Pure. The day's TIMED stops take the timed positions in start-time order; an untimed stop keeps its
 * own position (it has no time to be sorted by — moving it would be a guess, §13). Stable: equal times
 * keep their relative order. Returns the ids in the new order.
 */
export function orderDayByTime(items: ReadonlyArray<{ id: string; startTime?: string | null }>): string[] {
  const hhmm = (t: string | null | undefined) => (/^\d{2}:\d{2}/.test(t ?? "") ? (t as string).slice(0, 5) : null);
  const timedPositions: number[] = [];
  const timed: Array<{ id: string; t: string; i: number }> = [];
  items.forEach((it, i) => {
    const t = hhmm(it.startTime);
    if (t) {
      timedPositions.push(i);
      timed.push({ id: it.id, t, i });
    }
  });
  timed.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i));
  const out = items.map((it) => it.id);
  timedPositions.forEach((pos, k) => {
    out[pos] = timed[k].id;
  });
  return out;
}
