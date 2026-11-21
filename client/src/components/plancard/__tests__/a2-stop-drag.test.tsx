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
  // Hold-to-drag (sanctioned edit): a stop held over a day CHIP has no place in the day, so no box either.
  assert.match(drag, /if \(!drag\?\.dragging \|\| !drag\.target \|\| drag\.target\.byTime \|\| drag\.target\.dayNumber !== dayNumber \|\| drag\.target\.afterId !== afterId\) return null;/);
});

test("H4 the landing box is dashed, reads the approved line, and is drawn only where the drop would change something", () => {
  assert.match(drag, /border-2 border-dashed/);
  assert.match(drag, /\{dropHereLabel\(day, afterId\)\}/);
  assert.match(drag, /if \(!day \|\| !dropPlan\(\{ itemId: drag\.dragging\.itemId, fromDay: drag\.dragging\.fromDay, target: drag\.target, days: drag\.days \}\)\) return null;/);
});

test("H5 drag is on only on the desktop days board and the phone's day strip, for the owner, while the stops are theirs to change", () => {
  // Hold-to-drag (Leon, Nov 21, 2026 - sanctioned edit): the phone's strip joins the board; there it is a hold.
  assert.match(slip, /const dragEnabled = \(dayColumns \|\| dayStrip\) && isOwner && canEditItems;/);
  assert.match(slip, /<StopDragProvider enabled=\{dragEnabled\} hold=\{dayStrip\} days=\{dragDays\}/);
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

// HOLD-TO-DRAG ON THE PHONE (Leon, Nov 21, 2026; board R3_MovePhone).
const strip = read("../../plan/DayStrip.tsx");
const drawHold = (draggable: boolean) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <StopDragProvider enabled hold days={days} onDrop={() => {}}>
        <StopDragRow itemId="a" dayNumber={1} dayItemIds={["a"]} draggable={draggable}>
          <p>row</p>
        </StopDragRow>
      </StopDragProvider>
    </QueryClientProvider>,
  );

test("K1 on the phone the handle is drawn but is not a mouse-drag source; the row carries what the finger's hit test reads", () => {
  const html = drawHold(true);
  assert.match(html, /data-drag-row="a"/);
  assert.match(html, /data-drag-day="1"/);
  assert.match(html, /<span aria-hidden="true" draggable="false"[^>]*data-testid="stop-drag-handle-a">/);
  assert.match(html, /select-none/);
});

test("K2 a stop that may not move is not held: no handle, no hold styling", () => {
  const html = drawHold(false);
  assert.doesNotMatch(html, /stop-drag-handle/);
  assert.doesNotMatch(html, /select-none/);
  assert.match(drag, /useHoldDrag\(rowRef, \{ enabled: !!drag\?\.hold && draggable && dayNumber != null, itemId, dayNumber \}\);/);
});

test("K3 the hold: a timer starts the drag, a drift before it cancels (a scroll), and only a live drag stops the page scrolling", () => {
  const hook = drag.slice(drag.indexOf("function useHoldDrag"), drag.indexOf("/**\n * A day column as a drop zone."));
  assert.match(hook, /\}, HOLD_DRAG_MS\);/);
  assert.match(hook, /if \(startAt && !holdStillHolding\(startAt, \{ x: t\.clientX, y: t\.clientY \}\)\) cancelTimer\(\);\s*return;/);
  const guard = hook.indexOf("if (!active) {");
  const prevent = hook.indexOf("e.preventDefault();");
  assert.ok(guard > 0 && prevent > guard, "preventDefault only once the drag is live");
  assert.match(hook, /addEventListener\("touchmove", onMove, \{ passive: false \}\)/);
  assert.match(hook, /const onCancel = \(\) => finish\(false\);/);
});

test("K4 what is under the finger: a day chip moves the stop to that day by its time; a row is a place in the day; the landing box keeps its place", () => {
  const hit = drag.slice(drag.indexOf("function holdTargetAt"), drag.indexOf("function useHoldDrag"));
  assert.match(hit, /if \(el\.closest\('\[data-testid="stop-drop-slot"\]'\)\) return undefined;/);
  assert.match(hit, /if \(chip\) return \{ dayNumber: Number\(chip\.dataset\.dropDay\), afterId: null, byTime: true \};/);
  assert.match(hit, /afterIdForRow\(\{ rowId: row\.dataset\.dragRow!, dayItemIds, upperHalf: y < box\.top \+ box\.height \/ 2 \}\)/);
});

test("K5 the strip: chips are drop targets only with hold-drag on, it stays in reach while a stop is held, and the hint is the full approved sentence", () => {
  assert.match(strip, /data-drop-day=\{drag\?\.hold && d\.dayNum != null \? d\.dayNum : undefined\}/);
  assert.match(strip, /className=\{holding \? "sticky top-2 z-30/);
  assert.match(strip, /\{drag\?\.hold \? MOVE_STOP_COPY\.stripHint : MOVE_STOP_COPY\.stripTapHint\}/);
});
