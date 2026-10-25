/**
 * THE COMPARE VIEW'S WORDS (Track A step A4; ledger `2026-09-29-a4-plan-fit-compare`; product map
 * §E4, §M3, §M9; Part 6 mock screen 2, "Hotel compare at 375 px").
 *
 * Every NUMBER here arrives from the server (`GET /api/trips/:tripId/option-sets`); these functions
 * only choose the words around it — one home for each sentence, so the page and its test read the
 * same text (§18 rule 1). §13 on every cell: a figure the server did not give is a dash and a reason,
 * never a zero and never a guess.
 *
 * B8 (fix-queue row 182, architect 2026-10-25): a day's minutes are shown only when that day is
 * checked (`fit.checkedByDay`). A straight-line estimate is not shown. Travel / day uses the same
 * rule and does not total a mix of checked and unchecked days.
 */
import { planFitLine, type PlanFit } from "@shared/plan-fit";

/**
 * Traveler-facing sentences for travel minutes on the compare page.
 * Wording is held for owner approval.
 */
export const PLAN_COMPARE_MINUTE_COPY = {
  notCheckedYet: "Not checked yet",
  someDaysNotChecked: "Some days are not checked yet",
} as const;

export interface DatedPriceView {
  amount: string;
  currency: string;
  nights: number;
}

export interface Cell {
  value: string;
  note: string;
}

/** A, B, C — by the option's position in its set. */
export function optionLetter(position: number): string {
  return String.fromCharCode(64 + Math.max(1, Math.min(26, position)));
}

type ScoredFit = Extract<PlanFit, { scored: true }>;

/** Days the strip draws, in day order. A non-day or a non-number is dropped, never shown as zero. */
function shownDayNumbers(fit: ScoredFit): number[] {
  if (!fit.minutesByDay) return [];
  return Object.entries(fit.minutesByDay)
    .map(([d, m]) => [Number(d), Number(m)] as const)
    .filter(([d, m]) => Number.isInteger(d) && d > 0 && Number.isFinite(m) && m >= 0)
    .map(([d]) => d)
    .sort((a, b) => a - b);
}

/**
 * A day is checked when every leg summed into it is a routed duration.
 * `checkedByDay` is that answer, one boolean per day. When the payload has no such map, an
 * all-matrix figure is checked and a straight-line figure is not — a straight-line minute is
 * never shown on the strength of the aggregate alone.
 */
export function dayChecked(fit: ScoredFit, day: number): boolean {
  const map = fit.checkedByDay;
  if (map && (Object.prototype.hasOwnProperty.call(map, day) || Object.prototype.hasOwnProperty.call(map, String(day)))) {
    return map[day] === true;
  }
  if (map) return false;
  return fit.basis === "matrix";
}

/** True when every day the strip would draw is checked, and the aggregate is not a straight-line figure. */
export function allShownDaysChecked(fit: PlanFit): boolean {
  if (!fit.scored || fit.basis === "est") return false;
  const days = shownDayNumbers(fit);
  if (days.length === 0) return fit.basis === "matrix";
  return days.every((d) => dayChecked(fit, d));
}

/**
 * Travel / day. Minutes only when every shown day is checked. If some days are unchecked, say so —
 * do not total the checked days, and do not count the others as zero.
 */
export function travelCell(fit: PlanFit): Cell {
  if (!fit.scored) return { value: "—", note: fit.reason === "option_unlocated" ? "no pin yet" : "not enough stops yet" };
  const days = shownDayNumbers(fit);
  if (days.length === 0) {
    return fit.basis === "matrix"
      ? { value: `${fit.minutesPerDay} min`, note: "per day" }
      : { value: PLAN_COMPARE_MINUTE_COPY.notCheckedYet, note: "" };
  }
  const checked = days.filter((d) => dayChecked(fit, d)).length;
  if (checked === 0) return { value: PLAN_COMPARE_MINUTE_COPY.notCheckedYet, note: "" };
  if (checked < days.length || fit.basis === "est") return { value: "—", note: PLAN_COMPARE_MINUTE_COPY.someDaysNotChecked };
  return { value: `${fit.minutesPerDay} min`, note: "per day" };
}

/** Walkable: the plan's areas within walking distance. Always a straight-line test, so always "est.". */
export function areasCell(fit: PlanFit): Cell {
  if (!fit.scored) return { value: "—", note: "not scored yet" };
  if (fit.coverage === null || fit.areasTotal === 0) return { value: "—", note: "areas not known" };
  return { value: `${fit.areasNear} of ${fit.areasTotal}`, note: "of your areas · est." };
}

function money(amount: string, currency: string): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

/**
 * Price: the cached offer for the plan's OWN dates when the server found one (the stay's total, as the
 * hotel stated it); else a listing's stated price; else "price from the hotel". Never typed, never "$0".
 */
export function priceCell(o: { datedPrice?: DatedPriceView | null; priceSnapshot: string | null; sourceKind: string }): Cell {
  if (o.datedPrice) {
    const v = money(o.datedPrice.amount, o.datedPrice.currency);
    if (v) return { value: v, note: `for your ${o.datedPrice.nights} ${o.datedPrice.nights === 1 ? "night" : "nights"}` };
  }
  if (o.sourceKind === "listing" && o.priceSnapshot != null) {
    const v = money(o.priceSnapshot, "USD");
    if (v) return { value: v, note: "listed price" };
  }
  return { value: "—", note: "price from the hotel" };
}

/** M9, revealed on a chosen set: how much easier this place would make the days. */
export function savesLine(minutes: number, fit: PlanFit): string {
  const est = fit.scored && fit.basis === "est" ? " · est." : "";
  return `${minutes} min less travel per day than your choice${est}`;
}

export function easierLine(count: number): string {
  return count === 1 ? "1 place would make your days easier" : `${count} places would make your days easier`;
}

/**
 * The foot of the view. Says only what is true today: an open set keeps every place open (R126); a
 * chosen one can be compared again until something is booked. It does NOT promise a paid run per
 * place — that is Track A step A7, not built.
 */
export function compareFootLine(status: "open" | "chosen" | "closed", chosenTitle: string | null, count: number): string {
  if (status === "chosen" && chosenTitle) return `You chose ${chosenTitle}. You can change your mind until you book.`;
  if (status === "closed") return "This comparison is closed. Your plan kept what it had.";
  const all = count === 1 ? "this place" : count === 2 ? "both places" : `all ${count}`;
  return `Not chosen yet — your plan keeps ${all} open.`;
}

/** The board's headline (rev 15, held-batch-1 item 17). The count lives in the eyebrow. */
export function compareTitle(_count: number): string {
  return "Which one fits your days?";
}

/**
 * THE COMPARE BOARD'S DAY STRIP (slip conformance, boards rev 15; ledger `2026-10-08-slip-compare-board`):
 * one cell per day, in day order. A checked day states the SERVER's own minutes (`fit.minutesByDay`).
 * A day that is not checked states `PLAN_COMPARE_MINUTE_COPY.notCheckedYet` — never a straight-line
 * minute and never a tilde. Nothing is judged "close" or "far". Unscored ⇒ no strip.
 */
export function dayStripCells(fit: PlanFit): { day: number; label: string; minutes: string }[] {
  if (!fit.scored || !fit.minutesByDay) return [];
  return Object.entries(fit.minutesByDay)
    .map(([d, m]) => [Number(d), Number(m)] as const)
    .filter(([d, m]) => Number.isInteger(d) && d > 0 && Number.isFinite(m) && m >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([d, m]) => ({
      day: d,
      label: `Day ${d}`,
      minutes: dayChecked(fit, d) ? `${Math.round(m)} min` : PLAN_COMPARE_MINUTE_COPY.notCheckedYet,
    }));
}

/**
 * The fit sentence on this page. Minutes only when the whole figure is checked. Otherwise the
 * located count, with no minute number.
 */
export function compareBurdenLine(fit: PlanFit): string {
  if (!fit.scored || !allShownDaysChecked(fit)) {
    if (!fit.scored) return planFitLine(fit);
    return `based on ${fit.located} of ${fit.total} located stops`;
  }
  return planFitLine(fit);
}

/** The savings sentence carries minutes. It is drawn only when those minutes are checked. */
export function compareSavingsShown(fit: PlanFit): boolean {
  return allShownDaysChecked(fit);
}

/** The board's eyebrow: what the set compares and how many places are in it. */
export function compareEyebrow(label: string | null, count: number): string {
  return `${label ?? "Places to stay"} · ${count} ${count === 1 ? "place" : "places"}`;
}
