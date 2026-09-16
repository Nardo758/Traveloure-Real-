import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectMomentPhotos } from "../landing-moments";

const expertPhoto = {
  url: "https://example.test/expert.jpg",
  place: "A city photo",
  source: "expert" as const,
  handle: "local-expert",
};

describe("landing Moment photo selection", () => {
  it("keeps the approved representative image for curated wedding, proposal, golf, and girls-trip Moments", () => {
    for (const key of ["wedding", "proposal", "golf", "girls_trip"]) {
      const selected = selectMomentPhotos(key, [expertPhoto]);
      assert.equal(selected.photos[0]?.source, "representative", key);
      assert.notEqual(selected.photos[0]?.url, expertPhoto.url, key);
      assert.equal(selected.builder, null, key);
    }
  });

  it("keeps expert attribution for an unpinned Moment when a city photo exists", () => {
    const selected = selectMomentPhotos("anniversary", [expertPhoto], { handle: "local-expert", reviews: 4 });
    assert.deepEqual(selected.photos, [expertPhoto]);
    assert.deepEqual(selected.builder, { handle: "local-expert", reviews: 4 });
  });

  it("falls back to the configured representative image when no expert photo exists", () => {
    const selected = selectMomentPhotos("girls_trip", []);
    assert.equal(selected.photos[0]?.url, "/images/moments/cartagena-girls-trip.jpg");
  });
});