/**
 * demand-rollup.compute.ts — the PURE computation core of the L6 demand rollup (ledger
 * 2026-08-18-partner-demand-2b). Split from demand-rollup.service.ts ONLY so the metric math is
 * unit-testable with no DB (the service module imports `../db`, which requires DATABASE_URL at
 * load). This file imports NOTHING with side effects — it is the single home for demand MATH, and
 * `demand-rollup.service.ts` is its only production caller (the DB fetch/store/read glue). Together
 * they are the L6 single-computation home; no demand figure is computed anywhere else.
 */

// ── The item lifecycle stages the funnel tracks, in ladder order ─────────────────────────────
export const SLIP_FUNNEL_STAGES = [
  "in_planning",
  "with_expert",
  "ready_for_checkout",
  "purchased",
] as const;
export type SlipFunnelStage = (typeof SLIP_FUNNEL_STAGES)[number];

/** Routing statuses that count as OPEN unmet demand for the slip metric (R17). */
export const OPEN_SLIP_STATUSES = ["in_planning", "with_expert"] as const;

/**
 * The MARKET-LOCAL calendar date (YYYY-MM-DD) of an instant, in the market's timezone. A slip
 * observed at 23:30 in Kyoto belongs to that Kyoto day, not the next UTC day. `en-CA` yields
 * ISO-ordered YYYY-MM-DD. (Intl is deterministic; no argless Date/Date.now used.)
 */
export function marketLocalDate(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// ── unmet_demand_slip ──────────────────────────────────────────────────────────────────────────
export interface SlipDemandRow {
  marketSlug: string;
  date: string;
  estimatedCost: number | null;
}
export interface UnmetSlipCell {
  marketSlug: string;
  date: string;
  metric: "unmet_demand_slip";
  count: number;
  amount: number | null;
  valuedCount: number;
}

/**
 * Per (market, date): items with OPEN demand and NO bookable inventory are slips. `inventoryKeys`
 * holds "<market>|<date>" that DO have bookable inventory (an item in the set is demand-met, not a
 * slip). Deterministic (output sorted by market,date). $-value is Σ of present estimatedCosts; null
 * when no unmet item carried a price (count-only, §13 — never a guessed amount).
 */
export function computeUnmetSlip(
  demandRows: SlipDemandRow[],
  inventoryKeys: ReadonlySet<string>,
): UnmetSlipCell[] {
  const cells = new Map<string, UnmetSlipCell>();
  for (const r of demandRows) {
    const key = `${r.marketSlug}|${r.date}`;
    if (inventoryKeys.has(key)) continue;
    let cell = cells.get(key);
    if (!cell) {
      cell = { marketSlug: r.marketSlug, date: r.date, metric: "unmet_demand_slip", count: 0, amount: null, valuedCount: 0 };
      cells.set(key, cell);
    }
    cell.count += 1;
    if (r.estimatedCost != null && !Number.isNaN(r.estimatedCost)) {
      cell.amount = (cell.amount ?? 0) + r.estimatedCost;
      cell.valuedCount += 1;
    }
  }
  return Array.from(cells.values()).sort(
    (a, b) => a.marketSlug.localeCompare(b.marketSlug) || a.date.localeCompare(b.date),
  );
}

// ── slip_funnel ──────────────────────────────────────────────────────────────────────────────
export interface DiaryRow {
  marketSlug: string;
  itemId: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date;
}
export interface SlipFunnelPayload {
  stageEntries: Record<string, number>;
  transitions: Record<string, number>;
  transitionRates: Record<string, number>;
  avgHoursInStage: Record<string, number | null>;
  removed: number;
  removalDataSince: string | null;
  itemsObserved: number;
}
export interface SlipFunnelCell {
  marketSlug: string;
  metric: "slip_funnel";
  payload: SlipFunnelPayload;
}

/**
 * Per market: a stage funnel from the item's diary. `stageEntries[S]` counts distinct items whose
 * diary shows a transition INTO S; transitions count each from→to edge; `transitionRates` divides
 * an edge by entries into its `from` stage; `avgHoursInStage` is the mean dwell between consecutive
 * events. `item_removed` events are counted and `removalDataSince` is the earliest such event's ISO
 * date (§13 — the metric states its own start; earlier removals never existed to count).
 * Deterministic: maps built by sorted iteration; output cells sort by marketSlug.
 */
export function computeSlipFunnel(diaryRows: DiaryRow[]): SlipFunnelCell[] {
  const byMarket = new Map<string, DiaryRow[]>();
  for (const r of diaryRows) {
    const arr = byMarket.get(r.marketSlug) ?? [];
    arr.push(r);
    byMarket.set(r.marketSlug, arr);
  }

  const cells: SlipFunnelCell[] = [];
  for (const marketSlug of Array.from(byMarket.keys()).sort()) {
    const rows = byMarket.get(marketSlug)!;
    const stageEntries: Record<string, number> = {};
    const transitions: Record<string, number> = {};
    const dwellSum: Record<string, number> = {};
    const dwellN: Record<string, number> = {};
    const enteredByItem = new Map<string, Set<string>>();
    let removed = 0;
    let earliestRemoval: Date | null = null;
    const itemsSeen = new Set<string>();

    const byItem = new Map<string, DiaryRow[]>();
    for (const r of rows) {
      const k = r.itemId ?? `__trip__${r.eventType}`;
      const arr = byItem.get(k) ?? [];
      arr.push(r);
      byItem.set(k, arr);
    }

    for (const k of Array.from(byItem.keys()).sort()) {
      const evs = byItem.get(k)!.slice().sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.eventType.localeCompare(b.eventType),
      );
      const itemStages = enteredByItem.get(k) ?? new Set<string>();
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        if (e.itemId) itemsSeen.add(e.itemId);
        if (e.eventType === "item_removed") {
          removed += 1;
          if (earliestRemoval == null || e.createdAt.getTime() < earliestRemoval.getTime()) earliestRemoval = e.createdAt;
          continue;
        }
        if (e.toStatus && (SLIP_FUNNEL_STAGES as readonly string[]).includes(e.toStatus)) {
          itemStages.add(e.toStatus);
        }
        if (e.fromStatus && e.toStatus) {
          const edge = `${e.fromStatus}->${e.toStatus}`;
          transitions[edge] = (transitions[edge] ?? 0) + 1;
          if (i > 0) {
            const hrs = (e.createdAt.getTime() - evs[i - 1].createdAt.getTime()) / 3_600_000;
            if (hrs >= 0) {
              dwellSum[e.fromStatus] = (dwellSum[e.fromStatus] ?? 0) + hrs;
              dwellN[e.fromStatus] = (dwellN[e.fromStatus] ?? 0) + 1;
            }
          }
        }
      }
      enteredByItem.set(k, itemStages);
    }

    for (const stages of Array.from(enteredByItem.values())) {
      for (const s of Array.from(stages)) stageEntries[s] = (stageEntries[s] ?? 0) + 1;
    }

    const transitionRates: Record<string, number> = {};
    for (const edge of Object.keys(transitions).sort()) {
      const from = edge.split("->")[0];
      const denom = stageEntries[from] ?? 0;
      transitionRates[edge] = denom > 0 ? Math.round((transitions[edge] / denom) * 10000) / 10000 : 0;
    }
    const avgHoursInStage: Record<string, number | null> = {};
    for (const s of SLIP_FUNNEL_STAGES) {
      avgHoursInStage[s] = dwellN[s] ? Math.round((dwellSum[s] / dwellN[s]) * 100) / 100 : null;
    }

    cells.push({
      marketSlug,
      metric: "slip_funnel",
      payload: {
        stageEntries, transitions, transitionRates, avgHoursInStage, removed,
        removalDataSince: earliestRemoval ? earliestRemoval.toISOString().slice(0, 10) : null,
        itemsObserved: itemsSeen.size,
      },
    });
  }
  return cells;
}
