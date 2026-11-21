/**
 * A2 part 1 - the Move sheet as drawn (structure test), and the stop menu's "Move" entry
 * (Leon, Nov 20, 2026; board R3_MovePhone, minus Ideas).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MoveStopSheet } from "../../plan/MoveStopSheet";
import { ITEM_MENU_LABELS } from "../../plan/ItemRow";

(globalThis as any).React = React;
const days = [
  { dayNumber: 1, dateIso: "2026-12-08", stops: 4 },
  { dayNumber: 2, dateIso: "2026-12-09", stops: 2 },
  { dayNumber: 3, dateIso: "2026-12-10", stops: 0 },
];
const base = { itemId: "s1", stopName: "Tenryu-ji", currentDay: 1, time: "14:30", timeEditable: true, booked: false, days, pending: false, onMove: () => {}, onClose: () => {} };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const draw = (el: React.ReactElement) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);

// Radix portals a dialog's content, which a server render does not draw; the sheet's own source is the
// structure under test, the same way the F1 chooser is pinned.
const sheet = read("../../plan/MoveStopSheet.tsx");
const slip = read("../SlipView.tsx");
const row = read("../../plan/ItemRow.tsx");

test("S1 the sheet renders on the server without throwing, booked or not", () => {
  assert.doesNotThrow(() => draw(<MoveStopSheet {...base} />));
  assert.doesNotThrow(() => draw(<MoveStopSheet {...base} booked />));
});

test("S2 the sheet's parts: title, one option per day, keep/pick a time, one confirm", () => {
  assert.match(sheet, /MOVE_STOP_COPY\.title\(stopName\)/);
  assert.match(sheet, /data-testid=\{`move-stop-day-\$\{d\.dayNumber\}`\}/);
  assert.match(sheet, /moveDayOption\(d, currentDay\)/);
  assert.match(sheet, /data-testid="move-stop-keep-time"/);
  assert.match(sheet, /data-testid="move-stop-pick-time"/);
  assert.match(sheet, /data-testid="move-stop-confirm"/);
  assert.match(sheet, /MOVE_STOP_COPY\.confirm\(moveDayLong\(target\)\)/);
});

test("S3 the stop's own day cannot be chosen, and confirm needs a body to send", () => {
  assert.match(sheet, /disabled=\{here \|\| pending\}/);
  // It also LOOKS unavailable and says so to a screen reader (Leon, Nov 20, 2026: styling only).
  assert.match(sheet, /aria-disabled=\{here \|\| undefined\}/);
  assert.match(sheet, /\$\{here \? "cursor-not-allowed opacity-50" : ""\}/);
  assert.match(sheet, /disabled=\{!body \|\| pending\}/);
});

test("S4 a booked stop gets the sentence in place of every choice", () => {
  assert.match(sheet, /\{refusal \? \(\s*<p[^>]*data-testid=\{`move-stop-refusal-\$\{itemId\}`\}/);
});

test("S5 'Pick a time' is offered only where the stop's time is the traveler's to change", () => {
  assert.match(sheet, /\{timeEditable \? \(\s*<button [^\n]*data-testid="move-stop-pick-time"/);
  assert.match(slip, /timeEditable=\{timeRule\.editable\}/);
});

test("S6 the write is the existing item PATCH, then the plan is re-read", () => {
  assert.match(sheet, /apiRequest\("PATCH", SLIP_ITEM_ENDPOINTS\.edit\(tripId, itemId\), body\)/);
  assert.match(sheet, /invalidatePlan\(tripId\)/);
});

test("S7 the stop menu has a 'Move' entry, never on an arrival or departure row", () => {
  assert.equal(ITEM_MENU_LABELS.move, "Move");
  assert.match(row, /\{!isAnchor && menu\.onMove \? \(\s*<DropdownMenuItem onSelect=\{menu\.onMove\} data-testid=\{`item-menu-move-\$\{id\}`\}/);
});

test("S8 the plan page offers Move where the row may be reordered and the plan has another day", () => {
  assert.match(slip, /const canMoveDay = tools\.reorder && dayNumber != null && moveDays\.length > 1;/);
  assert.match(slip, /onMove: canMoveDay \? \(\) => setMoveOpen\(true\) : undefined,/);
  assert.match(slip, /booked=\{!!a\.booking\?\.id\}/);
});
