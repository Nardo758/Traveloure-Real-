/**
 * PLAN-3 item 1 (P2-D): an unchanged day is collapsed in the by-day compare, and revealing it draws
 * the day's stops.
 *
 * The bug this pins: `dayColumns` returned `stops: []` for an identical day, so the reveal drew an
 * EMPTY day. The guard is therefore two-sided — the column must carry the stops, and the rendered
 * body must show them once expanded.
 *
 *   U1 `dayColumns` keeps an identical day's stops
 *   U2 collapsed: the note and the reveal control, no stops
 *   U3 expanded (the reveal): the stops appear
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan3-unchanged-days.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { VersionDayBody } from "@/components/plancard/VersionDayBody";
import { dayColumns, type DayColumn, type VersionsBoardView } from "@/lib/versions-board";

(globalThis as any).React = React;

const view = {
  plan: { stops: [{ id: "d1", dayNumber: 1, name: "Kinkaku-ji", startTime: "08:00" }] },
  versions: [
    {
      variantId: "v1",
      label: "A",
      name: "Version A",
      badge: null,
      anchor: null,
      stops: [
        { id: "s1", dayNumber: 1, name: "Kinkaku-ji", startTime: "08:00" },
        { id: "s2", dayNumber: 1, name: "Ryoan-ji", startTime: "11:30" },
      ],
      days: [{ dayNumber: 1, identical: true, matchedByName: false, moved: [], added: [], dropped: [] }],
    },
  ],
} as unknown as VersionsBoardView;

const column = dayColumns(view, 1)[0] as DayColumn;
const html = (expanded: boolean) =>
  renderToString(<VersionDayBody c={column} dayNumber={1} expanded={expanded} onReveal={() => {}} />);

describe("PLAN-3 — unchanged days collapse", () => {
  it("U1 the identical day's column still carries its stops", () => {
    assert.equal(column.identical, true);
    assert.deepEqual(column.stops.map((s) => s.name), ["Kinkaku-ji", "Ryoan-ji"]);
  });

  it("U2 collapsed: same as draft, a reveal control, and no stops", () => {
    const out = html(false);
    assert.match(out, /Same as draft/);
    assert.match(out, /data-testid="versions-desk-show-A-1"/);
    assert.match(out, /Show the day anyway/);
    assert.doesNotMatch(out, /Kinkaku-ji|Ryoan-ji/);
    assert.doesNotMatch(out, /versions-desk-stop-/);
  });

  it("U3 expanded: the day's stops render", () => {
    const out = html(true);
    assert.match(out, /Kinkaku-ji/);
    assert.match(out, /Ryoan-ji/);
    assert.match(out, /data-testid="versions-desk-stop-s1"/);
    assert.match(out, /data-testid="versions-desk-stop-s2"/);
    assert.doesNotMatch(out, /Same as draft/);
  });
});
