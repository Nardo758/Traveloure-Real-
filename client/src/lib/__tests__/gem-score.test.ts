import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeGemScore, gemScoreMetaFragment } from "../gem-score";

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

describe("gemScoreMetaFragment (§5 label-with-value)", () => {
  it("always carries the 'gem score' label alongside the value", () => {
    assert.equal(gemScoreMetaFragment(85), "gem score 85");
    assert.equal(gemScoreMetaFragment(85.4), "gem score 85");
  });

  it("omits the fragment entirely — never a bare label or bare number — on zero/null/invalid", () => {
    assert.equal(gemScoreMetaFragment(0), null);
    assert.equal(gemScoreMetaFragment("0"), null);
    assert.equal(gemScoreMetaFragment(null), null);
    assert.equal(gemScoreMetaFragment(undefined), null);
    assert.equal(gemScoreMetaFragment("not-a-score"), null);
  });
});