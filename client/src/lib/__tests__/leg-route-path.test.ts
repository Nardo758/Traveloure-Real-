/**
 * Slice A1 — the leg review's live hop path, pure rules (ledger `2026-10-05-leg-live-hop-path`).
 *   P1 the polyline decoder reads Google's format and refuses a malformed string (no partial path)
 *   P2 a leg's path mode comes from its stored mode through the ONE mode reading; chauffeured ⇒ DRIVE;
 *      a mode with no road answer draws no path
 *   P3 the server resolver never calls Routes for an unlocated leg (no invented point), asks for the
 *      leg's OWN effective mode, and states every "no" with its reason
 *   P4 the path projection puts the numbered stops on the path's ends inside the box
 *
 * Pure — no DOM, no network. Run: npx tsx --test client/src/lib/__tests__/leg-route-path.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodePolyline, effectiveLegMode, legPathTravelMode } from "@shared/leg-route-path";
import { resolveLegRoutePath } from "../../../../server/services/leg-route-path.service";
import { hopPathPoints } from "../leg-review";

// Google's documented example: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453)
const GOOGLE_EXAMPLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

describe("P1 decodePolyline", () => {
  it("decodes Google's documented example", () => {
    assert.deepEqual(decodePolyline(GOOGLE_EXAMPLE), [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
  it("refuses empty, truncated and out-of-alphabet input", () => {
    assert.equal(decodePolyline(""), null);
    assert.equal(decodePolyline(null), null);
    assert.equal(decodePolyline("_p~iF"), null, "one point is not a path");
    assert.equal(decodePolyline("_p~iF~ps|U_ulL"), null, "a truncated pair");
    assert.equal(decodePolyline("_p~iF~ps|U\u0001\u0001"), null);
  });
});

describe("P2 legPathTravelMode", () => {
  it("maps the stored spellings onto Google's four", () => {
    assert.equal(legPathTravelMode("walking"), "WALK");
    assert.equal(legPathTravelMode("cycling"), "BICYCLE");
    assert.equal(legPathTravelMode("transit"), "TRANSIT");
    assert.equal(legPathTravelMode("driving"), "DRIVE");
    assert.equal(legPathTravelMode("taxi"), "DRIVE");
    assert.equal(legPathTravelMode("private_driver"), "DRIVE");
    assert.equal(legPathTravelMode("chauffeur"), "DRIVE");
  });
  it("draws nothing for a mode with no road answer", () => {
    assert.equal(legPathTravelMode("ferry"), null);
    assert.equal(legPathTravelMode(null), null);
    assert.equal(legPathTravelMode(""), null);
  });
  it("the author's pick wins over the recommendation", () => {
    assert.equal(effectiveLegMode({ userSelectedMode: "walking", recommendedMode: "driving" }), "walking");
    assert.equal(effectiveLegMode({ userSelectedMode: null, recommendedMode: "driving" }), "driving");
  });
});

describe("P3 resolveLegRoutePath", () => {
  const leg = { id: "leg-1", fromLat: 34.967, fromLng: 135.773, toLat: 34.995, toLng: 135.785, recommendedMode: "driving", userSelectedMode: "walking" };
  it("asks Routes for the leg's own mode and returns the shape", async () => {
    const calls: string[] = [];
    const r = await resolveLegRoutePath(leg, async (_o, _d, m) => { calls.push(m); return GOOGLE_EXAMPLE; });
    assert.deepEqual(calls, ["WALK"]);
    assert.deepEqual(r, { available: true, legId: "leg-1", travelMode: "WALK", encodedPolyline: GOOGLE_EXAMPLE, provider: "google_routes" });
  });
  it("an unlocated leg never reaches Routes and is never given a point", async () => {
    let called = false;
    for (const bad of [{ fromLat: null }, { toLng: null }, { fromLat: 0, fromLng: 0 }]) {
      const r = await resolveLegRoutePath({ ...leg, ...bad }, async () => { called = true; return GOOGLE_EXAMPLE; });
      assert.deepEqual(r, { available: false, legId: "leg-1", reason: "missing_coordinates" });
    }
    assert.equal(called, false);
  });
  it("no road mode and no Routes answer are stated, not guessed", async () => {
    assert.deepEqual(await resolveLegRoutePath({ ...leg, userSelectedMode: "ferry" }, async () => GOOGLE_EXAMPLE), { available: false, legId: "leg-1", reason: "no_road_mode" });
    assert.deepEqual(await resolveLegRoutePath(leg, async () => null), { available: false, legId: "leg-1", reason: "routes_unavailable" });
    assert.deepEqual(await resolveLegRoutePath(leg, async () => "_p~iF"), { available: false, legId: "leg-1", reason: "routes_unavailable" });
  });
});

describe("P4 hopPathPoints", () => {
  const from = { lat: 38.5, lng: -120.2 };
  const to = { lat: 43.252, lng: -126.453 };
  it("fits the stops and the path into the box, stops at the ends", () => {
    const p = hopPathPoints(from, to, decodePolyline(GOOGLE_EXAMPLE), 320, 150)!;
    assert.ok(p);
    for (const q of [p.a, p.b, ...p.path]) {
      assert.ok(q.x >= 23.9 && q.x <= 296.1 && q.y >= 23.9 && q.y <= 126.1, JSON.stringify(q));
    }
    assert.deepEqual(p.a, p.path[0]);
    assert.deepEqual(p.b, p.path[p.path.length - 1]);
  });
  it("draws nothing for an unlocated stop or a path under two points", () => {
    assert.equal(hopPathPoints({ lat: null, lng: null }, to, decodePolyline(GOOGLE_EXAMPLE), 320, 150), null);
    assert.equal(hopPathPoints(from, to, null, 320, 150), null);
    assert.equal(hopPathPoints(from, to, [{ lat: 1, lng: 1 }], 320, 150), null);
  });
});
