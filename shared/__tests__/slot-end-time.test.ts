/**
 * EX-1 (4) — `deriveSlotEndTime`, the ONE rule for a console slot's end time.
 * Pure: no db, no request. The rails that call it are proven in
 * `server/__tests__/ex1-expert-console.http.test.ts` (X5).
 *
 * Run solo: npx tsx --test shared/__tests__/slot-end-time.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSlotEndTime } from "../slot-end-time";

test("T1: start + duration when both exist", () => {
  assert.equal(deriveSlotEndTime("09:00", 90), "10:30");
  assert.equal(deriveSlotEndTime("9:15", 45), "10:00");
  assert.equal(deriveSlotEndTime("14:30:00", 30), "15:00");
});

test("T2: no start or no duration ⇒ NULL, never a default", () => {
  assert.equal(deriveSlotEndTime(undefined, 60), null);
  assert.equal(deriveSlotEndTime(null, 60), null);
  assert.equal(deriveSlotEndTime("10:00", null), null);
  assert.equal(deriveSlotEndTime("10:00", undefined), null);
  assert.equal(deriveSlotEndTime("10:00", 0), null);
  assert.equal(deriveSlotEndTime("10:00", -30), null);
  assert.equal(deriveSlotEndTime("10:00", 12.5), null);
});

test("T3: an unreadable start ⇒ NULL", () => {
  assert.equal(deriveSlotEndTime("morning", 60), null);
  assert.equal(deriveSlotEndTime("25:00", 60), null);
  assert.equal(deriveSlotEndTime("10:75", 60), null);
  assert.equal(deriveSlotEndTime("", 60), null);
});

test("T4: an end at or past midnight ⇒ NULL (a same-day wall clock cannot hold it)", () => {
  assert.equal(deriveSlotEndTime("23:00", 60), null);
  assert.equal(deriveSlotEndTime("23:30", 120), null);
  assert.equal(deriveSlotEndTime("22:59", 60), "23:59");
});
