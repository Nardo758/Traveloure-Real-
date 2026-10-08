/**
 * The placeholder window a dateless mint carries (ledger `2026-10-08-e1-zero-questions`; decision-maker,
 * Oct 8, 2026, E1 ruling 1). PURE.
 *
 * `trips.start_date` / `end_date` are NOT NULL and stay so — no migration touches them. A plan started
 * from the Experiences page asks no When, so its row carries ONE day, the MINT DAY, as both start and
 * end, and `dates_confirmed_at` stays NULL: every reader then calls it a placeholder (`shared/plan-dates.ts`),
 * the slip asks "Set your dates", and the day chips show one "Day 1" with no rule change. The mint day is
 * read in the plan's own zone (`resolveTripTimezone`, the launch-market lookup); a destination outside the
 * eight reads it in UTC — a placeholder, labelled as one, so no zone is claimed by it.
 */
import { resolveTripTimezone } from "./trip-timezone";

export function placeholderMintDay(destination: string | null | undefined, now: Date = new Date()): string {
  const timeZone = resolveTripTimezone(destination) ?? "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
