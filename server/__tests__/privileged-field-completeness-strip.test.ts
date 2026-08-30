/**
 * §19 "close the class" — scripts/check-privileged-field-completeness.cjs (2026-08-29-
 * privileged-field-completeness) found two real, previously-unclassified privileged-column holes
 * on the mass-assignment surface. This file pins both fixes:
 *
 * 1. `provider_services` approval-lifecycle family (`approvalStatus`, `submittedAt`, `reviewedAt`,
 *    `reviewedBy`, `rejectionReason`) — `approvalStatus` already had a full layer-2 strip on both
 *    create (`createProviderService`'s born-state clamp) and update (`updateProviderService`'s
 *    destructure, case C16b) but NO layer-1 schema omit; the other four had NO strip at all on the
 *    CREATE path, so a client POST could self-attribute a fabricated "reviewed by ___" onto their
 *    own brand-new submitted listing. Layer 1 (schema `.omit()`) is proven directly below —
 *    pure zod parse, no DB required.
 *
 * 2. `itinerary_items.routingStatus` / `bookingId` — the checkout-claim machine's own money-
 *    lifecycle state (routingStatus flips to 'purchased' with bookingId stamped, ONLY via the
 *    dedicated item-routing service, never via the generic create/update paths). Found unstripped
 *    on both `insertItineraryItemSchema` create call sites AND on the canonical PATCH route, which
 *    bypasses the schema entirely via a raw `req.body` destructure — so a traveler/expert with
 *    ordinary write access to their OWN trip could forge `routingStatus: "purchased"` plus an
 *    arbitrary `bookingId` on any item. Layer 1 (schema omit) and layer 2
 *    (`stripItineraryItemRoutingFields`, the function the PATCH route's `updateItineraryItem` call
 *    actually depends on since it never goes through the schema) are both proven below.
 *
 * Pure zod parse + a pure object-transform helper — no DB/network required. Run with:
 *   npx tsx --test server/__tests__/privileged-field-completeness-strip.test.ts
 *
 * A companion `.db.test.ts` exercising the real create/update DB round-trip is intentionally NOT
 * added here: this container has no reachable Postgres, matching the honest-gap precedent set by
 * expert-form-verification-strip.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// storage.ts imports `./db`, which throws at import time without DATABASE_URL. No query in this
// file ever runs, so a syntactically-valid placeholder is enough — same technique
// expert-form-verification-strip.test.ts uses to import storage/db without a live Postgres.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";

const { insertProviderServiceSchema, insertItineraryItemSchema } = await import("@shared/schema");
const { stripItineraryItemRoutingFields } = await import("../storage");

describe("insertProviderServiceSchema — approval-lifecycle family is stripped (layer 1)", () => {
  const minimalService = {
    serviceName: "Kyoto Tea Ceremony",
    price: "50.00",
    deliveryMethod: "in_person" as const,
  };
  const forgedApproval = {
    approvalStatus: "approved",
    submittedAt: new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
    reviewedBy: "attacker-controlled-user-id",
    rejectionReason: "forged: never actually rejected",
  };

  it("drops approvalStatus/submittedAt/reviewedAt/reviewedBy/rejectionReason even when the body carries them", () => {
    const parsed = insertProviderServiceSchema.parse({
      ...minimalService,
      ...forgedApproval,
    }) as Record<string, unknown>;
    assert.equal("approvalStatus" in parsed, false);
    assert.equal("submittedAt" in parsed, false);
    assert.equal("reviewedAt" in parsed, false);
    assert.equal("reviewedBy" in parsed, false);
    assert.equal("rejectionReason" in parsed, false);
  });

  it("still accepts and preserves ordinary listing content alongside the stripped fields", () => {
    const parsed = insertProviderServiceSchema.parse({
      ...minimalService,
      ...forgedApproval,
    }) as Record<string, unknown>;
    assert.equal(parsed.serviceName, "Kyoto Tea Ceremony");
    assert.equal(parsed.deliveryMethod, "in_person");
  });

  it("also strips on the PATCH shape (.partial())", () => {
    const parsed = insertProviderServiceSchema.partial().parse({
      approvalStatus: "approved",
      reviewedBy: "attacker-controlled-user-id",
    }) as Record<string, unknown>;
    assert.equal("approvalStatus" in parsed, false);
    assert.equal("reviewedBy" in parsed, false);
  });
});

describe("insertItineraryItemSchema — routingStatus/bookingId are stripped (layer 1)", () => {
  const minimalItem = {
    tripId: "trip-1",
    title: "Fushimi Inari walk",
    dayNumber: 1,
  };

  it("drops routingStatus/bookingId even when the body carries a forged purchase", () => {
    const parsed = insertItineraryItemSchema.parse({
      ...minimalItem,
      routingStatus: "purchased",
      bookingId: "someone-elses-booking-id",
    }) as Record<string, unknown>;
    assert.equal("routingStatus" in parsed, false);
    assert.equal("bookingId" in parsed, false);
  });

  it("still accepts and preserves ordinary item content, including bookingStatus (deliberately not stripped)", () => {
    const parsed = insertItineraryItemSchema.parse({
      ...minimalItem,
      routingStatus: "purchased",
      bookingId: "someone-elses-booking-id",
      bookingStatus: "confirmed",
    }) as Record<string, unknown>;
    assert.equal(parsed.title, "Fushimi Inari walk");
    assert.equal(parsed.bookingStatus, "confirmed");
  });
});

describe("stripItineraryItemRoutingFields — layer 2 storage backstop", () => {
  it("strips routingStatus and bookingId from an arbitrary object", () => {
    const dirty = {
      tripId: "trip-1",
      title: "Forged purchase",
      routingStatus: "purchased",
      bookingId: "someone-elses-booking-id",
    };
    const clean = stripItineraryItemRoutingFields(dirty);
    assert.deepEqual(clean, { tripId: "trip-1", title: "Forged purchase" });
  });

  it("is a no-op (drops nothing extra) on an object that never had the fields", () => {
    const input = { tripId: "trip-1", title: "Ordinary item" };
    const clean = stripItineraryItemRoutingFields(input);
    assert.deepEqual(clean, input);
  });

  it("this is the strip the canonical PATCH route actually depends on — it bypasses the schema", () => {
    // PATCH /api/trips/:tripId/itinerary-items/:itemId (trips.routes.ts) destructures req.body
    // directly (id/tripId/createdAt/updatedAt/suggestedBy/origin only) and calls
    // storage.updateItineraryItem(itemId, safeBody) — insertItineraryItemSchema is NEVER parsed
    // on that route, so layer 1 gives it zero protection. Simulating that exact raw-body shape:
    const rawPatchBody: Record<string, unknown> = {
      title: "Renamed by owner",
      routingStatus: "purchased",
      bookingId: "someone-elses-booking-id",
    };
    const clean = stripItineraryItemRoutingFields(rawPatchBody);
    assert.equal("routingStatus" in clean, false);
    assert.equal("bookingId" in clean, false);
    assert.equal(clean.title, "Renamed by owner");
  });
});
