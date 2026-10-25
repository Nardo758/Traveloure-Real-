/**
 * THE COMPARE VIEW'S WORDS (Track A step A4; ledger `2026-09-29-a4-plan-fit-compare`; product map
 * §E4, §M3, §M9; Part 6 mock screen 2, "Hotel compare at 375 px").
 *
 * Every NUMBER here arrives from the server (`GET /api/trips/:tripId/option-sets`); these functions
 * only choose the words around it — one home for each sentence, so the page and its test read the
 * same text (§18 rule 1). §13 on every cell: a figure the server did not give is a dash and a reason,
 * never a zero and never a guess.
 *
 * MINUTES (fix queue 182, Architect 2026-10-25): a minute is shown only for a day that has a checked
 * (routed) leg. The check is the slip's own rule — `slipLegBetween` in `client/src/lib/slip-legs.ts`
 * returns `kind: "routed"` only when the transport carries the engine's `routed` facts. Getting around
 * (`client/src/lib/getting-around.ts`) calls that same function. A straight-line stand-in is
 * `kind: "unrouted"` and does not count. The option-set payload this page reads has no transports and
 * no per-day routed flag, so the page passes no checked days and prints no minute.
 */
import { planFitLine, type PlanFit } from "@shared/plan-fit";
import { slipLegBetween } from "./slip-legs";

export interface DatedPriceView {
  amount: string;
  currency: string;
  nights: number;
}

export interface Cell {
  value: string;
  note: string;
}

/** The one new traveler-facing sentence on this board. Owner approval held. */
export const PLAN_COMPARE_COPY = {
  notCheckedYet: "Not checked yet",
} as const;

/**
 * Day numbers that have a checked (routed) leg, using the slip and Getting-around rule
 * (`slipLegBetween` → `kind: "routed"`). A day with only an unrouted, estimated, or not-checked
 * pair is absent.
 */
export function daysWithCheckedLeg(days: Parameters<typeof slipLegBetween>[0]): ReadonlySet<number> {
  const checked = new Set<number>();
  for (const day of days ?? []) {
    const dayNumber = Number(day.dayNumber ?? day.dayNum);
    if (!Number.isInteger(dayNumber) || dayNumber <= 0) continue;
    const stops = (day.activities ?? []).filter((stop) => stop.id);
    for (let i = 0; i < stops.length - 1; i++) {
      const leg = slipLegBetween([day], stops[i].id, stops[i + 1].id);
      if (leg?.kind === "routed") {
        checked.add(dayNumber);
        break;
      }
    }
  }
  return checked;
}

function scoredDayEntries(fit: Extract<PlanFit, { scored: true }>): Array<[number, number]> {
  if (!fit.minutesByDay) return [];
  return Object.entries(fit.minutesByDay)
    .map(([day, minutes]) => [Number(day), Number(minutes)] as [number, number])
    .filter(([day, minutes]) => Number.isInteger(day) && day > 0 && Number.isFinite(minutes) && minutes >= 0)
    .sort((a, b) => a[0] - b[0]);
}

/** True when every scored day has a checked leg. An empty day list is not "all checked". */
function everyScoredDayChecked(fit: Extract<PlanFit, { scored: true }>, checkedDays: ReadonlySet<number> | undefined): boolean {
  const days = scoredDayEntries(fit);
  return days.length > 0 && days.every(([day]) => checkedDays?.has(day) === true);
}

/** A, B, C — by the option's position in its set. */
export function optionLetter(position: number): string {
  return String.fromCharCode(64 + Math.max(1, Math.min(26, position)));
}

/**
 * Travel / day. Minutes only when every scored day has a checked leg — the figure is one mean, so
 * one unchecked day makes the whole number unusable. Otherwise the approved line. Never "est.".
 * Unscored stays a dash and the reason the server gave.
 */
export function travelCell(fit: PlanFit, checkedDays?: ReadonlySet<number>): Cell {
  if (!fit.scored) return { value: "—", note: fit.reason === "option_unlocated" ? "no pin yet" : "not enough stops yet" };
  if (!everyScoredDayChecked(fit, checkedDays)) return { value: PLAN_COMPARE_COPY.notCheckedYet, note: "" };
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

/**
 * M9, revealed on a chosen set: how much easier this place would make the days.
 * The minute sentence follows Travel / day. An unchecked day, or a fit with no scored days,
 * reads the approved line instead of a straight-line difference. No "est." suffix.
 */
export function savesLine(minutes: number, fit: PlanFit, checkedDays?: ReadonlySet<number>): string {
  if (!fit.scored || !everyScoredDayChecked(fit, checkedDays)) return PLAN_COMPARE_COPY.notCheckedYet;
  return `${minutes} min less travel per day than your choice`;
}

/**
 * The fit sentence under the metrics. Unscored keeps `planFitLine` (it states what is missing and
 * names no minute). A scored fit names minutes only when every scored day is checked, and never
 * with the straight-line "est." label. Otherwise the approved line.
 */
export function compareFitLine(fit: PlanFit, checkedDays?: ReadonlySet<number>): string {
  if (!fit.scored) return planFitLine(fit);
  if (!everyScoredDayChecked(fit, checkedDays)) return PLAN_COMPARE_COPY.notCheckedYet;
  return planFitLine(fit).replace(/^est\. /, "");
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
 * THE COMPARE BOARD'S DAY STRIP (slip conformance, boards rev 15; ledger `2026-10-08-slip-compare-board`;
 * fix queue 182): one cell per day, in day order. A day shows the server's minutes only when
 * `checkedDays` contains it (a checked routed leg). Every other day reads the approved line. No "~",
 * no straight-line minute. Nothing is judged "close" or "far". Unscored ⇒ no strip.
 */
export function dayStripCells(fit: PlanFit, checkedDays?: ReadonlySet<number>): { day: number; label: string; minutes: string }[] {
  if (!fit.scored) return [];
  return scoredDayEntries(fit).map(([day, minutes]) => ({
    day,
    label: `Day ${day}`,
    minutes: checkedDays?.has(day) ? `${Math.round(minutes)} min` : PLAN_COMPARE_COPY.notCheckedYet,
  }));
}

/** The board's eyebrow: what the set compares and how many places are in it. */
export function compareEyebrow(label: string | null, count: number): string {
  return `${label ?? "Places to stay"} · ${count} ${count === 1 ? "place" : "places"}`;
}
