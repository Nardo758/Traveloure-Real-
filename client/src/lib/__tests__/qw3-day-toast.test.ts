/**
 * QW-3 (Leon, Nov 7): a save still lands on Day 1 unless a day was chosen — and the toast now says which
 * day. No migration, no chooser: the plan's day is READ from the save's own answer, never assumed.
 *
 *   D1 a located save names its day
 *   D2 an unlocated save names its day and keeps the "not on the map" fact
 *   D3 an answer with no day keeps the old sentence (never a guessed "Day 1")
 *   D4 the signed-in rail reads the day from the created row and toasts it
 *
 * Cut-list #1 slice C (ledger `2026-11-11-cutlist1-slice-c-add-actions`): "Added to Day {n}." supersedes the Nov 7
 * "Saved to Day {n}."; a day-less answer reads "Added ✓". The rule (the day is read, never assumed) is unchanged.
 *
 * Run: npx tsx --test client/src/lib/__tests__/qw3-day-toast.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { guestSavedMessage } from "../waitlist-guest-plan";
import { ADD_COPY } from "../add-to-plan";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("QW-3 — the save toast names the day", () => {
  it("D1 a located save names its day", () => {
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: 2 } }), "Added to Day 2.");
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: 1 } }), "Added to Day 1.");
  });

  it("D2 an unlocated save names its day and keeps the map fact", () => {
    assert.equal(guestSavedMessage({ located: false, item: { dayNumber: 3 } }), "Added to Day 3. We don't have this spot on the map yet.");
  });

  it("D3 no day in the answer keeps the old sentence", () => {
    assert.equal(guestSavedMessage({ located: true }), ADD_COPY.added);
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: null } }), ADD_COPY.added);
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: 0 } }), ADD_COPY.added);
  });

  it("D4 the signed-in rail reads the day from the created row", () => {
    const picker = read("client/src/components/plan-picker.tsx");
    assert.match(picker, /dayNumber: typeof raw === "number" && Number\.isInteger\(raw\) && raw > 0 \? raw : null,/);
    // Slice C: the row's id and day go to the one add toast ("Added to Day {n}." with Undo and Change day).
    assert.match(picker, /\? announceTripAdd\(tripId, row\)/);
    assert.match(read("client/src/lib/plan-add-runner.ts"), /dayNumber: dayOf\(item\.dayNumber\)/);
  });
});
