/**
 * WHO GETS ROUTED LEGS — the ONE predicate (step 9a ruling 2, ledger `2026-10-07-step9a-routing-engine`;
 * surface spec R-e, §14.3). Every leg WRITER and every leg READER goes through `planGetsRoutedLegs`;
 * there is no second copy (§18 rule 1).
 *
 * A plan gets routed legs when ANY of these holds:
 *   · a FINISHED Optimize run — the plan holds an `ai_optimized` variant (written only at the end of an
 *     authorized paid or Trip Pass run; the free activate-transport variant is `source: "ai"`)
 *   · an ACTIVE Trip Pass on the plan
 *   · a handoff the expert has ACCEPTED or DELIVERED — never `proposed` / `unmatched` (no expert holds it)
 *   · a Ready Made copy (ruled a paid plan under R-e, spec 2026-10-04)
 * Otherwise it is a free plan: thin connectors and airport legs only (R-e). Pure; the server loads the facts.
 */
export const ROUTED_LEG_HANDOFF_STATUSES = ["accepted", "delivered"] as const;

export interface PlanRoutingFacts {
  finishedOptimizeRun: boolean;
  activeTripPass: boolean;
  /** The plan's current handoff status, or null when it has none. */
  handoffStatus: string | null;
  readyMadeCopy: boolean;
}

export function planGetsRoutedLegs(plan: PlanRoutingFacts): boolean {
  return (
    plan.finishedOptimizeRun ||
    plan.activeTripPass ||
    (plan.handoffStatus != null && (ROUTED_LEG_HANDOFF_STATUSES as readonly string[]).includes(plan.handoffStatus)) ||
    plan.readyMadeCopy
  );
}
