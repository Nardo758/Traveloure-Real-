/**
 * Row 247 (ledger `2026-10-29-leg-minutes-est`): on the expert surfaces, minutes that are not a
 * routed answer carry "est.".
 *
 *   E1  the mark is one constant, "est."
 *   E2  StopLegRow: an unrouted leg's minutes carry the mark
 *   E3  StopLegRow: a routed leg (engine-written, with minutes) does not; a leg with no minutes shows no mark
 *   E4  StopLegRow reads ONE routed test for both the rule and the mark
 *   E5  the workspace's transport-gap card marks its minutes, which are always the straight-line estimator's
 *   E6  StopLegRow is mounted only by the expert surfaces (LegReviewDrawer in workspace.tsx, WorkstationDays)
 *
 * Pure: react-dom/server, no git, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { LegRow } from "../../plan/LegRow";
import { LEG_ESTIMATE_MARK } from "@/lib/leg-rule";

(globalThis as any).React = React;
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const base = { id: "s1", dayNumber: 1, fromActivityId: "a", toActivityId: "b", recommendedMode: "walk", userSelectedMode: null, estimatedDurationMinutes: 12, proposalStatus: "proposed" } as any;
const row = (leg: any) => renderToString(<LegRow kind="stops" role="expert" leg={leg} />);

describe("row 247 — expert leg minutes marked est.", () => {
  it("E1 the mark is one constant", () => {
    assert.equal(LEG_ESTIMATE_MARK, "est.");
  });

  it("E2 an unrouted leg's minutes carry the mark", () => {
    const html = row(base);
    assert.ok(html.includes('data-testid="leg-minutes-est-s1"'));
    assert.match(text(html), /12 min est\./);
  });

  it("E3 a routed leg and a leg with no minutes carry no mark", () => {
    const routed = row({ ...base, source: "google_routes" });
    assert.match(text(routed), /12 min/);
    assert.ok(!routed.includes("leg-minutes-est-"));
    assert.doesNotMatch(text(routed), /est\./);
    const none = row({ ...base, estimatedDurationMinutes: null });
    assert.ok(!none.includes("leg-minutes-est-"));
  });

  it("E4 one routed test for the rule and the mark", () => {
    const src = read("client/src/components/plan/LegRow.tsx");
    assert.match(src, /const routed = storedLegIsRouted\(leg\);/);
    assert.match(src, /legRuleClass\(routed\)/);
    assert.match(src, /\{routed \? null : <span data-testid=\{`leg-minutes-est-\$\{leg\.id\}`\}>\{LEG_ESTIMATE_MARK\}<\/span>\}/);
  });

  it("E5 the workspace gap card marks its estimator minutes", () => {
    const ws = read("client/src/pages/expert/workspace.tsx");
    assert.match(ws, /import \{ LEG_ESTIMATE_MARK \} from "@\/lib\/leg-rule";/);
    assert.match(ws, /~\{pair\.estimatedTravelMinutes\} min \{LEG_ESTIMATE_MARK\} by \{pair\.estimatedTravelMode\} needed/);
    assert.match(read("server/services/transport-gap.service.ts"), /estimatedTravelMinutes: estimate\.durationMinutes/);
  });

  it("E6 only the expert surfaces mount StopLegRow", () => {
    const mounts: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== "__tests__") walk(rel); }
        else if (/\.tsx$/.test(e.name) && /kind="stops"/.test(read(rel))) mounts.push(rel);
      }
    };
    walk("client/src");
    assert.deepEqual(mounts.sort(), ["client/src/components/plan/LegReviewDrawer.tsx", "client/src/components/plan/WorkstationDays.tsx"]);
  });
});
