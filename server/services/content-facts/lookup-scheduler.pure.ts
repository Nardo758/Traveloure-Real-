/**
 * The order a draft's stops are looked up in — PURE (ledger `2026-09-30-places-named-gate`, amended
 * smoke 5 item 7, ledger `2026-10-03-smoke5-fixes`).
 *
 *   · only items that NAME a place are looked up (the caller passes those, already grouped by day);
 *   · round-robin ACROSS DAYS — every day's first named item, then every day's second, … — so the
 *     per-draft budget reaches the last day (production smoke 3);
 *   · SMOKE 5: when a day's FIRST attached lookup stores no hours fact, that day's NEXT named item is
 *     attempted next, before the round-robin continues. A day whose first place has no opening hours
 *     (a market street, a garden path) otherwise ended with no hours at all while the budget went to
 *     days that already had some. It applies once per day — to the first attached lookup — and the
 *     cap (`PLACES_LOOKUPS_PER_DRAFT`) is the caller's and is unchanged.
 */
export class LookupScheduler<T> {
  private readonly days: number[];
  private readonly lists: Map<number, T[]>;
  private readonly cursor = new Map<number, number>();
  private readonly firstAttachSeen = new Set<number>();
  private readonly priority: number[] = [];
  private dayIndex = 0;

  constructor(byDay: Map<number, T[]>) {
    this.lists = byDay;
    this.days = Array.from(byDay.keys()).sort((a, b) => a - b);
    for (const d of this.days) this.cursor.set(d, 0);
  }

  /** The next item to look up, with its day, or null when every day is exhausted. */
  next(): { day: number; entry: T } | null {
    while (this.priority.length) {
      const d = this.priority.shift()!;
      const e = this.take(d);
      if (e) return { day: d, entry: e };
    }
    for (let spins = 0; spins < this.days.length; spins++) {
      const d = this.days[this.dayIndex];
      this.dayIndex = (this.dayIndex + 1) % this.days.length;
      const e = this.take(d);
      if (e) return { day: d, entry: e };
    }
    return null;
  }

  /** What the lookup just taken from `day` did. Only the day's FIRST attached lookup can re-prioritise. */
  report(day: number, outcome: { attached: boolean; hasHours: boolean }): void {
    if (!outcome.attached || this.firstAttachSeen.has(day)) return;
    this.firstAttachSeen.add(day);
    if (!outcome.hasHours) this.priority.push(day);
  }

  /** Every entry not yet handed out — what a stopped run never tried. */
  remaining(): Array<{ day: number; entry: T }> {
    const out: Array<{ day: number; entry: T }> = [];
    for (const d of this.days) {
      const list = this.lists.get(d)!;
      for (let i = this.cursor.get(d)!; i < list.length; i++) out.push({ day: d, entry: list[i] });
    }
    return out;
  }

  private take(day: number): T | null {
    const list = this.lists.get(day);
    const i = this.cursor.get(day) ?? 0;
    if (!list || i >= list.length) return null;
    this.cursor.set(day, i + 1);
    return list[i];
  }
}
