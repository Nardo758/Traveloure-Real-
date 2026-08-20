/**
 * Partner Demand Phase 4 (recruitment one-pager) — pure-function unit tests for the L6 one-pager
 * view-model (no DB, no PDF). Covers R30 (public 10-floor), R31 (variant selection), R19 (stay is
 * count-only), determinism, and qualification.
 *
 * The floor is proven END-TO-END through the REAL path: rows are stamped `ok`/`no_data` by the real
 * `clearsFloor(n, "cross_partner", …)` (exactly what `toReadRow` does in the admin read), then run
 * through the real `summarizeMarkets` (which drops every non-`ok` cell), then handed to
 * `buildOnepagerModel`. So an n=9 figure is suppressed by the same code the read uses, not by the test.
 *
 * Run: tsx --test server/__tests__/demand-onepager.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeMarkets, type MarketSummary } from "../services/demand-rollup.compute";
import type { RollupReadRow, RollupWindow } from "../services/demand-rollup.service";
import { clearsFloor, metricClassOf } from "../config/demand-floors.config";
import {
  buildOnepagerModel,
  qualifyingMarkets,
} from "../services/demand-onepager.compute";

const WINDOW: RollupWindow = { from: "2026-05-22", to: "2026-11-18" };

/** Build a market-level read row with the REAL public (cross_partner) floor applied — the exact
 *  status/value mapping `toReadRow` performs in `readAdminDemandRollup`. */
function mkRow(o: {
  marketSlug: string;
  metric: "unmet_demand_slip" | "unmet_demand_stay";
  n: number;
  value: unknown;
  date?: string;
  kind?: "requested" | "missed";
}): RollupReadRow {
  const status = clearsFloor(o.n, "cross_partner", metricClassOf(o.metric)) ? "ok" : "no_data";
  return {
    marketSlug: o.marketSlug,
    date: o.date ?? "2026-08-22",
    metric: o.metric,
    value: status === "ok" ? o.value : null,
    n: o.n,
    status,
    kind: o.kind ?? "requested",
    partnerId: null,
    serviceId: null,
    stallStage: null,
    lowN: false,
    computedAt: new Date(0),
  };
}

function summaryFor(marketSlug: string, rows: RollupReadRow[]): MarketSummary | undefined {
  return summarizeMarkets(rows).find((s) => s.marketSlug === marketSlug);
}

function model(marketSlug: string, rows: RollupReadRow[]) {
  return buildOnepagerModel({
    marketSlug,
    marketName: "Kyoto",
    summary: summaryFor(marketSlug, rows),
    rows,
    window: WINDOW,
  });
}

// ── R30 · public 10-floor, no exceptions ──────────────────────────────────────────────────────
test("R30: a slip figure at n=9 is suppressed and never reaches the page", () => {
  const rows = [mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 9, value: { count: 9, amount: 1800, valuedCount: 9 } })];
  // n=9 < 10 ⇒ no_data ⇒ excluded from the summary ⇒ nothing clears ⇒ no artifact.
  assert.equal(model("kyoto", rows), null);
});

test("R30: the SAME slip figure at n=10 clears and leads (service-led)", () => {
  const rows = [mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 10, value: { count: 10, amount: 1800, valuedCount: 10 } })];
  const m = model("kyoto", rows);
  assert.ok(m, "n=10 clears the public floor");
  assert.equal(m!.variant, "service-led");
  assert.match(m!.hero.headline, /\$1,800/);
  assert.equal(m!.hero.strictCount, 10);
});

test("R30 (Kyoto acceptance shape): $240/n=3 service cell is invisible; the stay figure leads", () => {
  // Mirrors the real Kyoto data: an enumerable slip at n=3 (own-book early-signal on the console, but
  // BELOW the public 10-floor here) and a stay figure at n=27. The one-pager must resolve property-led
  // with NO dollar anywhere — R30 does not honor R29's enumerable-3 tier for a public artifact.
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 3, value: { count: 3, amount: 240, valuedCount: 3 } }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 27, value: { trips: 27, nights: 135, travelers: 41 } }),
  ];
  const m = model("kyoto", rows);
  assert.ok(m);
  assert.equal(m!.variant, "property-led");
  assert.doesNotMatch(m!.hero.headline, /\$|240/, "no dollar figure, and the $240 never appears");
  assert.match(m!.hero.headline, /27 trips · 135 nights/);
  assert.equal(m!.hero.strictCount, 27);
  assert.equal(m!.hero.unmetAmount, undefined);
});

// ── R31 · variant selection ────────────────────────────────────────────────────────────────────
test("R31: stay-only clears ⇒ property-led", () => {
  const rows = [mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 12, value: { trips: 12, nights: 40, travelers: 18 } })];
  assert.equal(model("kyoto", rows)!.variant, "property-led");
});

test("R31: slip-only (priced, cleared) ⇒ service-led", () => {
  const rows = [mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 15, value: { count: 15, amount: 3200, valuedCount: 15 } })];
  assert.equal(model("kyoto", rows)!.variant, "service-led");
});

test("R31: both clear ⇒ greater trip-count (weight) leads, unit-neutral", () => {
  // slip weight = slipCount 20 > stay weight = stayTrips 12 ⇒ service-led
  const serviceHeavy = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 20, value: { count: 20, amount: 5000, valuedCount: 20 } }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 12, value: { trips: 12, nights: 40, travelers: 18 } }),
  ];
  assert.equal(model("kyoto", serviceHeavy)!.variant, "service-led");
  // reverse the weights ⇒ property-led
  const stayHeavy = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 11, value: { count: 11, amount: 5000, valuedCount: 11 } }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 30, value: { trips: 30, nights: 90, travelers: 44 } }),
  ];
  assert.equal(model("kyoto", stayHeavy)!.variant, "property-led");
});

test("R31: neither class clears ⇒ NO artifact (null)", () => {
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 4, value: { count: 4, amount: 900, valuedCount: 4 } }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 8, value: { trips: 8, nights: 20, travelers: 10 } }),
  ];
  assert.equal(model("kyoto", rows), null);
});

test("R31: a count-only slip (amount null) does NOT lead a service-led hero", () => {
  // Priced $ is absent, so slip cannot lead a $-hero; the cleared stay leads instead.
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 14, value: { count: 14, amount: null, valuedCount: 0 } }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 11, value: { trips: 11, nights: 33, travelers: 15 } }),
  ];
  assert.equal(model("kyoto", rows)!.variant, "property-led");
});

// ── R19 · units never blend ──────────────────────────────────────────────────────────────────
test("R19: property-led hero carries no dollar figure at all", () => {
  const m = model("kyoto", [mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 20, value: { trips: 20, nights: 60, travelers: 25 } })])!;
  assert.doesNotMatch(m.hero.headline, /\$/);
  assert.doesNotMatch(m.hero.subline, /\$/);
  assert.equal(m.hero.unmetAmount, undefined);
  assert.doesNotMatch(m.methodology, /\$/);
});

// ── determinism ──────────────────────────────────────────────────────────────────────────────
test("determinism: identical rows ⇒ deep-equal model (byte-stable at the model layer)", () => {
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 27, value: { trips: 27, nights: 135, travelers: 41 }, date: "2026-08-22" }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 15, value: { trips: 15, nights: 60, travelers: 20 }, date: "2026-09-10" }),
  ];
  const a = model("kyoto", rows);
  const b = model("kyoto", rows);
  assert.deepStrictEqual(a, b);
});

test("determinism: window sort is stable — most nights first, date asc tiebreak", () => {
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 12, value: { trips: 12, nights: 30, travelers: 15 }, date: "2026-09-10" }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 12, value: { trips: 12, nights: 30, travelers: 15 }, date: "2026-08-22" }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 20, value: { trips: 20, nights: 90, travelers: 25 }, date: "2026-10-01" }),
  ];
  const m = model("kyoto", rows)!;
  assert.deepEqual(m.windows.map((w) => w.date), ["2026-10-01", "2026-08-22", "2026-09-10"]);
});

// ── note-2 reconciliation: the full window set SUMS to the hero (market total) ──────────────────
test("reconciliation (property-led): Σ(window trips|nights) === hero total", () => {
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 20, value: { trips: 20, nights: 90, travelers: 25 }, date: "2026-10-01" }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 12, value: { trips: 12, nights: 30, travelers: 15 }, date: "2026-08-22" }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 11, value: { trips: 11, nights: 24, travelers: 14 }, date: "2026-09-10" }),
  ];
  const m = model("kyoto", rows)!;
  const sumTrips = m.windows.reduce((a, w) => a + (w.trips ?? 0), 0);
  const sumNights = m.windows.reduce((a, w) => a + (w.nights ?? 0), 0);
  assert.equal(sumTrips, m.hero.stayTrips, "trips reconcile to the hero total");
  assert.equal(sumNights, m.hero.stayNights, "nights reconcile to the hero total");
  assert.equal(sumTrips, m.hero.strictCount, "strict count is the market total, not a window");
  assert.equal(m.windowsTotal, 3);
});

test("reconciliation (service-led): Σ(window $|count) === hero total; count-only counts but adds no $", () => {
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 14, value: { count: 14, amount: 3000, valuedCount: 14 }, date: "2026-10-01" }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 11, value: { count: 11, amount: 2000, valuedCount: 11 }, date: "2026-08-22" }),
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_slip", n: 12, value: { count: 12, amount: null, valuedCount: 0 }, date: "2026-09-10" }),
  ];
  const m = model("kyoto", rows)!;
  const sumAmount = m.windows.reduce((a, w) => a + (w.amount ?? 0), 0);
  const sumCount = m.windows.reduce((a, w) => a + (w.count ?? 0), 0);
  assert.equal(sumAmount, m.hero.unmetAmount, "priced $ reconciles to the hero total ($ from priced windows only)");
  assert.equal(sumCount, m.hero.unmetTripCount, "trip count reconciles (count-only window included)");
  assert.equal(m.windowsTotal, 3);
});

// ── qualification (R32 admin control) ──────────────────────────────────────────────────────────
test("qualifyingMarkets: only markets with a floor-clearing class qualify", () => {
  const rows = [
    mkRow({ marketSlug: "kyoto", metric: "unmet_demand_stay", n: 27, value: { trips: 27, nights: 135, travelers: 41 } }),
    mkRow({ marketSlug: "osaka", metric: "unmet_demand_slip", n: 6, value: { count: 6, amount: 900, valuedCount: 6 } }), // below floor
  ];
  const summaries = summarizeMarkets(rows);
  assert.deepEqual(qualifyingMarkets(summaries), ["kyoto"]);
});
