/**
 * Row 267 (F2; approved by Leon Oct 27, 2026): the plan card's optimizer labels. "Optimized" shows only
 * on a plan that went through the optimizer (the lastOptimizedAt gate is unchanged); the score badge
 * reads "Plan score" and "N out of 100".
 */
export const OPTIMIZER_BADGE_COPY = {
  optimized: "Optimized",
  planScore: "Plan score",
  outOf100: (n: number): string => `${n} out of 100`,
} as const;
