import { describe, it, expect } from "vitest";
import {
  hotelRowsToCandidates,
  neighborhoodRowsToCandidates,
  stopsToActivityCandidates,
  rankActivityAnchors,
  pickAutoAnchors,
  buildPinnedCandidateFromCoords,
  type NamedStop,
} from "../anchor-candidates-map";
import { rankAnchors, scoreAnchor } from "../anchor-scoring";

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

describe("anchor-candidates — pickAutoAnchors", () => {
  const ranked = {
    hotel: rankAnchors(
      hotelRowsToCandidates([{ hotelId: "h1", name: "Hotel Kanra", latitude: "35.0016", longitude: "135.7770" }]),
      STOPS,
    ),
    neighborhood: rankAnchors(
      neighborhoodRowsToCandidates([{ slug: "higashiyama", name: "Higashiyama", centroidLat: "35.0000", centroidLng: "135.7800" }]),
      STOPS,
    ),
    activity: rankActivityAnchors(STOPS, 5),
  };

  it("takes one of each type first, so the three versions have different bases", () => {
    const picked = pickAutoAnchors(ranked, 3);
    expect(picked).toHaveLength(3);
    expect(picked.map((p) => p.type)).toEqual(["hotel", "neighborhood", "activity"]);
    // each carries real coordinates for persistence
    expect(picked.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true);
  });

  it("returns fewer than n when inventory is thin — never a fabricated anchor (§13)", () => {
    const thin = { hotel: [], neighborhood: [], activity: rankActivityAnchors(STOPS, 5) };
    const picked = pickAutoAnchors(thin, 3);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(3);
    expect(picked.every((p) => p.type === "activity")).toBe(true);
  });
});

describe("anchor-candidates — buildPinnedCandidateFromCoords (Phase 1c, pure paths)", () => {
  it("resolves an activity pin to the trip's own stop using that stop's real coordinates", () => {
    const c = buildPinnedCandidateFromCoords({ type: "activity", id: "s2" }, STOPS);
    expect(c).not.toBeNull();
    expect(c).toMatchObject({ type: "activity", name: "Kiyomizu-dera" });
    expect(c!.lat).toBeCloseTo(34.9948, 4);
    // scoring against the other stops yields a real median (self is one of the STOPS but the
    // route scores against the full stop list; the point is the pin carries real coordinates)
    const score = scoreAnchor(c!, STOPS);
    expect(score.medianMeters).not.toBeNull();
  });

  it("ignores client coordinates for an activity pin — the stop's own coords win", () => {
    const c = buildPinnedCandidateFromCoords(
      { type: "activity", id: "s1", lat: 0, lng: 0 },
      STOPS,
    );
    expect(c!.lat).toBeCloseTo(35.0037, 4); // Gion's real lat, not the client's 0
    expect(c!.lng).toBeCloseTo(135.7788, 4);
  });

  it("accepts an explicitly placed custom location as the traveler's own coordinates (§22)", () => {
    const c = buildPinnedCandidateFromCoords(
      { type: "neighborhood", name: "My spot", lat: 35.01, lng: 135.77 },
      STOPS,
    );
    expect(c).toMatchObject({ type: "neighborhood", name: "My spot" });
    expect(c!.lat).toBeCloseTo(35.01, 4);
    expect(c!.id).toContain("custom:");
  });

  it("rejects an unresolvable pin — no coords, no matching stop ⇒ null, never fabricated (§13)", () => {
    expect(buildPinnedCandidateFromCoords({ type: "activity", id: "missing" }, STOPS)).toBeNull();
    expect(buildPinnedCandidateFromCoords({ type: "hotel", id: "h-unknown" }, STOPS)).toBeNull();
    // out-of-range coordinates are not a real placement
    expect(
      buildPinnedCandidateFromCoords({ type: "hotel", lat: 999, lng: 999 }, STOPS),
    ).toBeNull();
  });
});
