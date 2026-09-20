import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ROTATION_INTERVAL_MS,
  nextRotationIndex,
  shouldAdvanceRotation,
} from "../use-rotation";

describe("shared rotation policy", () => {
  it("uses the ruled eight-second cadence and wraps multiple items", () => {
    assert.equal(ROTATION_INTERVAL_MS, 8000);
    assert.equal(nextRotationIndex(0, 3), 1);
    assert.equal(nextRotationIndex(2, 3), 0);
  });

  it("holds one item and pauses for hover/focus or reduced motion", () => {
    assert.equal(shouldAdvanceRotation(1, false, false), false);
    assert.equal(shouldAdvanceRotation(3, true, false), false);
    assert.equal(shouldAdvanceRotation(3, false, true), false);
    assert.equal(shouldAdvanceRotation(3, false, false), true);
  });
});