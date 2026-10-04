/**
 * Smoke 10 S10-2 (ledger `2026-10-04-smoke10-fixes`): what `/itinerary-comparison/:id` renders. Pure.
 *   · the id is a comparison ON a plan ⇒ that plan's versions board (and the run's own state);
 *   · the id is not a comparison the viewer can read ⇒ it is read as a PLAN id (the board for it, or
 *     "no such plan" when the plan read fails too);
 *   · a comparison with NO plan (the trip-less guest cart) ⇒ the legacy screen, the one case left.
 */
export type PlanVersionsTarget =
  | { kind: "loading" }
  | { kind: "tripless" }
  | { kind: "plan"; tripId: string; comparisonStatus: string | null };

export function planVersionsTarget(input: {
  id: string;
  comparisonLoaded: boolean;
  comparisonFailed: boolean;
  comparison: { tripId?: string | null; status?: string | null } | null;
}): PlanVersionsTarget {
  if (input.comparisonLoaded && input.comparison) {
    if (!input.comparison.tripId) return { kind: "tripless" };
    return { kind: "plan", tripId: input.comparison.tripId, comparisonStatus: input.comparison.status ?? null };
  }
  if (input.comparisonFailed) return { kind: "plan", tripId: input.id, comparisonStatus: null };
  return { kind: "loading" };
}

/** A run's state for the page's one line; `ready`/`none` draw no line (the board says the rest). */
export function versionsRunState(status: string | null | undefined): "none" | "awaiting_payment" | "building" | "failed" | "ready" {
  switch (status) {
    case "pending_payment":
      return "awaiting_payment";
    case "generating":
    case "pending":
      return "building";
    case "failed":
      return "failed";
    case "generated":
    case "completed":
    case "applied":
      return "ready";
    default:
      return "none";
  }
}
