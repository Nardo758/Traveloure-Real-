import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCartActivityStamp, evaluateCartClock, evaluateCartItemChange,
  prepareCartActivity, snapshotSkipReason, CART_STATE_KEY, CART_IDLE_MS,
  isCartActivityRequest, withCartActivityOrigin, hasCartActivityOrigin,
} from "../services/cart-email-state.service";

test("pure builder tolerates malformed, huge, legacy and hostile input without traversal", () => {
  const huge = Array.from({ length: 200_000 }, () => ({ quantity: 1 }));
  const hostile = new Proxy({}, { get() { throw Error("getter"); }, ownKeys() { throw Error("keys"); } });
  const cyclic: any = {}; cyclic.self = cyclic;
  for (const input of [null, undefined, "", 42, [], {}, { old: "cart" }, huge, hostile, cyclic]) {
    assert.deepEqual(buildCartActivityStamp(input, 100, "server"), { at_ms: 100, sequence_id: "server" });
  }
});

test("origin is server-scoped to mutation routes, never reads, and isolated across async work", async () => {
  assert.equal(isCartActivityRequest("GET", "/api/trips/a/items/b/route"), false);
  assert.equal(isCartActivityRequest("POST", "/api/trips/a/items/b/route"), true);
  assert.equal(isCartActivityRequest("POST", "/api/quotes/a/accept"), true);
  assert.equal(isCartActivityRequest("POST", "/api/quotes/a/decline"), false);
  assert.equal(hasCartActivityOrigin(), false);
  await Promise.all([
    withCartActivityOrigin(async () => { await Promise.resolve(); assert.equal(hasCartActivityOrigin(), true); }),
    (async () => { await Promise.resolve(); assert.equal(hasCartActivityOrigin(), false); })(),
  ]);
  assert.equal(hasCartActivityOrigin(), false);
});

test("builder fault becomes a safe error, rather than exposing the injected exception", () => {
  assert.throws(() => prepareCartActivity(() => { throw Error("private implementation detail"); }),
    { message: "Cart change could not be saved. Please retry." });
});

test("idle boundary below, exactly at, and above 60 minutes", () => {
  const rows = [{ contentMeta: { [CART_STATE_KEY]: { activity: { at_ms: 1_000, sequence_id: "server" } } } }];
  assert.deepEqual(evaluateCartClock(rows, 1_000 + CART_IDLE_MS - 1), { eligible: false, reason: "not_idle" });
  assert.equal(evaluateCartClock(rows, 1_000 + CART_IDLE_MS).eligible, true);
  assert.equal(evaluateCartClock(rows, 1_000 + CART_IDLE_MS + 1).eligible, true);
});

test("missing/future/malformed stamps never get a guessed clock; empty cart closes sequence", () => {
  assert.deepEqual(evaluateCartClock([], 1_000), { eligible: false, reason: "empty_cart" });
  assert.deepEqual(evaluateCartClock([{ contentMeta: { legacy: true } }], 1_000),
    { eligible: false, reason: "no_activity_stamp" });
  assert.deepEqual(evaluateCartClock([{ contentMeta: { [CART_STATE_KEY]: {
    activity: { at_ms: 2_000, sequence_id: "bad" },
  } } }], 1_000), { eligible: false, reason: "invalid_activity_stamp" });
});

test("old cart skips change email; notified values suppress repetition", () => {
  assert.equal(snapshotSkipReason(null), "no_snapshot");
  assert.equal(evaluateCartItemChange({}, { price: "12", currency: "USD", availability: {} }), "no_snapshot");
  const initial = { price: "12", currency: "USD", availability: { capacity: 4 }, captured_at: "2026-01-01T00:00:00Z" };
  const current = { price: "14", currency: "USD", availability: { capacity: 4 } };
  const meta = { [CART_STATE_KEY]: { snapshot: initial, notified: current } };
  assert.equal(evaluateCartItemChange(meta, current), "already_notified");
  assert.equal(evaluateCartItemChange({ [CART_STATE_KEY]: { snapshot: initial } }, current), "changed");
  assert.equal(evaluateCartItemChange({ [CART_STATE_KEY]: { snapshot: initial } }, initial), "unchanged");
});
