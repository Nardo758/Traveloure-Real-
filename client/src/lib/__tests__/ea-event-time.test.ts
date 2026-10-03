import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { wallClockIso } = await import("../ea-event-time");

const TZ = process.env.TZ ?? "(unset)";

test(`19:00 on Nov 11 is that wall clock with this zone's offset [TZ=${TZ}]`, () => {
  const iso = wallClockIso("2026-11-11", "19:00");
  assert.ok(iso);
  const parsed = new Date(iso!);
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 10);
  assert.equal(parsed.getDate(), 11);
  assert.equal(parsed.getHours(), 19);
  assert.equal(parsed.getMinutes(), 0);
  // A naive "2026-11-11T19:00" is 19:00 UTC. The offset form must not be that instant
  // unless the process itself is UTC.
  const naiveUtc = new Date("2026-11-11T19:00:00.000Z");
  if (new Date(2026, 10, 11, 19, 0).getTimezoneOffset() !== 0) {
    assert.notEqual(parsed.getTime(), naiveUtc.getTime());
  }
});

test("a missing or impossible clock is refused", () => {
  assert.equal(wallClockIso("", "19:00"), null);
  assert.equal(wallClockIso("2026-11-11", "25:00"), null);
  assert.equal(wallClockIso("not-a-date", "19:00"), null);
});

test("an empty time is local midnight of that day", () => {
  const iso = wallClockIso("2026-11-11", "");
  assert.ok(iso);
  const parsed = new Date(iso!);
  assert.equal(parsed.getDate(), 11);
  assert.equal(parsed.getHours(), 0);
});

test("the event form sends the offset helper, not a bare datetime", () => {
  const src = readFileSync(new URL("../../pages/ea/events.tsx", import.meta.url), "utf8");
  assert.match(src, /wallClockIso\(form\.date, form\.time\)/);
  assert.doesNotMatch(src, /\$\{form\.date\}T\$\{form\.time/);
});
