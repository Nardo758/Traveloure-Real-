/**
 * DISCOVER ADD-TO-PLAN carries the affiliate product id when Discover has one.
 * Ledger `2026-09-18-add-to-plan-lossless`.
 *
 * The column (`itinerary_items.affiliate_product_id`) and the server-side admission
 * (`itineraryItemAffiliateLinkSchema` + `resolveItemAffiliateLink`) already existed; what was
 * missing was the CLIENT actually sending the id. This pins the one thing a client-side test can
 * prove without a server: the BODY `curated-content-section.tsx`'s add mutation sends.
 *
 * Run: npx tsx --test client/src/lib/__tests__/discover-add-body.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDiscoverAddBody, type DiscoverAddSourceItem } from "../discover-add-body";

function item(overrides: Partial<DiscoverAddSourceItem> = {}): DiscoverAddSourceItem {
  return {
    title: "Fushimi Inari night walk",
    description: "A guided evening walk through the gates.",
    contentCategory: "experience",
    price: "45.00",
    source: "Viator",
    tracking: { productId: null },
    ...overrides,
  };
}

test("carries affiliateProductId when tracking has one", () => {
  const body = buildDiscoverAddBody(item({ tracking: { productId: "prod-123" } }), "trip-1");
  assert.equal(body.affiliateProductId, "prod-123");
});

test("omits affiliateProductId entirely when tracking.productId is null", () => {
  const body = buildDiscoverAddBody(item({ tracking: { productId: null } }), "trip-1");
  assert.equal("affiliateProductId" in body, false, "the key must be ABSENT, not null or empty");
});

test("omits affiliateProductId when tracking.productId is an empty string", () => {
  const body = buildDiscoverAddBody(item({ tracking: { productId: "" } }), "trip-1");
  assert.equal("affiliateProductId" in body, false);
});

test("never includes an affiliate URL — §16, partner URLs stay server-side", () => {
  const body = buildDiscoverAddBody(item({ tracking: { productId: "prod-123" } }), "trip-1");
  assert.equal("affiliateUrl" in body, false);
  assert.equal("affiliate_url" in body, false);
});

test("the rest of the body is unchanged by this lane", () => {
  const body = buildDiscoverAddBody(item(), "trip-1");
  assert.equal(body.title, "Fushimi Inari night walk");
  assert.equal(body.description, "A guided evening walk through the gates.");
  assert.equal(body.itemType, "experience");
  assert.equal(body.dayNumber, 1);
  assert.equal(body.status, "planned");
  assert.equal(body.estimatedCost, "45.00");
  assert.equal(body.currency, "USD");
  assert.equal(body.notes, "Source: Viator");
});

test("a missing description falls back to an empty string, a missing price to null", () => {
  const body = buildDiscoverAddBody(item({ description: null, price: null }), "trip-1");
  assert.equal(body.description, "");
  assert.equal(body.estimatedCost, null);
});
