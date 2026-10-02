import assert from "node:assert/strict";
import test from "node:test";
import { bookingExpiryScheduler } from "../../services/booking-expiry-scheduler.service";
import { tripCardHandoverScheduler } from "../../services/trip-card-handover-scheduler.service";

type TimerCallback = () => void;

function stubTimers(): {
  timeouts: TimerCallback[];
  intervals: TimerCallback[];
  restore: () => void;
} {
  const timeouts: TimerCallback[] = [];
  const intervals: TimerCallback[] = [];
  const oldSetTimeout = globalThis.setTimeout;
  const oldSetInterval = globalThis.setInterval;
  const oldClearInterval = globalThis.clearInterval;

  globalThis.setTimeout = ((callback: TimerCallback) => {
    timeouts.push(callback);
    return {} as NodeJS.Timeout;
  }) as typeof globalThis.setTimeout;
  globalThis.setInterval = ((callback: TimerCallback) => {
    intervals.push(callback);
    return {} as NodeJS.Timeout;
  }) as typeof globalThis.setInterval;
  globalThis.clearInterval = (() => {}) as typeof globalThis.clearInterval;

  return {
    timeouts,
    intervals,
    restore: () => {
      globalThis.setTimeout = oldSetTimeout;
      globalThis.setInterval = oldSetInterval;
      globalThis.clearInterval = oldClearInterval;
    },
  };
}

const flushScheduledPass = () => new Promise<void>((resolve) => setImmediate(resolve));

test("legacy expiry startup, interval, and admin trigger preserve one callback and result", async () => {
  const timers = stubTimers();
  const scheduler = bookingExpiryScheduler as any;
  const originalAction = scheduler.runCancellationAction;
  const expected = { cancelledCount: 7, bookingIds: ["fixture"], errors: [], ranAt: new Date(0) };
  let calls = 0;
  scheduler.runCancellationAction = async () => {
    calls++;
    return expected;
  };

  try {
    scheduler.start();
    assert.equal(timers.timeouts.length, 1);
    assert.equal(timers.intervals.length, 1);

    timers.timeouts[0]();
    await flushScheduledPass();
    assert.equal(calls, 1, "the startup callback must enter the existing scheduler wrapper once");

    timers.intervals[0]();
    await flushScheduledPass();
    assert.equal(calls, 2, "the four-hour interval must enter the same callback once");

    assert.strictEqual(await scheduler.triggerManualRun(), expected);
    assert.equal(calls, 3, "the admin/manual trigger keeps its result while using the same wrapper");
  } finally {
    scheduler.stop();
    scheduler.runCancellationAction = originalAction;
    timers.restore();
  }
});

test("Trip Card nudge startup and hourly interval preserve one callback and result", async () => {
  const timers = stubTimers();
  const scheduler = tripCardHandoverScheduler as any;
  const originalAction = scheduler.runPassAction;
  const expected = { nudged: 4, ranAt: new Date(0) };
  let calls = 0;
  scheduler.runPassAction = async () => {
    calls++;
    return expected;
  };

  try {
    scheduler.start();
    assert.equal(timers.timeouts.length, 1);
    assert.equal(timers.intervals.length, 1);

    timers.timeouts[0]();
    await flushScheduledPass();
    assert.equal(calls, 1, "the delayed startup pass must enter the existing scheduler wrapper once");

    timers.intervals[0]();
    await flushScheduledPass();
    assert.equal(calls, 2, "each hourly tick must enter the same callback once");

    assert.strictEqual(await scheduler.runPass(), expected);
    assert.equal(calls, 3, "an ad-hoc pass preserves the callback result and is not double-dispatched");
  } finally {
    scheduler.stop();
    scheduler.runPassAction = originalAction;
    timers.restore();
  }
});