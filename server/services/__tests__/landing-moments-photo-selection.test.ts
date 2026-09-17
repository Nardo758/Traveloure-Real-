import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectMomentPhotos } from "../landing-moments";

const expertPhoto = {
  url: "https://example.test/expert.jpg",
  place: "A city photo",
  source: "expert" as const,
  handle: "local-expert",
  momentKey: "anniversary",
};

describe("landing Moment photo selection", () => {
  it("keeps the approved representative image when expert media has no matching Moment association", () => {
    for (const key of ["wedding", "proposal", "golf", "girls_trip"]) {
      const selected = selectMomentPhotos(key, [expertPhoto]);
      assert.equal(selected.photos[0]?.source, "representative", key);
      assert.notEqual(selected.photos[0]?.url, expertPhoto.url, key);
      assert.equal(selected.builder, null, key);
    }
  });

  it("keeps the wedding and honeymoon photo assignments intentionally swapped", () => {
    assert.equal(selectMomentPhotos("wedding", []).photos[0]?.url, "/images/moments/goa-honeymoon.jpg");
    assert.equal(selectMomentPhotos("honeymoon", []).photos[0]?.url, "/images/moments/kyoto-wedding.jpg");
  });

  it("uses the proposal-specific night image for the Proposal Moment", () => {
    const selected = selectMomentPhotos("proposal", []);
    assert.equal(selected.photos[0]?.url, "/images/moments/proposal-after-dark.jpg");
    assert.equal(selected.photos[0]?.place, "A proposal after dark");
    assert.equal(selected.photos[0]?.credit, "Elist Nguyen");
  });

  it("keeps expert attribution when the photo association matches the Moment", () => {
    const selected = selectMomentPhotos("anniversary", [expertPhoto], { handle: "local-expert", reviews: 4 });
    assert.deepEqual(selected.photos, [expertPhoto]);
    assert.deepEqual(selected.builder, { handle: "local-expert", reviews: 4 });
  });

  it("keeps two Moments in the same city from receiving each other's expert photos", () => {
    const weddingPhoto = {
      ...expertPhoto,
      url: "https://example.test/kyoto-wedding.jpg",
      place: "A Kyoto wedding",
      momentKey: "wedding",
    };
    const proposalPhoto = {
      ...expertPhoto,
      url: "https://example.test/kyoto-proposal.jpg",
      place: "A Kyoto proposal",
      momentKey: "proposal",
    };
    const sameCityPhotos = [weddingPhoto, proposalPhoto];

    assert.deepEqual(selectMomentPhotos("wedding", sameCityPhotos).photos, [weddingPhoto]);
    assert.deepEqual(selectMomentPhotos("proposal", sameCityPhotos).photos, [proposalPhoto]);
  });

  it("falls back to the configured representative image when no expert photo exists", () => {
    const selected = selectMomentPhotos("girls_trip", []);
    assert.equal(selected.photos[0]?.url, "/images/moments/cartagena-girls-trip.jpg");
  });
});