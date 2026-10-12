/**
 * ST-1 — the stop's time on the slip (ledger `2026-10-12-st1-stop-time-edit`).
 *
 *   ST1a the owner's row draws the time as a button at least 44px tall, keeping `slip-item-time-<id>`
 *   ST1b a stop with no time offers "Add a time" in the same place
 *   ST1c a row given no editor (not the owner, or a fixed travel row) draws the plain time, no button
 *   ST1d the Swap form follows the same rule: a blocked time is never sent; an allowed one is rounded
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/st1-stop-time-edit.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ItemRow } from "../../plan/ItemRow";
import { PlanRowLookProvider } from "../../plan/row-look";
import { useStopTimeEdit } from "../../plan/StopTimeEdit";
import { editBodyUnderTimeRule } from "../SlipItemTools";
import { STOP_TIME_ADD_LABEL, stopTimeRule } from "@shared/stop-time-edit";

(globalThis as any).React = React;

function OwnerRow({ time, anchor = false }: { time: string; anchor?: boolean }) {
  const rule = stopTimeRule({ ride: false, pastDay: false, booked: false, locked: false });
  const timeEdit = useStopTimeEdit({ tripId: "t1", itemId: "i1", time, rule });
  return (
    <ItemRow
      item={{ id: "i1", name: "Kinkaku-ji", time } as any}
      mode="edit"
      role="traveler"
      timeEdit={timeEdit}
      anchor={anchor ? { fromTool: null } : null}
    />
  );
}

function render(node: React.ReactNode, look: "plain" | "board" = "board") {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <PlanRowLookProvider look={look}>{node}</PlanRowLookProvider>
    </QueryClientProvider>,
  );
}

describe("ST-1 stop time on the slip", () => {
  it("ST1a the owner's time is a 44px button that keeps the time's test id", () => {
    for (const look of ["board", "plain"] as const) {
      const html = render(<OwnerRow time="17:35" />, look);
      assert.match(html, /data-testid="button-edit-time-i1"/, look);
      assert.match(html, /min-h-\[44px\]/, look);
      assert.match(html, /data-testid="slip-item-time-i1"[^>]*>17:35</, look);
    }
  });

  it("ST1b a stop with no time offers Add a time", () => {
    const html = render(<OwnerRow time="" />);
    assert.match(html, /data-testid="button-edit-time-i1"/);
    assert.ok(html.includes(STOP_TIME_ADD_LABEL));
  });

  it("ST1c no editor ⇒ plain time; a fixed travel row never takes the editor", () => {
    const plain = render(<ItemRow item={{ id: "i1", name: "Kinkaku-ji", time: "17:35" } as any} mode="read" role="traveler" />);
    assert.doesNotMatch(plain, /button-edit-time-i1/);
    assert.match(plain, /data-testid="slip-item-time-i1"[^>]*>17:35</);
    assert.doesNotMatch(render(<OwnerRow time="17:35" anchor />), /button-edit-time-i1/);
  });

  it("ST1d the Swap form sends no blocked time and rounds an allowed one", () => {
    const booked = stopTimeRule({ ride: false, pastDay: false, booked: true, locked: false });
    const open = stopTimeRule({ ride: false, pastDay: false, booked: false, locked: true });
    assert.equal(editBodyUnderTimeRule({ startTime: "10:03" }, booked), null);
    assert.deepEqual(editBodyUnderTimeRule({ startTime: "10:03", title: "X" }, booked), { title: "X" });
    assert.deepEqual(editBodyUnderTimeRule({ startTime: "10:03" }, open), { startTime: "10:05" });
    assert.deepEqual(editBodyUnderTimeRule({ startTime: null }, open), { startTime: null });
  });
});
