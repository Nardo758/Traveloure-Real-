import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProposalMapModel } from "../proposal-map-model";

describe("proposal comparison map honesty boundary", () => {
  it("renders only stops with complete, valid persisted coordinates", () => {
    const model = buildProposalMapModel([
      { id: "located", dayNumber: 1, name: "Gion", latitude: "35.0037", longitude: "135.7788" },
      { id: "missing-lng", dayNumber: 1, name: "Temple", latitude: "35.01", longitude: null },
      { id: "invalid", dayNumber: 2, name: "Invalid", latitude: 95, longitude: 135 },
      { id: "zero", dayNumber: 3, name: "Prime meridian", latitude: 0, longitude: 0 },
    ]);

    assert.equal(model.total, 4);
    assert.deepEqual(model.located.map((item) => item.id), ["located", "zero"]);
    assert.deepEqual(
      model.located.map(({ lat, lng }) => ({ lat, lng })),
      [{ lat: 35.0037, lng: 135.7788 }, { lat: 0, lng: 0 }],
    );
  });

  it("returns an empty located set instead of inventing a city-center fallback", () => {
    const model = buildProposalMapModel([
      { id: "one", dayNumber: 1, name: "Unlocated stop", latitude: null, longitude: null },
      { id: "two", dayNumber: 2, name: "Text-only stop" },
    ]);

    assert.equal(model.total, 2);
    assert.deepEqual(model.located, []);
  });
});