/**
 * P0-e (decision-maker, Oct 12, 2026; ledger `2026-10-12-p0e-findings-and-gaps`) — the card and Getting around.
 *
 *   PE6 item 1: one finding + 8 stops off the map ⇒ both render (plain and board)
 *   PE7 item 2: an hours finding names its stop, day and time under the count line
 *   PE8 item 4: the gap list splits real places from placeholders; the straight-line footer is a free plan's only
 *   PE9 item 3 as amended by LG-2 Ask 6: no bridge — each gap is its own two stops, and a not-checked leg says so
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/p0e-findings-gaps.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { OptimizerLead } from "../../plan/OptimizerLead";
import { gettingAroundDays } from "@/lib/getting-around";
import { FREE_PLAN_COVERAGE_FOOTER, SOME_TRAVEL_TIMES_UNCHECKED, UNLOCATED_PLACEHOLDERS_HEAD, UNLOCATED_PLACES_HEAD, type Finding, type LegCoverage } from "@shared/optimizer-lead";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const fee = { feeCents: 599, currency: "USD" } as any;

const closed: Finding = {
  kind: "closed_on_arrival",
  count: 1,
  days: [2],
  stops: [{ itemId: "g", title: "Ginkaku-ji Temple", day: 2, reason: "after_closing", atMin: 17 * 60, startMin: 17 * 60 + 10 }],
};
const eight: LegCoverage = {
  complete: false,
  unlocated: [
    ...Array.from({ length: 6 }, (_, i) => ({ day: 1, title: `Real place ${i + 1}` })),
    { day: 2, title: "Late Dinner in Shimogyo", placeholder: true as const },
    { day: 3, title: "Kaiseki Farewell Dinner", placeholder: true as const },
  ],
};

describe("P0-e", () => {
  for (const tone of ["plain", "board"] as const) {
    it(`PE6 one finding and eight stops off the map both render (${tone})`, () => {
      const html = renderToString(<OptimizerLead tone={tone} findings={[closed]} coverage={eight} routedPlan hasPricedItems={false} fee={fee} onClick={() => {}} />);
      assert.match(html, /data-testid="optimizer-finding-closed_on_arrival"/);
      assert.match(html, /data-testid="optimizer-lead-coverage"/);
      assert.ok(text(html).includes(`${SOME_TRAVEL_TIMES_UNCHECKED} — 8 stops aren't on the map`));
      assert.equal((html.match(/data-testid="optimizer-lead-unlocated-stop"/g) ?? []).length, 8);
    });

    it(`PE7 the hours finding names its stop (${tone})`, () => {
      const t = text(renderToString(<OptimizerLead tone={tone} findings={[closed]} coverage={{ complete: true, unlocated: [] }} routedPlan hasPricedItems={false} fee={fee} onClick={() => {}} />));
      assert.ok(t.includes("Ginkaku-ji Temple · Day 2 · 17:10 starts after closing (5:00 PM)"));
    });
  }

  it("PE8 the gap list splits by kind; the footer is a free plan's only", () => {
    const routed = renderToString(<OptimizerLead findings={[]} coverage={eight} routedPlan hasPricedItems={false} fee={fee} onClick={() => {}} />);
    const t = text(routed);
    assert.ok(t.indexOf(UNLOCATED_PLACES_HEAD) < t.indexOf("Real place 1"));
    assert.ok(t.indexOf(UNLOCATED_PLACEHOLDERS_HEAD) < t.indexOf("Day 2 · Late Dinner in Shimogyo"));
    assert.ok(t.indexOf("Real place 6") < t.indexOf(UNLOCATED_PLACEHOLDERS_HEAD), "places first, then placeholders");
    assert.ok(!t.includes(FREE_PLAN_COVERAGE_FOOTER), "a routed plan has no straight-line footer");
    const free = text(renderToString(<OptimizerLead findings={[]} coverage={eight} routedPlan={false} hasPricedItems={false} fee={fee} onClick={() => {}} />));
    assert.ok(free.includes(FREE_PLAN_COVERAGE_FOOTER));
  });

  it("PE9 Getting around draws no bridge; a not-checked leg reads 'Travel time not checked yet' (Ask 6)", () => {
    const day = {
      dayNumber: 1,
      activities: [
        { id: "fi", name: "Fushimi Inari", lat: 34.967, lng: 135.773 },
        { id: "soba", name: "Soba Restaurant" },
        { id: "tj", name: "Tofuku-ji", lat: 34.976, lng: 135.774 },
      ],
      transports: [
        {
          id: "leg-bridge",
          dayNumber: 1,
          legOrder: 1,
          fromActivityId: "fi",
          toActivityId: "tj",
          recommendedMode: "transit",
          estimatedDurationMinutes: 14,
          distanceMeters: 2100,
          routed: { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-10T05:00:00Z" } },
        },
      ],
    };
    const gaps = gettingAroundDays([day], "Asia/Tokyo")[0].gaps;
    assert.equal(gaps[1].title, "Soba Restaurant → Tofuku-ji", "the gap is its own two stops");
    assert.match(gaps[0].line, /Soba Restaurant isn't on the map/);
    const flagged = gettingAroundDays([{ ...day, legsNotChecked: [{ fromActivityId: "soba", toActivityId: "tj" }] }], "Asia/Tokyo")[0].gaps;
    assert.equal(flagged[1].kind, "not_checked");
    assert.equal(flagged[1].line, "Travel time not checked yet");
  });
});
