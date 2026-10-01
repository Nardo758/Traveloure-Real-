/**
 * THE PAID OPTIMIZER RUN'S FRESH FETCH (Track A A9 × A6 (3); ledger `2026-10-01-a9-paid-run-fresh-fetch`).
 *
 * `mayFetchFresh`'s `paid_run` arm had no caller (ledger `2026-10-01-a6-tavily-extract`, "not wired,
 * named"). This is that caller, and the ONLY one:
 *
 *   · ONLY a PAID run. A run covered by a Trip Pass or taken as a free re-run is not a paid run, and a
 *     free draft never reaches the optimizer at all — none of them may spend (§7, decision 3A).
 *   · ONE PASS PER RUN, started right after `recordOptimizerRun` returns the run id: the plan's own
 *     LOCATED baseline items (real coordinates only, §13) whose day falls within the trip's dates,
 *     each looked up through the ONE item rail `fetchFreshFactsForItem` (§18 rule 1 — no second
 *     fetcher). The budget is `resolveFreshFetchBudget` as built (plan / day / source caps); the pass
 *     stops at the first cap refusal, since every later item would be refused the same way.
 *   · COST reaches the run through the `runId` tag the Tavily client stamps on `api_usage_logs` — the
 *     run's ledger. No schema change, no new money figure.
 *   · NEVER fails or delays the run (§15b): the caller does not await it, and every error is caught
 *     and logged here.
 */
import type { OptimizerRunBasis } from "@shared/optimizer-runs";

export interface PaidRunBaselineItem {
  id: string;
  dayNumber?: number;
  latitude?: number;
  longitude?: number;
}

export interface PaidRunFreshFetchInput {
  basis: OptimizerRunBasis;
  runId: string | null;
  tripId: string | null | undefined;
  actorId: string | null;
  baselineItems: readonly PaidRunBaselineItem[];
  startDate: string;
  endDate: string;
}

type ItemFetch = (input: {
  ctx: { kind: "paid_run"; tripId: string; runId: string; actorId: string | null };
  tripId: string;
  item: { id: string; title: string; type: string | null };
  market: string | null;
  city: string | null;
}) => Promise<{ recorded: number; outcome: string }>;

type PlanLoad = (tripId: string) => Promise<{
  market: string | null;
  city: string | null;
  items: Array<{ id: string; title: string; type: string | null }>;
} | null>;

export interface PaidRunFreshFetchDeps {
  fetchItem: ItemFetch;
  loadPlan: PlanLoad;
}

/** The budget refusals after which no later item in the same pass can spend either. */
const STOP_OUTCOMES = new Set(["plan_cap_reached", "day_cap_reached", "meter_unreadable"]);

/** Pure: does this run get a fresh-fetch pass at all? Paid, recorded, and on a plan — nothing else. */
export function paidRunMayFreshFetch(input: Pick<PaidRunFreshFetchInput, "basis" | "runId" | "tripId">): boolean {
  return input.basis === "paid" && !!input.runId && !!input.tripId;
}

/** Whole days in the trip window (inclusive); null when either date does not parse. */
export function tripDayCount(startDate: string, endDate: string): number | null {
  const s = Date.parse(startDate);
  const e = Date.parse(endDate);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Pure: the located baseline items whose day sits within the trip's dates, in plan order, once each. */
export function selectPaidRunItems(items: readonly PaidRunBaselineItem[], startDate: string, endDate: string): string[] {
  const days = tripDayCount(startDate, endDate);
  if (days == null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const located = Number.isFinite(it.latitude) && Number.isFinite(it.longitude);
    const inWindow = typeof it.dayNumber === "number" && it.dayNumber >= 1 && it.dayNumber <= days;
    if (!located || !inWindow || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it.id);
  }
  return out;
}

export interface PaidRunFreshFetchSummary {
  ran: boolean;
  attempted: number;
  recorded: number;
  stoppedBy: string | null;
}

/** One pass for one paid run. Never throws. */
export async function runPaidRunFreshFetch(
  input: PaidRunFreshFetchInput,
  deps?: Partial<PaidRunFreshFetchDeps>,
): Promise<PaidRunFreshFetchSummary> {
  const summary: PaidRunFreshFetchSummary = { ran: false, attempted: 0, recorded: 0, stoppedBy: null };
  if (!paidRunMayFreshFetch(input)) return summary;
  try {
    const wanted = selectPaidRunItems(input.baselineItems, input.startDate, input.endDate);
    if (!wanted.length) return { ...summary, ran: true };
    const d: PaidRunFreshFetchDeps =
      deps?.fetchItem && deps?.loadPlan ? (deps as PaidRunFreshFetchDeps) : { ...(await defaultDeps()), ...(deps ?? {}) };
    const plan = await d.loadPlan(input.tripId!);
    if (!plan) return { ...summary, ran: true };
    // Only rows that are this plan's own itinerary items — a baseline id that is not one is skipped.
    const byId = new Map(plan.items.map((i) => [i.id, i]));
    summary.ran = true;
    for (const id of wanted) {
      const item = byId.get(id);
      if (!item) continue;
      summary.attempted += 1;
      const r = await d.fetchItem({
        ctx: { kind: "paid_run", tripId: input.tripId!, runId: input.runId!, actorId: input.actorId },
        tripId: input.tripId!,
        item,
        market: plan.market,
        city: plan.city,
      });
      summary.recorded += r.recorded;
      if (STOP_OUTCOMES.has(r.outcome)) {
        summary.stoppedBy = r.outcome;
        break;
      }
    }
  } catch (err) {
    console.error("[paid-run-fresh-fetch] pass failed (non-fatal):", (err as Error)?.message ?? err);
  }
  return summary;
}

/** Fire-and-forget entry for the optimizer: starts the pass and returns at once (§15b). */
export function startPaidRunFreshFetch(input: PaidRunFreshFetchInput, deps?: Partial<PaidRunFreshFetchDeps>): boolean {
  if (!paidRunMayFreshFetch(input)) return false;
  void runPaidRunFreshFetch(input, deps)
    .then((s) => {
      if (s.attempted) {
        console.info(`[paid-run-fresh-fetch] run=${input.runId} attempted=${s.attempted} recorded=${s.recorded}${s.stoppedBy ? ` stopped=${s.stoppedBy}` : ""}`);
      }
    })
    .catch(() => {});
  return true;
}

async function defaultDeps(): Promise<PaidRunFreshFetchDeps> {
  // Loaded lazily so the pure parts of this module need no database.
  const [{ fetchFreshFactsForItem }, { db }, schema, { and, eq }] = await Promise.all([
    import("./place-facts.service"),
    import("../../db"),
    import("@shared/schema"),
    import("drizzle-orm"),
  ]);
  return {
    fetchItem: (i) => fetchFreshFactsForItem(i),
    loadPlan: async (tripId) => {
      const [trip] = await db
        .select({ marketSlug: schema.trips.marketSlug, destination: schema.trips.destination })
        .from(schema.trips)
        .where(eq(schema.trips.id, tripId));
      if (!trip) return null;
      const items = await db
        .select({ id: schema.itineraryItems.id, title: schema.itineraryItems.title, type: schema.itineraryItems.itemType })
        .from(schema.itineraryItems)
        .where(and(eq(schema.itineraryItems.tripId, tripId)));
      return {
        market: trip.marketSlug ?? null,
        // The same city derivation the expert-action rail uses (content-facts.routes.ts).
        city: (trip.destination ?? "").split(",")[0]?.trim() || null,
        items: items.map((i) => ({ id: i.id, title: i.title, type: i.type ?? null })),
      };
    },
  };
}
