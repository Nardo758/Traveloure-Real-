/**
 * Held-batch-1 item 22: "Recommended" goes to the STRICT winner by S1's tiebreak
 * (`recommendedVersion`): fewest unlocated stops, then most days closest, then least total.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendedVersion, type BoardStop } from "../version-board";

const s = (id: string, day: number, lat: number | null, lng: number | null): BoardStop => ({ id, name: id, dayNumber: day, lat, lng });
const tight = [s("a1", 1, 35.0, 135.7), s("a2", 1, 35.001, 135.701), s("a3", 2, 35.0, 135.7), s("a4", 2, 35.001, 135.701)];
const loose = [s("b1", 1, 35.0, 135.7), s("b2", 1, 35.05, 135.75), s("b3", 2, 35.0, 135.7), s("b4", 2, 35.05, 135.75)];

test("RV1 the version closest on most days is recommended", () => {
  assert.equal(recommendedVersion([{ id: "A", stops: loose }, { id: "B", stops: tight }]), "B");
});

test("RV2 fewer unlocated stops beats closer days", () => {
  const tightButUnlocated = [...tight, s("a5", 2, null, null)];
  assert.equal(recommendedVersion([{ id: "A", stops: tightButUnlocated }, { id: "B", stops: loose }]), "B");
});

test("RV3 a full tie, one version, or a version with no located stop recommends none", () => {
  assert.equal(recommendedVersion([{ id: "A", stops: tight }, { id: "B", stops: tight }]), null);
  assert.equal(recommendedVersion([{ id: "A", stops: tight }]), null);
  assert.equal(recommendedVersion([{ id: "A", stops: tight }, { id: "B", stops: [s("x", 1, null, null)] }]), null);
});
