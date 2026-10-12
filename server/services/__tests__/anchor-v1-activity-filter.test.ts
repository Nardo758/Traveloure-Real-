/**
 * V-1: which trip stops may be an ACTIVITY anchor.
 *   A dining stop is scored against but never offered — a restaurant is not a place to build days around.
 *   A stop located only by an in-memory Google point (LD 57) is scored against but never an anchor,
 *   whose point is saved on the version.
 */
import { describe, it, expect } from "vitest";
import { rankActivityAnchors, stopsToActivityCandidates, type NamedStop } from "../anchor-candidates-map";

const stops: NamedStop[] = [
  { id: "t", name: "Kiyomizu-dera", lat: 34.9949, lng: 135.785, serviceType: "activity" },
  { id: "d", name: "Pontocho dinner", lat: 35.0046, lng: 135.7708, serviceType: "meal" },
  { id: "r", name: "Ramen", lat: 35.0, lng: 135.77, serviceType: "restaurant" },
  { id: "g", name: "Gion (Google only)", lat: 35.0037, lng: 135.7788, serviceType: "activity", anchorEligible: false },
  { id: "u", name: "Unknown type", lat: 35.01, lng: 135.76 },
];

describe("V-1 activity-anchor filter", () => {
  it("drops dining and Google-only stops from the candidates", () => {
    expect(stopsToActivityCandidates(stops).map((c) => c.id)).toEqual(["t", "u"]);
  });
  it("still scores the remaining candidates against every located stop", () => {
    const ranked = rankActivityAnchors(stops, 5);
    expect(ranked.map((a) => a.name).sort()).toEqual(["Kiyomizu-dera", "Unknown type"]);
    const t = ranked.find((a) => a.name === "Kiyomizu-dera")!;
    expect(t.medianMeters).not.toBeNull();
  });
});
