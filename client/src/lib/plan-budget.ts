/**
 * PLAN BUDGET — the plan's total is DERIVED from its events, and is never stored.
 * Ledger `2026-09-04-event-budget`; CLAUDE.md Locked Decision 29.
 *
 * THE BUDGET UNIT IS THE EVENT. `user_experiences.budget` is the traveler's own stated number for
 * ONE event inside the plan (an event IS a `user_experiences` row — ruling 29, no new artifact).
 * A plan-level budget column would be a SECOND number for the same fact, free to disagree with the
 * rows it claims to summarise the moment one of them is edited — the derivation-drift class §18
 * rule 1 names. So the plan total is computed, here, once, from the rows themselves, and nothing
 * writes it anywhere.
 *
 * THIS MODULE IS PURE — no React, no fetch, no DB, no imports at all — so every rule below is
 * testable on its own and cannot quietly become a second copy at a call site.
 *
 * WHAT IT MAY SAY, AND WHAT IT MAY NOT (§13):
 *  - It totals ONLY events that actually state a budget. `null`, absent, an empty string and any
 *    unparseable value all mean NOT STATED — none of them is zero, and none is counted.
 *  - When NO event states one, `planBudgetTotal` returns `null` and the caller renders NOTHING.
 *    "$0" would be a claim the traveler never made, and "Budget across 0 events" is worse: it
 *    reports an absence as a measurement.
 *  - It does NOT filter values it dislikes. Negatives cannot be born through the write rail
 *    (`userExperienceBudgetSchema` refuses them at admission, which is the one place that can),
 *    and a legacy row that somehow holds one is still SUMMED and still COUNTED here: silently
 *    dropping a stored value would make the total disagree with the "across N events" it is
 *    printed beside. A reader that lies quietly is worse than one that shows an odd number.
 *  - It is not money in the §14 sense. A budget is a stated intention; nothing here feeds a
 *    charge, a fee, a payout or a rate, and nothing here may start.
 *
 * A PAYER IS DELIBERATELY NOT MODELLED. "Whose budget is this" is a money IDENTITY, and identity
 * on a money path is exactly what §14 keeps off the client; it belongs to the cost-split lane, not
 * to a display total.
 */

/**
 * The structural subset this module reads. Declared here rather than imported from `slip-events`
 * so the module stays import-free (the `EventLinkedItem` precedent in that same file): a caller
 * passes its own richer event objects and they satisfy this by shape.
 */
export interface BudgetBearingEvent {
  /** `user_experiences.budget`. A `decimal` column, so the wire spelling is normally a string. */
  budget?: string | number | null;
}

export interface PlanBudgetTotal {
  /** The sum of every stated budget, in the plan's display currency (see `formatPlanBudget`). */
  total: number;
  /** How many EVENTS stated one — never the plan's event count, which is a different number. */
  eventCount: number;
}

/**
 * ONE event's stated budget as a number, or `null` for NOT STATED.
 *
 * The column round-trips as a string ("1200.00"), so a string is the expected input and a number
 * is accepted for the day a payload carries one. Everything else — `null`, `undefined`, `""`,
 * whitespace, "abc", `NaN`, `Infinity`, a boolean, an object — is NOT STATED. `Number("")` is 0
 * and `Number(" ")` is 0, which is precisely the coercion that would turn "the traveler left this
 * blank" into "the traveler said zero", so an empty/blank string is refused BEFORE the coercion.
 */
export function statedEventBudget(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The plan's total across the events that stated a budget.
 *
 * @returns `null` when NO event stated one — the caller must then render nothing at all. A
 *          non-null result always has `eventCount >= 1`, so a caller never has to guard against
 *          "across 0 events".
 */
export function planBudgetTotal(
  events: readonly BudgetBearingEvent[] | null | undefined,
): PlanBudgetTotal | null {
  let total = 0;
  let eventCount = 0;
  for (const event of events ?? []) {
    const stated = statedEventBudget(event?.budget);
    if (stated === null) continue;
    total += stated;
    eventCount += 1;
  }
  if (eventCount === 0) return null;
  // Currency arithmetic in binary floats accumulates a tail (0.1 + 0.2). The column holds two
  // decimal places, so the sum is snapped back to the same scale rather than rendered with the
  // artefact — this rounds a DISPLAY total, and settles no money.
  return { total: Math.round(total * 100) / 100, eventCount };
}

/**
 * The plan's display currency. There is NO per-plan currency column on `trips` today, and the
 * slip's existing money lines are plain USD (`SlipView`'s awaiting-checkout cost, PlanCard's
 * totals, `EscalationCTA`'s fee). So this reuses that convention rather than inventing a symbol
 * of its own — and it is stated HERE, once, so the day a plan carries its own currency there is a
 * single place to read it from instead of a hardcoded "$" scattered across surfaces.
 *
 * Fraction digits are 0 OR 2, never 1: a round budget reads "$1,200" the way the slip's other
 * amounts do, while a stated 1200.5 keeps BOTH its cents digits ("$1,200.50") instead of being
 * rounded away or printed as the "$1,200.5" that no currency is written in.
 */
export function formatPlanBudget(amount: number): string {
  const digits = Math.round(amount * 100) % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/**
 * The whole line, or `null` when there is nothing true to say.
 *
 * "Budget across 2 events: $1,600" — the COUNT is part of the claim, not decoration: it says which
 * events the number covers, so a plan with three events and one stated budget cannot be read as a
 * total for all three. Singular for one event, because "across 1 events" reads as a bug and makes
 * a reader distrust the number beside it.
 */
export function planBudgetLine(
  events: readonly BudgetBearingEvent[] | null | undefined,
): string | null {
  const summary = planBudgetTotal(events);
  if (!summary) return null;
  const unit = summary.eventCount === 1 ? "event" : "events";
  return `Budget across ${summary.eventCount} ${unit}: ${formatPlanBudget(summary.total)}`;
}
