/**
 * A1 (Leon, Nov 20, 2026): at desktop width, a list view with more than one day shows every day as an
 * always-open column, side by side, and "Expand all" is gone there. The phone keeps one collapsible card per day.
 *
 *   D1 a column is open whatever its open prop says, has a plain header (no toggle, no chevron), and keeps its body
 *   D2 a card (the default) is unchanged: the toggle, the closed state, the same test ids
 *   D3 both looks of the day block honour the column
 *   D4 source: the slip turns the board on only at desktop width, in the list view, with more than one day;
 *      widens the page only then; hides "Expand all" only then; and lays the columns out in one scrolling row
 *   D5 the width read starts false, so the server and the first paint draw the phone shape
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/a1-day-columns.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { DayBlock } from "../../plan/DayBlock";
import { PlanRowLookProvider } from "../../plan/row-look";
import { useMinWidth } from "../../../hooks/use-min-width";

(globalThis as any).React = React;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(HERE, rel), "utf8");
const day = (p: Partial<React.ComponentProps<typeof DayBlock>>) =>
  React.createElement(DayBlock, { dayKey: "2", heading: "Wed · 9 Dec", stats: "2 stops", children: React.createElement("p", null, "Tenryu-ji"), ...p } as any);
const html = (p: Partial<React.ComponentProps<typeof DayBlock>>, look?: "board") =>
  renderToString(look ? React.createElement(PlanRowLookProvider, { look, children: day(p) }) : day(p));

describe("A1 - days as always-open columns on desktop", () => {
  it("D1 a column is open, with a plain header and its body", () => {
    for (const open of [undefined, false, true]) {
      const out = html({ column: true, open });
      assert.match(out, /data-testid="slip-day-2"[^>]*data-open="true"/, `open=${open}: a column is open`);
      assert.match(out, /data-column="true"/);
      assert.match(out, /data-testid="slip-day-header-2"/);
      assert.doesNotMatch(out, /slip-day-toggle-2/, "no toggle");
      assert.doesNotMatch(out, /aria-expanded/, "nothing claims to expand");
      assert.doesNotMatch(out, /<button\b/, "the header is not a button");
      assert.match(out, /data-testid="slip-day-heading-2"[^>]*>Wed · 9 Dec</);
      assert.match(out, /data-testid="slip-day-stats-2"[^>]*>2 stops</);
      assert.match(out, /Tenryu-ji/, "the day's stops are drawn");
    }
  });

  it("D2 a card is unchanged", () => {
    const closed = html({ open: false });
    assert.match(closed, /data-testid="slip-day-toggle-2"/);
    assert.match(closed, /aria-expanded="false"/);
    assert.match(closed, /data-open="false"/);
    assert.doesNotMatch(closed, /Tenryu-ji|data-column|slip-day-header-2/);
    const opened = html({ open: true });
    assert.match(opened, /aria-expanded="true"/);
    assert.match(opened, /Tenryu-ji/);
  });

  it("D3 both looks honour the column", () => {
    const board = html({ column: true, open: false }, "board");
    assert.match(board, /data-column="true"/);
    assert.match(board, /data-open="true"/);
    assert.doesNotMatch(board, /slip-day-toggle-2|<button\b/);
    assert.match(board, /Tenryu-ji/);
    assert.match(html({ open: false }, "board"), /data-testid="slip-day-toggle-2"/, "the board card keeps its toggle");
  });

  it("D4 the slip turns the board on only where it belongs", () => {
    const view = read("../SlipView.tsx");
    assert.ok(view.includes('const dayColumns = desktopWidth && slipView === "list" && daySlots.length > 1;'));
    assert.ok(view.includes("const desktopWidth = useMinWidth(1024);"));
    assert.ok(view.includes('slipView === "map" || dayColumns || besideMap ? "max-w-6xl" : "max-w-[680px]"'), "the page widens only for the map, the board and the map beside the days (A7)");
    // A2 (Leon, Nov 20, 2026 - sanctioned edit): the phone's day strip is a third layout beside these two, so the
    // three lines below now also name `dayStrip`. The board's own conditions are unchanged.
    assert.ok(view.includes('slipView === "list" && daySlots.length > 1 && !dayColumns && !dayStrip ? ('), "Expand all is not drawn over the board");
    assert.ok(view.includes('<div className={dayColumns ? DAY_COLUMNS_ROW_CLASS : undefined} data-day-layout={dayColumns ? "columns" : dayStrip ? "strip" : "stack"}>'));
    assert.match(view, /const DAY_COLUMNS_ROW_CLASS = "flex items-start gap-3 overflow-x-auto pb-2";/, "one row, scrolling sideways when it runs out of width");
    assert.match(view, /<DayBlock[\s\S]{0,1400}?column=\{dayColumns \|\| dayStrip\}/);
    const block = read("../../plan/DayBlock.tsx");
    assert.match(block, /const DAY_COLUMN_CLASS = "min-w-\[264px\] flex-1 basis-0 self-start";/, "four share the row; a fifth scrolls");
  });

  it("D5 the width read starts false", () => {
    let seen: boolean | null = null;
    const Probe = () => {
      seen = useMinWidth(1024);
      return null;
    };
    renderToString(React.createElement(Probe));
    assert.equal(seen, false, "no window on the server: the phone shape");
  });
});
