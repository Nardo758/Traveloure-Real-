/**
 * R4-8 — the server's reversed-window rule, tested where it lives.
 *
 * `tripDateRangeRefusal` is what the LIVE `PATCH /api/trips/:id` (`server/routes.ts`) calls before
 * `storage.updateTrip`. It is fed the MERGED window (body over the stored row), so a PATCH that moves
 * only one end is judged against the other end already stored.
 *
 * Covered here: a reversed window is refused with the stable code, SAME-DAY is allowed (a one-day
 * trip), a one-sided or unknown window states no range and is allowed, and a timestamp is compared by
 * its calendar day so no timezone can flip the verdict.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { END_BEFORE_START_CODE, END_BEFORE_START_MESSAGE, tripDateRangeRefusal } from "../trip-date-range";

test("R4-8: end before start is refused with a stable code", () => {
  const refusal = tripDateRangeRefusal("2026-12-09", "2026-12-08");
  assert.ok(refusal, "a reversed window is refused");
  assert.equal(refusal.code, END_BEFORE_START_CODE);
  assert.equal(refusal.code, "end_before_start", "the code callers branch on never moves");
  assert.equal(refusal.message, END_BEFORE_START_MESSAGE, "the create rail's existing sentence, no new copy");
  assert.equal(refusal.message, "End date must be on or after start date");
});

test("R4-8: same-day is a one-day trip and stays valid", () => {
  assert.equal(tripDateRangeRefusal("2026-12-03", "2026-12-03"), null, "a same-day window saves");
  assert.equal(tripDateRangeRefusal("2026-12-03", "2026-12-04"), null, "an ordinary window saves");
});

test("R4-8: a window that states no range is not refused here", () => {
  assert.equal(tripDateRangeRefusal(null, "2026-12-04"), null, "only an end");
  assert.equal(tripDateRangeRefusal("2026-12-03", null), null, "only a start");
  assert.equal(tripDateRangeRefusal(undefined, undefined), null, "no window at all");
  assert.equal(tripDateRangeRefusal("not a date", "2026-12-04"), null, "an unknown shape is left to the schema");
});

test("R4-8: the comparison is by calendar day, never by instant", () => {
  // The same days, expressed as timestamps either side of midnight UTC — neither may flip the verdict.
  assert.equal(tripDateRangeRefusal("2026-12-03T23:30:00Z", "2026-12-03T00:10:00Z"), null, "same calendar day");
  assert.ok(tripDateRangeRefusal("2026-12-03T00:10:00Z", "2026-12-02T23:30:00Z"), "still reversed");
});
