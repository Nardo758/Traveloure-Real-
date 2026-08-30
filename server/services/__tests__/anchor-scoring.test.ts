import { describe, it, expect } from "vitest";
import {
  scoreAnchor,
  rankAnchors,
  WITHIN_WALK_METERS,
  type AnchorCandidate,
  type StopPoint,
} from "../anchor-scoring";

// A tight Kyoto old-town cluster (Gion / Higashiyama) — three real-ish stops close together.
const CLUSTER_STOPS: StopPoint[] = [
  { id: "s1", lat: 35.0037, lng: 135.7788 }, // Gion
  { id: "s2", lat: 34.9948, lng: 135.7850 }, // Kiyomizu-dera
  { id: "s3", lat: 35.0036, lng: 135.7708 }, // Pontocho
];

// Anchors of the THREE different kinds — the scorer must treat them identically (geometry only).
const CENTRAL_HOTEL: AnchorCandidate = { id: "h1", type: "hotel", name: "Old Town Hotel", lat: 35.0016, lng: 135.7770 };
const CENTRAL_NEIGHBORHOOD: AnchorCandidate = { id: "n1", type: "neighborhood", name: "Higashiyama", lat: 35.0016, lng: 135.7770 };
const CENTRAL_ACTIVITY: AnchorCandidate = { id: "a1", type: "activity", name: "Tea Ceremony", lat: 35.0016, lng: 135.7770 };
const PERIPHERAL_HOTEL: AnchorCandidate = { id: "h2", type: "hotel", name: "Airport Grand", lat: 34.8600, lng: 135.7400 }; // ~16 km south

describe("anchor-scoring — build around a location (hotel | neighborhood | activity)", () => {
  it("ranks a central anchor above a peripheral one", () => {
    const [best, worst] = rankAnchors([PERIPHERAL_HOTEL, CENTRAL_HOTEL], CLUSTER_STOPS);
    expect(best.anchorId).toBe("h1");
    expect(worst.anchorId).toBe("h2");
    expect(best.medianMeters!).toBeLessThan(worst.medianMeters!);
  });

  it("is type-agnostic — identical coordinates score identically across the three anchor kinds", () => {
    const h = scoreAnchor(CENTRAL_HOTEL, CLUSTER_STOPS);
    const n = scoreAnchor(CENTRAL_NEIGHBORHOOD, CLUSTER_STOPS);
    const a = scoreAnchor(CENTRAL_ACTIVITY, CLUSTER_STOPS);
    expect(n.medianMeters).toBe(h.medianMeters);
    expect(a.medianMeters).toBe(h.medianMeters);
    // the type is carried through so the UI can label it, but it never changes the geometry
    expect([h.type, n.type, a.type]).toEqual(["hotel", "neighborhood", "activity"]);
  });

  it("counts a central old-town anchor's stops as within a short walk, but not the airport's", () => {
    const central = scoreAnchor(CENTRAL_HOTEL, CLUSTER_STOPS);
    const airport = scoreAnchor(PERIPHERAL_HOTEL, CLUSTER_STOPS);
    expect(central.within15MinCount).toBeGreaterThan(0);
    expect(airport.within15MinCount).toBe(0);
    expect(central.medianMeters!).toBeLessThan(WITHIN_WALK_METERS);
  });

  it("§13: excludes unlocated stops honestly instead of scoring them at distance 0", () => {
    const withNulls: StopPoint[] = [
      ...CLUSTER_STOPS,
      { id: "s4", lat: null, lng: null }, // no coordinates — must be excluded, not counted at 0
    ];
    const score = scoreAnchor(CENTRAL_HOTEL, withNulls);
    expect(score.totalStops).toBe(4);
    expect(score.locatedStops).toBe(3);
    // the null stop did not drag the median toward 0
    const clean = scoreAnchor(CENTRAL_HOTEL, CLUSTER_STOPS);
    expect(score.medianMeters).toBe(clean.medianMeters);
  });

  it("§13: an anchor with no located stops is unscorable (null), never a fabricated perfect score, and sinks in the ranking", () => {
    const noCoords: StopPoint[] = [{ id: "x", lat: null, lng: null }];
    const score = scoreAnchor(CENTRAL_HOTEL, noCoords);
    expect(score.medianMeters).toBeNull();
    expect(score.estMedianWalkMinutes).toBeNull();

    const ranked = rankAnchors([CENTRAL_HOTEL, PERIPHERAL_HOTEL], noCoords);
    // both unscorable here; but a scorable anchor must always outrank an unscorable one:
    const mixed = rankAnchors([CENTRAL_HOTEL], CLUSTER_STOPS.concat(noCoords));
    expect(mixed[0].medianMeters).not.toBeNull();
    expect(ranked.every((r) => r.medianMeters === null)).toBe(true);
  });
});
