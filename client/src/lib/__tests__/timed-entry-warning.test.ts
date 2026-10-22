/**
 * FB-1 step 5c (ledger `2026-10-19-fb1-timed-entry`): the slip row's timed-entry warning, linked to the official site.
 *   TW1 Marketing's line, with "Slots open N days ahead." only when the fact states it
 *   TW2 no fact, or one not stating required, ⇒ nothing
 *   TW3 row 126: an approved bot fact's provenance is #1580's code-written stamp, carried whole
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIMED_ENTRY_LINE, itemTimedEntryWarning, timedEntryOpensLine } from "../place-facts";

const fact = (value: Record<string, unknown>) =>
  ({ factType: "timed_entry_required", need: "stop.hours", origin: "crawled", value, sourceUrl: "https://villa.example.jp/visit", provenance: "Villa official site · checked 19 Oct 2026", stale: false, publishable: true, checkedAt: "2026-10-19T08:00:00.000Z" }) as any;

test("TW1 the line, word for word, linked to the official site", () => {
  assert.equal(TIMED_ENTRY_LINE, "Entry needs a timed slot, reserved on the official site.");
  assert.equal(timedEntryOpensLine(30), "Slots open 30 days ahead.");
  assert.equal(timedEntryOpensLine(1), "Slots open 1 day ahead.");
  assert.deepEqual(itemTimedEntryWarning([fact({ required: true })]), {
    text: "Entry needs a timed slot, reserved on the official site. · Villa official site · checked 19 Oct",
    sourceUrl: "https://villa.example.jp/visit",
  });
  assert.equal(itemTimedEntryWarning([fact({ required: true, opensDaysAhead: 30 })])!.text, "Entry needs a timed slot, reserved on the official site. Slots open 30 days ahead. · Villa official site · checked 19 Oct");
});

test("TW2 nothing without a stated requirement", () => {
  assert.equal(itemTimedEntryWarning(undefined), null);
  assert.equal(itemTimedEntryWarning([]), null);
  assert.equal(itemTimedEntryWarning([fact({ required: false })]), null);
  assert.equal(itemTimedEntryWarning([{ ...fact({ required: true }), factType: "hours" }]), null);
});

test("TW3 a reviewed bot fact carries the stamp whole", () => {
  const bot = { ...fact({ required: true }), origin: "bot_proposal", provenance: "Checked 22 Oct 2026 · Source: Villa official site" };
  assert.deepEqual(itemTimedEntryWarning([bot]), {
    text: "Entry needs a timed slot, reserved on the official site. · Checked 22 Oct 2026 · Source: Villa official site",
    sourceUrl: "https://villa.example.jp/visit",
  });
});
