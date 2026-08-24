/**
 * Lane A (console-fixes) — A3 proofs for the slip's plan-level action logic
 * (client/src/lib/slip-plan-actions.ts):
 *
 *  - the in_planning filter: `with_expert`/`purchased`/booked items are NEVER posted to the
 *    routing endpoint by the bulk action (the endpoint's LEGAL_FROM for ready_for_checkout
 *    is ["in_planning"] — the client must not send requests it knows will 409);
 *  - single-invalidation: the cache-invalidation callback fires EXACTLY ONCE per batch
 *    (including partial-failure batches), and not at all for an empty batch;
 *  - honest failure reporting: per-item failures are collected with the SERVER's own
 *    message (never swallowed, never restated client-side);
 *  - the disabled/hidden gating helpers for "Optimize this plan" / "Add all to checkout".
 *
 * DB-free by construction: `postRoute` is injected. Run:
 *   npx tsx --test client/src/lib/__tests__/slip-plan-actions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  countOptimizableItems,
  humanizeRouteError,
  runBulkRouteToCheckout,
  selectBulkCheckoutItems,
  slipOptimizeDisabledReason,
  summarizeBulkRoute,
  type RoutableItemLike,
} from "../slip-plan-actions";

const MIXED: RoutableItemLike[] = [
  { id: "a", routingStatus: "in_planning" },
  { id: "b", routingStatus: "with_expert" },
  { id: "c", routingStatus: "ready_for_checkout" },
  { id: "d", routingStatus: "purchased" },
  { id: "e", routingStatus: "in_planning", booking: { id: "bk1" } }, // booked = never routed
  { id: "f", routingStatus: null },
  { id: "g" }, // not on the routing state machine at all
  { id: "h", routingStatus: "in_planning" },
];

describe("selectBulkCheckoutItems (the in_planning filter)", () => {
  it("keeps only un-booked in_planning items", () => {
    assert.deepStrictEqual(
      selectBulkCheckoutItems(MIXED).map((i) => i.id),
      ["a", "h"],
    );
  });

  it("returns empty for a plan with nothing in planning (bulk button hidden)", () => {
    assert.strictEqual(
      selectBulkCheckoutItems([
        { id: "x", routingStatus: "with_expert" },
        { id: "y", routingStatus: "purchased" },
      ]).length,
      0,
    );
  });
});

describe("countOptimizableItems (mirrors loadTripOptimizerInputs's reads)", () => {
  it("counts in_planning + ready_for_checkout, excluding booked rows", () => {
    // a, c, h — e is booked, so excluded even though its routingStatus says in_planning.
    assert.strictEqual(countOptimizableItems(MIXED), 3);
  });

  it("is zero when everything is with the expert or purchased", () => {
    assert.strictEqual(
      countOptimizableItems([
        { id: "x", routingStatus: "with_expert" },
        { id: "y", routingStatus: "purchased" },
      ]),
      0,
    );
  });
});

describe("slipOptimizeDisabledReason (honest disabled tooltip)", () => {
  const base = {
    optimizableCount: 2,
    destination: "Kyoto",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
  };

  it("enabled when items, destination, and dates all exist", () => {
    assert.strictEqual(slipOptimizeDisabledReason(base), null);
  });

  it("disabled with the zero-items reason when nothing is optimizable", () => {
    const reason = slipOptimizeDisabledReason({ ...base, optimizableCount: 0 });
    assert.ok(reason && /nothing to optimize/i.test(reason));
  });

  it("disabled when the trip has no destination (never invented — §13)", () => {
    const reason = slipOptimizeDisabledReason({ ...base, destination: null });
    assert.ok(reason && /destination/i.test(reason));
  });

  it("disabled when either date is missing (never invented — §13)", () => {
    assert.ok(slipOptimizeDisabledReason({ ...base, startDate: null }));
    assert.ok(slipOptimizeDisabledReason({ ...base, endDate: undefined }));
  });
});

describe("humanizeRouteError (server's own message, extracted)", () => {
  it("pulls message out of apiRequest's '<status>: <json>' format", () => {
    const err = new Error(
      '409: {"message":"Item routing state changed concurrently; re-read and retry.","expectedFrom":"in_planning"}',
    );
    assert.strictEqual(
      humanizeRouteError(err),
      "Item routing state changed concurrently; re-read and retry.",
    );
  });

  it("falls back to the raw body when it is not JSON", () => {
    assert.strictEqual(humanizeRouteError(new Error("409: Conflict")), "Conflict");
  });

  it("passes through a plain error message", () => {
    assert.strictEqual(humanizeRouteError(new Error("Network down")), "Network down");
  });
});

describe("runBulkRouteToCheckout", () => {
  it("posts ONLY in_planning items — with_expert/purchased/booked are never sent", async () => {
    const posted: string[] = [];
    const invalidations: number[] = [];
    const result = await runBulkRouteToCheckout({
      items: MIXED,
      postRoute: async (id) => {
        posted.push(id);
      },
      invalidate: () => invalidations.push(1),
    });
    assert.deepStrictEqual(posted.sort(), ["a", "h"]);
    assert.strictEqual(result.attempted, 2);
    assert.strictEqual(result.succeeded, 2);
    assert.deepStrictEqual(result.failed, []);
    assert.strictEqual(invalidations.length, 1, "exactly ONE invalidation per batch");
  });

  it("collects per-item failures honestly and STILL invalidates exactly once", async () => {
    let invalidateCalls = 0;
    const result = await runBulkRouteToCheckout({
      items: [
        { id: "ok1", routingStatus: "in_planning" },
        { id: "bad", routingStatus: "in_planning" },
        { id: "ok2", routingStatus: "in_planning" },
      ],
      postRoute: async (id) => {
        if (id === "bad") {
          throw new Error(
            '409: {"message":"with_expert → ready_for_checkout is not an edge on the state machine: return the item to in_planning first (ROUTING_STATE_CONTRACT §1)."}',
          );
        }
      },
      invalidate: () => invalidateCalls++,
    });
    assert.strictEqual(result.succeeded, 2);
    assert.strictEqual(result.failed.length, 1);
    assert.strictEqual(result.failed[0].id, "bad");
    assert.match(result.failed[0].message, /not an edge on the state machine/);
    assert.strictEqual(invalidateCalls, 1, "partial failure still means ONE invalidation");
  });

  it("does nothing at all for a batch with no in_planning items (no posts, no invalidation)", async () => {
    let posts = 0;
    let invalidateCalls = 0;
    const result = await runBulkRouteToCheckout({
      items: [{ id: "x", routingStatus: "with_expert" }],
      postRoute: async () => {
        posts++;
      },
      invalidate: () => invalidateCalls++,
    });
    assert.strictEqual(result.attempted, 0);
    assert.strictEqual(posts, 0);
    assert.strictEqual(invalidateCalls, 0);
  });

  it("never exceeds the concurrency bound", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items: RoutableItemLike[] = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      routingStatus: "in_planning",
    }));
    await runBulkRouteToCheckout({
      items,
      concurrency: 3,
      postRoute: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
      invalidate: () => {},
    });
    assert.ok(maxInFlight <= 3, `max in-flight was ${maxInFlight}, bound is 3`);
  });
});

describe("summarizeBulkRoute (one honest toast)", () => {
  it("all-success: plain added count", () => {
    assert.deepStrictEqual(summarizeBulkRoute({ attempted: 3, succeeded: 3, failed: [] }), {
      title: "3 items added to checkout",
    });
  });

  it("singular grammar", () => {
    assert.deepStrictEqual(summarizeBulkRoute({ attempted: 1, succeeded: 1, failed: [] }), {
      title: "1 item added to checkout",
    });
  });

  it("partial: reports both counts and the server's distinct reasons — never swallowed", () => {
    const summary = summarizeBulkRoute({
      attempted: 4,
      succeeded: 3,
      failed: [{ id: "b", message: "Item routing state changed concurrently; re-read and retry." }],
    });
    assert.strictEqual(summary.title, "3 added, 1 not added");
    assert.match(summary.description!, /changed concurrently/);
  });

  it("all-failed: says so, with deduplicated reasons", () => {
    const summary = summarizeBulkRoute({
      attempted: 2,
      succeeded: 0,
      failed: [
        { id: "a", message: "reason one" },
        { id: "b", message: "reason one" },
      ],
    });
    assert.strictEqual(summary.title, "2 items couldn't be added");
    assert.strictEqual(summary.description, "reason one");
  });
});
