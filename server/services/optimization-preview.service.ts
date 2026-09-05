/**
 * OPTIMIZATION PREVIEW — the ONE expression of the free sequencing heuristic.
 *
 * Ledger `2026-09-05-optimize-preview-on-slip`; CLAUDE.md Locked Decision 41 (d),
 * decision-maker ratified Sep 5, 2026:
 *
 *   "The existing free heuristic `POST /api/optimization-preview` is shown on the slip beside
 *    Optimize so the traveler sees what a paid run would buy before paying; charge only when
 *    they confirm."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ACTUALLY COMPUTES — and what it does NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * It is `calculateItineraryMetrics` (smart-sequencing.service.ts) and nothing more: four
 * sub-scores derived from each item's TYPE, PRICE, DURATION and DAY NUMBER —
 *
 *   balance   — how evenly adventure / cultural / dining / relaxation items are spread
 *   diversity — how many distinct activity categories the plan touches (8 categories = 100)
 *   pace      — activities per day against the 4–6 band
 *   wellness  — the share of the plan that is downtime, against the 20–40 % band
 *
 * — combined by the event type's own weights into a 0–100 `overallScore`.
 *
 * It reads NO geography, NO travel times and NO dates. There is no distance model here, so
 * this module never emits minutes of transit saved, kilometres avoided or a re-ordered day:
 * a preview that named a transit delta would be inventing one (§13). What it can honestly
 * say is where the plan currently scores and which dimension is weakest — the thing a paid
 * run has the most room to work on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EXTRAPOLATION IS SEGREGATED, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * The pre-existing cart response also carries `estimatedSavingsPct` / `estimatedCostDelta` /
 * `estimatedScheduleTighteningPct`. Those are NOT measurements: they are a flat 25 % (and
 * 30 %) extrapolation of the score gap, i.e. a number nothing computed from the plan's real
 * money or real schedule. They are preserved byte-for-byte for the cart (this lane changes no
 * existing surface) but live in their OWN function, `legacyPreviewExtrapolation`, so the
 * boundary is visible in code: the slip renders the computed part and never the extrapolated
 * dollar figure (§13 — no invented savings).
 *
 * ONE implementation, two callers (§18 rule 1):
 *   - `POST /api/optimization-preview` — the cart's body-shaped call (unchanged contract)
 *   - `GET  /api/optimization-preview?tripId=` — the slip's trip-shaped call, whose items come
 *     from `optimizer-baseline.service.ts` (the single expression of the optimizer read-set),
 *     server-side, so the client never sends an item list the server already holds (§14 reads).
 * Item NORMALIZATION differs per caller shape (a cart row has no day number; a trip item does)
 * and stays at each caller. The SCORING is here, once.
 */
import {
  calculateItineraryMetrics,
  type ItineraryMetrics,
} from "./smart-sequencing.service";

/** The four inputs the heuristic actually reads off an item. */
export interface PreviewHeuristicItem {
  serviceType: string;
  price?: string | number;
  duration?: number;
  dayNumber: number;
}

/**
 * Fewer than this many items and the preview is REFUSED, not computed. A one-item plan still
 * produces numbers (diversity 12.5, pace 25 …), but they describe the arithmetic, not an
 * opportunity: there is no second item to sequence it against, so a "room to improve" figure
 * drawn from them would read as a promise about a run that has nothing to re-order (§13).
 */
export const PREVIEW_MIN_ITEMS = 2;

export const PREVIEW_NO_ITEMS_REASON =
  "This plan has nothing the optimizer would read yet.";
export const PREVIEW_SINGLE_ITEM_REASON =
  "A single item can't be re-sequenced — the estimate needs at least two.";

export type PreviewDimensionKey = "balance" | "diversity" | "pace" | "wellness";

export interface PreviewDimension {
  key: PreviewDimensionKey;
  /** Traveler-facing name, stated ONCE here so no surface restates it (§18 rule 1). */
  label: string;
  /** 0–100, rounded for display. */
  score: number;
}

export interface OptimizationPreviewComputed {
  computable: true;
  /** Items the heuristic scored (the optimizer's own re-plannable read-set for a trip). */
  itemCount: number;
  /** Distinct day numbers among those items — counted, never assumed from trip length. */
  dayCount: number;
  /** `overallScore`, rounded. */
  currentScore: number;
  /** 100 − currentScore. The gap, stated as a gap — not converted into money or minutes. */
  improvementRoom: number;
  /** All four sub-scores, weakest first. */
  dimensions: PreviewDimension[];
  /** `dimensions[0]` — the dimension a run has the most room on. */
  weakest: PreviewDimension;
  /** The full metrics object, for callers that need cost/time totals (the cart's legacy fields). */
  metrics: ItineraryMetrics;
}

export interface OptimizationPreviewUncomputable {
  computable: false;
  /** The heuristic's OWN stated reason — surfaces render this, never a placeholder number. */
  reason: string;
}

export type OptimizationPreviewResult =
  | OptimizationPreviewComputed
  | OptimizationPreviewUncomputable;

const DIMENSION_LABELS: Record<PreviewDimensionKey, string> = {
  balance: "Balance of activity types",
  diversity: "Variety",
  pace: "Pace",
  wellness: "Downtime",
};

/**
 * Score a plan. Pure: no DB, no network, no clock — the same items always yield the same
 * answer, which is what makes the slip's line reproducible and testable.
 */
export function computeOptimizationPreviewHeuristic(
  items: PreviewHeuristicItem[],
  travelers: number = 1,
  eventType?: string,
  options?: {
    /**
     * Lowest item count this caller will accept. Defaults to `PREVIEW_MIN_ITEMS` (2) — the
     * honest floor, and what the slip uses. The cart passes 1 SOLELY to preserve its
     * pre-existing response contract verbatim: `POST /api/optimization-preview` has always
     * answered a one-item cart with a scored body, and this lane changes no existing surface.
     * That is a documented carry-over, not a second policy.
     */
    minItems?: number;
  },
): OptimizationPreviewResult {
  const minItems = Math.max(1, options?.minItems ?? PREVIEW_MIN_ITEMS);
  if (!Array.isArray(items) || items.length === 0) {
    return { computable: false, reason: PREVIEW_NO_ITEMS_REASON };
  }
  if (items.length < minItems) {
    return { computable: false, reason: PREVIEW_SINGLE_ITEM_REASON };
  }

  const metrics = calculateItineraryMetrics(items, travelers, eventType);

  const dimensions: PreviewDimension[] = (
    [
      ["balance", metrics.balanceScore],
      ["diversity", metrics.diversityScore],
      ["pace", metrics.paceScore],
      ["wellness", metrics.wellnessScore],
    ] as Array<[PreviewDimensionKey, number]>
  )
    .map(([key, score]) => ({ key, label: DIMENSION_LABELS[key], score: Math.round(score) }))
    // Weakest first. A tie keeps the declaration order above, so the answer is deterministic
    // rather than dependent on the sort's stability being asked for something it doesn't promise.
    .sort((a, b) => a.score - b.score);

  const currentScore = Math.round(metrics.overallScore);
  const dayCount = new Set(items.map((i) => i.dayNumber)).size;

  return {
    computable: true,
    itemCount: items.length,
    dayCount,
    currentScore,
    improvementRoom: Math.max(0, 100 - currentScore),
    dimensions,
    weakest: dimensions[0],
    metrics,
  };
}

/**
 * The cart's three legacy numbers, preserved EXACTLY as `POST /api/optimization-preview` has
 * always emitted them (the unrounded `overallScore` is deliberate — rounding first would move
 * the values). They are an EXTRAPOLATION of the score gap, not a computed saving: nothing in
 * this module measures money or minutes a re-ordering would recover. Kept for the cart's
 * existing UI; deliberately absent from the trip-addressed response the slip reads.
 */
export function legacyPreviewExtrapolation(preview: OptimizationPreviewComputed): {
  estimatedSavingsPct: number;
  estimatedCostDelta: number;
  estimatedScheduleTighteningPct: number;
} {
  const { metrics } = preview;
  const improvementRoom = Math.max(0, 100 - metrics.overallScore);
  const estimatedSavingsPct = Math.round(improvementRoom * 0.25); // up to 25% savings
  const estimatedScheduleTighteningPct = Math.round(
    (metrics.paceScore < 70 ? 70 - metrics.paceScore : 0) * 0.3,
  );
  const estimatedCostDelta =
    metrics.totalCost > 0
      ? -Math.round(metrics.totalCost * (estimatedSavingsPct / 100))
      : 0;
  return { estimatedSavingsPct, estimatedCostDelta, estimatedScheduleTighteningPct };
}
