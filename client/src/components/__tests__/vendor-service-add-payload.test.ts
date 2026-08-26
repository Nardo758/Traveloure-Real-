/**
 * Regression pin — docs/findings/CART_SLIP_DELTA.md, item 2 ("Add to trip" type mismatch).
 *
 * The bug: both the compact and full-density vendor-service cards in city-feed-card.tsx called
 * `onAdd({ type: "service", ... })`. `"service"` is not a member of AddToExperienceDialog's
 * `ExperienceItem["type"]` union (gem | neighborhood | hotel | activity | event | recommendation)
 * and is not in the `/api/cart` `CART_CONTENT_TYPES` allow-list (server/routes.ts, POST /api/cart)
 * — "Add to my trip cart" 400'd outright, and the "add to a specific trip" path landed an
 * uncategorized `itemType: "service"` row via POST /api/trips/:id/itinerary-items (not a member
 * of `itineraryItemTypeEnum`).
 *
 * The fix extracted the payload construction into `buildVendorServiceAddPayload`, shared by both
 * density variants, using `type: "activity"` — the same bucket "recommendation" cards already
 * collapse to in add-to-experience-dialog.tsx, which IS in both the dialog's union and the cart
 * allow-list.
 *
 * Pure function, no DB, no rendering — CI-safe.
 * Run: npx tsx --test client/src/components/__tests__/vendor-service-add-payload.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVendorServiceAddPayload } from "../city-feed-card";

// Mirrors the allow-lists this payload must satisfy on both consuming paths.
const DIALOG_TYPE_UNION = new Set([
  "gem",
  "neighborhood",
  "hotel",
  "activity",
  "event",
  "recommendation",
]);
const CART_CONTENT_TYPES = new Set(["gem", "hotel", "activity", "event", "neighborhood"]);

describe("buildVendorServiceAddPayload", () => {
  const service = {
    id: "svc-123",
    serviceName: "Sunset Boat Tour",
    shortDescription: "A guided sunset cruise.",
  };

  it("never emits the unhandled 'service' type", () => {
    const payload = buildVendorServiceAddPayload(service, "kyoto", "2026-09-01", "imp-1");
    assert.notEqual(payload.type, "service", "the bug: 'service' has no handler anywhere downstream");
  });

  it("emits a type recognized by AddToExperienceDialog's ExperienceItem union", () => {
    const payload = buildVendorServiceAddPayload(service, "kyoto", "2026-09-01", "imp-1");
    assert.ok(
      DIALOG_TYPE_UNION.has(payload.type),
      `type "${payload.type}" is not in the dialog's recognized union`,
    );
  });

  it("emits a type accepted by the /api/cart CART_CONTENT_TYPES allow-list", () => {
    const payload = buildVendorServiceAddPayload(service, "kyoto", "2026-09-01", "imp-1");
    assert.ok(
      CART_CONTENT_TYPES.has(payload.type),
      `type "${payload.type}" would 400 out of POST /api/cart's content-add branch`,
    );
  });

  it("categorizes as 'activity' — the same bucket the dialog gives 'recommendation' cards", () => {
    const payload = buildVendorServiceAddPayload(service, "kyoto", "2026-09-01", "imp-1");
    assert.equal(payload.type, "activity");
  });

  it("carries the service id as sourceContentId (stringified) and preserves title/description", () => {
    const payload = buildVendorServiceAddPayload(service, "kyoto", "2026-09-01", "imp-1");
    assert.equal(payload.sourceContentId, "svc-123");
    assert.equal(payload.title, "Sunset Boat Tour");
    assert.equal(payload.description, "A guided sunset cruise.");
    assert.equal(payload.city, "kyoto");
    assert.equal(payload.scheduledDate, "2026-09-01");
    assert.equal(payload.sourceImpressionId, "imp-1");
  });

  it("handles a numeric id and missing description/name honestly (no fabrication)", () => {
    const payload = buildVendorServiceAddPayload({ id: 42 }, "osaka", null, null);
    assert.equal(payload.sourceContentId, "42");
    assert.equal(payload.title, "");
    assert.equal(payload.description, undefined);
    assert.equal(payload.type, "activity");
  });
});
