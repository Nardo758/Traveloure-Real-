/**
 * FB-1 step 3 (decision-maker Leon Dixon, Oct 18, 2026 — step 3 rulings 1–5; ledger `2026-10-18-fb1-version-gate`):
 * the paid run checks each version with the ONE plan checker and compares it with its draft (`shared/version-check.ts`).
 *
 * A version's input is built from the draft's own input (`loadPlanCheckInput`): a version stop that keeps a draft item
 * (`sourceItemId`) inherits that item's OPEN point and stored facts; a stop the version added has neither, so its
 * checks are not run — never passed. The plan's anchors and the market's last departures apply unchanged; a version has
 * no energy rows, so pace is not checkable on it (coverage reduced, never a failure).
 *
 * The ONLY writes are the version's own metric rows and its status (`generated` → `held`). The draft's rows are never
 * written here.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryVariantItems, itineraryVariantMetrics, itineraryVariants, transportLegs } from "@shared/schema";
import type { PlanCheckInput, PlanCheckLastAdmission, PlanCheckStop } from "@shared/plan-check";
import {
  HELD_VARIANT_STATUS,
  gateVersion,
  isVersionStayPick,
  versionCheckMetricRows,
  type CheckedPlan,
  type VersionVerdict,
} from "@shared/version-check";
import { legIsRouted } from "./routing/plan-legs";

/** A version stop as the check reads it — a stored version row, or a sequenced activity still in memory. */
export interface VersionStopRow {
  id: string;
  name: string;
  dayNumber: number | null;
  startTime: string | null;
  endTime: string | null;
  duration: number | null;
  sourceItemId: string | null;
}

/**
 * Pure. A version's checker input from its stops and legs, inheriting points and facts from the draft's input through
 * `sourceItemId`. Returns the input and the version-stop → draft-item map the gate matches issues by.
 */
export function versionCheckInput(
  draft: PlanCheckInput,
  stops: readonly VersionStopRow[],
  legs: PlanCheckInput["legs"],
): { input: PlanCheckInput; sourceOf: Map<string, string | null> } {
  const draftStop = new Map(draft.stops.map((s) => [s.id, s]));
  const sourceOf = new Map<string, string | null>();
  const hours = new Map<string, NonNullable<ReturnType<PlanCheckInput["hours"]["get"]>>>();
  const lastAdmission = new Map<string, NonNullable<ReturnType<PlanCheckInput["lastAdmission"]["get"]>>>();
  const closedDates = new Map<string, readonly PlanCheckLastAdmission[]>();
  const out: PlanCheckStop[] = [];
  for (const r of stops) {
    if (r.dayNumber == null) continue;
    const source = r.sourceItemId && draftStop.has(r.sourceItemId) ? r.sourceItemId : null;
    sourceOf.set(r.id, source);
    const h = source ? draft.hours.get(source) : undefined;
    if (h) hours.set(r.id, h);
    const la = source ? draft.lastAdmission.get(source) : undefined;
    if (la) lastAdmission.set(r.id, la);
    const cd = source ? draft.closedDates?.get(source) : undefined;
    if (cd) closedDates.set(r.id, cd);
    out.push({
      id: r.id,
      title: r.name,
      dayNumber: r.dayNumber,
      startTime: r.startTime ?? null,
      endTime: r.endTime ?? null,
      durationMinutes: r.duration ?? null,
      point: source ? draftStop.get(source)!.point : null,
    });
  }
  return {
    input: {
      tripStartIso: draft.tripStartIso,
      transitCoverage: draft.transitCoverage,
      stops: out,
      hours,
      lastAdmission,
      closedDates,
      lastServices: draft.lastServices,
      anchors: draft.anchors,
      legs,
      energy: [],
    },
    sourceOf,
  };
}

/** A stored version's stops and legs, read after its legs were written (the legs step re-times its stops). */
async function storedVersionRows(variantId: string): Promise<{ stops: VersionStopRow[]; legs: PlanCheckInput["legs"] }> {
  const rows = await db
    .select()
    .from(itineraryVariantItems)
    .where(eq(itineraryVariantItems.variantId, variantId))
    .orderBy(asc(itineraryVariantItems.dayNumber), asc(itineraryVariantItems.startTime), asc(itineraryVariantItems.sortOrder));
  const legRows = await db.select().from(transportLegs).where(eq(transportLegs.variantId, variantId)).orderBy(asc(transportLegs.dayNumber), asc(transportLegs.legOrder));
  return {
    stops: rows
      .filter((r) => !isVersionStayPick(r as any))
      .map((r) => ({ id: r.id, name: r.name, dayNumber: r.dayNumber, startTime: r.startTime ?? null, endTime: r.endTime ?? null, duration: r.duration ?? null, sourceItemId: r.sourceItemId ?? null })),
    legs: legRows.map((l: any) => ({
      id: l.id,
      dayNumber: l.dayNumber,
      fromActivityId: l.fromActivityId ?? null,
      toActivityId: l.toActivityId ?? null,
      estimatedDurationMinutes: l.estimatedDurationMinutes ?? null,
      mode: l.userSelectedMode ?? l.selectedMode ?? l.recommendedMode ?? null,
      routed: legIsRouted(l),
      checkedAt: l.legCheckedAt ? new Date(l.legCheckedAt).toISOString() : null,
    })),
  };
}

async function writeMetricRows(variantId: string, rows: ReturnType<typeof versionCheckMetricRows>): Promise<void> {
  if (!rows.length) return;
  await db.insert(itineraryVariantMetrics).values(rows.map((r) => ({ variantId, ...r })));
}

/**
 * After sequencing, in memory (FB-1: the check runs after sequencing and after legs). Records the
 * `check_unresolved_after_sequencing` / `check_added_after_sequencing` rows; the decision is the after-legs check.
 * Never throws — a failed check is logged and records nothing (§15b: an ancillary effect never fails the run).
 */
export async function recordSequencingCheck(variantId: string, draft: CheckedPlan, stops: readonly VersionStopRow[]): Promise<VersionVerdict | null> {
  try {
    const { input, sourceOf } = versionCheckInput(draft.input, stops, []);
    const { result, verdict } = gateVersion(draft, input, sourceOf);
    await writeMetricRows(variantId, versionCheckMetricRows(result, verdict, "sequencing"));
    return verdict;
  } catch (err) {
    console.error(`[version-check] sequencing check failed for ${variantId}:`, (err as Error)?.message ?? err);
    return null;
  }
}

/**
 * After legs: THE GATE (ruling 1). A failing version is held (`generated` → `held`, an atomic conditional on its
 * status); every version gets its check metric rows. Never throws: when the check itself cannot run, the version is
 * NOT held — not checked never fails (ruling 2) — and the failure is logged.
 */
export async function gateStoredVersion(variantId: string, draft: CheckedPlan): Promise<VersionVerdict | null> {
  try {
    const { stops, legs } = await storedVersionRows(variantId);
    const { input, sourceOf } = versionCheckInput(draft.input, stops, legs);
    const { result, verdict } = gateVersion(draft, input, sourceOf);
    await writeMetricRows(variantId, versionCheckMetricRows(result, verdict, "legs"));
    if (!verdict.passes) {
      await db
        .update(itineraryVariants)
        .set({ status: HELD_VARIANT_STATUS })
        .where(and(eq(itineraryVariants.id, variantId), eq(itineraryVariants.status, "generated")));
    }
    return verdict;
  } catch (err) {
    console.error(`[version-check] gate failed for ${variantId} (version left as generated):`, (err as Error)?.message ?? err);
    return null;
  }
}
