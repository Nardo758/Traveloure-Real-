/**
 * P0-d (ledger `2026-10-12-p0d-coverage-bridges`).
 *
 *   PD1 item 1: the 330f594a shape (routed bridges + 8 gaps) ⇒ the card shows no all-clear, the unchecked
 *       line with the count, and the 8 stops; a complete routed plan keeps the all-clear; a free plan says
 *       travel times come with Optimize (plain and board tone alike); a response with no coverage gets none
 *   PD2 item 2: the ONE formatter — "Fushimi Inari → Tofuku-ji · around Soba Restaurant"
 *   PD3 item 2: the slip names a bridge in its slot; the Trip Card draws the same bridge with the same name
 *   PD4 item 3: the card's leg count is stop-to-stop legs + bridges; stay legs are in neither
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/p0d-coverage-bridges.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { OptimizerLead } from "../../plan/OptimizerLead";
import { cardLegCount, cardSlotLeg } from "../TripCardDays";
import { bridgeLegLabel, slipLegBetween } from "@/lib/slip-legs";
import { LEAD_ZERO, SOME_TRAVEL_TIMES_UNCHECKED, TRAVEL_TIMES_COME_WITH_OPTIMIZE, planLegCoverage } from "@shared/optimizer-lead";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const fee = { feeCents: 599, currency: "USD" } as any;

// The 330f594a shape: two days, eight stops off the map, the located stops bridged by routed legs.
const SHAPE_STOPS = [
  ["A", 1, true], ["u1", 1, false], ["u2", 1, false], ["B", 1, true], ["u3", 1, false], ["C", 1, true],
  ["D", 2, true], ["u4", 2, false], ["u5", 2, false], ["u6", 2, false], ["E", 2, true], ["u7", 2, false], ["u8", 2, false], ["F", 2, true],
].map(([id, dayNumber, located]) => ({ id: id as string, title: `Stop ${id}`, dayNumber: dayNumber as number, located: located as boolean }));
const SHAPE_LEGS = [["A", "B", 1], ["B", "C", 1], ["D", "E", 2], ["E", "F", 2]].map(([fromId, toId, dayNumber]) => ({ dayNumber: dayNumber as number, fromId: fromId as string, toId: toId as string, routed: true }));

describe("P0-d", () => {
  it("PD1 the all-clear needs every pair routed — the 330f594a shape gets the unchecked line and its 8 stops", () => {
    const coverage = planLegCoverage(SHAPE_STOPS, SHAPE_LEGS, () => false);
    for (const tone of ["plain", "board"] as const) {
      const gap = text(renderToString(<OptimizerLead tone={tone} findings={[]} coverage={coverage} routedPlan hasPricedItems={false} fee={fee} onClick={() => {}} />));
      assert.ok(!gap.includes(LEAD_ZERO), `${tone}: no all-clear`);
      assert.ok(gap.includes(`${SOME_TRAVEL_TIMES_UNCHECKED} — 8 stops aren't on the map`), `${tone}: the counted line`);
      assert.equal((gap.match(/Day \d · Stop u\d/g) ?? []).length, 8, `${tone}: the 8 stops listed`);
      const free = text(renderToString(<OptimizerLead tone={tone} findings={[]} coverage={{ complete: true, unlocated: [] }} routedPlan={false} hasPricedItems={false} fee={fee} onClick={() => {}} />));
      assert.ok(free.includes(TRAVEL_TIMES_COME_WITH_OPTIMIZE) && !free.includes(LEAD_ZERO), `${tone}: a free plan never gets it`);
    }
    const earned = text(renderToString(<OptimizerLead findings={[]} coverage={{ complete: true, unlocated: [] }} routedPlan hasPricedItems={false} fee={fee} onClick={() => {}} />));
    assert.ok(earned.includes(LEAD_ZERO), "a complete routed plan keeps the all-clear");
    const unknown = text(renderToString(<OptimizerLead findings={[]} hasPricedItems={false} fee={fee} onClick={() => {}} />));
    assert.ok(!unknown.includes(LEAD_ZERO) && unknown.includes(SOME_TRAVEL_TIMES_UNCHECKED), "no coverage answer ⇒ no all-clear");
  });

  it("PD2 the one formatter names a bridge by its endpoints and what it goes round", () => {
    assert.equal(bridgeLegLabel("Fushimi Inari", "Tofuku-ji", ["Soba Restaurant"]), "Fushimi Inari → Tofuku-ji · around Soba Restaurant");
    assert.equal(bridgeLegLabel("A", "C", ["B1", null, "B2"]), "A → C · around B1, B2");
    assert.equal(bridgeLegLabel("A", "C", []), "A → C");
  });

  const acts = [
    { id: "fi", name: "Fushimi Inari" },
    { id: "soba", name: "Soba Restaurant" },
    { id: "tj", name: "Tofuku-ji" },
  ];
  const bridge = {
    id: "leg-bridge",
    dayNumber: 1,
    legOrder: 1,
    fromActivityId: "fi",
    toActivityId: "tj",
    recommendedMode: "transit",
    estimatedDurationMinutes: 14,
    distanceMeters: 2100,
    routed: { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-10T05:00:00Z" } },
  };

  it("PD3 LG-2 Ask 6: neither the slip nor the Trip Card draws a leg round the unlocated stop", () => {
    assert.equal(slipLegBetween([{ dayNumber: 1, activities: acts, transports: [bridge as any] }], "soba", "tj"), null, "no bridge in the slip's slot before Tofuku-ji");
    assert.equal(slipLegBetween([{ dayNumber: 1, activities: acts, transports: [bridge as any] }], "fi", "soba"), null, "no leg into the unlocated stop");
    assert.equal(cardSlotLeg([bridge as any], acts, 0), null, "the card's slot into the unlocated stop is empty");
    assert.equal(cardSlotLeg([bridge as any], acts, 1), null, "and the slot after it draws no bridge");
  });

  it("PD4 the card's leg count is stop-to-stop legs, a not-checked leg included (Ask 6); stay legs are out", () => {
    const stay = { id: "hotel", name: "Hotel", type: "accommodation" };
    const day = {
      activities: [stay, ...acts, { id: "nj", name: "Nanzen-ji" }] as any[],
      transports: [
        { id: "s1", legOrder: 0, fromActivityId: "hotel", toActivityId: "fi" },
        bridge,
        { id: "own", legOrder: 3, fromActivityId: "tj", toActivityId: "nj" },
        { id: "s2", legOrder: 4, fromActivityId: "nj", toActivityId: "hotel" },
      ] as any[],
      legsNotChecked: [
        { fromActivityId: "fi", toActivityId: "soba" },
        { fromActivityId: "soba", toActivityId: "tj" },
      ],
    };
    assert.equal(cardLegCount([day]), 3, "two not-checked legs and the stop-to-stop leg; the bridge and the two stay legs are out");
    assert.equal(cardLegCount([{ ...day, legsNotChecked: [] }]), 1, "the bridge is never counted");
  });
});
