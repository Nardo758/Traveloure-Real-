/**
 * The trip-addressed free preview's response (`GET /api/optimization-preview?tripId=`, ledger
 * `2026-09-05-optimize-preview-on-slip`; LD 41 (d)). The route authorizes; this reads and assembles.
 *
 * QA round 3 PR 5 (Leon, Nov 12, 2026): "loader failures → named notChecked, 200, error still logged with stack."
 * A part that cannot be read is NAMED in `notChecked` (`PreviewPartNotLoaded`) and its own fields are LEFT OUT — every
 * reader already treats an absent part as unknown: no `findings` ⇒ no finding lines and no all-clear
 * (`OptimizerLead.tsx`), no `coverage` ⇒ incomplete (P0-d). Nothing is zero-filled into "nothing found" (§13). The
 * error is logged with its stack. The loaders are injectable so a failure can be proven without a database.
 */
import { trips } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { PreviewPartNotLoaded } from "@shared/optimizer-lead";
import { db } from "../db";
import { versionPerOptionEnabled } from "../config/version-options.config";
import { computeOptimizationPreviewHeuristic, type OptimizationPreviewResult } from "./optimization-preview.service";
import { loadTripOptimizerInputs } from "./optimizer-baseline.service";
import { loadLegCoverage, loadOptimizerFindings } from "./optimizer-lead.service";
import { openSetSlotsForRun } from "./version-options.service";

type Inputs = Awaited<ReturnType<typeof loadTripOptimizerInputs>>;

export interface TripPreviewLoaders {
  inputs: (tripId: string) => Promise<Inputs>;
  eventType: (tripId: string) => Promise<string | undefined>;
  findings: typeof loadOptimizerFindings;
  legCoverage: typeof loadLegCoverage;
  /** Null when the per-option versions are off (`OPTIMIZER_VERSION_PER_OPTION_ENABLED`): the field is not emitted. */
  openComparisons: ((tripId: string, inputs: Inputs) => Promise<number>) | null;
  log: (message: string, err: unknown) => void;
}

const defaultLoaders = (): TripPreviewLoaders => ({
  inputs: loadTripOptimizerInputs,
  // Event type drives only the heuristic's own score WEIGHTS (TEMPLATE_WEIGHTS) — it is not a fee input on this path,
  // because this path returns no fee. The party size is deliberately NOT read: `travelers` reaches only
  // `avgCostPerPerson`, which this response does not emit.
  eventType: async (tripId) => {
    const [row] = await db.select({ eventType: trips.eventType }).from(trips).where(eq(trips.id, tripId)).limit(1);
    return row?.eventType ?? undefined;
  },
  findings: loadOptimizerFindings,
  legCoverage: loadLegCoverage,
  // A7 (§F2 (4)): how many open comparisons a run would decide — never WHICH option wins; 0 or 1.
  openComparisons: versionPerOptionEnabled()
    ? async (tripId, inputs) => ((await openSetSlotsForRun(tripId, inputs.baselineItems as any, null))?.length ? 1 : 0)
    : null,
  log: (message, err) => console.error(message, err),
});

export async function buildTripPreviewResponse(tripId: string, loaders: TripPreviewLoaders = defaultLoaders()): Promise<Record<string, unknown>> {
  const partsNotLoaded: PreviewPartNotLoaded[] = [];
  const loadPart = async <T>(part: PreviewPartNotLoaded["part"], load: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await load();
    } catch (err) {
      // `console.error` with the Error itself prints its stack.
      loaders.log(`[optimization-preview:trip] ${part} failed for trip ${tripId}:`, err);
      partsNotLoaded.push({ part, reason: "load_failed" });
      return undefined;
    }
  };

  const inputs = await loadPart("plan_items", async () => ({ ...(await loaders.inputs(tripId)), eventType: await loaders.eventType(tripId) }));

  const preview: OptimizationPreviewResult | null = inputs
    ? computeOptimizationPreviewHeuristic(
        // `loadTripOptimizerInputs` always sets both `serviceType` and `dayNumber` (the column is NOT NULL and the
        // itemType map never returns undefined); the optimizer's shared item type declares them optional for its OTHER
        // producers. An item that somehow arrives without either is DROPPED rather than given an invented type or day
        // (§13) — and the item count this response reports is taken from what was actually scored.
        inputs.baselineItems.flatMap((item) =>
          item.serviceType && item.dayNumber != null
            ? [
                {
                  serviceType: item.serviceType,
                  // Absent stays absent. `calculateItineraryMetrics` treats a missing price as no cost and a missing
                  // duration as its own default — neither is invented here.
                  price: item.price,
                  duration: item.duration,
                  dayNumber: item.dayNumber,
                },
              ]
            : [],
        ),
        1,
        inputs.eventType,
      )
    : null;

  // Surface step 4 (spec §8; R-f): what Optimize found — kinds and counts only. Independent of the heuristic score, so a
  // refused score still carries them. FB-1 step 1: `notChecked` names the findings that could not be read (and why).
  const lead = await loadPart("findings", () => loaders.findings(tripId));
  // P0-d item 1 (ledger `2026-10-12-p0d-coverage-bridges`): the all-clear also needs every pair of stops on every day
  // not yet past to have a routed leg; the card reads this beside the findings.
  const legs = await loadPart("leg_coverage", () => loaders.legCoverage(tripId));
  const countOpen = loaders.openComparisons;
  const openComparisons = inputs && preview?.computable && countOpen ? await loadPart("open_comparisons", () => countOpen(tripId, inputs)) : undefined;

  const parts = {
    ...(lead ? { findings: lead.findings, hasPricedItems: lead.hasPricedItems } : {}),
    notChecked: [...(lead?.notChecked ?? []), ...partsNotLoaded],
    ...(legs ? { coverage: legs.coverage, routedPlan: legs.routedPlan } : {}),
  };

  // With the plan's items unread there is no heuristic answer: a code (rendered nowhere) says so, and `notChecked`
  // names the part.
  if (!inputs || !preview) return { computable: false, reason: "plan_items_not_loaded", ...parts };
  // The heuristic's OWN reason, passed through unchanged — the client never restates it.
  if (!preview.computable) return { computable: false, reason: preview.reason, ...parts };

  // Projected explicitly. `metrics` (the full internal object) and the three extrapolated cart numbers are NOT emitted:
  // nothing here measures money or minutes a re-ordering would recover (§13).
  return {
    computable: true,
    itemCount: preview.itemCount,
    dayCount: preview.dayCount,
    currentScore: preview.currentScore,
    improvementRoom: preview.improvementRoom,
    weakest: preview.weakest,
    dimensions: preview.dimensions,
    // Items the run would treat as fixed points — purchased rows AND D3 expert work, counted from the same read-set's
    // actual constraint list, never assumed (§13).
    fixedCount: inputs.fixedCommitments.length,
    ...parts,
    ...(openComparisons !== undefined ? { openComparisons } : {}),
  };
}
