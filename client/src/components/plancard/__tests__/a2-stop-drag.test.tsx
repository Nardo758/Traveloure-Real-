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
  // A3 (sanctioned edit): the provider works the drop out once (`plan`), for the box, the chips and the drop.
  assert.match(drag, /if \(!day \|\| !drag\.plan\) return null;/);
});

test("H5 drag is on for the owner in every layout of the days, while the stops are theirs to change", () => {
  // A3 (Leon, Nov 21, 2026 - sanctioned edit): the owner's menu no longer reorders, so drag is not limited to
  // the desktop board and the phone's strip - a one-day plan and a tablet's stacked day cards drag too.
  assert.match(slip, /const dragEnabled = isOwner && canEditItems;/);
  assert.match(slip, /<StopDragProvider enabled=\{dragEnabled\} days=\{dragDays\}/);
});

test("H6 an arrival or departure row has no handle; a booked stop has one, for its own day only", () => {
  // A3 (Leon, Nov 21, 2026 - sanctioned edit): "Booked stops: draggable within their own day only."
  assert.match(slip, /const canDrag = isOwner && tools\.reorder && !travel;/);
  assert.match(slip, /<StopDragRow itemId=\{a\.id\} dayNumber=\{dayNumber \?\? null\} dayItemIds=\{dayItemIds\} draggable=\{canDrag\} ownDayOnly=\{!!a\.booking\?\.id\}>/);
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
      <StopDragProvider enabled days={days} onDrop={() => {}}>
        <StopDragRow itemId="a" dayNumber={1} dayItemIds={["a"]} draggable={draggable}>
          <p>row</p>
        </StopDragRow>
      </StopDragProvider>
    </QueryClientProvider>,
  );

test("K1 the row carries what the finger's hit test reads, and the handle is a mouse-drag source the hold switches off while a finger is down", () => {
  const html = drawHold(true);
  assert.match(html, /data-drag-row="a"/);
  assert.match(html, /data-drag-day="1"/);
  assert.match(html, /<span aria-hidden="true" draggable="true"[^>]*data-drag-handle=""[^>]*data-testid="stop-drag-handle-a">/);
  assert.match(html, /\[@media\(pointer:coarse\)\]:select-none/);
  assert.match(drag, /handle\(\)\?\.setAttribute\("draggable", "false"\);/);
  assert.match(drag, /handle\(\)\?\.setAttribute\("draggable", "true"\);/);
});

test("K2 a stop that may not move is not held: no handle, no hold styling", () => {
  const html = drawHold(false);
  assert.doesNotMatch(html, /stop-drag-handle/);
  assert.doesNotMatch(html, /select-none/);
  assert.match(drag, /useHoldDrag\(rowRef, \{ enabled: !!drag && draggable && dayNumber != null, itemId, dayNumber, ownDayOnly \}\);/);
});

test("K3 the hold: a timer starts the drag, a drift before it cancels (a scroll), and only a live drag stops the page scrolling", () => {
  const hook = drag.slice(drag.indexOf("function useHoldDrag"), drag.indexOf("/**\n * A day column as a drop zone."));
  assert.match(hook, /\}, HOLD_DRAG_MS\);/);
  assert.match(hook, /if \(startAt && !holdStillHolding\(startAt, \{ x: t\.clientX, y: t\.clientY \}\)\) cancelTimer\(\);\s*return;/);
  const move = hook.slice(hook.indexOf("const onMove = "), hook.indexOf("const finish = "));
  const guard = move.indexOf("if (!active) {");
  const prevent = move.indexOf("e.preventDefault();");
  assert.ok(guard > 0 && prevent > guard, "the page is held still only once the drag is live");
  assert.match(hook, /addEventListener\("touchmove", onMove, \{ passive: false \}\)/);
  assert.match(hook, /const onCancel = \(\) => finish\(false\);/);
});

test("K4 what is under the finger: a day chip moves the stop to that day by its time; a row is a place in the day; the landing box keeps its place", () => {
  const hit = drag.slice(drag.indexOf("function holdTargetAt"), drag.indexOf("function useHoldDrag"));
  assert.match(hit, /if \(el\.closest\('\[data-testid="stop-drop-slot"\]'\)\) return undefined;/);
  assert.match(hit, /if \(chip\) return \{ dayNumber: Number\(chip\.dataset\.dropDay\), afterId: null, byTime: true \};/);
  assert.match(hit, /afterIdForRow\(\{ rowId: row\.dataset\.dragRow!, dayItemIds, upperHalf: y < box\.top \+ box\.height \/ 2 \}\)/);
});

test("K5 the strip: chips are drop targets only with drag on, it stays in reach while a stop is held, and the hint is the full approved sentence", () => {
  assert.match(strip, /data-drop-day=\{drag && d\.dayNum != null \? d\.dayNum : undefined\}/);
  assert.match(strip, /className=\{holding \? "sticky top-2 z-30/);
  assert.match(strip, /\{drag \? MOVE_STOP_COPY\.stripHint : MOVE_STOP_COPY\.stripTapHint\}/);
});

// A3 - THE OWNER'S MENU NO LONGER REORDERS; DRAG DOES, EVERYWHERE (Leon, Nov 21, 2026).
test("N1 the owner's stop menu has no Move up / Move down; an advisor's keeps both", () => {
  assert.match(slip, /onMoveUp: isOwner \? null : actions\.onMoveUp,/);
  assert.match(slip, /onMoveDown: isOwner \? null : actions\.onMoveDown,/);
  // The entries themselves stay in the menu component, for the advisor.
  const row = read("../../plan/ItemRow.tsx");
  assert.match(row, /item-menu-move-up-\$\{id\}/);
  assert.match(row, /item-menu-move-down-\$\{id\}/);
});

test("N2 every other menu entry is still wired for the owner", () => {
  for (const entry of ["onDetails", "onSwap", "onMove:", "onRemove", "onToggleLock", "onAskLocal"]) {
    assert.ok(slip.includes(entry), `${entry} is still passed to the row's menu`);
  }
});

test("N3 a day is a landing place for a finger too, and a closed day that would take the drop is ringed", () => {
  assert.match(drag, /"data-drop-column": dayNumber,/);
  assert.match(drag, /const column = el\.closest<HTMLElement>\("\[data-drop-column\]"\);/);
  assert.match(block, /data-\[drop-over=true\]:data-\[open=false\]:ring-2/);
});

test("N4 the strip's chips take a mouse drop as well as a finger's, and are ringed only where the drop would do something", () => {
  assert.match(strip, /drag\.over\(\{ dayNumber: d\.dayNum, afterId: null, byTime: true \}\);/);
  assert.match(strip, /const over = holding && drag\?\.plan && drag\.target\?\.byTime \? drag\.target\.dayNumber : null;/);
});
