/**
 * TC-3b — the trip profile overlay, pure (ledger `2026-10-11-tc3b-ride-recommender`).
 *
 *   OV1 the write body is an allowlist: skippedCorridors and unknown keys are refused; null clears
 *   OV2 the read keeps only well-formed fields — junk is dropped, never coerced
 *   OV3 the trip's statement wins over the account profile and is marked explicit; an unstated field is untouched
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTripProfileOverlay, overlayPatchFromBody, parseTripProfileOverlay, tripProfileOverlayBody } from "../trip-profile-overlay";

test("OV1 the write body is an allowlist; null clears", () => {
  assert.equal(tripProfileOverlayBody.safeParse({ skippedCorridors: ["a>b"] }).success, false);
  assert.equal(tripProfileOverlayBody.safeParse({ dietary: ["vegan"] }).success, false);
  assert.equal(tripProfileOverlayBody.safeParse({ childHeightsCm: [10] }).success, false);
  assert.equal(tripProfileOverlayBody.safeParse({ mobility: "flying" }).success, false);
  const ok = tripProfileOverlayBody.parse({ mobility: "limited", childHeightsCm: [75, 120], pace: null });
  assert.deepEqual(overlayPatchFromBody(ok), { mobility: "limited", childHeightsCm: [75, 120], pace: null });
});

test("OV2 the read keeps only well-formed fields", () => {
  assert.deepEqual(parseTripProfileOverlay(null), {});
  assert.deepEqual(parseTripProfileOverlay({ travelStyles: ["food"] }), {});
  assert.deepEqual(
    parseTripProfileOverlay({ profileOverlay: { mobility: "limited", pace: "warp", scenic: "yes", childHeightsCm: [75, "x", 5], skippedCorridors: ["a>b", 3] } }),
    { mobility: "limited", childHeightsCm: [75], skippedCorridors: ["a>b"] },
  );
});

test("OV3 the trip's statement wins and is marked explicit", () => {
  const account = { pace: "packed" as const, budgetBand: "luxury" as const, mobility: undefined, dietary: [], source: { transportPreference: "none" as const, pace: "explicit" as const, budgetBand: "derived" as const, dietary: "none" as const, mobility: "none" as const } };
  const out = applyTripProfileOverlay(account, { mobility: "wheelchair", pace: "relaxed" });
  assert.equal(out.mobility, "wheelchair");
  assert.equal(out.pace, "relaxed");
  assert.equal(out.budgetBand, "luxury");
  assert.equal(out.source.mobility, "explicit");
  assert.equal(out.source.budgetBand, "derived");
  assert.equal(account.pace, "packed"); // the account profile itself is not touched
  assert.deepEqual(applyTripProfileOverlay(account, {}), account);
});
