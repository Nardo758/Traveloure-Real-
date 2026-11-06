/**
 * PLAN-1 Phase 3 guard (ledger `2026-11-06-plan1-phase3-one-planner`): ONE planner surface. A plan is planned only in
 * `SlipView` (Days), `MapControlCenter` (Map) and the calendar component (Calendar — not built; its toggle segment is a
 * disabled placeholder until its artifact lands). Nothing else may draw the planner's day list or map.
 *
 *   P1  every file that mounts the planner's pieces (<SlipView, <DayBlock, <MapControlCenter, <SlipDayItem) is a NAMED
 *       host below, with the reason it may; a new host fails here until it is ruled
 *   P2  the deleted guest duplicate stays deleted, and nothing imports it
 *   P3  the toggle offers Days · Calendar · Map, Calendar disabled with no view behind it
 *
 * Stated negative space: this sees JSX mounts by component NAME. A hand-written day list that uses none of these
 * components is invisible to it; review is the layer for that.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/__tests__/plan1-one-planner.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PLANNER_MOUNT = /<(SlipView|DayBlock|MapControlCenter|SlipDayItem)[\s>]/g;

/** host file → the pieces it may mount, and why. */
const HOSTS: Record<string, { mounts: string[]; why: string }> = {
  "client/src/components/plancard/SlipView.tsx": { mounts: ["MapControlCenter", "SlipDayItem", "DayBlock"], why: "THE planner: Days and Map" },
  "client/src/pages/slip-view.tsx": { mounts: ["SlipView"], why: "/plans/:id — the owner's plan" },
  "client/src/pages/guest-plan-map.tsx": { mounts: ["SlipView", "MapControlCenter"], why: "/plans/new — the guest's plan is SlipView in guest mode; the signed-out map before any plan is MapControlCenter in guest mode" },
  "client/src/components/plancard/PlanCard.tsx": { mounts: ["MapControlCenter"], why: "the Trip Card read-out (LD 45 (6)), not a planner" },
  "client/src/components/plancard/TripCardDays.tsx": { mounts: ["DayBlock"], why: "the Trip Card's days (LD 45 (6)), a read-out" },
  "client/src/components/plancard/VersionsBoard.tsx": { mounts: ["MapControlCenter"], why: "the Optimize comparison board (LD 41 (e)), review only" },
  "client/src/pages/itinerary-view.tsx": { mounts: ["MapControlCenter"], why: "the shared read-only itinerary link (canEdit: false)" },
  "client/src/pages/expert/workspace.tsx": { mounts: ["MapControlCenter"], why: "the expert's Workstation (LD 42 D16), not the traveler's planner" },
  "client/src/components/plan/WorkstationDays.tsx": { mounts: ["DayBlock"], why: "the expert's Workstation days (LD 42 D16)" },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("PLAN-1 one planner surface", () => {
  it("P1 the planner's pieces are mounted only by the named hosts", () => {
    const found: Record<string, Set<string>> = {};
    for (const f of walk("client/src")) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(PLANNER_MOUNT)) (found[f] ??= new Set()).add(m[1]);
    }
    for (const [f, pieces] of Object.entries(found)) {
      const host = HOSTS[f];
      assert.ok(host, `${f} mounts ${[...pieces].join(", ")} — a planner surface outside SlipView / MapControlCenter / Calendar`);
      for (const p of pieces) assert.ok(host.mounts.includes(p), `${f} mounts ${p}, which its ruling does not name`);
    }
    for (const f of Object.keys(HOSTS)) assert.ok(found[f], `${f} is named but mounts nothing — remove it from HOSTS`);
  });

  it("P2 the guest duplicate is deleted and stays deleted", () => {
    assert.equal(fs.existsSync("client/src/components/plan/GuestPlanSlip.tsx"), false);
    for (const f of walk("client/src")) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /GuestPlanSlip/, f);
  });

  it("P3 the toggle reads Days · Calendar · Map, Calendar a disabled placeholder", () => {
    const s = fs.readFileSync("client/src/components/plancard/SlipView.tsx", "utf8");
    const toggle = s.slice(s.indexOf('data-testid="slip-view-toggle"'), s.indexOf('data-testid="slip-days-expand-all"'));
    const order = ["button-slip-view-list", "button-slip-view-calendar", "button-slip-view-map"].map((id) => toggle.indexOf(id));
    assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "Days, Calendar, Map in that order");
    const cal = toggle.slice(toggle.lastIndexOf("<button", order[1]), toggle.indexOf("</button>", order[1]));
    assert.match(cal, /\sdisabled\s/);
    assert.doesNotMatch(cal, /onClick/);
    assert.match(cal, />\s*Calendar\s*$/);
    assert.match(fs.readFileSync("shared/plan-view.ts", "utf8"), /PLAN_VIEWS = \["days", "map"\]/, "no calendar view until its artifact lands");
  });
});
