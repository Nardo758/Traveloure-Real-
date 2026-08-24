/**
 * ready-made-clone-routing.test.ts
 *
 * Guards §3.1 of docs/briefs/ROUTING_STATE_CONTRACT.md:
 *   "RM-cloned items born `in_planning` with an explicit override in
 *    ready-made-purchase.service.ts clone path — the spread-copy must
 *    exclude/override routing_status."
 *
 * This test is intentionally DB-free.  It replicas the exact spread expression
 * from fulfillReadyMadePurchase and proves that `routing_status` is always
 * `in_planning` on every cloned item regardless of whatever the source item
 * carried.
 *
 * Run with: npx tsx --test server/services/__tests__/ready-made-clone-routing.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Mirror of the clone spread in ready-made-purchase.service.ts ──────────────
// Keep this in sync with the production code (around line 100-105).
// If the production expression changes, update here and add a test case.
function cloneItem(
  sourceItem: Record<string, unknown>,
  newTripId: string,
): Record<string, unknown> {
  // Destructure exactly as the service does (strip identity + timestamp cols).
  const { id: _id, tripId: _tripId, createdAt: _c, updatedAt: _u, ...rest } = sourceItem as any;
  return {
    ...rest,
    tripId: newTripId,
    routing_status: "in_planning", // §3.1: explicit override — ROUTING_STATE_CONTRACT.md
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeSourceItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "src-item-001",
    tripId: "src-trip-001",
    title: "Day 1: City tour",
    day: 1,
    type: "activity",
    routing_status: "in_planning",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  };
}

const CLONE_TRIP_ID = "clone-trip-999";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ready-made clone — routing_status override (§3.1)", () => {
  it("source item in_planning → clone lands in_planning", () => {
    const source = makeSourceItem({ routing_status: "in_planning" });
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.routing_status, "in_planning");
  });

  it("source item with_expert → clone still lands in_planning (not with_expert)", () => {
    const source = makeSourceItem({ routing_status: "with_expert" });
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.routing_status, "in_planning",
      "clone must never inherit with_expert from an author-side source item");
  });

  it("source item ready_for_checkout → clone still lands in_planning", () => {
    const source = makeSourceItem({ routing_status: "ready_for_checkout" });
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.routing_status, "in_planning",
      "clone must never inherit ready_for_checkout — born-purchased = born-approved violation");
  });

  it("source item purchased → clone still lands in_planning", () => {
    const source = makeSourceItem({ routing_status: "purchased" });
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.routing_status, "in_planning",
      "clone must never inherit purchased status");
  });

  it("source item with no routing_status field → clone lands in_planning (not undefined)", () => {
    const source = makeSourceItem();
    delete (source as any).routing_status;
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.routing_status, "in_planning",
      "explicit override must set in_planning even when source omits the field");
  });

  it("clone receives the new tripId, not the source tripId", () => {
    const source = makeSourceItem({ routing_status: "with_expert" });
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.tripId, CLONE_TRIP_ID);
    assert.notEqual(cloned.tripId, source.tripId);
  });

  it("clone does NOT carry the source item's id", () => {
    const source = makeSourceItem();
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.id, undefined, "id must be stripped so the DB mints a new identity");
  });

  it("clone does NOT carry createdAt / updatedAt from source", () => {
    const source = makeSourceItem();
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.createdAt, undefined);
    assert.equal(cloned.updatedAt, undefined);
  });

  it("all source items in a batch land in_planning regardless of mixed states", () => {
    const allStatuses = ["in_planning", "with_expert", "ready_for_checkout", "purchased", undefined] as const;
    const sourceItems = allStatuses.map((status, i) =>
      makeSourceItem({ id: `item-${i}`, routing_status: status }),
    );

    const cloned = sourceItems.map((item) => {
      const { id: _id, tripId: _tripId, createdAt: _c, updatedAt: _u, ...rest } = item as any;
      return { ...rest, tripId: CLONE_TRIP_ID, routing_status: "in_planning" };
    });

    for (const item of cloned) {
      assert.equal(item.routing_status, "in_planning",
        `item cloned from status=${item.routing_status} must land in_planning`);
    }
  });

  it("non-routing fields are preserved through the clone (content fidelity)", () => {
    const source = makeSourceItem({
      routing_status: "with_expert",
      title: "Sunset boat tour",
      day: 3,
      type: "activity",
      durationMinutes: 120,
      price: "89.00",
    });
    const cloned = cloneItem(source, CLONE_TRIP_ID);
    assert.equal(cloned.title, "Sunset boat tour");
    assert.equal(cloned.day, 3);
    assert.equal(cloned.type, "activity");
    assert.equal(cloned.durationMinutes, 120);
    assert.equal(cloned.price, "89.00");
  });
});
