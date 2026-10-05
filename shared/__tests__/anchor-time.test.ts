/**
 * R316 — the wall-clock convention for `temporal_anchors.anchor_datetime`, one module for every side
 * (ledger `2026-10-05-anchor-writers-wall-clock`).
 *   A1 a writer's value is the zone-less "YYYY-MM-DDTHH:MM:00"; a bad date or time is null, never guessed
 *   A2 the route-boundary reader stores a zone-less string as its wall-clock on a UTC, Tokyo and
 *      Los Angeles process alike; a string naming its own zone is taken as given; garbage is Invalid
 *   A3 the overlap rule's anchor reader agrees with what the route stored
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorDatetimeFromInput, anchorWallClockMs, anchorWallClockString } from "../anchor-time";

test("A1 the writer's wall-clock string", () => {
  assert.equal(anchorWallClockString("2026-11-15", "14:00"), "2026-11-15T14:00:00");
  assert.equal(anchorWallClockString("2026-11-15", "9:05"), "2026-11-15T09:05:00");
  assert.equal(anchorWallClockString("2026-11-15", "09:05:30"), "2026-11-15T09:05:30");
  for (const [d, t] of [["", "14:00"], ["2026-11-15", ""], ["2026/11/15", "14:00"], ["2026-11-15", "24:00"], ["2026-11-15", "14:60"], [null, null]] as const) {
    assert.equal(anchorWallClockString(d, t), null, `${d} ${t}`);
  }
});

test("A2 the route-boundary reader does not depend on the server's TZ", () => {
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      assert.equal((anchorDatetimeFromInput("2026-11-15T14:00:00") as Date).toISOString(), "2026-11-15T14:00:00.000Z", tz);
      assert.equal((anchorDatetimeFromInput("2026-11-15T14:00") as Date).toISOString(), "2026-11-15T14:00:00.000Z", tz);
      assert.equal((anchorDatetimeFromInput("2026-11-15T05:00:00.000Z") as Date).toISOString(), "2026-11-15T05:00:00.000Z", tz);
      assert.equal((anchorDatetimeFromInput("2026-11-15T14:00:00+09:00") as Date).toISOString(), "2026-11-15T05:00:00.000Z", tz);
      assert.ok(Number.isNaN((anchorDatetimeFromInput("not a date") as Date).getTime()), tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
  const d = new Date("2026-11-15T14:00:00Z");
  assert.equal(anchorDatetimeFromInput(d), d);
  assert.equal(anchorDatetimeFromInput(undefined), undefined);
});

test("A3 the overlap rule reads back exactly what the route stored", () => {
  const stored = anchorDatetimeFromInput(anchorWallClockString("2026-11-15", "14:00")) as Date;
  assert.equal(anchorWallClockMs(stored), Date.parse("2026-11-15T14:00:00Z"));
  assert.equal(anchorWallClockMs("2026-11-15T14:00:00"), Date.parse("2026-11-15T14:00:00Z"));
});
