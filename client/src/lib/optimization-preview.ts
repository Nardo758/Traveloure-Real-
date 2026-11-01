/**
 * optimization-preview — the pure reading of the FREE heuristic preview shown beside the slip's
 * "Optimize this plan" button.
 *
 * Ledger `2026-09-05-optimize-preview-on-slip`; CLAUDE.md Locked Decision 41 (d):
 * "the existing free heuristic … is shown on the slip beside Optimize so the traveler sees what
 * a paid run would buy before paying; charge only when they confirm."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE MAY AND MAY NOT SAY (§13)
 * ─────────────────────────────────────────────────────────────────────────────
 * The server heuristic (`server/services/optimization-preview.service.ts`) reads each item's
 * TYPE, PRICE, DURATION and DAY NUMBER. It reads no coordinates, no travel times and no dates.
 * So this module renders the four things that were actually computed — the plan's score, the
 * gap to 100, the weakest dimension, and how many items over how many days — and NEVER a
 * distance, a drive time, a percentage saved or a dollar figure. The trip-addressed endpoint
 * does not even send those; the cart's older response still carries three extrapolated numbers
 * (a flat percentage of the score gap), and this surface deliberately does not read them.
 *
 * A value that could not be computed is OMITTED WITH THE SERVER'S OWN REASON, never a
 * placeholder: `describeOptimizationPreview` returns `null` for an absent preview and a
 * `{ kind: "reason" }` shape carrying the server's text for a refused one. The reason is passed
 * through verbatim — restating it here would be a second authority on when a preview is
 * possible (§18 rule 1).
 *
 * The fee is SERVER-RESOLVED (`GET /api/optimization-fee`) and Trip Pass coverage is the
 * server's `coversAction` answer on that same response — never inferred from anything the
 * client can see. Nothing in this module charges anything; the charge still happens only when
 * the traveler presses Optimize and confirms.
 */

import type { Finding, LegCoverage } from "@shared/optimizer-lead";

// ── Server shapes (mirrors of what the two endpoints return) ─────────────────────────────────

export interface PreviewDimension {
  key: "balance" | "diversity" | "pace" | "wellness";
  /** Traveler-facing name — authored SERVER-side and rendered as given. */
  label: string;
  score: number;
}

export interface TripOptimizationPreviewComputed {
  computable: true;
  itemCount: number;
  dayCount: number;
  currentScore: number;
  improvementRoom: number;
  weakest: PreviewDimension;
  dimensions: PreviewDimension[];
  /** Purchased items a run would treat as fixed points. */
  fixedCount: number;
  /** Surface step 4 (spec §8, R-f): what Optimize found — kinds and counts only. */
  findings?: Finding[];
  /** A real price exists on the plan (a listing or a booking) — gates the cost delta line. */
  hasPricedItems?: boolean;
  /** P0-d item 1: every pair of stops on the days ahead has a routed leg; absent ⇒ no all-clear. */
  coverage?: LegCoverage;
  /** P0-d item 1: the plan earns routed legs (`planGetsRoutedLegs`); a free plan never gets the all-clear. */
  routedPlan?: boolean;
}

export interface TripOptimizationPreviewRefused {
  computable: false;
  reason: string;
  /** Surface step 4: the findings ride a refused score too. */
  findings?: Finding[];
  hasPricedItems?: boolean;
  coverage?: LegCoverage;
  routedPlan?: boolean;
}

export type TripOptimizationPreview =
  | TripOptimizationPreviewComputed
  | TripOptimizationPreviewRefused;

export interface OptimizationFeeQuote {
  complexityTier: string;
  feeCents: number;
  currency: string;
  creditTowardCoordination?: boolean;
  aiDisabled: boolean;
  /** SERVER truth (`coversAction(tripId, "optimizer_run")`) — never inferred client-side. */
  coveredByTripPass: boolean;
  /** R-ac (step 6): the Trip Pass's run allowance on this trip; absent ⇒ no active pass. */
  tripPassRuns?: { cap: number; used: number; left: number };
  /** Server truth from `optimizerFreeRetimes()`; null or absent means not known, the client never reads the env or holds a literal. */
  freeRetimesPerVersion?: number | null;
}

/**
 * R-ac (step 6): the pass holder's run line — "4 of 5 Trip Pass runs left", or, with none left, that
 * the next run is paid (the CTA then carries the band fee). Null without a pass (§13: nothing claimed).
 */
export function tripPassRunsLine(fee: OptimizationFeeQuote | null | undefined): string | null {
  const r = fee?.tripPassRuns;
  if (!r) return null;
  if (r.left <= 0) return `Your Trip Pass's ${r.cap} runs are used · the next run is a paid run`;
  return `${r.left} of ${r.cap} Trip Pass ${r.cap === 1 ? "run" : "runs"} left`;
}

// ── The line ────────────────────────────────────────────────────────────────────────────────

// Surface step 4 (ledger `2026-10-03-surface-step4-optimizer-lead`): the "scores N/100" line and its
// caveat are GONE — `OptimizerLead` renders what Optimize FOUND instead (spec §8). §18c: deleted, not
// kept beside the card that replaced them.

// ── The fee chip ────────────────────────────────────────────────────────────────────────────

export const TRIP_PASS_COVERED_LABEL = "Included in your Trip Pass";

/**
 * ONE MONEY FORMATTER FOR THE SLIP'S AI CONTROLS (§18 rule 1).
 *
 * Exported for the Ask-AI drawer (ledger `2026-09-16-l16-lanes2-3-drawer`), which states the
 * `concierge:ai_task` band's server-resolved amount beside this rail's own run fee. A second
 * `Intl.NumberFormat` call written beside it is how one surface starts rendering `$12` where the
 * other renders `$12.00`. It formats a number the SERVER resolved and derives no amount itself.
 */
export function formatMoneyCents(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
    }).format(amount);
  } catch {
    // An unrecognised currency code is stated, not swallowed into a bare number that would read
    // as dollars.
    return `${amount.toFixed(2)} ${(currency || "").toUpperCase()}`.trim();
  }
}

/**
 * THE ONE RE-RUN RULE, in words (B3, production smoke test Sep 30, 2026 — ledger
 * `2026-09-30-b3-b6-draft-is-the-deliverable`). The server's rule is Locked Decision 41 (a), ledger
 * `2026-09-05-trip-pass-run-gate` (`resolveOptimizerRunAuthorization`): a run is covered by a Trip
 * Pass on its plan, else FREE when the traveler completed an optimization in the last 24 hours
 * (`OPTIMIZATION_FREE_RERUN_MS`), else charged. The slip's fee line and the comparison board both
 * render THIS sentence — two surfaces wording the rule separately is how they came to disagree
 * ("free within 24 hours" on one, "charged on confirm" on the other) (§18 rule 1).
 */
// R-ac (step 6): the unlimited 24-hour full re-run is retired. What stays free after a run is re-timing
// a day on the versions board (smart-sequencing, no model call); another full run is paid, or covered
// by a Trip Pass up to its cap.
//
// Row 266 (ledger `2026-11-01-row266-free-retime-copy`): the line states the count the SERVER allows
// (`freeRetimesPerVersion` on the fee quote) and reads the Trip Pass line when the server says the pass
// covers the run. No client env read and no literal count. The board keeps its own line (`retimeLine`).
// Approvals: `free` and `freeWithCount` Leon, Oct 27, 2026; `freeOne` Leon, Oct 28, 2026; `tripPass` the
// Architect, Oct 27, 2026, with Leon approving the PR before it ships.
export const OPTIMIZE_RERUN_COPY = {
  /** No usable count on the quote (null, absent, or not a whole number). */
  free: "Re-timing a day is free for 24 hours.",
  /** The quote's count is exactly one. */
  freeOne: "Re-timing a day is free for 24 hours, with one free re-time for each version.",
  /** The quote's count is two or more. */
  freeWithCount: (count: number) => `Re-timing a day is free for 24 hours, with ${count} free re-times for each version.`,
  /** The server's `coveredByTripPass` is true. */
  tripPass: "Re-timing a day is included with your Trip Pass, for 24 hours after each run.",
} as const;

/** The count-free line. The cart reads no fee quote, so its bullet stays this one. */
export const OPTIMIZE_RERUN_RULE = OPTIMIZE_RERUN_COPY.free;

/**
 * The Optimize card's re-run line for this quote. A count of zero shows no line (ruled), so this returns
 * null; any other unusable value reads the count-free line.
 */
export function optimizeRerunRule(fee: OptimizationFeeQuote | null | undefined): string | null {
  if (fee?.coveredByTripPass === true) return OPTIMIZE_RERUN_COPY.tripPass;
  const n = fee?.freeRetimesPerVersion;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return OPTIMIZE_RERUN_COPY.free;
  if (n === 0) return null;
  if (n === 1) return OPTIMIZE_RERUN_COPY.freeOne;
  return OPTIMIZE_RERUN_COPY.freeWithCount(n);
}

// The fee chip's sentence moved onto the card's CTA (`optimizeCtaLabel`, `components/plan/OptimizerLead`).
