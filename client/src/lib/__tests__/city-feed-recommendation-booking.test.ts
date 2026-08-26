import assert from "node:assert";
import { describe, it } from "node:test";
import { buildCityFeedRecommendationBookingUrl } from "../city-feed-recommendation-booking";

describe("city-feed recommendation booking URLs", () => {
  it("keeps a Mumbai recommendation in Mumbai and retains its neighbourhood", () => {
    const target = new URL(
      buildCityFeedRecommendationBookingUrl(
        { categoryKey: "photographer" },
        "discover_location",
        { city: "Mumbai", neighborhoodId: "bandra-west" },
      ),
      "https://traveloure.test",
    );

    assert.equal(target.pathname, "/services");
    assert.equal(target.searchParams.get("categoryKey"), "photographer");
    assert.equal(target.searchParams.get("upsellSource"), "discover_location");
    assert.equal(target.searchParams.get("location"), "Mumbai");
    assert.equal(target.searchParams.get("neighborhood"), "bandra-west");
    assert.notEqual(target.searchParams.get("location"), "Nagoya");
  });

  it("keeps Kyoto's context independent from every other market", () => {
    const target = new URL(
      buildCityFeedRecommendationBookingUrl(
        { categoryKey: "tour-guide" },
        "discover_location",
        { city: "Kyoto", neighborhoodId: "gion" },
      ),
      "https://traveloure.test",
    );

    assert.equal(target.searchParams.get("location"), "Kyoto");
    assert.equal(target.searchParams.get("neighborhood"), "gion");
    assert.notEqual(target.searchParams.get("location"), "Mumbai");
  });
});