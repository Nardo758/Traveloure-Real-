/**
 * R317 — anchor readers read the plan's wall-clock, never the server's zone
 * (ledger `2026-10-05-anchor-readers-wall-clock`).
 *   R1 smart sequencing pins an anchor on its own day and minute on a UTC, Tokyo and Los Angeles process
 *   R2 an anchor late in the evening stays on its own plan day (the server-midnight bug moved it)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAnchorConstraints } from "../services/smart-sequencing.service";

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

const base = { anchorType: "ceremony", bufferBefore: 30, bufferAfter: null };

test("R1 the anchor's day and minute are its wall-clock", () => {
  underEachZone((tz) => {
    const [c] = parseAnchorConstraints([{ ...base, anchorDatetime: new Date("2026-11-16T14:00:00Z") }], "2026-11-15");
    assert.equal(c.dayNumber, 2, tz);
    assert.equal(c.startTimeMinutes, 14 * 60, tz);
    assert.equal(c.anchorDatetime, "2026-11-16T14:00:00.000Z", tz);
    assert.equal(c.bufferBefore, 30, tz);
  });
});

test("R2 an evening anchor stays on its own plan day", () => {
  underEachZone((tz) => {
    const [c] = parseAnchorConstraints([{ ...base, anchorDatetime: "2026-11-15T23:30:00" }], new Date("2026-11-15T00:00:00Z"));
    assert.equal(c.dayNumber, 1, tz);
    assert.equal(c.startTimeMinutes, 23 * 60 + 30, tz);
  });
});
