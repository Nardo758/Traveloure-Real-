/**
 * Audit B8 remainder (architect dispatch CB-N, as ruled 2026-10-26 09:05 ET with the 09:55 ET addendum; ledger
 * `2026-10-26-b8-live-site-unchecked-minutes`) — the live sites only. A leg prints minutes only when it is
 * checked (`isCheckedTransport`, the Trip Card's `LegLine` rule); the dead pages go to row 54 untouched.
 *
 *   TN10 X-1 the comparison page's TransportLeg: an unchecked leg prints its label and cost, no minutes;
 *        a checked leg prints its minutes unless a previewed alternative is showing; the mode menu's
 *        alternatives never print minutes
 *   TN14 X-6 the optimizer metrics carry no travel badge and no travelDistance prop
 *   TN15 X-7 the slip's unrouted row and Getting around read "{mode} · Not checked yet"; the estimate row is
 *        still empty; unroutedLegLine itself is unchanged
 *   TN9  scope fence: no server/shared, no test edits beyond the three sanctioned files, no StopLegRow lines,
 *        no workspace.tsx, no workflows
 *   TN16 my-itinerary.tsx (and the other dead pages) are not in the diff
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx
 */
import "./node-navigator-stub";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransportLeg } from "@/components/itinerary/TransportLeg";
import { OptimizerMetrics } from "../StatsRow";
import { LegRow } from "@/components/plan/LegRow";
import { gettingAroundDays } from "@/lib/getting-around";
import { unroutedLegLine } from "@/lib/slip-legs";
import { PLAN_COMPARE_MINUTE_COPY } from "@/lib/plan-compare";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const read = (p: string) => fs.readFileSync(p, "utf8");
const MINUTES = /\d+\s*min/;

const leg = (extra: Record<string, unknown> = {}) =>
  ({
    id: "L1", legOrder: 1, fromName: "Kinkaku-ji", toName: "Ryoan-ji", recommendedMode: "transit", userSelectedMode: null,
    distanceDisplay: "1.2 km", estimatedDurationMinutes: 14, estimatedCostUsd: 3,
    alternativeModes: [{ mode: "walk", durationMinutes: 22, costUsd: null, energyCost: 1, reason: "" }],
    ...extra,
  }) as any;
const ROUTED = { line: null, fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } };

function renderLeg(l: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToString(React.createElement(QueryClientProvider, { client: qc, children: React.createElement(TransportLeg, { leg: l, previewOnly: true }) }));
}

describe("audit B8 remainder — live sites", () => {
  it("TN10 X-1 the comparison page's leg row", () => {
    // A variant leg as the comparison page maps it: no stop ids, no routed facts — unchecked.
    const unchecked = renderLeg(leg());
    assert.ok(!unchecked.includes('data-testid="leg-duration-1"'));
    const row = text(unchecked);
    assert.match(row, /Transit · \$3/);
    assert.doesNotMatch(row, MINUTES);
    assert.doesNotMatch(row, /Transit · ·/, "no stray separator");
    const checked = renderLeg(leg({ fromActivityId: "a", toActivityId: "b", routed: ROUTED }));
    assert.match(checked, /data-testid="leg-duration-1"/);
    assert.match(text(checked), /Transit · 14 min · \$3/);
    // The mode menu is closed under server rendering, so its lines are read from source.
    const src = read("client/src/components/itinerary/TransportLeg.tsx");
    assert.match(src, /const checked = isCheckedTransport\(leg as any\);/);
    // The pill: a checked leg's own minutes only — a previewed alternative (isCustomized) shows none.
    const customized = renderLeg(leg({ fromActivityId: "a", toActivityId: "b", routed: ROUTED, userSelectedMode: "walk" }));
    assert.ok(!customized.includes('data-testid="leg-duration-1"'));
    assert.doesNotMatch(text(customized), MINUTES);
    assert.match(src, /const showPillMinutes = checked && !isCustomized;/);
    assert.match(src, /\{showPillMinutes && \(\s*<>\s*<span className="text-muted-foreground">·<\/span>\s*<span className="text-sm text-muted-foreground" data-testid=\{`leg-duration-\$\{leg\.legOrder\}`\}>/);
    assert.match(src, /\{checked\s*\? `\$\{leg\.estimatedDurationMinutes\} min /);
    assert.match(src, /: leg\.estimatedCostUsd \? `\$\$\{leg\.estimatedCostUsd\.toFixed\(0\)\}` : "Free"\}/);
    assert.match(src, /\{alt\.costUsd \? `\$\$\{alt\.costUsd\.toFixed\(0\)\}` : "Free"\}/);
    assert.doesNotMatch(src, /alt\.durationMinutes\} min/, "an alternative never prints minutes");
  });

  it("TN14 X-6 no travel badge", () => {
    const html = renderToString(
      React.createElement(OptimizerMetrics, { tripId: "t", traveloureScore: 80, savings: null, savingsPercent: null, wellnessTime: null, travelDistance: 95, starDelta: null, totalCost: null, perPerson: null } as any),
    );
    assert.doesNotMatch(html, /badge-travel-distance-/);
    assert.doesNotMatch(text(html), /m travel/);
    assert.equal(
      renderToString(React.createElement(OptimizerMetrics, { tripId: "t", traveloureScore: null, savings: null, savingsPercent: null, wellnessTime: null, travelDistance: 95, starDelta: null, totalCost: null, perPerson: null } as any)),
      "",
      "a travel figure alone no longer shows the strip",
    );
    assert.doesNotMatch(read("client/src/components/plancard/StatsRow.tsx"), /travelDistance\b|badge-travel-distance|m travel/);
    assert.doesNotMatch(read("client/src/components/plancard/PlanCard.tsx"), /travelDistance\b/);
  });

  it("TN15 X-7 the slip's unrouted row and Getting around", () => {
    assert.equal(PLAN_COMPARE_MINUTE_COPY.notCheckedYet, "Not checked yet");
    assert.equal(text(renderToString(<LegRow kind="unrouted" legId="u1" mode="walk" minutes={15} />)), "walk · Not checked yet");
    assert.equal(text(renderToString(<LegRow kind="unrouted" legId="u2" mode={null} minutes={15} />)), "Not checked yet");
    assert.equal(renderToString(<LegRow kind="unrouted" legId="u3" mode="drive" minutes={18} estimate={true} />), "");
    const day = {
      dayNumber: 1,
      activities: [{ id: "a", name: "Kinkaku-ji" }, { id: "b", name: "Ryoan-ji" }],
      transports: [{ id: "L", fromActivityId: "a", toActivityId: "b", recommendedMode: "walking", estimatedDurationMinutes: 15, alternativeModes: [] }],
    };
    const [d] = gettingAroundDays([day], "Asia/Tokyo");
    assert.equal(d.gaps[0].kind, "unrouted");
    assert.equal(d.gaps[0].line, "walk · Not checked yet");
    assert.equal(unroutedLegLine("drive", 18), "18 min · drive", "the helper itself is unchanged");
    assert.doesNotMatch(read("client/src/lib/getting-around.ts"), /unroutedLegLine/);
    assert.doesNotMatch(read("client/src/components/plan/LegRow.tsx"), /unroutedLegLine/);
  });

  function diffFiles(): string[] | null {
    try {
      return execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" }).split("\n").filter(Boolean);
    } catch {
      return null; // no origin/main in this checkout: the fence is checked where it exists
    }
  }

  it("TN9 scope fence", () => {
    const files = diffFiles();
    if (!files) return;
    assert.deepEqual(files.filter((f) => /^(server|shared|\.github)\//.test(f)), []);
    assert.ok(!files.includes("client/src/pages/expert/workspace.tsx"));
    const allowedTests = new Set([
      "client/src/components/plancard/__tests__/b8-no-straight-line-minutes.test.tsx",
      "client/src/components/plancard/__tests__/step9c-leg-sheet.test.tsx",
      "client/src/components/plancard/__tests__/getting-around-every-gap.test.tsx",
      "client/src/components/plancard/__tests__/b8-live-site-unchecked-minutes.test.tsx",
    ]);
    assert.deepEqual(files.filter((f) => /__tests__|\.test\.|\.spec\.|^playwright\/|^e2e\//.test(f) && !allowedTests.has(f)), []);
    // StopLegRow (LegRow.tsx) still prints its own minutes — the expert surface's own row.
    assert.match(read("client/src/components/plan/LegRow.tsx"), /\{leg\.estimatedDurationMinutes\} min/);
  });

  it("TN16 the dead pages are untouched", () => {
    const files = diffFiles();
    if (!files) return;
    for (const f of [
      "client/src/pages/my-itinerary.tsx",
      "client/src/components/itinerary/DayTransportPanel.tsx",
      "client/src/components/itinerary/InlineTransportSelector.tsx",
      "client/src/components/itinerary/TransportHub.tsx",
      "client/src/components/itinerary/TransportBookingCard.tsx",
    ]) assert.ok(!files.includes(f), f);
  });
});
