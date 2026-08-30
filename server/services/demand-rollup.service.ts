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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  itineraryItems,
  itemTransitionLog,
  partnerDemandRollup,
  trips,
  tripSelectedHotels,
  users,
  vendorAvailabilitySlots,
  providerServices,
  UNMAPPED_MARKET_SLUG,
  type InsertPartnerDemandRollup,
} from "@shared/schema";
import { isRealTripSql } from "./demand-test-exclusion";
import { resolveMarketSlug, timezoneForMarket, getMarketByKey } from "./trend-engine/operating-markets";
import { clearsFloor, floorForScope, DEMAND_WINDOW_DAYS, type DemandAudience } from "../config/demand-floors.config";
import {
  OPEN_SLIP_STATUSES,
  marketLocalDate,
  computeUnmetSlip,
  computeUnmetSlipByService,
  computeSlipFunnel,
  computeUnmetStay,
  computeStallStage,
  classifyKind,
  addDaysISO,
  summarizeMarkets,
  pickTopDemandSignal,
  type SlipDemandRow,
  type DiaryRow,
  type StayDemandRow,
  type DemandKind,
  type MarketSummary,
  type SlipFunnelPayload,
  type StallStage,
  type TopDemandSignal,
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
      serviceId: itineraryItems.providerServiceId,
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
    serviceId: r.serviceId ?? null,
  }));

  // ── inventory keys: (market, date) AND (serviceId, date) pairs with a bookable slot. Slot→market
  //    via the provider service's city resolved in JS (resolveMarketSlug lives in JS, not SQL). The
  //    per-service set backs the R25b per-listing slip (a service is "met" only by its OWN slot). ──
  const bookableSlots = await db
    .select({
      date: vendorAvailabilitySlots.date,
      serviceId: vendorAvailabilitySlots.serviceId,
      city: providerServices.city,
      capacity: vendorAvailabilitySlots.capacity,
      bookedCount: vendorAvailabilitySlots.bookedCount,
      status: vendorAvailabilitySlots.status,
    })
    .from(vendorAvailabilitySlots)
    .innerJoin(providerServices, eq(vendorAvailabilitySlots.serviceId, providerServices.id));

  const inventoryKeys = new Set<string>();
  const serviceInventoryKeys = new Set<string>();
  for (const s of bookableSlots) {
    const bookable = s.status === "available" && Number(s.bookedCount ?? 0) < Number(s.capacity ?? 1);
    if (!bookable) continue;
    const slug = resolveMarketSlug(s.city);
    const d = marketLocalDate(new Date(`${s.date}T00:00:00Z`), timezoneForMarket(slug));
    inventoryKeys.add(`${bucketSlug(slug)}|${d}`);
    if (s.serviceId != null) serviceInventoryKeys.add(`${s.serviceId}|${d}`);
  }

  const slipCells = computeUnmetSlip(demandRows, inventoryKeys);
  const slipServiceCells = computeUnmetSlipByService(demandRows, serviceInventoryKeys);

  // ── slip_funnel source rows: item diary joined to trip market, R16-filtered ──
  // leftJoin itinerary_items so each transition can resolve its provider_service_id (usually NULL
  //  for open items — those fall to the market funnel only, never a guessed service; R25b).
  const diary = await db
    .select({
      marketSlug: trips.marketSlug,
      itemId: itemTransitionLog.itemId,
      eventType: itemTransitionLog.eventType,
      fromStatus: itemTransitionLog.fromStatus,
      toStatus: itemTransitionLog.toStatus,
      createdAt: itemTransitionLog.createdAt,
      serviceId: itineraryItems.providerServiceId,
    })
    .from(itemTransitionLog)
    .innerJoin(trips, eq(itemTransitionLog.tripId, trips.id))
    .leftJoin(users, eq(trips.userId, users.id))
    .leftJoin(itineraryItems, eq(itemTransitionLog.itemId, itineraryItems.id))
    .where(isRealTripSql(users.email, trips.authorId));

  const diaryRows: DiaryRow[] = diary.map((r) => ({
    marketSlug: bucketSlug(r.marketSlug),
    itemId: r.itemId,
    eventType: r.eventType,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    createdAt: r.createdAt as Date,
    serviceId: r.serviceId ?? null,
  }));
  const funnelCells = computeSlipFunnel(diaryRows);
  const funnelServiceCells = computeSlipFunnel(diaryRows, { by: "service" });

  // ── unmet_demand_stay source rows (R19): REAL trips with a real date range and NO stay anchored
  //    on-platform — neither an `accommodation` itinerary item NOR a trip_selected_hotels row. This
  //    is a structural read ("no stay RECORDED", not "no bed" — §13), which is why the metric is
  //    count-only and floor-gated. The stay_anchor_miss/no_stay_flag advisory events corroborate it
  //    but are never read here. ──
  const stayTrips = await db
    .select({
      marketSlug: trips.marketSlug,
      startDate: trips.startDate,
      endDate: trips.endDate,
      travelers: trips.numberOfTravelers,
    })
    .from(trips)
    .leftJoin(users, eq(trips.userId, users.id))
    .where(
      and(
        isRealTripSql(users.email, trips.authorId),
        sql`${trips.endDate} > ${trips.startDate}`,
        sql`NOT EXISTS (SELECT 1 FROM itinerary_items ii WHERE ii.trip_id = ${trips.id} AND ii.item_type = 'accommodation')`,
        sql`NOT EXISTS (SELECT 1 FROM trip_selected_hotels tsh WHERE tsh.trip_id = ${trips.id})`,
      ),
    );

  const stayRows: StayDemandRow[] = stayTrips.map((r) => {
    const startInstant = new Date(`${r.startDate}T00:00:00Z`);
    const nights = Math.round(
      (new Date(`${r.endDate}T00:00:00Z`).getTime() - startInstant.getTime()) / 86_400_000,
    );
    return {
      marketSlug: bucketSlug(r.marketSlug),
      checkIn: marketLocalDate(startInstant, timezoneForMarket(r.marketSlug)),
      nights,
      travelers: r.travelers != null ? Number(r.travelers) : null,
    };
  });
  const stayCells = computeUnmetStay(stayRows);

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
  for (const c of stayCells) {
    toInsert.push({
      marketSlug: c.marketSlug,
      date: c.date,
      metric: "unmet_demand_stay",
      partnerId: null,
      serviceId: null,
      value: { trips: c.trips, nights: c.nights, travelers: c.travelers, travelersCaptured: c.travelersCaptured },
      sourceRowCount: c.trips,
    });
  }
  // ── per-service cells (R25b): same key, service_id SET. Their floor is decided at READ time by
  //    the reader's audience (R27), NOT here — the stored cell is grain, not a floor. ──
  for (const c of slipServiceCells) {
    toInsert.push({
      marketSlug: c.marketSlug,
      date: c.date,
      metric: "unmet_demand_slip",
      partnerId: null,
      serviceId: c.serviceId ?? null,
      value: { count: c.count, amount: c.amount, valuedCount: c.valuedCount },
      sourceRowCount: c.count,
    });
  }
  for (const c of funnelServiceCells) {
    toInsert.push({
      marketSlug: c.marketSlug,
      date: latestDiaryDateByMarket.get(c.marketSlug) ?? c.payload.removalDataSince ?? "1970-01-01",
      metric: "slip_funnel",
      partnerId: null,
      serviceId: c.serviceId ?? null,
      value: c.payload,
      sourceRowCount: c.payload.itemsObserved,
    });
  }

  // REPLACE-BY-DATE (idempotent): delete the exact (market, date, metric, partner, service) rows we
  // are about to write — matching EACH row's OWN scope (eq when set, isNull when null) so every
  // grain (market-level AND per-service) replaces cleanly and none leaks across a re-run (scope-leak
  // gate). A stale row for a date with no current demand is left as history (never silently mutated).
  await db.transaction(async (tx) => {
    for (const row of toInsert) {
      await tx
        .delete(partnerDemandRollup)
        .where(
          and(
            eq(partnerDemandRollup.marketSlug, row.marketSlug),
            eq(partnerDemandRollup.date, row.date),
            eq(partnerDemandRollup.metric, row.metric),
            row.partnerId == null ? isNull(partnerDemandRollup.partnerId) : eq(partnerDemandRollup.partnerId, row.partnerId),
            row.serviceId == null ? isNull(partnerDemandRollup.serviceId) : eq(partnerDemandRollup.serviceId, row.serviceId),
          ),
        );
    }
    if (toInsert.length) await tx.insert(partnerDemandRollup).values(toInsert);
  });

  return toInsert.length;
}

// ── floor-enforced reads (2B.3) + ±window axis & requested/missed split (R20) ───────────────────
export interface RollupReadRow {
  marketSlug: string;
  date: string;
  metric: string;
  value: unknown | null;   // null ⇒ suppressed below floor (§13 no_data)
  n: number;               // source_row_count (show-the-N)
  status: "ok" | "no_data";
  kind: DemandKind;        // R20: "requested" (date ≥ market-today) | "missed" (expired unfilled)
  partnerId: string | null; // scope: market-level rows are (null, null); per-service set serviceId
  serviceId: string | null; // R25b — the per-listing grain; null on market-level cells
  // 3.3 Catalog funnel rows: the funnel's biggest leak, derived SERVER-SIDE (L6 "no client math")
  // from this cell's own slip_funnel payload. Set only on a floor-cleared slip_funnel row; null on
  // every other metric, on a suppressed row, and on a funnel with no honest stall to claim (§13).
  stallStage: StallStage | null;
  computedAt: Date;
}
export interface RollupWindow { from: string; to: string; }
export interface RollupReadResult {
  cadence: string;
  window: RollupWindow;    // the ±WINDOW date span actually read (R20)
  historySince: string | null; // earliest run behind these rows — the honest floor of the past view
  floor: number;           // the audience's suppression floor (R27) — the client renders the honest
                           // "shows at N" line from THIS, never a hardcoded literal (config-only)
  rows: RollupReadRow[];   // each tagged requested|missed; NEVER a blended total (R20 binding rule)
  summary: MarketSummary[]; // per-market headline, aggregated SERVER-SIDE (L6 "no client math"),
                           // forked by kind AND metric, only floor-cleared cells (§13)
}
export interface RollupReadOpts { from?: string; to?: string; now?: Date }

type StoredRollupRow = {
  marketSlug: string; date: string; metric: string; value: unknown;
  sourceRowCount: number; partnerId: string | null; serviceId: string | null; computedAt: Date;
};

function isIsoDate(s?: string): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Default read window = [today − WINDOW, today + WINDOW] (R20); explicit from/to narrow it. `now`
 *  is injected so the caller owns the clock. A malformed param is ignored, not an error. */
function resolveWindow(now: Date, from?: string, to?: string): RollupWindow {
  const todayUtc = now.toISOString().slice(0, 10);
  return {
    from: isIsoDate(from) ? from : addDaysISO(todayUtc, -DEMAND_WINDOW_DAYS),
    to: isIsoDate(to) ? to : addDaysISO(todayUtc, DEMAND_WINDOW_DAYS),
  };
}

/** Map a stored row → read row: floor suppression (§13, R27 audience-keyed) + requested/missed
 *  disposition (R20). The cell's market-local "today" decides its kind; the AUDIENCE (own-book vs
 *  cross-partner) decides its floor, NOT its grain — the same cell suppresses differently per reader. */
function toReadRow(row: StoredRollupRow, now: Date, audience: DemandAudience): RollupReadRow {
  const ok = clearsFloor(row.sourceRowCount, audience);
  const marketSlug = String(row.marketSlug);
  const tz = timezoneForMarket(marketSlug === UNMAPPED_MARKET_SLUG ? null : marketSlug);
  const date = String(row.date);
  // The stall segment rides ONLY on a floor-cleared slip_funnel cell — never re-derived on a client
  // (L6). A suppressed cell (value nulled) carries no stall either, so nothing leaks below the floor.
  const stallStage =
    ok && row.metric === "slip_funnel" && row.value != null
      ? computeStallStage(row.value as SlipFunnelPayload)
      : null;
  return {
    marketSlug,
    date,
    metric: row.metric,
    value: ok ? row.value : null,
    n: row.sourceRowCount,
    status: ok ? "ok" : "no_data",
    kind: classifyKind(date, marketLocalDate(now, tz)),
    partnerId: row.partnerId,
    serviceId: row.serviceId,
    stallStage,
    computedAt: row.computedAt as Date,
  };
}

/** Earliest run behind a set of rows — the honest floor of the "past" view depth (R20: "history
 *  since <first run>", never a fabricated full band). Null when there are no rows. */
function historySinceOf(rows: { computedAt: Date }[]): string | null {
  let earliest: Date | null = null;
  for (const r of rows) {
    const d = r.computedAt as Date;
    if (d && (earliest == null || d.getTime() < earliest.getTime())) earliest = d;
  }
  return earliest ? earliest.toISOString().slice(0, 10) : null;
}

function inWindow(row: { date: string }, w: RollupWindow): boolean {
  const d = String(row.date);
  return d >= w.from && d <= w.to;
}

/** ADMIN read: every rollup row, floor-enforced, INCLUDING the unmapped bucket (R13), within the
 *  ±WINDOW (R20). The caller gates on the §2 blanket admin guard; this does not itself authorize. */
export async function readAdminDemandRollup(opts: RollupReadOpts = {}): Promise<RollupReadResult> {
  const now = opts.now ?? new Date();
  const window = resolveWindow(now, opts.from, opts.to);
  const stored = await db.select().from(partnerDemandRollup);
  // ADMIN is a CROSS-PARTNER reader (R27) — every row floors at 10, whatever its grain.
  const rows = stored.filter((r) => inWindow(r, window)).map((r) => toReadRow(r as StoredRollupRow, now, "cross_partner"));
  return {
    cadence: "updated daily",
    window,
    historySince: historySinceOf(stored),
    floor: floorForScope("cross_partner"),
    rows,
    // hero-not-sum (R25b): the summary aggregates MARKET-LEVEL cells only, never their per-service
    // children — a market's hero equals its market cell, never the sum of its listings' cells.
    summary: summarizeMarkets(rows.filter((r) => r.partnerId == null && r.serviceId == null)),
  };
}

/** PARTNER read: floor-enforced rows for the caller's own markets (derived from their
 *  provider_services cities, never a client value), UNMAPPED bucket EXCLUDED (R13 admin-only),
 *  within the ±WINDOW (R20). No money/rate figure is present (R12). */
export async function readPartnerDemandRollup(
  partnerUserId: string,
  opts: RollupReadOpts = {},
): Promise<RollupReadResult & { markets: string[] }> {
  const now = opts.now ?? new Date();
  const window = resolveWindow(now, opts.from, opts.to);
  const svc = await db
    .select({ id: providerServices.id, city: providerServices.city })
    .from(providerServices)
    .where(eq(providerServices.userId, partnerUserId));
  const markets = Array.from(
    new Set(svc.map((s) => resolveMarketSlug(s.city)).filter((m): m is string => !!m)),
  ).sort();
  const ownServiceIds = new Set(svc.map((s) => s.id));

  if (markets.length === 0) {
    return { cadence: "updated daily", window, historySince: null, floor: floorForScope("own_book"), markets: [], rows: [], summary: [] };
  }

  const stored = await db
    .select()
    .from(partnerDemandRollup)
    .where(inArray(partnerDemandRollup.marketSlug, markets));
  // UNMAPPED excluded (R13); a per-service cell is returned ONLY if the caller OWNS that service —
  // a market cell (service_id NULL) is always in-scope for the caller's own markets.
  const visible = stored.filter(
    (r) => r.marketSlug !== UNMAPPED_MARKET_SLUG && (r.serviceId == null || ownServiceIds.has(r.serviceId)),
  );
  // The PARTNER reads their OWN book (R27) — their market + owned-service cells floor at 5.
  const rows = visible.filter((r) => inWindow(r, window)).map((r) => toReadRow(r as StoredRollupRow, now, "own_book"));

  return {
    cadence: "updated daily",
    window,
    historySince: historySinceOf(visible),
    floor: floorForScope("own_book"),
    markets,
    rows,
    // hero-not-sum (R25b): market-level cells only feed the summary.
    summary: summarizeMarkets(rows.filter((r) => r.partnerId == null && r.serviceId == null)),
  };
}

/**
 * The ONE highest-value demand signal for the Today card (3.4 Item 2.1). Reads the partner's own
 * rollup (own_book floor, R16-filtered, UNMAPPED excluded) and selects the single top signal
 * SERVER-SIDE (pickTopDemandSignal — R19-honest, floor-cleared only), resolving the market's display
 * name so the client renders honest copy with no client math. Null when there is no floor-cleared
 * requested demand (§13 — the card simply does not render). */
export async function readTopDemandSignal(
  partnerUserId: string,
): Promise<{ signal: (TopDemandSignal & { marketName: string }) | null }> {
  const rollup = await readPartnerDemandRollup(partnerUserId);
  const top = pickTopDemandSignal(rollup.summary);
  if (!top) return { signal: null };
  const marketName = getMarketByKey(top.marketSlug)?.cityName ?? top.marketSlug;
  return { signal: { ...top, marketName } };
}
