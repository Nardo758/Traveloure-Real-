/**
 * Audit B8 follow-up (architect dispatch CB-M; rulings 2026-10-25 22:50 ET, 2026-10-26 01:15 ET and the
 * answers of 2026-10-26 01:25 ET; ledger `2026-10-25-b8-transport-section`) — the Transport section, the hero
 * "Travel time", the shared link's expert copy and the trip-less comparison page print minutes only for a
 * checked (routed) leg. A checked leg is the Trip Card's `LegLine` rule (`routedLegBetween`), wrapped by
 * `client/src/lib/transport-section-minutes.ts`.
 *
 *   TS1  a checked leg prints its minutes
 *   TS2  the engine's straight-line estimate prints the mode label, no digits
 *   TS3  an unrouted leg (a person's minutes) and a routed leg with no stop ids print the label
 *   TS4  Total Time only when every leg is checked; no summary block with no legs
 *   TS5  a mode badge prints minutes only when every leg of that mode is checked (OP-4)
 *   TS6  the shared link (no `routed` on any leg): labels, no Total tile, no minute badges, Legs kept
 *   TS7  no legs / undefined renders nothing; a routed leg with 0 minutes is not checked
 *   TS8  BuildAroundDialog's comment cites the founder comment on #1703
 *   TS9  TransportSection keeps no unconditional minutes; its cost tile, selector and booking panel remain
 *   TS10 heroTravelMinutes: the caller's sum when every leg is checked, else null
 *   TS11 the Trip Card hero omits Travel time for null, keeps "-" and a value
 *   TS12 the shared link's StatsRow omits Travel Time for null
 *   TS13 itinerary-view's expert copy uses the same helper (source scan; the page cannot load under tsx)
 *   TS14 the trip-less comparison page has no travel-time chip; the money chip is unchanged
 *   TS15 an AI-suggested leg reads "Suggested", from TRANSPORT_SECTION_COPY
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/b8-transport-section-checked-minutes.test.tsx
 */
import "./node-navigator-stub";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { TransportSection } from "../TransportSection";
import { PlanCardHeader } from "../PlanCardHeader";
import { HeroSection } from "../HeroSection";
import { StatsRow } from "../StatsRow";
import { TEMPLATES } from "../plancard-types";
import {
  TRANSPORT_SECTION_COPY,
  heroTravelMinutes,
  isCheckedTransport,
  transportMinutesView,
} from "@/lib/transport-section-minutes";
import { computeProposalPreview, hasHeadlineClaim } from "@/lib/slip-proposal-preview";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const read = (p: string) => fs.readFileSync(p, "utf8");
const ROUTED = { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } };

let n = 0;
// A checked leg sets BOTH `duration` and `estimatedDurationMinutes` — `routedLegBetween` reads the latter.
const checked = (mode: string, minutes: number, extra: Record<string, unknown> = {}) => {
  n++;
  return { id: `c${n}`, mode, from: `a${n}`, to: `b${n}`, fromActivityId: `a${n}`, toActivityId: `b${n}`, duration: minutes, estimatedDurationMinutes: minutes, cost: 0, status: "confirmed", routed: ROUTED, ...extra } as any;
};
const estimate = (mode: string, minutes: number, extra: Record<string, unknown> = {}) => {
  n++;
  return { id: `e${n}`, mode, from: `a${n}`, to: `b${n}`, fromActivityId: `a${n}`, toActivityId: `b${n}`, duration: minutes, estimatedDurationMinutes: minutes, cost: 0, status: "suggested", alternativeModes: [{ mode, reason: "straight_line_est" }], ...extra } as any;
};
const unrouted = (mode: string, minutes: number, extra: Record<string, unknown> = {}) => {
  n++;
  return { id: `u${n}`, mode, from: `a${n}`, to: `b${n}`, fromActivityId: `a${n}`, toActivityId: `b${n}`, duration: minutes, estimatedDurationMinutes: minutes, cost: 0, status: "confirmed", alternativeModes: [], ...extra } as any;
};
// The shared link's mapping (itinerary-view.tsx): ids as from/to, `duration` only, no `routed`.
const shared = (mode: string, minutes: number) => {
  n++;
  return { id: `s${n}`, mode, from: `a${n}`, to: `b${n}`, duration: minutes, cost: 0, status: "suggested" } as any;
};
const day = (transports: any[]) => ({ dayNum: 1, date: "Nov 12", label: "Day 1", activities: [], transports }) as any;

function render(transports: any[] | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false, queryFn: async () => null } } });
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc, children: React.createElement(TransportSection, { tripId: "t", tripDestination: "Kyoto", day: { ...day([]), transports } } as any) }),
  );
}
/** The inner text of the element carrying `data-testid="<id>"` (first match). */
function byTestId(html: string, id: string): string | null {
  const at = html.indexOf(`data-testid="${id}"`);
  if (at < 0) return null;
  const open = html.lastIndexOf("<", at);
  const tag = html.slice(open + 1).match(/^[a-z]+/)![0];
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  re.lastIndex = open;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return text(html.slice(html.indexOf(">", open) + 1, m.index));
  }
  return null;
}

describe("audit B8 follow-up — checked minutes only", () => {
  it("TS1 a checked leg prints its minutes", () => {
    const leg = checked("transit", 24);
    assert.equal(isCheckedTransport(leg), true);
    assert.equal(byTestId(render([leg]), `text-transport-duration-${leg.id}`), "24 min");
  });

  it("TS2 an estimate prints the mode label, no digits", () => {
    const leg = estimate("drive", 18);
    assert.equal(isCheckedTransport(leg), false);
    const line = byTestId(render([leg]), `text-transport-duration-${leg.id}`)!;
    // The LegLine lookup: TRANSPORT_MODE_LABELS has no "drive" entry, so the mode word itself prints.
    assert.equal(line, "drive");
    const walk = estimate("walk", 12);
    assert.equal(byTestId(render([walk]), `text-transport-duration-${walk.id}`), "Walk");
    assert.doesNotMatch(line, /\d|min/);
  });

  it("TS3 an unrouted leg, and a routed leg with no stop ids, print the label", () => {
    const own = unrouted("walk", 30);
    assert.equal(byTestId(render([own]), `text-transport-duration-${own.id}`), "Walk");
    const noIds = checked("transit", 24, { fromActivityId: "", toActivityId: "", from: "", to: "" });
    assert.equal(isCheckedTransport(noIds), false);
    assert.equal(byTestId(render([noIds]), `text-transport-duration-${noIds.id}`), "Transit");
  });

  it("TS4 Total Time only when every leg is checked", () => {
    const mixed = render([checked("transit", 24), estimate("drive", 18)]);
    assert.equal(byTestId(mixed, "text-transport-stat-total-time-t"), null);
    assert.doesNotMatch(text(mixed), /Total Time/);
    const both = render([checked("transit", 24), checked("walk", 11)]);
    assert.equal(byTestId(both, "text-transport-stat-total-time-t"), "35m");
    assert.match(text(both), /Total Time/);
    assert.equal(byTestId(render([]), "transport-summary-t"), null);
  });

  it("TS5 a mode badge prints minutes only when every leg of that mode is checked", () => {
    const html = render([checked("transit", 24), checked("transit", 6), checked("walk", 9), estimate("walk", 12)]);
    assert.equal(byTestId(html, "badge-mode-summary-transit-t"), "30m");
    assert.equal(byTestId(html, "badge-mode-summary-walk-t"), "Walk");
    const view = transportMinutesView([checked("walk", 9), estimate("walk", 12)]);
    assert.deepEqual(view.modes, [{ mode: "walk", label: "Walk", minutes: null }]);
  });

  it("TS6 the shared link: labels, no Total tile, no minute badges, Legs kept", () => {
    const legs = [shared("transit", 24), shared("walk", 9)];
    const html = render(legs);
    for (const l of legs) assert.doesNotMatch(byTestId(html, `text-transport-duration-${l.id}`)!, /\d/);
    assert.equal(byTestId(html, "text-transport-stat-total-time-t"), null);
    assert.equal(byTestId(html, "badge-mode-summary-transit-t"), "Transit");
    assert.doesNotMatch(byTestId(html, "badge-mode-summary-walk-t")!, /\d+m/);
    assert.equal(byTestId(html, "text-transport-stat-legs-t"), "2");
  });

  it("TS7 no legs render nothing; a routed leg with 0 minutes is not checked", () => {
    for (const t of [undefined, []]) {
      const html = render(t as any);
      assert.equal(byTestId(html, "transport-summary-t"), null);
      assert.doesNotMatch(html, /transport-leg-/);
    }
    const zero = checked("transit", 0);
    assert.equal(isCheckedTransport(zero), false);
    assert.equal(byTestId(render([zero]), `text-transport-duration-${zero.id}`), "Transit");
    assert.deepEqual(transportMinutesView(undefined), { legs: [], totalMinutes: null, modes: [] });
  });

  it("TS8 BuildAroundDialog cites the founder comment on #1703", () => {
    const src = read("client/src/components/plancard/BuildAroundDialog.tsx");
    assert.ok(src.includes("founder comment: #1703 2026-10-26T01:02:00Z"));
    assert.ok(!src.includes("relayed on #1703"));
  });

  it("TS9 TransportSection keeps no unconditional minutes", () => {
    const src = read("client/src/components/plancard/TransportSection.tsx");
    assert.match(src, /\{legMinutes\.checked \? \(\s*<>\s*<Clock className="w-3 h-3" \/> \{tr\.duration\} min\s*<\/>\s*\) : \(\s*legMinutes\.label\s*\)\}/);
    assert.match(src, /\.\.\.\(total != null \? \[\{ l: "Total Time", v: `\$\{total\}m` \}\] : \[\]\)/);
    assert.doesNotMatch(src, /\{ l: "Total Time", v: `\$\{day\.transports\.reduce/);
    assert.match(src, /\{ l: "Est\. Cost"/);
    assert.match(src, /function TransportModeSelector\(/);
    assert.match(src, /export function LegBookingPanel\(/);
  });

  it("TS10 heroTravelMinutes returns the caller's sum only when every leg is checked", () => {
    const all = [day([checked("transit", 50)]), day([checked("walk", 45)])];
    assert.equal(heroTravelMinutes(all, 95), 95);
    assert.equal(heroTravelMinutes(all, 123), 123, "the passed sum is returned as is, never recomputed");
    assert.equal(heroTravelMinutes([day([checked("transit", 50)]), day([estimate("walk", 45)])], 95), null);
    assert.equal(heroTravelMinutes([day([]), day([])], 95), null);
    assert.equal(heroTravelMinutes([], 95), null);
    assert.equal(heroTravelMinutes(undefined, 95), null);
  });

  it("TS11 the Trip Card hero omits Travel time for null", () => {
    const header = (transitTime: any) => text(renderToString(React.createElement(PlanCardHeader, { title: "Kyoto", destination: "Kyoto", dateRange: "", statusLabel: null, metrics: { days: 3, activities: 9, legs: 4, transitTime } } as any)));
    const omitted = header(null);
    assert.doesNotMatch(omitted, /Travel time/);
    assert.doesNotMatch(omitted, /\d+h|\d+m\b/);
    assert.match(omitted, /Travel legs/);
    assert.match(header("2h 5m"), /2h 5m Travel time/);
    assert.match(header("-"), /Travel time/);
    const hero = (totalMinutes: number | null) =>
      text(renderToString(React.createElement(Router as any, { ssrPath: "/" }, React.createElement(HeroSection, { trip: { id: "t", destination: "Kyoto", startDate: null, endDate: null }, traveloureScore: null, shareToken: null, totalCost: null, perPerson: null, budget: null, days: [], totalActivities: 0, totalLegs: 0, totalMinutes, statsLabels: TEMPLATES.travel?.statsLabels ?? ["Days", "Activities", "Travel Legs", "Travel Time"] } as any))));
    assert.doesNotMatch(hero(null), /Travel time/);
    assert.match(hero(125), /2h 5m Travel time/);
    const card = read("client/src/components/plancard/PlanCard.tsx");
    assert.equal((card.match(/const totalMinutes = stats\.totalTransitMinutes/g) ?? []).length, 2, "both sums still read the server's total");
    assert.equal((card.match(/const heroMinutes = heroTravelMinutes\(days, totalMinutes\);/g) ?? []).length, 2);
    assert.match(card, /transitTime: heroMinutes == null \? null : formatMinutes\(heroMinutes\)/);
    assert.match(card, /totalMinutes=\{heroMinutes\}/);
    assert.doesNotMatch(card, /transitTime: formatMinutes\(totalMinutes\)|totalMinutes=\{totalMinutes\}/);
  });

  it("TS12 the shared link's StatsRow omits Travel Time for null", () => {
    const stats = (totalMinutes: number | null) =>
      renderToString(React.createElement(StatsRow, { trip: { id: "t", startDate: null, endDate: null }, days: [], totalActivities: 3, totalLegs: 2, totalMinutes, templateConfig: { statsLabels: ["Days", "Activities", "Travel Legs", "Travel Time"] } } as any));
    const omitted = stats(null);
    assert.doesNotMatch(text(omitted), /Travel Time/);
    assert.doesNotMatch(omitted, /text-stat-travel-time-/);
    for (const l of ["Days", "Activities", "Travel Legs"]) assert.match(text(omitted), new RegExp(l));
    assert.match(text(stats(125)), /Travel Time 2h 5m/);
    assert.equal(heroTravelMinutes([day([shared("transit", 24), shared("walk", 9)])], 33), null);
    const view = read("client/src/pages/itinerary-view.tsx");
    assert.match(view, /data\.variant\.transportSummary\?\.totalMinutes/);
    assert.match(view, /const heroMinutes = heroTravelMinutes\(planCardDays, totalMinutes\);/);
    assert.match(view, /<StatsRow[\s\S]{0,300}totalMinutes=\{heroMinutes\}/);
  });

  it("TS13 the expert copy uses the same helper (source scan)", () => {
    const view = read("client/src/pages/itinerary-view.tsx");
    assert.match(view, /import \{ heroTravelMinutes, transportMinutesView \} from "@\/lib\/transport-section-minutes";/);
    assert.match(view, /\{legMinutes\.checked \? \(\s*<>\s*<Clock className="w-3 h-3" \/> \{tr\.duration\} min\s*<\/>\s*\) : \(\s*legMinutes\.label\s*\)\}/);
    assert.match(view, /\.\.\.\(total != null \? \[\{ l: "Total Time", v: `\$\{total\}m` \}\] : \[\]\)/);
    assert.doesNotMatch(view, /\{ l: "Total Time", v: `\$\{day\.transports\.reduce/);
    assert.doesNotMatch(view, /^\s*<Clock className="w-3 h-3" \/> \{tr\.duration\} min\s*<\/span>/m);
    for (const s of ["expert-transport-section-", "expert-transport-leg-", "LegBookingPanel"]) assert.ok(view.includes(s), s);
  });

  it("TS14 the trip-less comparison page has no travel-time chip", () => {
    const page = read("client/src/pages/itinerary-comparison.tsx");
    for (const s of ["less travel", "more travel", "proposal-preview-drivetime", "sumLegMinutes", "computeDriveTimeDelta", "baselineDriveMinutes", "variantDriveMinutes", "baselineLegs"]) {
      assert.ok(!page.includes(s), s);
    }
    const p = computeProposalPreview({ baselineTotalUsd: 1000, variantTotalUsd: 800 });
    assert.ok(!("driveTime" in p));
    assert.deepEqual(p.money, { direction: "saves", amountUsd: 200, percent: 20 });
    assert.equal(hasHeadlineClaim(p), true, "money alone is a headline claim");
    assert.equal(hasHeadlineClaim(computeProposalPreview({ baselineTotalUsd: 1000, variantTotalUsd: 1000 })), false);
    // The page cannot be imported under tsx (it loads leaflet CSS), so the strip is checked by source.
    assert.match(page, /` Saves \$\$\{money\.amountUsd\.toLocaleString\(\)\} \(\$\{money\.percent\}% less\)`/);
    assert.match(page, /data-testid="proposal-preview-money"/);
  });

  it("TS15 an AI-suggested leg reads 'Suggested'", () => {
    assert.equal(TRANSPORT_SECTION_COPY.suggested, "Suggested");
    const ai = checked("transit", 24, { status: "suggested", suggestedBy: "ai" });
    const ex = checked("walk", 9, { status: "suggested", suggestedBy: "expert" });
    const html = render([ai, ex]);
    assert.equal(byTestId(html, `text-transport-suggested-${ai.id}`), "Suggested");
    assert.equal(byTestId(html, `text-transport-suggested-${ex.id}`), "Expert suggested");
    assert.doesNotMatch(text(html), /\bAI\b/);
    const src = read("client/src/components/plancard/TransportSection.tsx");
    assert.doesNotMatch(src, /"AI\s+suggested"/);
    assert.match(src, /TRANSPORT_SECTION_COPY\.suggested/);
  });
});
