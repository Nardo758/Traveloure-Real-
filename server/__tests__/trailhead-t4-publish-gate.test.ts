/**
 * Operation Trailhead LANE T4 — publish gate + read filter (DB-FREE unit proofs).
 *
 * Proves the single-source predicates in shared/discover-stub.ts that the admin
 * publish route and the discover read-path both honor:
 *   - a born-hidden stub does NOT pass the discover filter,
 *   - flipping discover_page_visible true makes it pass,
 *   - only a REVIEWED (expert-visible, unpublished, not rejected) stub is
 *     eligible to publish,
 *   - the inventory-class vocabulary is closed and defaults to 'external',
 *   - the render-time trend headline is honest and never fabricated.
 *
 * DB-touching behavior (the atomic conditional flip on the real row) is proven by
 * the Replit walkthrough (docs/findings/trailhead-t4-walkthrough.md), not here —
 * this session has no DATABASE_URL.
 *
 * Run with:  npx tsx --test server/__tests__/trailhead-t4-publish-gate.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  INVENTORY_CLASSES,
  DEFAULT_INVENTORY_CLASS,
  isValidInventoryClass,
  normalizeInventoryClass,
  passesDiscoverFilter,
  canPublishToDiscover,
  buildTrendContext,
} from "../../shared/discover-stub";

// A freshly-ingested, born-hidden scraped stub.
function bornHiddenStub() {
  return {
    expertWorkspaceVisible: false,
    discoverPageVisible: false,
    status: "pending_expert_review",
  };
}

describe("T4 discover read filter", () => {
  it("born-hidden stub does NOT pass the discover filter", () => {
    assert.equal(passesDiscoverFilter(bornHiddenStub()), false);
  });

  it("a stub reviewed into the library but not yet published is still hidden", () => {
    const reviewed = { ...bornHiddenStub(), expertWorkspaceVisible: true };
    assert.equal(passesDiscoverFilter(reviewed), false);
  });

  it("flipping discover_page_visible=true makes the stub pass the filter", () => {
    const published = { discoverPageVisible: true, status: "pending_expert_review" };
    assert.equal(passesDiscoverFilter(published), true);
  });

  it("a rejected/quarantined row never passes even if the flag is stale-true", () => {
    assert.equal(passesDiscoverFilter({ discoverPageVisible: true, status: "rejected" }), false);
    assert.equal(passesDiscoverFilter({ discoverPageVisible: true, status: "quarantined" }), false);
  });
});

describe("T4 publish eligibility (canPublishToDiscover)", () => {
  it("born-hidden (not yet reviewed) stub is NOT publishable", () => {
    assert.equal(canPublishToDiscover(bornHiddenStub()), false);
  });

  it("a reviewed, unpublished, non-rejected stub IS publishable", () => {
    const reviewed = { expertWorkspaceVisible: true, discoverPageVisible: false, status: "pending_expert_review" };
    assert.equal(canPublishToDiscover(reviewed), true);
  });

  it("an already-published stub is NOT re-publishable (idempotent flip target)", () => {
    const published = { expertWorkspaceVisible: true, discoverPageVisible: true, status: "pending_expert_review" };
    assert.equal(canPublishToDiscover(published), false);
  });

  it("a rejected stub is never publishable even if expert-visible", () => {
    const rejected = { expertWorkspaceVisible: true, discoverPageVisible: false, status: "rejected" };
    assert.equal(canPublishToDiscover(rejected), false);
  });
});

describe("T4 hidden-default → flip → visible (end-to-end predicate walk)", () => {
  it("models the admin ladder: ingest hidden, review, publish, render", () => {
    // 1. Born hidden — invisible to travelers, not yet publishable.
    let row = bornHiddenStub();
    assert.equal(passesDiscoverFilter(row), false);
    assert.equal(canPublishToDiscover(row), false);

    // 2. Admin intake approve → expert_workspace_visible=true. Now publishable, still hidden.
    row = { ...row, expertWorkspaceVisible: true };
    assert.equal(canPublishToDiscover(row), true);
    assert.equal(passesDiscoverFilter(row), false);

    // 3. Admin publish → discover_page_visible=true. Now the row passes the discover filter.
    row = { ...row, discoverPageVisible: true };
    assert.equal(passesDiscoverFilter(row), true);
    // …and is no longer eligible for a second flip.
    assert.equal(canPublishToDiscover(row), false);
  });
});

describe("T4 inventory-class vocabulary", () => {
  it("is a closed set of three, defaulting to external", () => {
    assert.deepEqual([...INVENTORY_CLASSES], ["external", "provider", "affiliate"]);
    assert.equal(DEFAULT_INVENTORY_CLASS, "external");
  });

  it("validates and normalizes unknown values to external", () => {
    assert.equal(isValidInventoryClass("external"), true);
    assert.equal(isValidInventoryClass("provider"), true);
    assert.equal(isValidInventoryClass("bogus"), false);
    assert.equal(normalizeInventoryClass("bogus"), "external");
    assert.equal(normalizeInventoryClass(null), "external");
    assert.equal(normalizeInventoryClass("affiliate"), "affiliate");
  });
});

describe("T4.4 render-time trend headline (never stored)", () => {
  it("emits the market+event ceiling only when both signals are present", () => {
    assert.equal(
      buildTrendContext({ marketTrending: true, marketName: "Kyoto", imminentEventName: "Gion Matsuri" }),
      "Kyoto is trending · Gion Matsuri approaching",
    );
  });

  it("degrades honestly — trending-only, event-only, or nothing", () => {
    assert.equal(buildTrendContext({ marketTrending: true, marketName: "Kyoto", imminentEventName: null }), "Kyoto is trending");
    assert.equal(buildTrendContext({ marketTrending: false, marketName: "Kyoto", imminentEventName: "Gion Matsuri" }), "Gion Matsuri approaching");
    assert.equal(buildTrendContext({ marketTrending: false, marketName: "Kyoto", imminentEventName: null }), null);
  });
});
