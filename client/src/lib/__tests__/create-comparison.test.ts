import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCreateComparisonPayload } from "../create-comparison.ts";

const BASE_OPTIONS = {
  destination: "Kyoto, Japan",
  startDate: "2026-10-10",
  endDate: "2026-10-14",
  tripId: "trip-1",
};

describe("buildCreateComparisonPayload — confirmed anchor choice", () => {
  it("forwards a confirmed candidate pin to the create endpoint", () => {
    const payload = buildCreateComparisonPayload({
      ...BASE_OPTIONS,
      optimizationPaymentId: "pi_test_1",
      pinnedAnchor: {
        type: "hotel",
        id: "hotel-1",
        name: "Higashiyama Lantern Hotel",
      },
    });

    assert.deepEqual(payload.pinnedAnchor, {
      type: "hotel",
      id: "hotel-1",
      name: "Higashiyama Lantern Hotel",
    });
    assert.equal(payload.optimizationPaymentId, "pi_test_1");
  });

  it("omits pinnedAnchor for Auto and sends custom locations as type + name only", () => {
    const automatic = buildCreateComparisonPayload(BASE_OPTIONS);
    assert.equal("pinnedAnchor" in automatic, false);

    const custom = buildCreateComparisonPayload({
      ...BASE_OPTIONS,
      pinnedAnchor: { type: "neighborhood", name: "Northern canal district" },
    });
    assert.deepEqual(custom.pinnedAnchor, {
      type: "neighborhood",
      name: "Northern canal district",
    });
    assert.equal("lat" in custom.pinnedAnchor, false);
    assert.equal("lng" in custom.pinnedAnchor, false);
  });
});