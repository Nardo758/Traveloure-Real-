/**
 * ST-1 — the stop-time rule (ledger `2026-10-12-st1-stop-time-edit`).
 *
 *   TR1 a ride is never editable — the operator's departure, whatever else is true
 *   TR2 a past day, then a booking, block with their own sentence
 *   TR3 a locked stop stays editable (LD 61) and carries the lock's note; a plain stop carries none
 *   TR4 Save rounds to the nearest 5 minutes; ties up; never past 23:55; junk is null
 *
 * Run: npx tsx --test shared/__tests__/st1-stop-time-edit.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STOP_TIME_BOOKED_REASON,
  STOP_TIME_LOCKED_NOTE,
  STOP_TIME_PAST_REASON,
  STOP_TIME_RIDE_REASON,
  roundToFiveMinutes,
  stopTimeRule,
} from "../stop-time-edit";

const base = { ride: false, pastDay: false, booked: false, locked: false };

describe("ST-1 stop-time rule", () => {
  it("TR1 a ride is never editable", () => {
    assert.deepEqual(stopTimeRule({ ...base, ride: true, locked: true }), { editable: false, reason: STOP_TIME_RIDE_REASON });
    assert.deepEqual(stopTimeRule({ ride: true, pastDay: true, booked: true, locked: true }), { editable: false, reason: STOP_TIME_RIDE_REASON });
  });

  it("TR2 a past day, then a booking, block with their own sentence", () => {
    assert.deepEqual(stopTimeRule({ ...base, pastDay: true, booked: true }), { editable: false, reason: STOP_TIME_PAST_REASON });
    assert.deepEqual(stopTimeRule({ ...base, booked: true }), { editable: false, reason: STOP_TIME_BOOKED_REASON });
  });

  it("TR3 a locked stop stays the owner's to change, with the lock's note", () => {
    assert.deepEqual(stopTimeRule({ ...base, locked: true }), { editable: true, note: STOP_TIME_LOCKED_NOTE });
    assert.deepEqual(stopTimeRule(base), { editable: true, note: null });
  });

  it("TR4 rounds to the nearest 5 minutes", () => {
    assert.equal(roundToFiveMinutes("10:02"), "10:00");
    assert.equal(roundToFiveMinutes("10:03"), "10:05");
    assert.equal(roundToFiveMinutes("10:07:30"), "10:05");
    assert.equal(roundToFiveMinutes("9:58"), "10:00");
    assert.equal(roundToFiveMinutes("23:58"), "23:55");
    assert.equal(roundToFiveMinutes("17:35"), "17:35");
    assert.equal(roundToFiveMinutes(""), null);
    assert.equal(roundToFiveMinutes("25:00"), null);
    assert.equal(roundToFiveMinutes(null), null);
  });
});
