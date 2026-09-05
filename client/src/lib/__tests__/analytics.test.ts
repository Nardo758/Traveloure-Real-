import assert from "node:assert/strict";
import test from "node:test";
import { trackEvent } from "../analytics";

test("trackEvent is safe when window is unavailable", () => {
  const originalWindow = globalThis.window;
  try {
    Object.assign(globalThis, { window: undefined });
    assert.doesNotThrow(() => trackEvent("trip_created"));
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});

test("trackEvent is safe when the tracker is unavailable", () => {
  const originalWindow = globalThis.window;
  try {
    Object.assign(globalThis, { window: {} });
    assert.doesNotThrow(() => trackEvent("trip_created", { surface: "intake_panel" }));
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});

test("trackEvent forwards flat event data and swallows tracker errors", () => {
  const originalWindow = globalThis.window;
  const calls: Array<[string, Record<string, string | number | boolean> | undefined]> = [];
  try {
    Object.assign(globalThis, {
      window: {
        umami: {
          track: (name: string, data?: Record<string, string | number | boolean>) => calls.push([name, data]),
        },
      },
    });
    trackEvent("service_added_to_cart", { item_type: "service", has_scheduled_date: false });
    assert.deepEqual(calls, [["service_added_to_cart", { item_type: "service", has_scheduled_date: false }]]);
    Object.assign(globalThis.window, { umami: { track: () => { throw new Error("unavailable"); } } });
    assert.doesNotThrow(() => trackEvent("trip_created"));
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});