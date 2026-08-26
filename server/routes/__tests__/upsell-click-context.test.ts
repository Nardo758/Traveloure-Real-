import assert from "node:assert";
import { describe, it } from "node:test";
import { upsellClickBodySchema } from "../upsell-click-context";

describe("upsell click context", () => {
  it("accepts a city-feed click without a trip while retaining city and neighbourhood", () => {
    const payload = upsellClickBodySchema.parse({
      surface: "discover_location",
      offeringId: "photographer",
      city: "Mumbai",
      neighborhoodId: "bandra-west",
    });

    assert.equal(payload.tripId, undefined);
    assert.equal(payload.city, "Mumbai");
    assert.equal(payload.neighborhoodId, "bandra-west");
  });

  it("continues to accept trip-scoped clicks", () => {
    const payload = upsellClickBodySchema.parse({
      surface: "cart",
      offeringId: "airport-transfer",
      tripId: "trip-123",
    });

    assert.equal(payload.tripId, "trip-123");
  });

  it("rejects clicks that have neither trip nor market context", () => {
    assert.throws(
      () => upsellClickBodySchema.parse({ surface: "discover_location", offeringId: "photographer" }),
      /tripId or city is required/,
    );
  });
});