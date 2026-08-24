/**
 * Operation Trailhead LANE T3.2 — provider-matcher unit proofs (DB-free, no network).
 *
 * Proves the three-hard-gate matcher (R-T3-b: name AND geo AND category, all three) behaves
 * conservatively — a missed match that stays 'external' is always preferred to a wrong match that
 * mis-books a traveler. No DATABASE_URL is needed: provider rows are passed in.
 *
 * Run with:  npx tsx --test server/__tests__/trailhead-t3-provider-matcher.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  matchStubToProvider,
  nameSimilarity,
  type StubMatchInput,
  type ProviderServiceCandidate,
} from "../services/stub-provider-matcher";
import { PROVIDER_MATCH_MIN_NAME_SIMILARITY, PROVIDER_MATCH_MAX_KM } from "../config/trailhead.config";

// A Kyoto tea-ceremony stub, located near Gion.
const teaStub: StubMatchInput = {
  id: "stub-tea",
  name: "Camellia Tea Ceremony Kyoto",
  contentType: "attraction", // tour_guide / activity_provider crosswalk to 'attraction'
  latitude: "35.003500",
  longitude: "135.778000",
};

// An approved provider service for the same operator, same pin, activity_provider → attraction.
function teaProvider(overrides: Partial<ProviderServiceCandidate> = {}): ProviderServiceCandidate {
  return {
    id: "svc-tea",
    serviceName: "Camellia Kyoto Tea Ceremony",
    latitude: "35.003520",
    longitude: "135.778050",
    categoryKey: "activity_provider", // crosswalks to 'attraction'
    approvalStatus: "approved",
    ...overrides,
  };
}

describe("T3.2 provider matcher — the three hard gates", () => {
  it("exact-match hit: same name/geo/category resolves to the provider with high confidence", () => {
    const m = matchStubToProvider(teaStub, [teaProvider()]);
    assert.ok(m, "expected a match");
    assert.equal(m!.serviceId, "svc-tea");
    assert.ok(m!.confidence >= 0.9, `expected high confidence, got ${m!.confidence}`);
    assert.equal(m!.evidence.stubContentType, "attraction");
    assert.equal(m!.evidence.crosswalkContentType, "attraction");
    assert.ok(m!.evidence.distanceKm <= PROVIDER_MATCH_MAX_KM);
    assert.ok(m!.evidence.nameSimilarity >= PROVIDER_MATCH_MIN_NAME_SIMILARITY);
  });

  it("same-name-different-neighborhood MISS: name+category agree but geo is out of range ⇒ null", () => {
    // Same operator name and category, but the pin is ~5 km away (a different neighborhood). Geo is a
    // required leg, so this stays external rather than book the wrong venue.
    const farProvider = teaProvider({ latitude: "35.045000", longitude: "135.760000" });
    const m = matchStubToProvider(teaStub, [farProvider]);
    assert.equal(m, null);
  });

  it("category-mismatch MISS: name+geo agree but the crosswalk disagrees with the stub content type ⇒ null", () => {
    // A dining_venue (→ 'restaurant') can never satisfy an 'attraction' stub, even at the same pin
    // with an identical name.
    const wrongCat = teaProvider({ categoryKey: "dining_venue" });
    const m = matchStubToProvider(teaStub, [wrongCat]);
    assert.equal(m, null);
  });

  it("category SERVICE_ONLY/AFFILIATE_RUNG target never agrees (florist → service_only) ⇒ null", () => {
    const florist = teaProvider({ categoryKey: "florist" });
    assert.equal(matchStubToProvider(teaStub, [florist]), null);
  });

  it("unapproved listing is not a valid provider target (R-T3-a) ⇒ null even on a perfect match", () => {
    const draft = teaProvider({ approvalStatus: "submitted" });
    assert.equal(matchStubToProvider(teaStub, [draft]), null);
  });

  it("unlocated stub or unlocated candidate can never resolve to a provider ⇒ null", () => {
    assert.equal(matchStubToProvider({ ...teaStub, latitude: null, longitude: null }, [teaProvider()]), null);
    assert.equal(matchStubToProvider(teaStub, [teaProvider({ latitude: null, longitude: null })]), null);
  });

  it("name threshold boundary: a shared-token coincidence below the threshold ⇒ null", () => {
    // "Fushimi Inari Shrine" vs "Fushimi Inari Taisha" — 2 shared of 4 union tokens = 0.5 similarity,
    // below the 0.72 gate. Same pin, same category. Must NOT match (the wrong-venue guard).
    const shrineStub: StubMatchInput = {
      id: "stub-shrine",
      name: "Fushimi Inari Shrine",
      contentType: "attraction",
      latitude: "34.967100",
      longitude: "135.772700",
    };
    const taisha = teaProvider({
      id: "svc-taisha",
      serviceName: "Fushimi Inari Taisha",
      latitude: "34.967120",
      longitude: "135.772710",
      categoryKey: "tour_guide", // → attraction
    });
    assert.equal(nameSimilarity(shrineStub.name, taisha.serviceName), 0.5);
    assert.ok(0.5 < PROVIDER_MATCH_MIN_NAME_SIMILARITY);
    assert.equal(matchStubToProvider(shrineStub, [taisha]), null);
  });

  it("name threshold boundary: a token reordering above the threshold ⇒ hit", () => {
    // "Camellia Tea Ceremony Kyoto" vs "Camellia Kyoto Tea Ceremony" — identical token sets = 1.0.
    assert.equal(nameSimilarity(teaStub.name, "Camellia Kyoto Tea Ceremony"), 1);
    const m = matchStubToProvider(teaStub, [teaProvider()]);
    assert.ok(m);
  });

  it("picks the highest-confidence survivor deterministically among multiple candidates", () => {
    const near = teaProvider({ id: "svc-near", latitude: "35.003510", longitude: "135.778010" });
    const farther = teaProvider({ id: "svc-far", latitude: "35.006000", longitude: "135.780000" });
    const m = matchStubToProvider(teaStub, [farther, near]);
    assert.ok(m);
    assert.equal(m!.serviceId, "svc-near", "the closer identical-name candidate wins");
  });
});
