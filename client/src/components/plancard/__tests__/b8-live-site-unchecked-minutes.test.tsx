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
 * CB-O (architect, as ruled 2026-10-26 10:30 ET; ledger `2026-10-26-b8-remaining-unchecked-minutes`) adds:
 *   TN3  estimate-shaped, zero-minute and stop-id-less legs print no minutes on the comparison leg row
 *   TN8  Getting around: unrouted and estimate gaps read "{mode} · Not checked yet"; a routed gap keeps "24 min"
 *   TN9L the variant-origin leak case: an unflagged unrouted leg reads "drive · Not checked yet"
 *   TN11 /itinerary/:id and /my-itinerary/:id redirect to /trip/:id; MyItineraryPage is never rendered
 *   TN17 the Trip Card connector prints minutes only for a checked leg on its recommended mode
 *   TN18 the connector's check is one isCheckedTransport call on the raw day.transports entry
 *   TN19 withoutUncheckedTravelMetrics drops only travel_time
 *   TN20 the comparison page drops travel_time from the card (after the slice) and the modal (before the split)
 *   TN21 the UnroutedLegRowProps comment reads "mode-only"
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
import { slipLegBetween } from "@/lib/slip-legs";
import { GettingAroundBody } from "@/components/plan/GettingAroundSheet";
import { TransportConnector } from "../ActivitiesSection";
import { UNCHECKED_TRAVEL_METRIC_KEY, withoutUncheckedTravelMetrics } from "@/lib/variant-metrics";

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
      "client/src/components/plancard/__tests__/plan-cost-strip.test.tsx",
      "client/src/lib/__tests__/e4-neighbourhood-pin-icon.test.ts",
      "client/src/components/plancard/__tests__/versions-restore.test.tsx",
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

describe("audit B8 remaining (CB-O)", () => {
  const CONNECTOR_MINUTES = /\d+m\b/;
  function renderConnector(l: any, checked: boolean, modeOverride?: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    return renderToString(
      React.createElement(QueryClientProvider, {
        client: qc,
        children: React.createElement(TransportConnector, { tripId: "t", leg: l, checked, modeOverride, onModeChange: () => {} }),
      }),
    );
  }

  it("TN3 estimate-shaped, zero-minute and stop-id-less legs print no minutes", () => {
    const shapes = [
      leg({ alternativeModes: [{ mode: "walk", durationMinutes: 9, costUsd: null, energyCost: 1, reason: "straight_line_est" }] }),
      leg({ fromActivityId: "a", toActivityId: "b", routed: ROUTED, estimatedDurationMinutes: 0 }),
      leg({ routed: ROUTED }),
    ];
    for (const l of shapes) {
      const html = renderLeg(l);
      assert.ok(!html.includes('data-testid="leg-duration-1"'));
      assert.doesNotMatch(text(html), MINUTES);
      assert.match(text(html), /Transit/);
    }
  });

  it("TN8 Getting around: unrouted and estimate gaps read Not checked yet; a routed gap keeps its minutes", () => {
    const day = {
      dayNumber: 1,
      activities: [{ id: "a", name: "Kinkaku-ji" }, { id: "b", name: "Ryoan-ji" }, { id: "c", name: "Ninna-ji" }, { id: "d", name: "Myoshin-ji" }],
      transports: [
        { id: "L1", fromActivityId: "a", toActivityId: "b", recommendedMode: "walking", estimatedDurationMinutes: 15, alternativeModes: [] },
        { id: "L2", fromActivityId: "b", toActivityId: "c", recommendedMode: "driving", estimatedDurationMinutes: 18, alternativeModes: [{ reason: "straight_line_est" }] },
        { id: "L3", fromActivityId: "c", toActivityId: "d", mode: "transit", estimatedDurationMinutes: 24, routed: { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } } },
      ],
    };
    const [d] = gettingAroundDays([day], "Asia/Tokyo");
    assert.equal(d.gaps[0].kind, "unrouted");
    assert.equal(d.gaps[0].line, "walk · Not checked yet");
    assert.equal(d.gaps[1].line, "drive · Not checked yet");
    assert.equal(d.gaps[2].kind, "routed");
    assert.match(d.gaps[2].line, /^24 min/);
    const body = text(renderToString(<GettingAroundBody data={{ days: [{ ...day, transports: [day.transports[0]] }], trip: { timezone: "Asia/Tokyo" } } as any} />));
    assert.ok(body.includes("walk · Not checked yet"));
    assert.doesNotMatch(body, MINUTES);
  });

  it("TN9L the variant-origin leak case", () => {
    const day = {
      dayNumber: 1,
      activities: [{ id: "a" }, { id: "b" }],
      transports: [{ id: "L", fromActivityId: "a", toActivityId: "b", recommendedMode: "driving", estimatedDurationMinutes: 18, alternativeModes: [] }],
    };
    assert.deepEqual(slipLegBetween([day] as any, "a", "b"), { kind: "unrouted", legId: "L", mode: "drive", minutes: 18 });
    assert.equal(gettingAroundDays([day], "Asia/Tokyo")[0].gaps[0].line, "drive · Not checked yet");
    assert.equal(unroutedLegLine("drive", 18), "18 min · drive");
    assert.equal(unroutedLegLine("drive", 18, true), "18 min · drive · est.");
    for (const f of ["client/src/components/plan/LegRow.tsx", "client/src/lib/getting-around.ts"]) {
      const src = read(f);
      assert.ok(src.includes("PLAN_COMPARE_MINUTE_COPY.notCheckedYet"), f);
      assert.ok(!src.includes("unroutedLegLine"), f);
      assert.ok(src.includes("TRAVEL_TIME_NOT_CHECKED_LINE"), f);
    }
  });

  it("TN11 the legacy itinerary links redirect to the Trip Card", () => {
    const app = read("client/src/App.tsx");
    for (const path of ["/itinerary/:id", "/my-itinerary/:id"]) {
      const re = new RegExp(`<Route path="${path.replace(/[/:]/g, (c) => "\\" + c)}">\\s*\\{\\(\\{ id \\}\\) => <Redirect to=\\{\`/trip/\\$\\{id\\}\`\\} />\\}\\s*</Route>`);
      const m = app.match(re);
      assert.ok(m, path);
      assert.ok(!m![0].includes("?tab="), path);
    }
    assert.equal((app.match(/\bMyItineraryPage\b/g) ?? []).length, 1, "the lazy import only, never rendered");
  });

  it("TN17 the Trip Card connector prints minutes only for a checked leg on its recommended mode", () => {
    const toggle = (html: string) => {
      const at = html.indexOf('data-testid="button-connector-toggle-L1"');
      assert.ok(at > 0, "the toggle keeps its testid");
      return text(html.slice(html.lastIndexOf("<button", at), html.indexOf("</button>", at)));
    };
    const unchecked = toggle(renderConnector(leg(), false));
    assert.match(unchecked, /Transit/);
    assert.match(unchecked, /\$3/);
    assert.doesNotMatch(unchecked, CONNECTOR_MINUTES);
    assert.match(toggle(renderConnector(leg(), true)), /\b14m\b/);
    const previewed = toggle(renderConnector(leg(), true, "walk"));
    assert.doesNotMatch(previewed, /\b14m\b|\b22m\b/);
    assert.doesNotMatch(toggle(renderConnector(leg({ estimatedDurationMinutes: 0 }), true)), CONNECTOR_MINUTES);
    // The label and the distance alone (the icon first); no stray text.
    assert.match(toggle(renderConnector(leg({ estimatedCostUsd: null }), false)), /^\S+ Transit 1\.2 km$/);
  });

  it("TN18 the connector's check is one isCheckedTransport call on the raw entry", () => {
    const src = read("client/src/components/plancard/ActivitiesSection.tsx");
    assert.match(src, /import \{ isCheckedTransport \} from "@\/lib\/transport-section-minutes";/);
    assert.equal((src.match(/isCheckedTransport\(/g) ?? []).length, 1);
    assert.doesNotMatch(src, /routedLegBetween|function isChecked/);
    assert.ok(src.includes("day.transports?.find((t) => t.id === legAfter.id)"));
    assert.match(src, /const legAfterChecked = legAfterRaw \? isCheckedTransport\(legAfterRaw\) : false;/);
    assert.match(src, /checked=\{legAfterChecked\}/);
    assert.match(src, /const showMinutes = checked && selectedEntry\.mode === recommendedEntry\.mode;/);
    assert.match(src, /\{showMinutes && displayDuration > 0 && \(\s*<span className="text-muted-foreground\/60">\{displayDuration\}m<\/span>/);
    assert.match(src, /\{checked && m\.mode === recommendedEntry\.mode && m\.durationMinutes > 0 && \(\s*<span className="opacity-70">\{m\.durationMinutes\}m<\/span>/);
    assert.equal((src.match(/\{displayDuration\}m|\{m\.durationMinutes\}m/g) ?? []).length, 2, "both minute fragments sit behind the guards");
    assert.doesNotMatch(src, /\{m\.costUsd/, "chips gain no cost fragment");
    for (const id of ["transport-connector-", "button-connector-toggle-", "button-connector-maps-", "mode-picker-", "mode-option-${leg.id}-${m.mode}"]) assert.ok(src.includes(id), id);
    assert.doesNotMatch(read("client/src/components/plancard/PlanCard.tsx"), /\brouted\s*:/);
  });

  it("TN19 withoutUncheckedTravelMetrics drops only travel_time", () => {
    assert.equal(UNCHECKED_TRAVEL_METRIC_KEY, "travel_time");
    const input = [
      { metricKey: "total_cost", description: "$1,200 total" },
      { metricKey: "travel_time", description: "45 minutes between locations" },
      { metricKey: "free_time", description: "90 minutes of relaxation time" },
    ];
    const copy = input.map((m) => ({ ...m }));
    const out = withoutUncheckedTravelMetrics(input);
    assert.deepEqual(out, [input[0], input[2]]);
    assert.deepEqual(input, copy, "the input is not mutated");
    assert.deepEqual(withoutUncheckedTravelMetrics([]), []);
    assert.deepEqual(withoutUncheckedTravelMetrics([input[1]]), []);
    assert.ok(!out.map((m) => m.description).join(" ").includes("minutes between locations"));
  });

  it("TN20 the comparison page drops travel_time from the card and the modal", () => {
    const page = read("client/src/pages/itinerary-comparison.tsx");
    assert.match(page, /import \{ withoutUncheckedTravelMetrics \} from "@\/lib\/variant-metrics";/);
    assert.ok(page.includes("withoutUncheckedTravelMetrics(sortedMetrics.slice(0, 4)).map("), "filter after the slice");
    assert.ok(page.includes("const modalMetrics = withoutUncheckedTravelMetrics(modalVariant.metrics);"));
    assert.ok(!page.includes("modalVariant.metrics.filter("));
    assert.equal((page.match(/modalMetrics\.filter\(/g) ?? []).length, 3);
    assert.match(page, /case "travel_time":\s*return Clock;/);
    assert.ok(!page.includes("minutes between locations"));
    assert.ok(read("server/itinerary-optimizer.ts").includes("minutes between locations"), "the server still writes it");
  });

  it("TN21 the UnroutedLegRowProps comment reads mode-only", () => {
    const src = read("client/src/components/plan/LegRow.tsx");
    assert.ok(!src.includes("minutes-only line"));
    assert.ok(src.includes('one mode-only line between its stops ("walk · Not checked yet")'));
    assert.ok(!src.includes("unroutedLegLine"));
    assert.match(src, /\{leg\.estimatedDurationMinutes\} min/);
  });
});
