/**
 * THE COMPARE VIEW'S WORDS (Track A step A4; ledger `2026-09-29-a4-plan-fit-compare`; product map
 * §E4, §M3, §M9; Part 6 mock screen 2, "Hotel compare at 375 px").
 *
 * Every NUMBER here arrives from the server (`GET /api/trips/:tripId/option-sets`); these functions
 * only choose the words around it — one home for each sentence, so the page and its test read the
 * same text (§18 rule 1). §13 on every cell: a figure the server did not give is a dash and a reason,
 * never a zero and never a guess.
 */
import type { PlanFit } from "@shared/plan-fit";

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

/** Travel / day: minutes when scored; "est." whenever any leg was a straight-line estimate. */
export function travelCell(fit: PlanFit): Cell {
  if (!fit.scored) return { value: "—", note: fit.reason === "option_unlocated" ? "no pin yet" : "not enough stops yet" };
  return { value: `${fit.minutesPerDay} min`, note: fit.basis === "est" ? "est." : "per day" };
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

export function compareTitle(count: number): string {
  return count === 1 ? "Compare 1 place" : `Compare ${count} places`;
}
