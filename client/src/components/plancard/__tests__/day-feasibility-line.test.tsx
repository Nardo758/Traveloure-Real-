/**
 * FD-3 — the day's feasibility line on the ONE day block (ledger `2026-10-10-fd3-feasibility`, §3d).
 *
 *   DF1  an open day draws the server's counts as the shared line, in both looks
 *   DF2  a closed day draws no line, and nothing changes in its header
 *   DF3  no counts ⇒ no line (never a claimed "checked")
 *   DF4  a day with nothing stored says "not checked"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { DayBlock } from "@/components/plan/DayBlock";
import { PlanRowLookProvider } from "@/components/plan/row-look";
import type { DayFeasibility } from "@shared/plan-feasibility";

(globalThis as any).React = React;

const counts: DayFeasibility = { stops: 6, hoursChecked: 5, lastEntryChecked: 0, rides: 1, ridesChecked: 0 };
const block = (props: Partial<React.ComponentProps<typeof DayBlock>>, look: "plain" | "board" = "plain") =>
  renderToString(
    React.createElement(PlanRowLookProvider as any, { look }, React.createElement(DayBlock as any, { dayKey: "1", heading: "Mon · Nov 8", stats: "6 stops", ...props }, React.createElement("p", null, "rows"))),
  );

describe("FD-3 day feasibility line", () => {
  it("DF1 an open day draws the line, in both looks", () => {
    for (const look of ["plain", "board"] as const) {
      const html = block({ open: true, feasibility: counts }, look);
      assert.match(html, /data-testid="slip-day-feasibility-1"/);
      assert.match(html, /Hours checked for 5 of 6 stops · last entry not checked · last trains not checked/);
    }
  });

  it("DF2 a closed day draws no line and its header is unchanged", () => {
    const withLine = block({ open: false, feasibility: counts });
    const without = block({ open: false });
    assert.equal(withLine.includes("slip-day-feasibility-1"), false);
    assert.equal(withLine, without);
  });

  it("DF3 no counts ⇒ no line", () => {
    assert.equal(block({ open: true }).includes("slip-day-feasibility"), false);
    assert.equal(block({ open: true, feasibility: { stops: 0, hoursChecked: 0, lastEntryChecked: 0, rides: 0, ridesChecked: 0 } }).includes("slip-day-feasibility"), false);
  });

  it("DF4 nothing stored says not checked", () => {
    const html = block({ open: true, feasibility: { stops: 2, hoursChecked: 0, lastEntryChecked: 0, rides: 0, ridesChecked: 0 } });
    assert.match(html, /Hours not checked · last entry not checked/);
  });
});
