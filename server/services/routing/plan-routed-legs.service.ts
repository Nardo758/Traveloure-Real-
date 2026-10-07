/**
 * The facts `planGetsRoutedLegs` decides on, loaded for one plan (step 9a ruling 2, ledger
 * `2026-10-07-step9a-routing-engine`). The rule itself is `shared/plan-routed-legs.ts` — this file only
 * reads. A read that fails answers FALSE for that fact (a free plan's posture: nothing routed is shown
 * or bought on a guess), and says so in the log.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { itineraryComparisons, itineraryVariants, readyMadePurchases } from "@shared/schema";
import { planGetsRoutedLegs, type PlanRoutingFacts } from "@shared/plan-routed-legs";
import { tripHasPass } from "../trip-entitlement.service";
import { getTripHandoff } from "../handoff.service";

async function safely<T>(label: string, fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err: any) {
    console.error(`[routing] plan fact '${label}' unreadable:`, err?.message ?? err);
    return fallback;
  }
}

export async function loadPlanRoutingFacts(tripId: string): Promise<PlanRoutingFacts> {
  const [finishedOptimizeRun, activeTripPass, handoffStatus, readyMadeCopy] = await Promise.all([
    safely("optimize_run", false, async () => {
      const [row] = await db
        .select({ id: itineraryVariants.id })
        .from(itineraryVariants)
        .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
        .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryVariants.source, "ai_optimized")))
        .limit(1);
      return !!row;
    }),
    safely("trip_pass", false, () => tripHasPass(tripId)),
    safely("handoff", null as string | null, async () => (await getTripHandoff(tripId))?.status ?? null),
    safely("ready_made_copy", false, async () => {
      const [row] = await db
        .select({ id: readyMadePurchases.id })
        .from(readyMadePurchases)
        .where(eq(readyMadePurchases.cloneTripId, tripId))
        .limit(1);
      return !!row;
    }),
  ]);
  return { finishedOptimizeRun, activeTripPass, handoffStatus, readyMadeCopy };
}

/** Does this plan get routed legs? The one server entry to the one rule. */
export async function tripGetsRoutedLegs(tripId: string): Promise<boolean> {
  return planGetsRoutedLegs(await loadPlanRoutingFacts(tripId));
}

/**
 * The trip-scoped legs this plan SHOWS (step 9a rulings 3 and 5) — `selectPlanLegs` over the plan's own
 * answer. For readers that look at trip legs only (the OptimizerLead's reachability finding); the plan
 * object applies the same rule with its variant legs.
 */
export async function tripLegsShown(tripId: string): Promise<any[]> {
  const { getTripTransportLegs } = await import("../trip-transport-legs.service");
  const { selectPlanLegs } = await import("./plan-legs");
  const [qualifies, tripLegs] = await Promise.all([tripGetsRoutedLegs(tripId), getTripTransportLegs(tripId, { includeProposed: true })]);
  return selectPlanLegs({ qualifies, tripLegs, variantLegs: [] }).tripLegs;
}
