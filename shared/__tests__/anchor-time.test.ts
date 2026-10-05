/**
 * R316 — the wall-clock convention for `temporal_anchors.anchor_datetime`, one module for every side
 * (ledger `2026-10-05-anchor-writers-wall-clock`).
 *   A1 a writer's value is the zone-less "YYYY-MM-DDTHH:MM:00"; a bad date or time is null, never guessed
 *   A2 the route-boundary reader stores a zone-less string as its wall-clock on a UTC, Tokyo and
 *      Los Angeles process alike; a string naming its own zone is taken as given; garbage is Invalid
 *   A3 the overlap rule's anchor reader agrees with what the route stored
 * R317 — the readers (ledger `2026-10-05-anchor-readers-wall-clock`):
 *   A4 day / time / minutes of an anchor are its wall-clock on a UTC, Tokyo and Los Angeles process alike
 *   A5 the plan-day number is a calendar-day difference, not a server-midnight one
 *   A6 the 12h label is the wall-clock; an unreadable value is null, never a guessed time
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anchorDatetimeFromInput,
  anchorDayNumber,
  anchorTimeLabel12h,
  anchorWallClockMs,
  anchorWallClockParts,
  anchorWallClockString,
} from "../anchor-time";

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

function underEachZone(fn: (tz: string) => void) {
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      fn(tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

test("A4 the anchor's day, time and minutes are its wall-clock on any server", () => {
  underEachZone((tz) => {
    const stored = new Date(Date.parse("2026-11-15T23:30:00Z")); // what drizzle returns for 23:30 wall-clock
    for (const v of [stored, "2026-11-15T23:30:00", "2026-11-15T23:30"]) {
      assert.deepEqual(anchorWallClockParts(v), { date: "2026-11-15", time: "23:30", minutes: 1410 }, `${tz} ${String(v)}`);
    }
    assert.deepEqual(anchorWallClockParts("2026-11-15T00:05:00"), { date: "2026-11-15", time: "00:05", minutes: 5 }, tz);
    assert.equal(anchorWallClockParts("nope"), null, tz);
    assert.equal(anchorWallClockParts(null), null, tz);
  });
});

test("A5 the plan-day number is a calendar-day difference", () => {
  underEachZone((tz) => {
    assert.equal(anchorDayNumber("2026-11-15T00:30:00", "2026-11-15"), 1, tz);
    assert.equal(anchorDayNumber("2026-11-17T23:30:00", "2026-11-15"), 3, tz);
    assert.equal(anchorDayNumber(new Date("2026-11-16T23:59:00Z"), new Date("2026-11-15T00:00:00Z")), 2, tz);
    assert.equal(anchorDayNumber("2026-11-14T10:00:00", "2026-11-15"), 0, tz);
    assert.equal(anchorDayNumber("2026-11-15T10:00:00", null), null, tz);
    assert.equal(anchorDayNumber("garbage", "2026-11-15"), null, tz);
  });
});

test("A6 the 12h label is the wall-clock", () => {
  underEachZone((tz) => {
    assert.equal(anchorTimeLabel12h("2026-11-15T14:00:00"), "02:00 PM", tz);
    assert.equal(anchorTimeLabel12h(new Date("2026-11-15T09:05:00Z")), "09:05 AM", tz);
    assert.equal(anchorTimeLabel12h(""), null, tz);
  });
});
