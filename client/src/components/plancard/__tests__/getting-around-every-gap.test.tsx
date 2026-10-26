/**
 * Production smoke F1 (ledger `2026-10-08-getting-around-every-gap`): Getting around lists EVERY gap
 * between consecutive stops and never drops a day. The smoke-12 shape: days of 4 / 6 / 5 stops ⇒
 * 3 / 5 / 4 gaps.
 *   G1 every consecutive gap is listed, in stop order, on every day
 *   G2 a routed leg reads the slip's line; an unrouted leg reads "walk · Not checked yet" (audit B8); no leg, or
 *      a leg with no minutes, reads "not worked out yet"
 *   G3 days never vanish — a one-stop day and an empty day are still listed, with no gaps
 *   G4 a plan that doesn't earn routed legs gets the header "Travel times come with Optimize"; one that
 *      does gets none
 *   G5 the sheet renders every day and every gap; no row carries a dollar figure (R-h)
 *   G6 P0-b item 2: a gap beside a stop with no point reads "not worked out yet — <stop> isn't on the map"
 *   G7 P0-b item 1: the header says why legs are skipped (engine off, dates, free plan)
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/getting-around-every-gap.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { GettingAroundBody } from "../../plan/GettingAroundSheet";
import {
  GETTING_AROUND_DATES_HEADER,
  GETTING_AROUND_ENGINE_OFF_HEADER,
  GETTING_AROUND_OPTIMIZE_HEADER,
  GETTING_AROUND_PENDING,
  gettingAroundDays,
  gettingAroundHeader,
} from "@/lib/getting-around";

(globalThis as any).React = React;

// P0-b (sanctioned Oct 11, 2026): the fixture's stops carry a point, because a gap beside an unlocated
// stop now names it (G6). The assertions of G1–G5 are unchanged.
const stops = (day: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${day}s${i + 1}`, name: `Stop ${day}.${i + 1}`, lat: 35 + i / 100, lng: 135.7 }));
const ROUTED = { line: "Keihan Main Line", fare: { amount: 220, currency: "JPY" }, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } };

// Smoke-12 shape. Day 1: one routed leg, one unrouted leg with minutes, one gap with no leg.
// Day 2: one leg with no minutes, the rest absent. Day 3: no legs at all.
const DAYS = [
  {
    dayNumber: 1,
    activities: stops(1, 4),
    transports: [
      { id: "l1", fromActivityId: "d1s1", toActivityId: "d1s2", recommendedMode: "transit", estimatedDurationMinutes: 24, routed: ROUTED },
      { id: "l2", fromActivityId: "d1s2", toActivityId: "d1s3", recommendedMode: "walking", estimatedDurationMinutes: 15, estimatedCostUsd: 9, proposalStatus: "confirmed" },
    ],
  },
  {
    dayNumber: 2,
    activities: stops(2, 6),
    transports: [{ id: "l3", fromActivityId: "d2s3", toActivityId: "d2s4", recommendedMode: "driving", estimatedDurationMinutes: 0 }],
  },
  { dayNumber: 3, activities: stops(3, 5), transports: [] },
];

describe("Getting around lists every gap", () => {
  it("G1 every consecutive gap, in stop order, on every day (4/6/5 stops → 3/5/4 gaps)", () => {
    const days = gettingAroundDays(DAYS, "Asia/Tokyo");
    assert.deepEqual(days.map((d) => d.gaps.length), [3, 5, 4]);
    assert.deepEqual(days[1].gaps.map((g) => g.key), ["d2s1>d2s2", "d2s2>d2s3", "d2s3>d2s4", "d2s4>d2s5", "d2s5>d2s6"]);
    assert.equal(days[0].gaps[0].title, "Stop 1.1 → Stop 1.2");
  });

  it("G2 routed line, mode-only line, or 'not worked out yet'", () => {
    const [d1, d2, d3] = gettingAroundDays(DAYS, "Asia/Tokyo");
    assert.equal(d1.gaps[0].kind, "routed");
    assert.equal(d1.gaps[0].line, "24 min · Keihan Main Line · ¥220 · Google · checked 4 Oct");
    assert.equal(d1.gaps[1].kind, "unrouted");
    assert.equal(d1.gaps[1].line, "walk · Not checked yet");
    assert.deepEqual([d1.gaps[2].kind, d1.gaps[2].line], ["pending", GETTING_AROUND_PENDING]);
    assert.equal(d2.gaps[2].kind, "pending", "a leg with no minutes is not worked out yet");
    assert.ok(d2.gaps.every((g) => g.kind === "pending"));
    assert.ok(d3.gaps.every((g) => g.line === GETTING_AROUND_PENDING));
  });

  it("G3 days never vanish", () => {
    const days = gettingAroundDays(
      [
        { dayNumber: 2, activities: [], transports: [] },
        { dayNumber: 1, activities: stops(1, 1), transports: [] },
      ],
      null,
    );
    assert.deepEqual(days.map((d) => [d.dayNumber, d.gaps.length]), [[1, 0], [2, 0]]);
  });

  it("G4 the Optimize header only on a plan that doesn't earn routed legs", () => {
    assert.equal(gettingAroundHeader({}), GETTING_AROUND_OPTIMIZE_HEADER);
    assert.equal(gettingAroundHeader(null), GETTING_AROUND_OPTIMIZE_HEADER);
    assert.equal(gettingAroundHeader({ routedLegs: true }), null);
  });

  it("G5 the sheet renders every day and every gap, and no dollar figure", () => {
    const free = renderToString(<GettingAroundBody data={{ days: DAYS, trip: { timezone: "Asia/Tokyo" } }} />);
    assert.ok(free.includes(GETTING_AROUND_OPTIMIZE_HEADER));
    for (const n of [1, 2, 3]) assert.match(free, new RegExp(`data-testid="getting-around-day-${n}"`));
    assert.equal(free.match(/data-testid="getting-around-gap-/g)?.length, 12);
    assert.ok(!free.includes("$"), "the leg's estimatedCostUsd never reaches a row");
    const paid = renderToString(<GettingAroundBody data={{ days: DAYS, trip: { timezone: "Asia/Tokyo" }, routedLegs: true }} />);
    assert.ok(!paid.includes("getting-around-header"));
  });

  it("G6 a gap beside an unlocated stop names it", () => {
    const [d] = gettingAroundDays(
      [{ dayNumber: 1, activities: [{ id: "a", name: "Kinkaku-ji", lat: 35.03, lng: 135.72 }, { id: "b", name: "Somewhere in Gion", lat: null, lng: null }, { id: "c", name: "Yasaka", lat: 35.0, lng: 135.78 }], transports: [] }],
      null,
    );
    assert.equal(d.gaps[0].line, "not worked out yet — Somewhere in Gion isn't on the map");
    assert.equal(d.gaps[1].line, "not worked out yet — Somewhere in Gion isn't on the map");
  });

  it("G7 the header says why legs are skipped", () => {
    assert.equal(gettingAroundHeader({ legsSkipped: "engine_off" }), GETTING_AROUND_ENGINE_OFF_HEADER);
    assert.equal(gettingAroundHeader({ routedLegs: true, legsSkipped: "dates_not_confirmed" }), GETTING_AROUND_DATES_HEADER);
    assert.equal(gettingAroundHeader({ legsSkipped: "free_plan" }), GETTING_AROUND_OPTIMIZE_HEADER);
    assert.equal(gettingAroundHeader({ routedLegs: true }), null);
  });
});
