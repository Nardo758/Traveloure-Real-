/**
 * occasion-schedule.ts — pure date math for the occasion scheduler.
 *
 * Ledger 2026-08-27-plus-is-delivery. Decides, for one occasion and a given "today", whether it
 * is inside the 14-day lead window and, if so, which concrete occurrence it is drafting for. The
 * cycle_key returned is that occurrence's date (YYYY-MM-DD) — unique per cycle for ANY recurrence,
 * which is what makes the occasion_drafts ledger a correct idempotency guard (a bare year cannot
 * express a biweekly cycle).
 *
 * Kept pure and `today`-injectable so the "14-days-out → one draft" behaviour is unit-testable
 * without a clock. All math is date-only in UTC midnight.
 */
export const OCCASION_LEAD_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const BIWEEKLY_STEP_DAYS = 14;

export function parseDateUTC(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** Whole days from a→b (b minus a), both normalized to UTC midnight. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export interface DueOccurrence {
  /** The concrete target occurrence date, YYYY-MM-DD — the ledger dedupe key. */
  cycleKey: string;
  /** Same value as a Date for downstream date arithmetic. */
  targetDate: string;
  occasionYear: number;
}

/**
 * Returns the due occurrence if `today` falls within [target − leadDays, target], else null.
 *   · none     — the fixed occasion date, once. Past dates never fire again.
 *   · annual   — the month/day in the current or next year, whichever is in-window.
 *   · biweekly — the next occurrence on the 14-day cadence from the seed date; the lead window
 *                and the step are both 14 days, so each day maps to exactly one cycle.
 */
export function computeDueOccurrence(
  occasionDate: string,
  recurrence: string,
  today: Date,
  leadDays: number = OCCASION_LEAD_DAYS,
): DueOccurrence | null {
  const occ = parseDateUTC(occasionDate);
  const todayUTC = parseDateUTC(toDateKey(today));

  const dueFor = (target: Date): DueOccurrence | null => {
    const diff = daysBetween(todayUTC, target); // target − today
    if (diff >= 0 && diff <= leadDays) {
      return { cycleKey: toDateKey(target), targetDate: toDateKey(target), occasionYear: target.getUTCFullYear() };
    }
    return null;
  };

  if (recurrence === "annual") {
    const y = todayUTC.getUTCFullYear();
    for (const candidateYear of [y, y + 1]) {
      const target = new Date(Date.UTC(candidateYear, occ.getUTCMonth(), occ.getUTCDate()));
      const due = dueFor(target);
      if (due) return due;
    }
    return null;
  }

  if (recurrence === "biweekly") {
    // Smallest occurrence occ + 14k that is >= today (k >= 0).
    const elapsed = daysBetween(occ, todayUTC);
    const k = elapsed <= 0 ? 0 : Math.ceil(elapsed / BIWEEKLY_STEP_DAYS);
    const target = addDays(occ, k * BIWEEKLY_STEP_DAYS);
    return dueFor(target);
  }

  // recurrence === "none" (and any unknown value → treated as one-off)
  return dueFor(occ);
}
