/**
 * Step 9a (ledger `2026-10-07-step9a-routing-engine`; ruling 1; spec §3 LegRow): routed legs on the
 * slip and the card.
 *   S1 the slip draws a routed leg between two rows only when the server sent its `routed` facts
 *   S2 the routed LegRow reads the one line — duration · line · fare · provenance — in the plan's zone
 *   S3 the paused line (L5) appears ONCE, on the plan's first pair, and blocks nothing
 *   S4 the card matches a leg to its PAIR by id (stay legs do not shift it); a day whose legs name no
 *      stop keeps its position pairing
 *   S5 the card's routed leg reads the same line as the slip
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/step9a-routed-legs.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { LegRow } from "../../plan/LegRow";
import { useSlipLegs } from "../../plan/useSlipLegs";
import { TRAVEL_TIMES_PAUSED_LINE, pausedLinePair, routedLegBetween } from "@/lib/slip-legs";
import { LegLine, cardLegAfter } from "../TripCardDays";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const ROUTED = { line: "Keihan Main Line", fare: { amount: 220, currency: "JPY" }, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } };
const DAYS = [
  {
    dayNumber: 1,
    activities: [{ id: "a" }, { id: "b" }, { id: "c" }],
    transports: [
      { id: "stay-a", fromActivityId: "stay", toActivityId: "a", recommendedMode: "walking", estimatedDurationMinutes: 9, legOrder: 0, routed: { ...ROUTED, line: null, fare: null } },
      { id: "ab", fromActivityId: "a", toActivityId: "b", recommendedMode: "transit", estimatedDurationMinutes: 24, legOrder: 1, routed: ROUTED },
      { id: "bc", fromActivityId: "b", toActivityId: "c", recommendedMode: "taxi", estimatedDurationMinutes: 15, legOrder: 2 },
    ],
  },
];

function Probe(props: { data: any; pairs: Array<[string, string]> }) {
  const render = useSlipLegs(props.data);
  return <div>{props.pairs.map(([p, n]) => <div key={p + n}>{render({ id: p }, { id: n }, 0)}</div>)}</div>;
}

describe("step 9a routed legs", () => {
  it("S1 only a leg carrying routed facts is drawn between rows", () => {
    assert.equal(routedLegBetween(DAYS, "a", "b")?.legId, "ab");
    assert.equal(routedLegBetween(DAYS, "b", "c"), null, "an expert's confirmed leg carries no engine facts");
    assert.equal(routedLegBetween(DAYS, "a", "c"), null);
    assert.equal(routedLegBetween(null, "a", "b"), null);
  });

  it("S2 the routed LegRow reads the one line", () => {
    const leg = routedLegBetween(DAYS, "a", "b")!;
    const html = renderToString(<LegRow kind="routed" legId={leg.legId} mode={leg.mode} route={leg.route} timeZone="Asia/Tokyo" />);
    assert.match(html, /data-testid="slip-leg-routed-ab"/);
    assert.equal(text(html), "24 min · Keihan Main Line · ¥220 · Google · checked 4 Oct");
  });

  it("S3 the paused line appears once, on the first pair", () => {
    assert.deepEqual(pausedLinePair(DAYS), ["a", "b"]);
    const html = renderToString(<Probe data={{ days: DAYS, travelTimesPaused: true, trip: { timezone: "Asia/Tokyo" } }} pairs={[["a", "b"], ["b", "c"]]} />);
    assert.equal(html.split(TRAVEL_TIMES_PAUSED_LINE).length - 1, 1);
    assert.match(html, /slip-leg-routed-ab/, "the legs stay as last computed");
    const calm = renderToString(<Probe data={{ days: DAYS }} pairs={[["a", "b"]]} />);
    assert.ok(!calm.includes(TRAVEL_TIMES_PAUSED_LINE));
    const free = renderToString(<Probe data={{ days: [{ dayNumber: 1, activities: [{ id: "a" }, { id: "b" }], transports: [] }] }} pairs={[["a", "b"]]} />);
    assert.ok(!free.includes("slip-leg-routed"), "a free plan draws nothing between rows");
  });

  it("S4 the card matches a leg to its pair; a version day keeps its position pairing", () => {
    const acts = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const legs = [...DAYS[0].transports] as any[];
    assert.equal(cardLegAfter(legs, acts, 0)?.id, "ab", "the stay leg (legOrder 0) does not shift it");
    assert.equal(cardLegAfter(legs, acts, 1)?.id, "bc");
    const version = [{ id: "v1", fromActivityId: "x1", toActivityId: "x2" }, { id: "v2", fromActivityId: "x2", toActivityId: "x3" }] as any[];
    assert.equal(cardLegAfter(version, acts, 1)?.id, "v2");
  });

  it("S5 the card's routed leg reads the same line as the slip", () => {
    const leg = routedLegBetween(DAYS, "a", "b")!;
    const slip = text(renderToString(<LegRow kind="routed" legId={leg.legId} mode={leg.mode} route={leg.route} timeZone="Asia/Tokyo" />));
    const card = text(renderToString(<LegLine leg={DAYS[0].transports[1] as any} showMinutes={false} timeZone="Asia/Tokyo" />));
    assert.equal(card, slip);
    const plain = text(renderToString(<LegLine leg={DAYS[0].transports[2] as any} showMinutes={false} timeZone="Asia/Tokyo" />));
    assert.ok(!plain.includes("checked"), "a non-routed leg keeps its old line");
  });
});
