/**
 * A2 part 2 - desktop drag on the days board: where it is on, what may be dragged, and what a drop writes
 * (Leon, Nov 20, 2026; board R3_DaysBoard). Structure test: the board's drag parts as drawn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StopDragProvider, StopDragRow, StopDropSlot } from "../../plan/StopDrag";

(globalThis as any).React = React;
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const drag = read("../../plan/StopDrag.tsx");
const slip = read("../SlipView.tsx");
const block = read("../../plan/DayBlock.tsx");
const days = [{ dayNumber: 1, dateIso: "2026-12-08", items: [{ id: "a", name: "A" }] }];
const draw = (enabled: boolean, draggable: boolean) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <StopDragProvider enabled={enabled} days={days} onDrop={() => {}}>
        <StopDropSlot dayNumber={1} afterId={null} />
        <StopDragRow itemId="a" dayNumber={1} dayItemIds={["a"]} draggable={draggable}>
          <p>row</p>
        </StopDragRow>
      </StopDragProvider>
    </QueryClientProvider>,
  );

test("H1 off the board nothing is added: the row is drawn as it was, with no handle and no wrapper", () => {
  assert.equal(draw(false, true), "<p>row</p>");
});

test("H2 on the board a draggable stop gets the handle; a stop that may not move gets none but is still a drop reference", () => {
  const on = draw(true, true);
  assert.match(on, /data-testid="stop-drag-row-a"/);
  assert.match(on, /<span aria-hidden="true" draggable="true"[^>]*data-testid="stop-drag-handle-a">⋮⋮<\/span>/);
  const fixed = draw(true, false);
  assert.match(fixed, /data-testid="stop-drag-row-a"/);
  assert.doesNotMatch(fixed, /stop-drag-handle/);
});

test("H3 no landing box is drawn until a stop is being dragged", () => {
  assert.doesNotMatch(draw(true, true), /stop-drop-slot/);
  assert.match(drag, /if \(!drag\?\.dragging \|\| !drag\.target \|\| drag\.target\.dayNumber !== dayNumber \|\| drag\.target\.afterId !== afterId\) return null;/);
});

test("H4 the landing box is dashed, reads the approved line, and is drawn only where the drop would change something", () => {
  assert.match(drag, /border-2 border-dashed/);
  assert.match(drag, /\{dropHereLabel\(day, afterId\)\}/);
  assert.match(drag, /if \(!day \|\| !dropPlan\(\{ itemId: drag\.dragging\.itemId, fromDay: drag\.dragging\.fromDay, target: drag\.target, days: drag\.days \}\)\) return null;/);
});

test("H5 drag is on only on the desktop days board, for the owner, while the stops are theirs to change", () => {
  assert.match(slip, /const dragEnabled = dayColumns && isOwner && canEditItems;/);
  assert.match(slip, /<StopDragProvider enabled=\{dragEnabled\} days=\{dragDays\}/);
});

test("H6 a booked stop and an arrival or departure row have no handle", () => {
  assert.match(slip, /const canDrag = isOwner && tools\.reorder && !travel && !a\.booking\?\.id;/);
  assert.match(slip, /<StopDragRow itemId=\{a\.id\} dayNumber=\{dayNumber \?\? null\} dayItemIds=\{dayItemIds\} draggable=\{canDrag\}>/);
});

test("H7 each day column takes the drop, and a day's first place has its own landing box", () => {
  assert.match(block, /const dropZone = useDayDropZone\(dropDay\?\.dayNumber \?\? null, dropDay\?\.lastItemId \?\? null\);/);
  assert.equal((block.match(/\{\.\.\.dropZone\}/g) ?? []).length, 2, "both day looks");
  assert.match(slip, /dropDay=\{\{ dayNumber: slot\.dayNum, lastItemId: dayItemIds\[dayItemIds\.length - 1\] \?\? null \}\}/);
  assert.match(slip, /\{slot\.dayNum != null \? <StopDropSlot dayNumber=\{slot\.dayNum\} afterId=\{null\} \/> : null\}/);
});

test("H8 a drop is the two existing writes in order - the item PATCH, then the reorder - and the plan is re-read either way", () => {
  const body = drag.slice(drag.indexOf("export function useStopDrop"));
  const patch = body.indexOf('apiRequest("PATCH", SLIP_ITEM_ENDPOINTS.edit(tripId, itemId), plan.move)');
  const reorder = body.indexOf('apiRequest("POST", SLIP_ITEM_ENDPOINTS.reorder(tripId), plan.reorder)');
  assert.ok(patch > 0 && reorder > patch, "PATCH first, then reorder");
  assert.match(body, /onSettled: \(\) => invalidatePlan\(tripId\)/);
  assert.match(body, /title: MOVE_STOP_COPY\.failed/);
});
