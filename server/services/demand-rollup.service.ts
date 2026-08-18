/**
 * demand-rollup.service.ts — the L6 SINGLE-COMPUTATION home for every Partner Demand figure
 * (ledger 2026-08-18-partner-demand-2b, R17). The metric MATH lives in its pure core
 * demand-rollup.compute.ts (unit-tested with no DB); this file is the ONLY production caller of it,
 * adding the DB glue: fetch source rows (R16-filtered) → compute → REPLACE-BY-DATE store →
 * floor-enforced read. Two authors computing demand two ways is the parallel-scorer class L6/§18
 * forbids — so every number flows through this pair and nowhere else.
 *
 * Two metrics (R17): unmet_demand_slip + slip_funnel. Synthetic trips (test accounts + authoring
 * listings) are excluded via the R16 predicate at BOTH computation and read. Money metrics stay
 * R12-blocked; search/request grain stays dark-gated — neither is computed here.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  itineraryItems,
  itemTransitionLog,
  partnerDemandRollup,
  trips,
  users,
  vendorAvailabilitySlots,
  providerServices,
  UNMAPPED_MARKET_SLUG,
  type InsertPartnerDemandRollup,
} from "@shared/schema";
import { isRealTripSql } from "./demand-test-exclusion";
import { resolveMarketSlug, timezoneForMarket } from "./trend-engine/operating-markets";
import { clearsFloor } from "../config/demand-floors.config";
import {
  OPEN_SLIP_STATUSES,
  marketLocalDate,
  computeUnmetSlip,
  computeSlipFunnel,
  type SlipDemandRow,
  type DiaryRow,
} from "./demand-rollup.compute";

// Re-export the pure core so the service module is the single import surface for callers/tests
// that want the whole L6 API in one place.
export * from "./demand-rollup.compute";

/** Bucket a resolved-or-null market slug into the storage value (real slug or the R13 sentinel). */
function bucketSlug(slug: string | null): string {
  return slug ?? UNMAPPED_MARKET_SLUG;
}

/**
 * Compute both metrics from live source rows (R16-filtered) and REPLACE-BY-DATE into
 * partner_demand_rollup. Idempotent for a given source state: identical source → identical rows.
 * The nightly scheduler calls this. Returns the number of rows written.
 */
export async function computeAndStoreDemandRollup(): Promise<number> {
  // ── unmet_demand_slip source rows: open items in REAL traveler trips, market-local dated ──
  const openItems = await db
    .select({
      marketSlug: trips.marketSlug,
      startDate: trips.startDate,
      estimatedCost: itineraryItems.estimatedCost,
    })
    .from(itineraryItems)
    .innerJoin(trips, eq(itineraryItems.tripId, trips.id))
    .leftJoin(users, eq(trips.userId, users.id))
    .where(
      and(
        inArray(itineraryItems.routingStatus, OPEN_SLIP_STATUSES as unknown as string[]),
        isRealTripSql(users.email, trips.authorId),
      ),
    );

  const demandRows: SlipDemandRow[] = openItems.map((r) => ({
    marketSlug: bucketSlug(r.marketSlug),
    date: marketLocalDate(new Date(`${r.startDate}T00:00:00Z`), timezoneForMarket(r.marketSlug)),
    estimatedCost: r.estimatedCost != null ? Number(r.estimatedCost) : null,
  }));

  // ── inventory keys: (market, date) pairs with a bookable slot. Slot→market via the provider
  //    service's city resolved in JS (resolveMarketSlug lives in JS, not SQL). ──
  const bookableSlots = await db
    .select({
      date: vendorAvailabilitySlots.date,
      city: providerServices.city,
      capacity: vendorAvailabilitySlots.capacity,
      bookedCount: vendorAvailabilitySlots.bookedCount,
      status: vendorAvailabilitySlots.status,
    })
    .from(vendorAvailabilitySlots)
    .innerJoin(providerServices, eq(vendorAvailabilitySlots.serviceId, providerServices.id));

  const inventoryKeys = new Set<string>();
  for (const s of bookableSlots) {
    const bookable = s.status === "available" && Number(s.bookedCount ?? 0) < Number(s.capacity ?? 1);
    if (!bookable) continue;
    const slug = resolveMarketSlug(s.city);
    const d = marketLocalDate(new Date(`${s.date}T00:00:00Z`), timezoneForMarket(slug));
    inventoryKeys.add(`${bucketSlug(slug)}|${d}`);
  }

  const slipCells = computeUnmetSlip(demandRows, inventoryKeys);

  // ── slip_funnel source rows: item diary joined to trip market, R16-filtered ──
  const diary = await db
    .select({
      marketSlug: trips.marketSlug,
      itemId: itemTransitionLog.itemId,
      eventType: itemTransitionLog.eventType,
      fromStatus: itemTransitionLog.fromStatus,
      toStatus: itemTransitionLog.toStatus,
      createdAt: itemTransitionLog.createdAt,
    })
    .from(itemTransitionLog)
    .innerJoin(trips, eq(itemTransitionLog.tripId, trips.id))
    .leftJoin(users, eq(trips.userId, users.id))
    .where(isRealTripSql(users.email, trips.authorId));

  const diaryRows: DiaryRow[] = diary.map((r) => ({
    marketSlug: bucketSlug(r.marketSlug),
    itemId: r.itemId,
    eventType: r.eventType,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    createdAt: r.createdAt as Date,
  }));
  const funnelCells = computeSlipFunnel(diaryRows);

  // The funnel is cumulative history, not a per-day figure, so it stores under ONE reserved date per
  // market: the market-local date of the most recent diary event ("as of"), so recompute replaces.
  const latestDiaryDateByMarket = new Map<string, string>();
  for (const r of diaryRows) {
    const slug = r.marketSlug === UNMAPPED_MARKET_SLUG ? null : r.marketSlug;
    const d = marketLocalDate(r.createdAt, timezoneForMarket(slug));
    const cur = latestDiaryDateByMarket.get(r.marketSlug);
    if (!cur || d > cur) latestDiaryDateByMarket.set(r.marketSlug, d);
  }

  const toInsert: InsertPartnerDemandRollup[] = [];
  for (const c of slipCells) {
    toInsert.push({
      marketSlug: c.marketSlug,
      date: c.date,
      metric: "unmet_demand_slip",
      partnerId: null,
      serviceId: null,
      value: { count: c.count, amount: c.amount, valuedCount: c.valuedCount },
      sourceRowCount: c.count,
    });
  }
  for (const c of funnelCells) {
    toInsert.push({
      marketSlug: c.marketSlug,
      date: latestDiaryDateByMarket.get(c.marketSlug) ?? c.payload.removalDataSince ?? "1970-01-01",
      metric: "slip_funnel",
      partnerId: null,
      serviceId: null,
      value: c.payload,
      sourceRowCount: c.payload.itemsObserved,
    });
  }

  // REPLACE-BY-DATE (idempotent): delete the exact (market, date, metric, NULL, NULL) rows we are
  // about to write, then insert. A stale row for a date with no current demand is left as history
  // (never silently mutated).
  await db.transaction(async (tx) => {
    for (const row of toInsert) {
      await tx
        .delete(partnerDemandRollup)
        .where(
          and(
            eq(partnerDemandRollup.marketSlug, row.marketSlug),
            eq(partnerDemandRollup.date, row.date),
            eq(partnerDemandRollup.metric, row.metric),
            isNull(partnerDemandRollup.partnerId),
            isNull(partnerDemandRollup.serviceId),
          ),
        );
    }
    if (toInsert.length) await tx.insert(partnerDemandRollup).values(toInsert);
  });

  return toInsert.length;
}

// ── floor-enforced reads (2B.3) ────────────────────────────────────────────────────────────────
export interface RollupReadRow {
  marketSlug: string;
  date: string;
  metric: string;
  value: unknown | null;   // null ⇒ suppressed below floor (§13 no_data)
  n: number;               // source_row_count (show-the-N)
  status: "ok" | "no_data";
  computedAt: Date;
}

function applyFloor(row: {
  marketSlug: string; date: string; metric: string; value: unknown;
  sourceRowCount: number; partnerId: string | null; serviceId: string | null; computedAt: Date;
}): RollupReadRow {
  const ok = clearsFloor({ sourceRowCount: row.sourceRowCount, partnerId: row.partnerId, serviceId: row.serviceId });
  return {
    marketSlug: row.marketSlug,
    date: String(row.date),
    metric: row.metric,
    value: ok ? row.value : null,
    n: row.sourceRowCount,
    status: ok ? "ok" : "no_data",
    computedAt: row.computedAt as Date,
  };
}

/** ADMIN read: every rollup row, floor-enforced, INCLUDING the unmapped bucket (R13). The caller
 *  gates on the §2 blanket admin guard; this function does not itself authorize. */
export async function readAdminDemandRollup(): Promise<{ cadence: string; rows: RollupReadRow[] }> {
  const rows = await db.select().from(partnerDemandRollup);
  return {
    cadence: "updated daily",
    rows: rows.map((r) =>
      applyFloor({
        marketSlug: r.marketSlug, date: r.date, metric: r.metric, value: r.value,
        sourceRowCount: r.sourceRowCount, partnerId: r.partnerId, serviceId: r.serviceId, computedAt: r.computedAt,
      }),
    ),
  };
}

/** PARTNER read: floor-enforced rows for the caller's own markets (derived from their
 *  provider_services cities, never a client value), UNMAPPED bucket EXCLUDED (R13 admin-only).
 *  No money/rate figure is present (R12). */
export async function readPartnerDemandRollup(
  partnerUserId: string,
): Promise<{ cadence: string; markets: string[]; rows: RollupReadRow[] }> {
  const svc = await db
    .select({ city: providerServices.city })
    .from(providerServices)
    .where(eq(providerServices.userId, partnerUserId));
  const markets = Array.from(
    new Set(svc.map((s) => resolveMarketSlug(s.city)).filter((m): m is string => !!m)),
  ).sort();

  if (markets.length === 0) return { cadence: "updated daily", markets: [], rows: [] };

  const rows = await db
    .select()
    .from(partnerDemandRollup)
    .where(inArray(partnerDemandRollup.marketSlug, markets));

  return {
    cadence: "updated daily",
    markets,
    rows: rows
      .filter((r) => r.marketSlug !== UNMAPPED_MARKET_SLUG)
      .map((r) =>
        applyFloor({
          marketSlug: r.marketSlug, date: r.date, metric: r.metric, value: r.value,
          sourceRowCount: r.sourceRowCount, partnerId: r.partnerId, serviceId: r.serviceId, computedAt: r.computedAt,
        }),
      ),
  };
}
