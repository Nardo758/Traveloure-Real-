/**
 * startup-delay.test.ts — the boot-herd mitigation contract (scheduler-reliability lane #1712).
 *
 * jitteredStartupDelay is the cheap half of the pool-exhaustion fix: it must guarantee that no
 * scheduler's first pass can land inside the boot window (a hard 60s floor) and that first passes
 * fan out (jitter), while NEVER pulling a pass earlier than the scheduler intended.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  jitteredStartupDelay,
  STARTUP_DELAY_FLOOR_MS,
  STARTUP_DELAY_SPREAD_MS,
} from "../startup-delay";

test("never returns less than the 60s floor, even for a zero/negative base", () => {
  for (const base of [undefined, 0, -1000, 5, 1_000]) {
    for (let i = 0; i < 200; i++) {
      const d = jitteredStartupDelay(base as number | undefined);
      assert.ok(d >= STARTUP_DELAY_FLOOR_MS, `delay ${d} for base ${base} fell below the floor`);
    }
  }
});

test("adds bounded jitter on top of the floor (spread is (0, SPREAD_MS])", () => {
  let sawAboveFloor = false;
  for (let i = 0; i < 500; i++) {
    const d = jitteredStartupDelay(0);
    assert.ok(d >= STARTUP_DELAY_FLOOR_MS, "below floor");
    assert.ok(d < STARTUP_DELAY_FLOOR_MS + STARTUP_DELAY_SPREAD_MS, `jitter ${d} exceeded the spread`);
    if (d > STARTUP_DELAY_FLOOR_MS) sawAboveFloor = true;
  }
  assert.ok(sawAboveFloor, "jitter never fired — passes would still stampede together");
});

test("preserves a base already past the floor and only pushes it LATER (never earlier)", () => {
  const base = 30 * 60 * 1000; // a 30-min intended delay
  for (let i = 0; i < 200; i++) {
    const d = jitteredStartupDelay(base);
    assert.ok(d >= base, `delay ${d} pulled the pass earlier than its intended ${base}`);
    assert.ok(d < base + STARTUP_DELAY_SPREAD_MS, `delay ${d} overshot base+spread`);
  }
});

test("fans passes out — a batch of first-run delays is not all identical", () => {
  const delays = new Set<number>();
  for (let i = 0; i < 50; i++) delays.add(jitteredStartupDelay(2 * 60 * 1000));
  // With ms-resolution jitter across 50 draws, a single clustered value would be a real defect.
  assert.ok(delays.size > 10, `first-run delays clustered (${delays.size} distinct values)`);
});
