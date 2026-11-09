/**
 * UI-1 invariants — the pieces the header / state-board / view-bar regroup must not lose.
 *
 * This is the guard for the restructure itself: it pins what exists on `main` today, so the slice that
 * moves these elements into a top bar and a state board either keeps them or fails loudly.
 *
 *   H1 the view bar keeps all three toggles by testid, calendar included (OPEN-C keeps it, disabled)
 *   H2 the three state pieces exist: status strip, optimized badge, see-what-changed
 *   H3 the plan menu is PASSED IN (`menu` prop) — the ⋯ must wire to it, never mount a second menu
 *   H4 the planner root still spreads the canvas token attribute
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui1-header-invariants.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync("client/src/components/plancard/SlipView.tsx", "utf8");

describe("UI-1 — header, state board and view bar invariants", () => {
  it("H1 keeps every view toggle, calendar included", () => {
    for (const id of ["button-slip-view-list", "button-slip-view-map", "button-slip-view-calendar"]) {
      assert.ok(SRC.includes(id), `${id} must survive the view-bar regroup`);
    }
    // OPEN-C: the calendar stays, disabled as PLAN-1 left it — the slice may not remove it.
    assert.ok(SRC.includes("slip-viewbar"), "the view bar keeps its testid");
  });

  it("H2 keeps the three state pieces the board absorbs", () => {
    for (const id of ["slip-status-strip", "slip-optimized-badge", "slip-see-what-changed"]) {
      assert.ok(SRC.includes(id), `${id} must exist somewhere in the state board`);
    }
    assert.ok(SRC.includes("slip-optimizer-slot"), "the optimizer portal target is not dropped");
  });

  it("H3 the plan menu is passed in, not re-implemented", () => {
    assert.match(SRC, /menu = null,/, "SlipHeader takes a `menu` prop");
    assert.match(SRC, /\bmenu\b/, "the ⋯ has something to open");
  });

  it("H4 the planner root spreads the canvas token attribute", () => {
    assert.match(SRC, /slipTokensAttr\(readSlipTokensMode\(\)\)/);
  });
});
