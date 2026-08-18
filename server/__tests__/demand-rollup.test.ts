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
  computeUnmetStay,
  classifyKind,
  addDaysISO,
  type SlipDemandRow,
  type DiaryRow,
  type StayDemandRow,
} from "../services/demand-rollup.compute";
import { clearsFloor, DEMAND_FLOORS, DEMAND_WINDOW_DAYS } from "../config/demand-floors.config";

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

// ── unmet_demand_stay (R19, hand-derivable) ──────────────────────────────────────────────────────
test("computeUnmetStay: trips/nights/travelers aggregate per (market, check-in); count-only", () => {
  const rows: StayDemandRow[] = [
    { marketSlug: "kyoto", checkIn: "2026-10-12", nights: 3, travelers: 4 },
    { marketSlug: "kyoto", checkIn: "2026-10-12", nights: 2, travelers: null }, // party not captured
    { marketSlug: "kyoto", checkIn: "2026-10-15", nights: 1, travelers: 2 },
    { marketSlug: "__unmapped__", checkIn: "2026-10-12", nights: 5, travelers: null },
  ];
  const cells = computeUnmetStay(rows);
  assert.equal(cells.length, 3);
  // kyoto/2026-10-12: 2 trips; nights 3+2=5; only row-1 captured a party (4) ⇒ travelers 4, captured 1
  const k1012 = cells.find((c) => c.marketSlug === "kyoto" && c.date === "2026-10-12")!;
  assert.equal(k1012.trips, 2);
  assert.equal(k1012.nights, 5);
  assert.equal(k1012.travelers, 4);
  assert.equal(k1012.travelersCaptured, 1);
  // count-only (R19): the cell carries NO dollar field of any name
  assert.equal("amount" in k1012, false);
  assert.equal("value" in k1012 || "usd" in k1012 || "dollars" in k1012, false);
});

test("computeUnmetStay: NULL party never becomes a headcount (§13), sorted deterministically", () => {
  const rows: StayDemandRow[] = [
    { marketSlug: "__unmapped__", checkIn: "2026-10-12", nights: 5, travelers: null },
    { marketSlug: "kyoto", checkIn: "2026-10-15", nights: 1, travelers: 2 },
  ];
  const cells = computeUnmetStay(rows);
  // output sorts by market then date: __unmapped__ before kyoto
  assert.deepEqual(cells.map((c) => c.marketSlug), ["__unmapped__", "kyoto"]);
  const unmapped = cells[0];
  assert.equal(unmapped.travelers, null, "no party captured ⇒ travelers stays NULL, not 0");
  assert.equal(unmapped.travelersCaptured, 0);
  assert.equal(unmapped.nights, 5);
  assert.equal(unmapped.trips, 1);
});

test("computeUnmetStay: determinism — identical input, identical rows", () => {
  const rows: StayDemandRow[] = [
    { marketSlug: "kyoto", checkIn: "2026-10-12", nights: 3, travelers: 4 },
    { marketSlug: "goa", checkIn: "2026-10-12", nights: 2, travelers: null },
  ];
  assert.deepEqual(computeUnmetStay(rows), computeUnmetStay(rows));
});

// ── ±window axis & requested/missed split (R20) ──────────────────────────────────────────────────
test("classifyKind: today-or-later is 'requested', a passed date is 'missed' (never summed)", () => {
  assert.equal(classifyKind("2026-10-20", "2026-10-18"), "requested"); // future window
  assert.equal(classifyKind("2026-10-18", "2026-10-18"), "requested"); // today counts as requested
  assert.equal(classifyKind("2026-10-17", "2026-10-18"), "missed");    // expired_unmet
});

test("addDaysISO: month/year rollovers and ±WINDOW symmetry (config-driven, no literal)", () => {
  assert.equal(addDaysISO("2026-08-18", 0), "2026-08-18");
  assert.equal(addDaysISO("2026-08-31", 1), "2026-09-01");   // month rollover
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");  // 2026 is not a leap year
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");  // year rollover
  // the default read window is exactly ±DEMAND_WINDOW_DAYS around a date, and it is symmetric
  assert.equal(DEMAND_WINDOW_DAYS, 90);
  const d = "2026-08-18";
  assert.equal(addDaysISO(addDaysISO(d, DEMAND_WINDOW_DAYS), -DEMAND_WINDOW_DAYS), d);
});

test("R19: stay and slip cells carry distinct metric tags — service- and stay-shaped never blend", () => {
  const stay = computeUnmetStay([{ marketSlug: "kyoto", checkIn: "2026-10-12", nights: 3, travelers: 4 }]);
  const slip = computeUnmetSlip([{ marketSlug: "kyoto", date: "2026-10-12", estimatedCost: 100 }], new Set());
  assert.equal(stay[0].metric, "unmet_demand_stay");
  assert.equal(slip[0].metric, "unmet_demand_slip");
  assert.notEqual(stay[0].metric, slip[0].metric);
});
