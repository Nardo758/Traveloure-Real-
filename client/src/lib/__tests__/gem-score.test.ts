import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeGemScore } from "../gem-score";

describe("normalizeGemScore", () => {
  it("keeps a real score on the 0–100 scale as an integer", () => {
    assert.equal(normalizeGemScore(85), 85);
    assert.equal(normalizeGemScore(85.4), 85);
  });

  it("treats the unscored zero default as absent", () => {
    assert.equal(normalizeGemScore(0), null);
    assert.equal(normalizeGemScore("0"), null);
  });

  it("treats missing and invalid values as absent", () => {
    assert.equal(normalizeGemScore(null), null);
    assert.equal(normalizeGemScore(undefined), null);
    assert.equal(normalizeGemScore("not-a-score"), null);
  });
});