/**
 * BP-1 (ledger `2026-10-12-bp1-booking-path`, ruling 3): where "Book this for me" lives.
 *   L1 never on the slip row — the row's ⋯ menu passes no `onBookForMe`;
 *   L2 the item sheet reads the item's path through the ONE `bookingControls`, and draws its own Book control
 *      before "Book this for me";
 *   L3 the leg sheet keeps its "Book this for me";
 *   L4 Finalize never ticks an item whose path is `none`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(resolve(CLIENT_SRC, p), "utf8");
const view = read("components/plancard/SlipView.tsx");

test("L1: the slip row's menu offers no Book this for me", () => {
  assert.doesNotMatch(view, /onBookForMe\s*:/);
});

test("L2: the item sheet reads bookingControls and draws Book before Book this for me", () => {
  assert.match(view, /bookingControls\(a\.bookingPath\)/);
  const book = view.indexOf("item-sheet-book-${a.id}");
  const forMe = view.indexOf("item-sheet-book-for-me-${a.id}");
  assert.ok(book > 0 && forMe > book, "the item's own Book control comes first");
});

test("L3: the leg sheet keeps Book this for me", () => {
  assert.match(read("components/plan/LegSheet.tsx"), /onBookForMe/);
});

test("L4: Finalize never ticks a none item", () => {
  assert.match(read("components/plancard/FinalizeBookingModal.tsx"), /bookingPath !== "none"/);
});
