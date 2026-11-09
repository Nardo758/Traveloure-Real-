/**
 * UI-1 invariants — the pieces the header / state-board / view-bar regroup must not lose.
 *
 * This is the guard for the restructure itself: it pinned what existed on `main` BEFORE the move, so
 * the slice that regroups these elements either keeps them or fails loudly. H5 is the finished
 * shape's pin: the header is the top bar only, and the state pieces have actually LEFT it.
 *
 *   H1 the view bar keeps all three toggles by testid, calendar included (OPEN-C keeps it, disabled)
 *   H2 the three state pieces exist ONCE, in the one state board, with the optimizer portal
 *   H3 the plan menu is PASSED IN (`menu` prop) — the ⋯ must wire to it, never mount a second menu
 *   H4 the planner root still spreads the canvas token attribute
 *   H5 the back arrow leads the top bar, and the header no longer draws the state pieces
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui1-header-invariants.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync("client/src/components/plancard/SlipView.tsx", "utf8");
/** The header's own source, so "the pieces moved OUT" can be asserted rather than assumed. */
const HEADER = SRC.slice(SRC.indexOf("export function SlipHeader"), SRC.indexOf("// ── SlipStatusStrip"));
/** The state board's own source — from its container up to the view bar. */
const BOARD = SRC.slice(SRC.indexOf('data-testid="slip-state-board"'), SRC.indexOf('data-testid="slip-viewbar"'));

describe("UI-1 — header, state board and view bar invariants", () => {
  it("H1 keeps every view toggle, calendar included", () => {
    for (const id of ["button-slip-view-list", "button-slip-view-map", "button-slip-view-calendar"]) {
      assert.ok(SRC.includes(id), `${id} must survive the view-bar regroup`);
    }
    // OPEN-C: the calendar stays, disabled as PLAN-1 left it — the slice may not remove it.
    assert.ok(SRC.includes("slip-viewbar"), "the view bar keeps its testid");
    // `disabled` is written BEFORE the testid on the button, so read the whole element.
    const calendarAt = SRC.indexOf('data-testid="button-slip-view-calendar"');
    const calendarButton = SRC.slice(SRC.lastIndexOf("<button", calendarAt), calendarAt + 120);
    assert.match(calendarButton, /\bdisabled\b/, "and it stays disabled");
  });

  it("H2 keeps the three state pieces the board absorbs, in the board", () => {
    assert.ok(BOARD.length > 0, "the state board is addressable, above the view bar");
    for (const id of ["slip-status-strip", "slip-optimized-badge", "slip-see-what-changed"]) {
      assert.ok(BOARD.includes(id), `${id} must live in the state board`);
      // One copy: a piece left behind in the header would be a second renderer.
      assert.equal((SRC.match(new RegExp(`"${id}"`, "g")) ?? []).length, 1, `${id} renders once`);
    }
    assert.ok(BOARD.includes("slip-optimizer-slot"), "the optimizer portal target moved WITH the board");
  });

  it("H3 the plan menu is passed in, not re-implemented", () => {
    assert.match(SRC, /menu = null,/, "SlipHeader takes a `menu` prop");
    assert.match(SRC, /\bmenu\b/, "the ⋯ has something to open");
  });

  it("H4 the planner root spreads the canvas token attribute", () => {
    assert.match(SRC, /slipTokensAttr\(readSlipTokensMode\(\)\)/);
  });

  it("H5 the top bar is the back arrow + eyebrow, and the state pieces have left it", () => {
    assert.ok(HEADER.length > 0, "the header is addressable");
    const back = HEADER.indexOf('data-testid="slip-back"');
    const eyebrow = HEADER.indexOf('data-testid="slip-occasion-name"');
    assert.ok(back > 0, "the back arrow is in the top bar");
    assert.ok(eyebrow > 0, "the eyebrow is still the bar's label");
    assert.ok(back < eyebrow, "the arrow leads the row");
    // The header keeps its own badges; the STATE pieces are the board's now.
    for (const id of ["slip-optimized-badge", "slip-see-what-changed", "slip-status-strip"]) {
      assert.ok(!HEADER.includes(id), `${id} must not be drawn by the header any more`);
    }
    // The phase / private badges and the ⋯ are untouched by the move.
    for (const id of ["slip-phase-chip", "slip-private-badge"]) {
      assert.ok(HEADER.includes(id), `${id} stays in the top bar`);
    }
  });
});
