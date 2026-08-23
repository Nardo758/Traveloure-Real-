import { describe, it, expect } from "vitest";
import {
  hotelRowsToCandidates,
  neighborhoodRowsToCandidates,
  stopsToActivityCandidates,
  rankActivityAnchors,
  type NamedStop,
} from "../anchor-candidates-map";

const STOPS: NamedStop[] = [
  { id: "s1", name: "Gion tea ceremony", lat: 35.0037, lng: 135.7788 },
  { id: "s2", name: "Kiyomizu-dera", lat: 34.9948, lng: 135.7850 },
  { id: "s3", name: "Pontocho supper", lat: 35.0036, lng: 135.7708 },
  { id: "s4", name: "Arashiyama bamboo", lat: 35.0094, lng: 135.6669 }, // far west
];

describe("anchor-candidates — pure mappers", () => {
  it("hotel mapper keeps located rows and drops coordinate-less ones (§13)", () => {
    const c = hotelRowsToCandidates([
      { hotelId: "h1", name: "Hotel Kanra", latitude: "35.0016", longitude: "135.7770" },
      { hotelId: "h2", name: "No Coords Inn", latitude: null, longitude: null },
      { hotelId: "h3", name: "Bad Coords", latitude: "abc", longitude: "135.0" },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: "hotel", name: "Hotel Kanra" });
    expect(c[0].lat).toBeCloseTo(35.0016, 4);
  });

  it("neighborhood mapper reads centroid columns", () => {
    const c = neighborhoodRowsToCandidates([
      { slug: "higashiyama", name: "Higashiyama", centroidLat: "35.0016", centroidLng: "135.7770" },
      { slug: "nowhere", name: "Nowhere", centroidLat: null, centroidLng: "135.0" },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: "neighborhood", name: "Higashiyama" });
  });

  it("activity mapper keeps located stops only", () => {
    const c = stopsToActivityCandidates([
      ...STOPS,
      { id: "s5", name: "Unlocated", lat: null, lng: null },
    ]);
    expect(c).toHaveLength(4);
    expect(c.every((x) => x.type === "activity")).toBe(true);
  });
});

describe("anchor-candidates — activity ranking", () => {
  it("scores each activity against the OTHER stops (self excluded) and ranks central ones first", () => {
    const ranked = rankActivityAnchors(STOPS, 5);
    expect(ranked).toHaveLength(4);
    // the far-west Arashiyama stop should rank LAST (highest median to the others)
    expect(ranked[ranked.length - 1].name).toBe("Arashiyama bamboo");
    // a central old-town stop should rank first
    expect(["Gion tea ceremony", "Pontocho supper", "Kiyomizu-dera"]).toContain(ranked[0].name);
    // every score is against 3 other stops, never itself
    expect(ranked.every((r) => r.locatedStops === 3)).toBe(true);
  });

  it("respects the limit", () => {
    expect(rankActivityAnchors(STOPS, 2)).toHaveLength(2);
  });
});
