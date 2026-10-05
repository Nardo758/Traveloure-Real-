/**
 * R319 — an expert's HH:MM edit to an item's start time (ledger `2026-10-05-expert-item-time-wall-clock`).
 *   E1 a bare "HH:MM" original takes the edit (the old helper silently dropped it)
 *   E2 a dated original keeps its date and suffix; only HH:MM changes — on a UTC, Tokyo and LA process alike
 *   E3 no original takes the edit; an unreadable edit or original keeps the original (§13)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeExpertTimeEdit } from "../expert-time-edit";

test("E1 a bare time takes the edit", () => {
  assert.equal(mergeExpertTimeEdit("09:00", "14:30"), "14:30");
  assert.equal(mergeExpertTimeEdit("9:00:00", "7:05"), "07:05");
});

test("E2 a dated original changes only its HH:MM, whatever the server's zone", () => {
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      assert.equal(mergeExpertTimeEdit("2026-11-15T09:00:00", "23:30"), "2026-11-15T23:30:00", tz);
      assert.equal(mergeExpertTimeEdit("2026-11-15T09:00:00.000Z", "23:30"), "2026-11-15T23:30:00.000Z", tz);
      assert.equal(mergeExpertTimeEdit("2026-11-15 09:00", "00:15"), "2026-11-15 00:15", tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test("E3 absences and unreadable values", () => {
  assert.equal(mergeExpertTimeEdit(null, "14:00"), "14:00");
  assert.equal(mergeExpertTimeEdit("", "14:00"), "14:00");
  assert.equal(mergeExpertTimeEdit("09:00", undefined), "09:00");
  assert.equal(mergeExpertTimeEdit("09:00", ""), "09:00");
  for (const bad of ["24:00", "12:60", "noon", "14:00:00", "1400"]) {
    assert.equal(mergeExpertTimeEdit("09:00", bad), "09:00", bad);
  }
  assert.equal(mergeExpertTimeEdit("morning", "14:00"), "morning");
  assert.equal(mergeExpertTimeEdit(null, "bad"), null);
});
