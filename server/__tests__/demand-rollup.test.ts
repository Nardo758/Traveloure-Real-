/**
 * Partner Demand 2B (ledger 2026-08-18-partner-demand-2b) — pure-function unit tests for the L6
 * demand-rollup computations (no DB). Covers: market-local date, floor enforcement, determinism,
 * and both metric shapes with a hand-derivable figure.
 * Run: tsx --test server/__tests__/demand-rollup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  marketLocalDate,
  computeUnmetSlip,
  computeSlipFunnel,
  type SlipDemandRow,
  type DiaryRow,
} from "../services/demand-rollup.compute";
import { clearsFloor, DEMAND_FLOORS } from "../config/demand-floors.config";

// ── market-local date ────────────────────────────────────────────────────────────────────────
test("market-local date: 23:30 JST lands on the JST date, not the next UTC day", () => {
  // 2026-08-18T14:30:00Z == 23:30 on 2026-08-18 in Asia/Tokyo (UTC+9)
  assert.equal(marketLocalDate(new Date("2026-08-18T14:30:00Z"), "Asia/Tokyo"), "2026-08-18");
  // one hour later == 00:30 on 2026-08-19 JST → rolls to the next JST date
  assert.equal(marketLocalDate(new Date("2026-08-18T15:30:00Z"), "Asia/Tokyo"), "2026-08-19");
  // UTC fallback (unmapped bucket) keeps the UTC date
  assert.equal(marketLocalDate(new Date("2026-08-18T23:30:00Z"), "UTC"), "2026-08-18");
});

// ── floor enforcement (config, read path) ──────────────────────────────────────────────────────
test("floor: market grain below 10 → suppressed, at 10 → renders", () => {
  assert.equal(DEMAND_FLOORS.market, 10);
  assert.equal(clearsFloor({ sourceRowCount: 9, partnerId: null, serviceId: null }), false);
  assert.equal(clearsFloor({ sourceRowCount: 10, partnerId: null, serviceId: null }), true);
});

test("floor: partner/service grain uses the higher 25-floor", () => {
  assert.equal(DEMAND_FLOORS.partner, 25);
  assert.equal(clearsFloor({ sourceRowCount: 24, partnerId: "p1", serviceId: null }), false);
  assert.equal(clearsFloor({ sourceRowCount: 25, partnerId: "p1", serviceId: null }), true);
  assert.equal(clearsFloor({ sourceRowCount: 25, partnerId: null, serviceId: "s1" }), true);
});

// ── unmet_demand_slip (hand-derivable) ─────────────────────────────────────────────────────────
test("computeUnmetSlip: count/amount/valuedCount, inventory removes a slip, count-only honesty", () => {
  const demand: SlipDemandRow[] = [
    { marketSlug: "kyoto", date: "2026-08-18", estimatedCost: 100 },
    { marketSlug: "kyoto", date: "2026-08-18", estimatedCost: null }, // count-only item
    { marketSlug: "kyoto", date: "2026-08-19", estimatedCost: 50 },   // met by inventory below
    { marketSlug: "__unmapped__", date: "2026-08-18", estimatedCost: null },
  ];
  const inventory = new Set<string>(["kyoto|2026-08-19"]); // Aug 19 has bookable inventory

  const cells = computeUnmetSlip(demand, inventory);
  // kyoto/2026-08-18: 2 unmet items, one priced (amount 100, valuedCount 1); Aug-19 removed by inventory
  const kyoto18 = cells.find((c) => c.marketSlug === "kyoto" && c.date === "2026-08-18")!;
  assert.equal(kyoto18.count, 2);
  assert.equal(kyoto18.amount, 100);
  assert.equal(kyoto18.valuedCount, 1);
  assert.equal(cells.find((c) => c.date === "2026-08-19"), undefined, "Aug 19 met by inventory");
  // unmapped/2026-08-18: 1 item, no price ⇒ amount stays NULL (§13 count-only, never a guessed $)
  const unmapped = cells.find((c) => c.marketSlug === "__unmapped__")!;
  assert.equal(unmapped.count, 1);
  assert.equal(unmapped.amount, null);
});

// ── slip_funnel ────────────────────────────────────────────────────────────────────────────────
test("computeSlipFunnel: stage entries, transition rate, removal count + removalDataSince", () => {
  const diary: DiaryRow[] = [
    // item A: in_planning → with_expert (24h later)
    { marketSlug: "kyoto", itemId: "A", eventType: "status_transition", fromStatus: "in_planning", toStatus: "with_expert", createdAt: new Date("2026-08-18T00:00:00Z") },
    { marketSlug: "kyoto", itemId: "A", eventType: "status_transition", fromStatus: "with_expert", toStatus: "ready_for_checkout", createdAt: new Date("2026-08-19T00:00:00Z") },
    // item B: in_planning → with_expert, then removed
    { marketSlug: "kyoto", itemId: "B", eventType: "status_transition", fromStatus: "in_planning", toStatus: "with_expert", createdAt: new Date("2026-08-18T00:00:00Z") },
    { marketSlug: "kyoto", itemId: "B", eventType: "item_removed", fromStatus: "with_expert", toStatus: null, createdAt: new Date("2026-08-20T06:00:00Z") },
  ];
  const [cell] = computeSlipFunnel(diary);
  assert.equal(cell.marketSlug, "kyoto");
  // both A and B entered with_expert; only A entered ready_for_checkout
  assert.equal(cell.payload.stageEntries["with_expert"], 2);
  assert.equal(cell.payload.stageEntries["ready_for_checkout"], 1);
  // transition in_planning→with_expert happened for both (rate vs entries(in_planning)…in_planning
  // is never a to_status here, so entries[in_planning] is 0 → rate 0, guarded, not NaN)
  assert.equal(cell.payload.transitions["in_planning->with_expert"], 2);
  assert.equal(cell.payload.transitions["with_expert->ready_for_checkout"], 1);
  assert.equal(Number.isFinite(cell.payload.transitionRates["with_expert->ready_for_checkout"]), true);
  // removal
  assert.equal(cell.payload.removed, 1);
  assert.equal(cell.payload.removalDataSince, "2026-08-20");
  assert.equal(cell.payload.itemsObserved, 2);
});

// ── determinism ──────────────────────────────────────────────────────────────────────────────
test("determinism: identical inputs → identical rows (both metrics)", () => {
  const demand: SlipDemandRow[] = [
    { marketSlug: "kyoto", date: "2026-08-18", estimatedCost: 100 },
    { marketSlug: "goa", date: "2026-08-18", estimatedCost: null },
  ];
  const inv = new Set<string>();
  assert.deepEqual(computeUnmetSlip(demand, inv), computeUnmetSlip(demand, inv));

  const diary: DiaryRow[] = [
    { marketSlug: "kyoto", itemId: "A", eventType: "status_transition", fromStatus: "in_planning", toStatus: "with_expert", createdAt: new Date("2026-08-18T00:00:00Z") },
    { marketSlug: "goa", itemId: "C", eventType: "status_transition", fromStatus: "in_planning", toStatus: "with_expert", createdAt: new Date("2026-08-18T00:00:00Z") },
  ];
  assert.deepEqual(computeSlipFunnel(diary), computeSlipFunnel(diary));
});
