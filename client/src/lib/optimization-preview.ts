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
}

export interface TripOptimizationPreviewRefused {
  computable: false;
  reason: string;
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
}

// ── The line ────────────────────────────────────────────────────────────────────────────────

/**
 * The standing caveat. Both halves are required by the ruling: the estimate is a simple
 * heuristic (not a measurement, and not a promise of the delta a run will produce), and what a
 * paid run actually builds is anchored versions of the plan priced from real listings.
 *
 * "up to three" is deliberate: the optimizer's own contract caps variants at three but yields
 * fewer when the destination's catalogue is thin, and promising exactly three would be a claim
 * the generator does not make (§13).
 */
export const OPTIMIZE_PREVIEW_CAVEAT =
  "An estimate from a simple heuristic — it reads what each item is, not where it is, so it names no distance, time or money saved. A paid run builds up to three anchored versions of your plan, priced from real listings.";

export type OptimizePreviewLine =
  | { kind: "estimate"; headline: string; caveat: string }
  | { kind: "reason"; reason: string };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Turn a preview response into the line the slip renders, or `null` when there is nothing
 * honest to show (no response yet, or a malformed one — never a placeholder).
 */
export function describeOptimizationPreview(
  preview: TripOptimizationPreview | null | undefined,
): OptimizePreviewLine | null {
  if (!preview || typeof preview !== "object") return null;
  if (preview.computable === false) {
    // The SERVER's reason, verbatim. An empty one is shown as nothing rather than as a guess.
    return preview.reason ? { kind: "reason", reason: preview.reason } : null;
  }
  if (preview.computable !== true || !preview.weakest) return null;

  const scope = `${plural(preview.itemCount, "item", "items")} over ${plural(
    preview.dayCount,
    "day",
    "days",
  )}`;
  const fixed =
    preview.fixedCount > 0
      ? ` ${plural(preview.fixedCount, "booked item", "booked items")} would stay put.`
      : "";

  return {
    kind: "estimate",
    headline:
      `This plan scores ${preview.currentScore}/100 across ${scope} — ` +
      `${preview.weakest.label.toLowerCase()} is its weakest part (${preview.weakest.score}/100), ` +
      `so that is where a run has the most room.${fixed}`,
    caveat: OPTIMIZE_PREVIEW_CAVEAT,
  };
}

// ── The fee chip ────────────────────────────────────────────────────────────────────────────

export const TRIP_PASS_COVERED_LABEL = "Included in your Trip Pass";

function formatMoney(cents: number, currency: string): string {
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
 * What the fee chip says, or `null` when there is no price to state. Three server-decided
 * cases, in order:
 *   - `aiDisabled`  → NOTHING. The run cannot be bought for this plan, so no price is honest.
 *   - `coveredByTripPass` → the existing covered label, on the server's word.
 *   - otherwise     → the server-resolved amount, with the pricing page's own promise attached.
 */
export function formatOptimizationFeeLabel(
  fee: OptimizationFeeQuote | null | undefined,
): string | null {
  if (!fee || typeof fee !== "object") return null;
  if (fee.aiDisabled) return null;
  if (fee.coveredByTripPass) return TRIP_PASS_COVERED_LABEL;
  if (!Number.isFinite(fee.feeCents) || fee.feeCents <= 0) return null;
  return `${formatMoney(fee.feeCents, fee.currency)} to run · charged only when you confirm`;
}
