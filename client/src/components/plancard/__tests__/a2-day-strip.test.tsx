/**
 * A2 - the phone's day strip as drawn (structure test; board R3_MovePhone, minus Ideas), and where the plan
 * page mounts it (Leon, Nov 20, 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DayStrip } from "../../plan/DayStrip";
import type { StripDay } from "../../../lib/day-strip";

(globalThis as any).React = React;
const days: StripDay[] = [
  { key: "day-1", dayNum: 1, dateIso: "2026-12-08", stops: 2, itemIds: ["a", "b"] },
  { key: "day-2", dayNum: 2, dateIso: "2026-12-09", stops: 2, itemIds: ["c", "d"] },
  { key: "day-3", dayNum: 3, dateIso: "2026-12-10", stops: 1, itemIds: ["e"] },
];
const html = renderToStaticMarkup(<DayStrip days={days} selectedKey="day-1" onSelect={() => {}} />);
const slip = readFileSync(new URL("../SlipView.tsx", import.meta.url), "utf8");

test("T1 one chip per day, in order, each with its label and its stop count", () => {
  const chips = Array.from(html.matchAll(/data-testid="slip-day-chip-(\d+)"[^>]*><span>([^<]+)<\/span><span[^>]*>(\d+)<\/span>/g)).map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(chips, [["1", "Tue 8", "2"], ["2", "Wed 9", "2"], ["3", "Thu 10", "1"]]);
});

test("T2 exactly the shown day's chip is selected", () => {
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(html, /aria-selected="true"[^>]*data-testid="slip-day-chip-1"|data-testid="slip-day-chip-1"[^>]*aria-selected="true"/);
});

test("T3 the hint under the strip is 'Tap a day to see it.' and nothing about dragging", () => {
  assert.match(html, /data-testid="slip-day-strip-hint">Tap a day to see it\.<\/p>/);
  assert.doesNotMatch(html, /drag|Hold/i);
});

test("T4 no 'Ideas' chip (it arrives with A4)", () => {
  assert.doesNotMatch(html, /Ideas/);
});

test("T5 a chip is at least 48px tall and the row scrolls sideways inside itself", () => {
  assert.match(html, /min-h-\[48px\]/);
  assert.match(html, /overflow-x-auto/);
});

test("T6 the plan page: the strip is a phone-width, list-view, multi-day layout", () => {
  assert.match(slip, /const phoneWidth = useMaxWidth\(639\);/);
  assert.match(slip, /const dayStrip = phoneWidth && slipView === "list" && daySlots\.length > 1;/);
  assert.match(slip, /\{dayStrip \? <DayStrip days=\{stripDays\} selectedKey=\{stripKey\} onSelect=\{setStripChosen\} \/> : null\}/);
});

test("T7 the plan page: only the shown day is drawn, always open, and 'Expand all' is gone there", () => {
  assert.match(slip, /if \(dayStrip && slot\.key !== stripKey\) return null;/);
  assert.match(slip, /column=\{dayColumns \|\| dayStrip\}/);
  assert.match(slip, /daySlots\.length > 1 && !dayColumns && !dayStrip \? \(/);
  assert.match(slip, /data-day-layout=\{dayColumns \? "columns" : dayStrip \? "strip" : "stack"\}/);
});

test("T8 a newly linked stop takes the strip back to its day", () => {
  assert.match(slip, /useEffect\(\(\) => setStripChosen\(null\), \[highlightItemId\]\);/);
});
