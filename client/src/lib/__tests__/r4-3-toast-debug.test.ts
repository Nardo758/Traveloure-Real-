/**
 * R4-3 part 2 — the QA toast logger, tested where it can be observed.
 *
 *   1. With the flag OFF nothing is written: no console.info, no matter how many toasts move.
 *   2. With it ON, adding toast B while A is open reports A as dismissed with reason "replaced" and
 *      names B as the replacer — which is the measurement the ticket exists for (TOAST_LIMIT = 1 means
 *      any second toast evicts the first, and that is what a "closed early" QA run would be seeing).
 *
 * The store is a module singleton, so the assertions are made per-id rather than by counting every line:
 * a toast added during the flag-off phase is still in state when the flag flips on, and its eviction is
 * logged then. That is the logger telling the truth about the store, not noise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { __resetToastDebugForTests, toastCloseReason } from "../toast-debug";

type Line = Record<string, any>;

function captureInfo() {
  const lines: Line[] = [];
  const original = console.info;
  console.info = (msg?: any) => {
    if (typeof msg === "string" && msg.startsWith("[toast] ")) lines.push(JSON.parse(msg.slice(8)));
  };
  return {
    lines,
    restore() {
      console.info = original;
    },
  };
}

function withWindow(search: string, storage: string | null) {
  (globalThis as any).window = {
    location: { search },
    localStorage: { getItem: (k: string) => (k === "debugToasts" ? storage : null) },
  };
}

test("R4-3: with the flag off, nothing is logged", async () => {
  withWindow("", null);
  __resetToastDebugForTests();
  const cap = captureInfo();
  try {
    const { toast } = await import("../../hooks/use-toast");
    toast({ title: "flag off A", duration: 8000 });
    toast({ title: "flag off B", duration: 8000 });
    assert.deepEqual(cap.lines, [], "no [toast] line while the flag is off");
  } finally {
    cap.restore();
  }
});

test("R4-3: with the flag on, adding B while A is open reports A replaced by B", async () => {
  withWindow("?debugToasts=1", null);
  __resetToastDebugForTests();
  const cap = captureInfo();
  try {
    const { toast } = await import("../../hooks/use-toast");
    const a = toast({ title: "A", duration: 8000 });
    const b = toast({ title: "B", duration: 8000 });

    const addA = cap.lines.find((l) => l.event === "add" && l.id === a.id);
    assert.ok(addA, "A's add is logged");
    assert.equal(addA.title, "A");
    assert.equal(addA.duration, 8000, "the ruling's duration is recorded");
    assert.equal(typeof addA.at, "number");

    const replaced = cap.lines.find((l) => l.event === "dismiss" && l.id === a.id);
    assert.ok(replaced, "A's eviction is logged");
    assert.equal(replaced.reason, "replaced");
    assert.equal(replaced.replacedBy.id, b.id, "the replacer is named");
    assert.equal(replaced.replacedBy.title, "B");
    assert.equal(typeof replaced.ms, "number", "ms since A's add is recorded");
  } finally {
    cap.restore();
  }
});

test("R4-3: the close reason is timer only at/after the duration", () => {
  assert.equal(toastCloseReason(8000, 8000), "timer", "the full duration is the timer");
  assert.equal(toastCloseReason(7900, 8000), "timer", "a timer firing marginally early is still a timer");
  assert.equal(toastCloseReason(6300, 8000), "user", "6.3 s of an 8 s toast is a user close");
  assert.equal(toastCloseReason(0, 8000), "user");
});
