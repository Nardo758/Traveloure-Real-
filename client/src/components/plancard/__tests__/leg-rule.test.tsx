/**
 * P0-c item 4 — a routed leg never draws the dashed rule; dashed means unrouted (ledger `2026-10-12-p0c-hotfix`).
 *
 *   LR1 the slip's routed row draws a solid rule; its unrouted row draws a dashed one
 *   LR2 the stop leg row is solid only when the engine wrote it (a `source` with minutes)
 *   LR3 the Trip Card's `LegLine`: routed ⇒ solid, unrouted ⇒ dashed
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/leg-rule.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { LegRow } from "../../plan/LegRow";
import { LegLine } from "../TripCardDays";
import { LEG_RULE_ROUTED, LEG_RULE_UNROUTED, legRuleClass, storedLegIsRouted } from "@/lib/leg-rule";

(globalThis as any).React = React;
const ROUTE = { durationMin: 24, distanceM: 6100, line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } } as any;
const solid = (html: string) => html.includes("border-solid") && !html.includes("border-dashed");
const dashed = (html: string) => html.includes("border-dashed") && !html.includes("border-solid");

describe("P0-c item 4 — dashed = unrouted only", () => {
  it("LR0 one class per state", () => {
    assert.equal(legRuleClass(true), LEG_RULE_ROUTED);
    assert.equal(legRuleClass(false), LEG_RULE_UNROUTED);
    assert.equal(storedLegIsRouted({ source: "google_routes", estimatedDurationMinutes: 12 }), true);
    assert.equal(storedLegIsRouted({ source: null, estimatedDurationMinutes: 12 }), false);
    assert.equal(storedLegIsRouted({ source: "google_routes", estimatedDurationMinutes: 0 }), false);
  });

  it("LR1 the slip's routed row is solid; its unrouted row is dashed", () => {
    assert.ok(solid(renderToString(<LegRow kind="routed" legId="r1" mode="transit" route={ROUTE} timeZone="Asia/Tokyo" />)));
    assert.ok(dashed(renderToString(<LegRow kind="unrouted" legId="u1" mode="walk" minutes={18} />)));
  });

  it("LR2 the stop leg row is solid only for an engine-written leg", () => {
    const base = { id: "s1", dayNumber: 1, fromActivityId: "a", toActivityId: "b", recommendedMode: "walk", userSelectedMode: null, estimatedDurationMinutes: 12, proposalStatus: "proposed" } as any;
    assert.ok(solid(renderToString(<LegRow kind="stops" role="traveler" leg={{ ...base, source: "google_routes" }} />)));
    assert.ok(dashed(renderToString(<LegRow kind="stops" role="traveler" leg={base} />)));
  });

  it("LR3 the Trip Card: routed ⇒ solid, unrouted ⇒ dashed", () => {
    const plain = { id: "p1", fromActivityId: "a", toActivityId: "b", recommendedMode: "walk", estimatedDurationMinutes: 12 } as any;
    const routed = { ...plain, id: "r1", mode: "transit", routed: { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } } } as any;
    assert.ok(solid(renderToString(<LegLine leg={routed} showMinutes timeZone="Asia/Tokyo" />)));
    assert.ok(dashed(renderToString(<LegLine leg={plain} showMinutes timeZone="Asia/Tokyo" />)));
  });
});
