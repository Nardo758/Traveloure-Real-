/**
 * QW-3 (Leon, Nov 7): a save still lands on Day 1 unless a day was chosen — and the toast now says which
 * day. No migration, no chooser: the plan's day is READ from the save's own answer, never assumed.
 *
 *   D1 a located save names its day
 *   D2 an unlocated save names its day and keeps the "not on the map" fact
 *   D3 an answer with no day keeps the old sentence (never a guessed "Day 1")
 *   D4 the signed-in rail reads the day from the created row and toasts it
 *
 * Run: npx tsx --test client/src/lib/__tests__/qw3-day-toast.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { guestSavedMessage } from "../waitlist-guest-plan";
import { WAITLIST_COPY } from "../waitlist-copy";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("QW-3 — the save toast names the day", () => {
  it("D1 a located save names its day", () => {
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: 2 } }), `${WAITLIST_COPY.savedToPlan} · Day 2`);
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: 1 } }), "Saved to plan · Day 1");
  });

  it("D2 an unlocated save names its day and keeps the map fact", () => {
    assert.equal(guestSavedMessage({ located: false, item: { dayNumber: 3 } }), "Saved to Day 3. We don't have this spot on the map yet.");
  });

  it("D3 no day in the answer keeps the old sentence", () => {
    assert.equal(guestSavedMessage({ located: true }), WAITLIST_COPY.savedToPlan);
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: null } }), WAITLIST_COPY.savedToPlan);
    assert.equal(guestSavedMessage({ located: true, item: { dayNumber: 0 } }), WAITLIST_COPY.savedToPlan);
  });

  it("D4 the signed-in rail reads the day from the created row", () => {
    const picker = read("client/src/components/plan-picker.tsx");
    assert.match(picker, /return typeof raw === "number" && Number\.isInteger\(raw\) && raw > 0 \? raw : null;/);
    assert.match(picker, /description: day === null \? "It's on your new plan\." : `It's on Day \$\{day\}\.`/);
  });
});
