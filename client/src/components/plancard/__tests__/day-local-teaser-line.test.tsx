/**
 * FD-5 — the day's count-only local teaser on the ONE day block (ledger `2026-10-10-fd5-coverage-targets`).
 * The server has already applied the coverage gate (shared/__tests__/coverage-targets.test.ts CT3 proves
 * under-target ⇒ no key); this proves the block draws exactly what arrives.
 *
 *   LT1  at target ⇒ the honest count, in both looks, beside the feasibility line
 *   LT2  zero ⇒ nothing
 *   LT3  under target (no key from the server) ⇒ nothing
 *   LT4  a closed day draws nothing
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { DayBlock } from "@/components/plan/DayBlock";
import { PlanRowLookProvider } from "@/components/plan/row-look";

(globalThis as any).React = React;

const block = (props: Record<string, unknown>, look: "plain" | "board" = "plain") =>
  renderToString(
    React.createElement(PlanRowLookProvider as any, { look }, React.createElement(DayBlock as any, { dayKey: "1", heading: "Mon · Nov 8", stats: "6 stops", ...props }, React.createElement("p", null, "rows"))),
  );

describe("FD-5 day local teaser line", () => {
  it("LT1 at target draws the honest count, in both looks", () => {
    for (const look of ["plain", "board"] as const) {
      const html = block({ open: true, localTeaser: { localPicks: 3, localNotes: 2 }, feasibility: { stops: 2, hoursChecked: 1, lastEntryChecked: 0, rides: 0, ridesChecked: 0 } }, look);
      assert.match(html, /data-testid="slip-day-local-teaser-1"/);
      assert.match(html, /3 local picks and 2 local notes for this day/);
      assert.ok(html.indexOf("slip-day-feasibility-1") < html.indexOf("slip-day-local-teaser-1"), "beside, after, the feasibility line");
    }
  });

  it("LT2 zero draws nothing", () => {
    assert.equal(block({ open: true, localTeaser: { localPicks: 0, localNotes: 0 } }).includes("slip-day-local-teaser"), false);
  });

  it("LT3 under target (no key) draws nothing", () => {
    assert.equal(block({ open: true }).includes("slip-day-local-teaser"), false);
    assert.equal(block({ open: true, localTeaser: null }).includes("slip-day-local-teaser"), false);
  });

  it("LT4 a closed day draws nothing", () => {
    assert.equal(block({ open: false, localTeaser: { localPicks: 3, localNotes: 2 } }), block({ open: false }));
  });
});
