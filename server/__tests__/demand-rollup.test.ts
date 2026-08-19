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
  computeUnmetSlipByService,
  computeSlipFunnel,
  computeUnmetStay,
  computeStallStage,
  classifyKind,
  addDaysISO,
  summarizeMarkets,
  pickTopDemandSignal,
  buildDemandRollupFacts,
  DEMAND_ROLLUP_RULES_NOTE,
  type SlipDemandRow,
  type DiaryRow,
  type StayDemandRow,
  type SummaryInputRow,
  type SlipFunnelPayload,
  type MarketSummary,
} from "../services/demand-rollup.compute";
import { clearsFloor, floorForScope, DEMAND_FLOORS, DEMAND_WINDOW_DAYS } from "../config/demand-floors.config";

// ── market-local date ────────────────────────────────────────────────────────────────────────
test("market-local date: 23:30 JST lands on the JST date, not the next UTC day", () => {
  // 2026-08-18T14:30:00Z == 23:30 on 2026-08-18 in Asia/Tokyo (UTC+9)
  assert.equal(marketLocalDate(new Date("2026-08-18T14:30:00Z"), "Asia/Tokyo"), "2026-08-18");
  // one hour later == 00:30 on 2026-08-19 JST → rolls to the next JST date
  assert.equal(marketLocalDate(new Date("2026-08-18T15:30:00Z"), "Asia/Tokyo"), "2026-08-19");
  // UTC fallback (unmapped bucket) keeps the UTC date
  assert.equal(marketLocalDate(new Date("2026-08-18T23:30:00Z"), "UTC"), "2026-08-18");
});

// ── floor enforcement — R27 audience-scoped (config, read path) ──────────────────────────────────
test("floor R27: tiers come from config — own-book 5, cross-partner 10, sold 25", () => {
  assert.equal(DEMAND_FLOORS.ownBook, 5);
  assert.equal(DEMAND_FLOORS.crossPartner, 10);
  assert.equal(DEMAND_FLOORS.sold, 25);
  assert.equal(floorForScope("own_book"), 5);
  assert.equal(floorForScope("cross_partner"), 10);
  assert.equal(floorForScope("sold"), 25);
});

test("floor R27: the SAME cell suppresses by AUDIENCE, not grain", () => {
  // n=7 renders to the OWNER (own-book 5) but is SUPPRESSED in an admin cross-partner view (10)
  assert.equal(clearsFloor(7, "own_book"), true);
  assert.equal(clearsFloor(7, "cross_partner"), false);
  // n=12 clears both audiences; n=4 clears neither
  assert.equal(clearsFloor(12, "own_book"), true);
  assert.equal(clearsFloor(12, "cross_partner"), true);
  assert.equal(clearsFloor(4, "own_book"), false);
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

// ── summarizeMarkets: server-side hero aggregate (R19/R20 — forks + no suppressed leak) ───────────
test("summarizeMarkets: forks kind + metric, sums only floor-cleared cells, suppressed never leak", () => {
  const rows: SummaryInputRow[] = [
    // requested slip, floor-cleared → counts
    { marketSlug: "kyoto", metric: "unmet_demand_slip", kind: "requested", status: "ok", value: { count: 5, amount: 400, valuedCount: 5 } },
    // requested slip, SUPPRESSED → must NOT leak into the aggregate (§13)
    { marketSlug: "kyoto", metric: "unmet_demand_slip", kind: "requested", status: "no_data", value: { count: 3, amount: 999, valuedCount: 3 } },
    // missed slip, cleared → lands in the MISSED bucket, never summed with requested
    { marketSlug: "kyoto", metric: "unmet_demand_slip", kind: "missed", status: "ok", value: { count: 2, amount: 120, valuedCount: 2 } },
    // requested stay, cleared → stay bucket (count-only, never a $)
    { marketSlug: "kyoto", metric: "unmet_demand_stay", kind: "requested", status: "ok", value: { trips: 27, nights: 135, travelers: 54 } },
  ];
  const [k] = summarizeMarkets(rows);
  assert.equal(k.marketSlug, "kyoto");
  // requested slip: only the cleared cell (400), the suppressed 999 is invisible
  assert.equal(k.requested.slipAmount, 400);
  assert.equal(k.requested.slipCount, 5);
  // requested stay is count-only and separate from slip $
  assert.equal(k.requested.stayTrips, 27);
  assert.equal(k.requested.stayNights, 135);
  assert.equal(k.requested.stayTravelers, 54);
  // missed is its OWN bucket — never blended into requested (R20)
  assert.equal(k.missed.slipAmount, 120);
  assert.equal(k.requested.slipAmount !== k.missed.slipAmount, true);
});

test("summarizeMarkets hero-not-sum: a per-service child cell is NEVER summed into the hero (R25b)", () => {
  const rows: SummaryInputRow[] = [
    { marketSlug: "kyoto", metric: "unmet_demand_slip", kind: "requested", status: "ok", value: { count: 10, amount: 400, valuedCount: 10 } }, // market cell
    { marketSlug: "kyoto", metric: "unmet_demand_slip", kind: "requested", status: "ok", value: { count: 5, amount: 200, valuedCount: 5 }, serviceId: "svc-A" }, // child
  ];
  const [k] = summarizeMarkets(rows);
  assert.equal(k.requested.slipAmount, 400, "hero equals the market cell, not market+child (600)");
  assert.equal(k.requested.slipCount, 10);
});

// ── per-service grain (R25b, 3.1b) ───────────────────────────────────────────────────────────────
test("computeUnmetSlipByService: groups by service, skips NULL-service rows, uses per-service inventory", () => {
  const demand: SlipDemandRow[] = [
    { marketSlug: "kyoto", date: "2026-09-01", estimatedCost: 100, serviceId: "svc-A" },
    { marketSlug: "kyoto", date: "2026-09-01", estimatedCost: 50, serviceId: "svc-A" },
    { marketSlug: "kyoto", date: "2026-09-01", estimatedCost: 80, serviceId: "svc-B" }, // met by svc-B's own slot
    { marketSlug: "kyoto", date: "2026-09-01", estimatedCost: 30, serviceId: null },     // no service → excluded
  ];
  const svcInv = new Set<string>(["svc-B|2026-09-01"]);
  const cells = computeUnmetSlipByService(demand, svcInv);
  assert.equal(cells.length, 1, "only svc-A is unmet; svc-B met by its own slot; null-service excluded");
  assert.equal(cells[0].serviceId, "svc-A");
  assert.equal(cells[0].count, 2);
  assert.equal(cells[0].amount, 150);
  assert.equal(cells[0].valuedCount, 2);
  assert.deepEqual(computeUnmetSlipByService(demand, svcInv), computeUnmetSlipByService(demand, svcInv)); // determinism
});

// ── stall stage (3.3 Catalog funnel rows) ────────────────────────────────────────────────────────
function funnelPayload(stageEntries: Record<string, number>): SlipFunnelPayload {
  return { stageEntries, transitions: {}, transitionRates: {}, avgHoursInStage: {}, removed: 0, removalDataSince: null, itemsObserved: 0 };
}

test("computeStallStage: picks the largest stage-to-stage drop (the funnel's biggest leak)", () => {
  // 20 → 18 → 4 → 3: the with_expert→ready_for_checkout segment loses 14, the biggest fall
  const stall = computeStallStage(funnelPayload({ in_planning: 20, with_expert: 18, ready_for_checkout: 4, purchased: 3 }));
  assert.notEqual(stall, null);
  assert.equal(stall!.fromStage, "with_expert");
  assert.equal(stall!.toStage, "ready_for_checkout");
  assert.equal(stall!.entered, 18);
  assert.equal(stall!.continued, 4);
  assert.equal(stall!.dropped, 14);
  assert.equal(stall!.dropRate, Math.round((14 / 18) * 10000) / 10000);
});

test("computeStallStage: a tie resolves to the EARLIER ladder segment (deterministic)", () => {
  // in_planning→with_expert drops 10; ready_for_checkout→purchased also drops 10 → earlier wins
  const stall = computeStallStage(funnelPayload({ in_planning: 10, with_expert: 0, ready_for_checkout: 10, purchased: 0 }));
  assert.equal(stall!.fromStage, "in_planning");
  assert.equal(stall!.toStage, "with_expert");
  assert.equal(stall!.dropped, 10);
});

test("computeStallStage: null (§13) when there is no honest stall to claim", () => {
  // no stage carried entries → no claim
  assert.equal(computeStallStage(funnelPayload({})), null);
  // a flat/monotonic-up funnel never drops → no stall invented (not a zero-drop segment)
  assert.equal(computeStallStage(funnelPayload({ in_planning: 5, with_expert: 5, ready_for_checkout: 6, purchased: 6 })), null);
  // determinism
  const p = funnelPayload({ in_planning: 9, with_expert: 2 });
  assert.deepEqual(computeStallStage(p), computeStallStage(p));
});

// ── top demand signal for the Today card (3.4 Item 2.1) ──────────────────────────────────────────
function mkSummary(marketSlug: string, requested: Partial<MarketSummary["requested"]>): MarketSummary {
  const blank = { slipAmount: null, slipCount: 0, slipValuedCount: 0, stayTrips: 0, stayNights: 0, stayTravelers: null };
  return { marketSlug, requested: { ...blank, ...requested }, missed: { ...blank } };
}

test("pickTopDemandSignal: highest-$ SERVICE signal wins; R19 units carried, never blended", () => {
  const top = pickTopDemandSignal([
    mkSummary("goa", { slipAmount: 400, slipCount: 8 }),
    mkSummary("kyoto", { slipAmount: 900, slipCount: 12, stayTrips: 50 }), // higher $ AND has stay
  ]);
  assert.equal(top?.shape, "service");
  assert.equal(top?.marketSlug, "kyoto");
  assert.equal(top?.amount, 900);
  assert.equal(top?.count, 12);
  // R19: a service signal carries NO stay units
  assert.equal(top?.trips, undefined);
  assert.equal(top?.nights, undefined);
});

test("pickTopDemandSignal: STAY signal is the fallback only when NO service $ exists (R19, no $)", () => {
  const top = pickTopDemandSignal([
    mkSummary("kyoto", { stayTrips: 27, stayNights: 135 }), // stay only, no slip $
  ]);
  assert.equal(top?.shape, "stay");
  assert.equal(top?.trips, 27);
  assert.equal(top?.nights, 135);
  // R19: a stay signal NEVER carries $
  assert.equal(top?.amount, undefined);
  assert.equal((top as { amount?: number })?.amount, undefined);
});

test("pickTopDemandSignal: null when there is no floor-cleared requested demand (§13); deterministic tie", () => {
  assert.equal(pickTopDemandSignal([]), null);
  assert.equal(pickTopDemandSignal([mkSummary("kyoto", {})]), null); // no slip $, no stay trips
  // tie on $ → earlier market (summaries arrive sorted) wins, stably
  const tie = [mkSummary("goa", { slipAmount: 500, slipCount: 5 }), mkSummary("kyoto", { slipAmount: 500, slipCount: 9 })];
  assert.equal(pickTopDemandSignal(tie)?.marketSlug, "goa");
  assert.deepEqual(pickTopDemandSignal(tie), pickTopDemandSignal(tie));
});

// ── advisor labeled facts (3.4 Item 2.2) — R5/R19/R20 labels ride into the prompt ───────────────
test("buildDemandRollupFacts: each figure is tagged by kind (R20) and shape (R19); rulesNote rides along", () => {
  const facts = buildDemandRollupFacts([
    mkSummary("kyoto", { slipAmount: 900, slipCount: 12, stayTrips: 27, stayNights: 135 }),
  ]);
  // rulesNote carries both invariants into the prompt
  assert.equal(facts.rulesNote, DEMAND_ROLLUP_RULES_NOTE);
  assert.match(facts.rulesNote, /R19/);
  assert.match(facts.rulesNote, /R20/);
  assert.match(facts.rulesNote, /never/i);
  const k = facts.markets[0];
  assert.equal(k.market, "kyoto");
  // R20: requested and missed are SEPARATE buckets (never one summed figure)
  assert.ok("requested" in k && "missed" in k);
  // R19: service demand is a DOLLAR figure; stay demand is count-only in the SAME bucket, no $ key
  assert.equal(k.requested.serviceDollars, 900);
  assert.equal(k.requested.serviceCount, 12);
  assert.equal(k.requested.stayTrips, 27);
  assert.equal(k.requested.stayNights, 135);
  assert.equal("stayDollars" in k.requested, false, "R19: a stay figure never carries a dollar key");
  // missed is its own bucket, empty here (a settled loss is never blended into requested)
  assert.equal(k.missed.serviceDollars, null);
  assert.equal(k.missed.stayTrips, 0);
});

test("computeSlipFunnel by service: per-service cells skip NULL-service; market grain still counts all", () => {
  const diary: DiaryRow[] = [
    { marketSlug: "kyoto", itemId: "A", eventType: "status_transition", fromStatus: "in_planning", toStatus: "with_expert", createdAt: new Date("2026-09-01T00:00:00Z"), serviceId: "svc-A" },
    { marketSlug: "kyoto", itemId: "B", eventType: "status_transition", fromStatus: "in_planning", toStatus: "with_expert", createdAt: new Date("2026-09-01T00:00:00Z"), serviceId: null },
  ];
  const svc = computeSlipFunnel(diary, { by: "service" });
  assert.equal(svc.length, 1, "only the serviced item forms a per-service cell");
  assert.equal(svc[0].serviceId, "svc-A");
  assert.equal(svc[0].payload.stageEntries["with_expert"], 1);
  // market grain (default) is UNCHANGED and counts BOTH items, no serviceId on the cell
  const mkt = computeSlipFunnel(diary);
  assert.equal(mkt.length, 1);
  assert.equal(mkt[0].serviceId, undefined);
  assert.equal(mkt[0].payload.stageEntries["with_expert"], 2);
});

