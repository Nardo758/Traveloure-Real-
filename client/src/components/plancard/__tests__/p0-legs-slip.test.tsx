/**
 * P0 legs baseline on the slip (ledger `2026-10-10-p0-legs-baseline`).
 *   C1 LG-2 Ask 6 (supersedes the bridge): a leg A→C past an unlocated B is never drawn in the slot before C
 *   C2 a fallback drive carries "No transit found — drive shown" on its row; an ordinary leg does not
 *   C3 the day line counts "no route found" only when the server sent a count
 *   C4 P0-b item 8: a Kyoto drive standing in for transit the routing API cannot answer carries the ruled
 *      line, rides on the route through `slipLegBetween`, and is never confused with C2's fallback
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/p0-legs-slip.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { LegRow } from "../../plan/LegRow";
import { slipLegBetween } from "@/lib/slip-legs";
import { NO_TRANSIT_DRIVE_NOTE, TRANSIT_API_UNCOVERED_NOTE } from "@shared/routing-engine";
import { feasibilityLine } from "@shared/plan-feasibility";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const ROUTED = { line: null, fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } };
const DAYS = [
  {
    dayNumber: 1,
    activities: [{ id: "a" }, { id: "b" }, { id: "c" }],
    transports: [{ id: "ac", fromActivityId: "a", toActivityId: "c", recommendedMode: "driving", estimatedDurationMinutes: 11, routed: { ...ROUTED, transitUnavailable: true as const } }],
  },
];

describe("P0 legs on the slip", () => {
  it("C1: a leg A→C round the unlocated B is drawn in no slot (Ask 6)", () => {
    assert.equal(slipLegBetween(DAYS, "a", "b"), null, "nothing between A and the unlocated B");
    assert.equal(slipLegBetween(DAYS, "b", "c"), null, "A's leg is not drawn before C");
  });

  it("C2: the fallback drive says so; an ordinary routed leg does not", () => {
    const leg = slipLegBetween([{ ...DAYS[0], activities: [{ id: "a" }, { id: "c" }] }], "a", "c") as any;
    assert.equal(leg.transitUnavailable, true);
    const html = text(renderToString(<LegRow kind="routed" legId="ac" mode={leg.mode} route={leg.route} timeZone="Asia/Tokyo" transitUnavailable />));
    assert.ok(html.startsWith(`${NO_TRANSIT_DRIVE_NOTE} · 11 min · drive`), html);
    const plain = text(renderToString(<LegRow kind="routed" legId="x" mode="transit" route={{ ...leg.route }} timeZone="Asia/Tokyo" />));
    assert.ok(!plain.includes(NO_TRANSIT_DRIVE_NOTE));
  });

  it("C3: 'no route found' appears only with a server count", () => {
    const base = { stops: 3, hoursChecked: 0, lastEntryChecked: 0, rides: 0, ridesChecked: 0 };
    assert.equal(feasibilityLine(base), "Hours not checked · last entry not checked");
    assert.equal(feasibilityLine({ ...base, noRoute: 1 }), "Hours not checked · last entry not checked · no route found for 1 leg");
    assert.equal(feasibilityLine({ ...base, noRoute: 2 }), "Hours not checked · last entry not checked · no route found for 2 legs");
    assert.equal(feasibilityLine({ ...base, noRoute: 0 }), "Hours not checked · last entry not checked");
  });

  it("C4: a Kyoto drive the API cannot offer transit for reads the ruled line", () => {
    const days = [
      {
        dayNumber: 1,
        activities: [{ id: "a" }, { id: "b" }],
        transports: [{ id: "ab", fromActivityId: "a", toActivityId: "b", recommendedMode: "driving", estimatedDurationMinutes: 9, routed: { ...ROUTED, transitApiUncovered: true as const } }],
      },
    ];
    const leg = slipLegBetween(days, "a", "b") as any;
    assert.equal(leg.route.transitApiUncovered, true);
    assert.equal(leg.transitUnavailable, undefined, "not the transit-had-no-route fallback");
    const html = text(renderToString(<LegRow kind="routed" legId="ab" mode={leg.mode} route={leg.route} timeZone="Asia/Tokyo" />));
    assert.equal(TRANSIT_API_UNCOVERED_NOTE, "Taxi/drive time shown — train and bus times aren't available here yet.");
    assert.ok(html.startsWith(`${TRANSIT_API_UNCOVERED_NOTE} 9 min · drive`), html);
    assert.ok(!html.includes(NO_TRANSIT_DRIVE_NOTE));
  });
});
