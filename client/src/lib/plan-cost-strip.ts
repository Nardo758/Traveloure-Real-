/**
 * PLAN COST STRIP — the slip's per-person cost strip (fix-queue row 241; inventory row 221).
 * Ledger `2026-10-26-per-person-cost-strip`; the BudgetStrip board is the spec for the three states.
 *
 * Pure: no React, no fetch. The math, the state decision, the bar and every string live here once.
 *
 * WHAT IT COUNTS (Architect ruling, Oct 26, 2026): a stop's price counts only when it is a real
 * booking's amount or a price the traveler entered on the stop. A draft's price, an expert's quote,
 * a stop with no stated origin, a transport leg and the server's own totals are never summed. A
 * stop with no price is "unpriced", never $0 (§13).
 *
 * THE BUDGET is the plan's derived event total (`planBudgetTotal`, LD 29); nothing here stores one.
 * THE PARTY is `trip.travelers`, the traveling party (never the invited roster, LD 37); unstated
 * means no per-person figure, never a party of one.
 */
import { formatPlanBudget, planBudgetTotal, type BudgetBearingEvent } from "@/lib/plan-budget";
import { itemBookingLabelStatus } from "@shared/booking-visibility";
import { readPurchaseStatus } from "@/lib/purchase-status";
import type { PlanCardActivity } from "@/components/plancard/plancard-types";

/** Every traveler-facing string on the strip. Wording held for owner approval. */
export const PLAN_COST_STRIP_COPY = Object.freeze({
  pricedSoFarLabel: "Priced so far",
  budgetLabel: (budget: string, n: number | null) => (n === null ? `Budget · ${budget}` : `Budget · ${budget} for ${n}`),
  perPerson: (amount: string) => `${amount} per person`,
  travelers: (n: number) => (n === 1 ? "1 traveler" : `${n} travelers`),
  pricedWord: "priced",
  left: (amount: string) => `${amount} left`,
  coverageA: (n: number, m: number) => (m === 1 ? `${n} of 1 stop has a price` : `${n} of ${m} stops have a price`),
  unpriced: (k: number) => `${k} unpriced`,
  coverageB: (n: number, m: number) => (m === 1 ? `${n} of 1 stop priced` : `${n} of ${m} stops priced`),
  footnote: "Prices are the ones on your stops. Unpriced stops add nothing here. Partner prices are confirmed at booking.",
  noneTitle: "No priced stops yet",
  noneSub: "The strip appears once a stop has a price.",
  separator: " · ",
});

const snapCents = (n: number) => Math.round(n * 100) / 100;

/** The traveler's OWN price for one stop, or null. Never an estimate, never 0. */
export function stopOwnPrice(
  a: Pick<PlanCardActivity, "origin" | "cost" | "booking">,
): { amount: number; bookingId: string | null } | null {
  const b = a.booking;
  if (b && readPurchaseStatus(itemBookingLabelStatus(b))?.kind === "booked") {
    const amount = Number(b.totalAmount);
    if (b.totalAmount !== null && Number.isFinite(amount) && amount > 0) return { amount, bookingId: b.id };
  }
  if (a.origin === "traveler" && typeof a.cost === "number" && Number.isFinite(a.cost) && a.cost > 0) {
    return { amount: a.cost, bookingId: null };
  }
  return null;
}

/** A stated party: a whole number of at least 1, else null (never defaulted to 1). */
export function statedParty(travelers: number | null | undefined): number | null {
  return typeof travelers === "number" && Number.isInteger(travelers) && travelers >= 1 ? travelers : null;
}

export interface PlanCostSummary {
  /** null when no stop counts. Never 0. */
  pricedTotal: number | null;
  pricedCount: number;
  stopCount: number;
  /** null unless pricedTotal is set AND the party is stated. */
  perPerson: number | null;
}

export function planCostSummary(
  activities: readonly PlanCardActivity[],
  travelers: number | null | undefined,
): PlanCostSummary {
  let sum = 0;
  let pricedCount = 0;
  const seenBookings = new Set<string>();
  for (const a of activities) {
    const price = stopOwnPrice(a);
    if (!price) continue;
    pricedCount += 1;
    if (price.bookingId !== null) {
      // Two stops on one booking are both priced; the booking's amount counts once.
      if (seenBookings.has(price.bookingId)) continue;
      seenBookings.add(price.bookingId);
    }
    sum += price.amount;
  }
  const pricedTotal = pricedCount > 0 ? snapCents(sum) : null;
  const party = statedParty(travelers);
  const perPerson = pricedTotal !== null && party !== null ? snapCents(pricedTotal / party) : null;
  return { pricedTotal, pricedCount, stopCount: activities.length, perPerson };
}

/** Board A, B, C. */
export type PlanCostStripState = "priced_no_budget" | "budget_set" | "none_priced";

export interface PlanCostStripText {
  label: string | null;
  amount: string | null;
  secondary: string | null;
  coverageLeft: string | null;
  coverageRight: string | null;
  footnote: string | null;
  title: string | null;
  sub: string | null;
}

export interface PlanCostStripView {
  state: PlanCostStripState;
  summary: PlanCostSummary;
  /** The ONE traveler count: the divisor, "N travelers" and "for N". */
  party: number | null;
  budgetTotal: number | null;
  /** budget minus priced total; null with no budget, or when over budget. */
  remaining: number | null;
  /** The priced total is strictly over the budget. */
  over: boolean;
  /** A: share of stops priced; B: budget used; C: null. */
  barPercent: number | null;
  text: PlanCostStripText;
}

const clampPercent = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

export function planCostStripView(args: {
  activities: readonly PlanCardActivity[];
  travelers: number | null | undefined;
  planEvents: readonly BudgetBearingEvent[] | null | undefined;
}): PlanCostStripView {
  const C = PLAN_COST_STRIP_COPY;
  const summary = planCostSummary(args.activities, args.travelers);
  const party = statedParty(args.travelers);
  const budgetTotal = planBudgetTotal(args.planEvents)?.total ?? null;
  const { pricedTotal, pricedCount, stopCount, perPerson } = summary;
  const empty: PlanCostStripText = {
    label: null, amount: null, secondary: null, coverageLeft: null, coverageRight: null, footnote: null, title: null, sub: null,
  };

  if (budgetTotal !== null) {
    const priced = pricedTotal ?? 0;
    const over = priced > budgetTotal;
    const remaining = over ? null : snapCents(budgetTotal - priced);
    const barPercent = budgetTotal > 0 ? clampPercent((100 * priced) / budgetTotal) : priced > 0 ? 100 : 0;
    const secondary = [
      C.pricedWord,
      remaining === null ? null : C.left(formatPlanBudget(remaining)),
      perPerson === null ? null : C.perPerson(formatPlanBudget(perPerson)),
    ].filter((s): s is string => s !== null).join(C.separator);
    return {
      state: "budget_set", summary, party, budgetTotal, remaining, over, barPercent,
      text: {
        ...empty,
        label: C.budgetLabel(formatPlanBudget(budgetTotal), party),
        amount: formatPlanBudget(priced),
        secondary,
        coverageLeft: C.coverageB(pricedCount, stopCount),
      },
    };
  }

  if (pricedTotal !== null) {
    const unpriced = stopCount - pricedCount;
    const secondary =
      perPerson === null || party === null
        ? null
        : ["", C.perPerson(formatPlanBudget(perPerson)), C.travelers(party)].join(C.separator).trimStart();
    return {
      state: "priced_no_budget", summary, party, budgetTotal: null, remaining: null, over: false,
      barPercent: stopCount > 0 ? clampPercent((100 * pricedCount) / stopCount) : 0,
      text: {
        ...empty,
        label: C.pricedSoFarLabel,
        amount: formatPlanBudget(pricedTotal),
        secondary,
        coverageLeft: C.coverageA(pricedCount, stopCount),
        coverageRight: unpriced > 0 ? C.unpriced(unpriced) : null,
        footnote: C.footnote,
      },
    };
  }

  return {
    state: "none_priced", summary, party, budgetTotal: null, remaining: null, over: false, barPercent: null,
    text: { ...empty, title: C.noneTitle, sub: C.noneSub },
  };
}
