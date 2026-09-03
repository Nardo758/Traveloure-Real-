/**
 * `travelersForSave` — UNTOUCHED MEANS NOT SET.
 *
 * Migration 241 de-masked party size so an uncaptured count stays NULL: an honest "not captured"
 * the demand rollup can tell apart from a real answer (§13). `EditTripPanel` put the mask back one
 * layer up — it seeded its travelers input with a literal `2` and wrote `travelers` on EVERY save,
 * so a traveler who opened the panel to fix a title left with a fabricated party of two. This is
 * the pure normalizer that fix turns on, pinned here so the default can never creep back in.
 *
 * The one thing every case below asserts: the ONLY way to get a number out is to have put one in.
 *
 * Run: npx tsx --test client/src/lib/__tests__/travelers-de-mask.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { travelersForSave } from "../plan-vocabulary";

describe("travelersForSave", () => {
  it("returns undefined for an untouched (empty) input — never a default of 2", () => {
    assert.equal(travelersForSave(""), undefined);
    assert.equal(travelersForSave("   "), undefined);
    assert.equal(travelersForSave(undefined), undefined);
    assert.equal(travelersForSave(null), undefined);
  });

  it("returns undefined for zero and for negatives — a party of nobody is not an answer", () => {
    assert.equal(travelersForSave("0"), undefined);
    assert.equal(travelersForSave(0), undefined);
    assert.equal(travelersForSave("-3"), undefined);
    assert.equal(travelersForSave(-3), undefined);
  });

  it("returns undefined for anything unparseable — never a silent fallback number", () => {
    assert.equal(travelersForSave("abc"), undefined);
    assert.equal(travelersForSave(Number.NaN), undefined);
    assert.equal(travelersForSave(Number.POSITIVE_INFINITY), undefined);
  });

  it("returns the stated count for a real answer, from a string or a number", () => {
    assert.equal(travelersForSave("3"), 3);
    assert.equal(travelersForSave(3), 3);
    assert.equal(travelersForSave(" 12 "), 12);
    assert.equal(travelersForSave(1), 1);
  });

  it("floors a fractional entry rather than rejecting it — 2.7 travelers is 2 people", () => {
    assert.equal(travelersForSave("2.7"), 2);
    // …but a fraction BELOW one is still nobody, not a rounded-up guess.
    assert.equal(travelersForSave("0.4"), undefined);
  });
});
