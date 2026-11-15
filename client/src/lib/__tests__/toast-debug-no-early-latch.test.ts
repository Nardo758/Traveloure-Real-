/**
 * Toast-debug latch (Leon, Nov 15): an early call must not latch the answer.
 *
 * `toastDebugEnabled()` memoises on purpose, so a mid-session query-string change cannot flip the logger
 * under a running session. The bug was WHERE it memoised: a call with no `window` (SSR, or any module that
 * reads this during import) used to store `false`, and that memo survived into the browser - so
 * `?debugToasts=1` and `localStorage.debugToasts` were dead for the whole session and the QA logger could
 * never be turned on after the fact.
 *
 * The rule now: nothing is latched before a real window answers. The first answer from a real window sticks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toastDebugEnabled, __resetToastDebugForTests, logToastAdd, toastCloseReason } from "../toast-debug";

function withWindow(search: string | null, storage: string | null, fn: () => void) {
  const saved = (globalThis as any).window;
  (globalThis as any).window = {
    location: { search: search ?? "" },
    localStorage: { getItem: (k: string) => (k === "debugToasts" ? storage : null) },
  };
  try {
    fn();
  } finally {
    (globalThis as any).window = saved;
    __resetToastDebugForTests();
  }
}

test("an early call with no window does not latch the answer", () => {
  __resetToastDebugForTests();
  const saved = (globalThis as any).window;
  delete (globalThis as any).window;
  try {
    assert.equal(toastDebugEnabled(), false, "no window reads as off");
  } finally {
    (globalThis as any).window = saved;
  }
  // The page now exists and asks for the logger: the earlier answer must not have stuck.
  withWindow("?debugToasts=1", null, () => {
    assert.equal(toastDebugEnabled(), true, "?debugToasts=1 still works after an early call");
  });
});

test("the first REAL answer sticks, so a mid-session URL change cannot flip it", () => {
  withWindow(null, null, () => {
    assert.equal(toastDebugEnabled(), false);
    (globalThis as any).window.location.search = "?debugToasts=1";
    assert.equal(toastDebugEnabled(), false, "memoised on purpose");
  });
});

test("localStorage is honoured, and a throwing window still reads as off", () => {
  withWindow(null, "1", () => assert.equal(toastDebugEnabled(), true));
  const saved = (globalThis as any).window;
  (globalThis as any).window = { get location() { throw new Error("blocked"); }, localStorage: undefined };
  try {
    assert.equal(toastDebugEnabled(), false, "a blocked window reads as off");
  } finally {
    (globalThis as any).window = saved;
    __resetToastDebugForTests();
  }
});

test("the logger still observes without changing anything", () => {
  withWindow("?debugToasts=1", null, () => {
    const infos: string[] = [];
    const savedInfo = console.info;
    (console as any).info = (line: string) => infos.push(String(line));
    try {
      logToastAdd("t1", "Added to Day 2.", 4000);
      assert.equal(infos.length, 1, "one line per add");
      assert.match(infos[0], /"event":"add"/);
    } finally {
      console.info = savedInfo;
    }
    assert.equal(toastCloseReason(4000, 4000), "timer");
    assert.equal(toastCloseReason(900, 4000), "user");
  });
});
