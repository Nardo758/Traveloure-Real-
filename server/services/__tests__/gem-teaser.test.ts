/**
 * Thin gem detail — the ruled TEASER projection (2026-08-29 Replit-audit
 * ruling 3; ledger 2026-08-29-replit-gem-audit).
 *
 * The discover surface (GET /api/discover/location/:city — both the
 * neighborhoods[].gems embed and the top-level gems section) ships hidden
 * gems as the teaser set ONLY. This spec pins the EXACT allowed key set and
 * names the removed families one by one, so re-adding any of them — or a
 * future column leaking through by default — is a red test, not a drift.
 *
 * Run with:
 *   npx tsx --test server/services/__tests__/gem-teaser.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GEM_TEASER_KEYS, toGemTeaser } from "../../../shared/gem-teaser.js";

/** Every column of travel_pulse_hidden_gems (shared/schema.ts) as a full row,
 *  plus the server-resolved curatedBy — the worst case the projection faces. */
const FULL_ROW = {
  id: "g-1",
  city: "Kyoto",
  country: "Japan",
  placeName: "Hanamikoji Street",
  placeType: "viewpoint",
  address: "123 Hanamikoji-dori, Higashiyama Ward", // REMOVED by ruling 3
  latitude: "35.0037",
  longitude: "135.7751",
  localRating: "4.60", // popularity-ratio family — REMOVED
  touristMentions: 120, // popularity-ratio family — REMOVED
  localMentions: 340, // popularity-ratio family — REMOVED
  gemScore: 87,
  discoveryStatus: "hidden", // REMOVED
  daysUntilMainstream: 45, // mainstream forecast — REMOVED
  description: "A stone-paved street of machiya teahouses.",
  whyLocalsLoveIt: "Golden-hour lanterns before the crowds arrive.",
  bestFor: ["photography", "evening walk"],
  priceRange: "$$",
  imageUrl: null,
  aiGenerated: false,
  aiGeneratedAt: null,
  neighborhood: "gion",
  curatedByExpertId: "exp-yuki", // raw id — REMOVED (ships only as resolved curatedBy)
  detectedAt: new Date("2026-08-01T00:00:00Z"),
  lastUpdated: new Date("2026-08-20T00:00:00Z"),
  curatedBy: { id: "exp-yuki", firstName: "Yuki", lastName: "Tanaka", profileImageUrl: null },
};

describe("toGemTeaser — the ruled teaser set only (audit ruling 3)", () => {
  test("output carries EXACTLY the ruled key set — nothing more, nothing less", () => {
    const teaser = toGemTeaser(FULL_ROW);
    assert.deepEqual(
      Object.keys(teaser).sort(),
      [...GEM_TEASER_KEYS].sort(),
      "teaser keys must equal GEM_TEASER_KEYS exactly — widen only with a ruling",
    );
  });

  test("the four removed families never survive the projection", () => {
    const teaser = toGemTeaser(FULL_ROW) as Record<string, unknown>;
    // (a) exact location
    assert.equal("address" in teaser, false, "address must be removed");
    assert.equal("latitude" in teaser, false, "latitude must be removed");
    assert.equal("longitude" in teaser, false, "longitude must be removed");
    // (b) popularity ratios
    assert.equal("touristMentions" in teaser, false, "touristMentions must be removed");
    assert.equal("localMentions" in teaser, false, "localMentions must be removed");
    assert.equal("localRating" in teaser, false, "localRating must be removed");
    // (c) mainstream forecast
    assert.equal("daysUntilMainstream" in teaser, false, "daysUntilMainstream must be removed");
    // (d) discovery status
    assert.equal("discoveryStatus" in teaser, false, "discoveryStatus must be removed");
    // plus bookkeeping + the raw attribution id (resolved curatedBy replaces it)
    assert.equal("curatedByExpertId" in teaser, false, "raw curatedByExpertId must be removed");
    assert.equal("aiGenerated" in teaser, false);
    assert.equal("aiGeneratedAt" in teaser, false);
    assert.equal("detectedAt" in teaser, false);
    assert.equal("lastUpdated" in teaser, false);
  });

  test("teaser fields pass through intact, including resolved attribution", () => {
    const teaser = toGemTeaser(FULL_ROW);
    assert.equal(teaser.placeName, "Hanamikoji Street");
    assert.equal(teaser.gemScore, 87);
    assert.equal(teaser.whyLocalsLoveIt, "Golden-hour lanterns before the crowds arrive.");
    assert.deepEqual(teaser.bestFor, ["photography", "evening walk"]);
    assert.deepEqual(teaser.curatedBy, {
      id: "exp-yuki",
      firstName: "Yuki",
      lastName: "Tanaka",
      profileImageUrl: null,
    });
  });

  test("no fabricated attribution: an absent or unresolved curator stays null (ruling 1 / §13)", () => {
    const { curatedBy: _drop, ...noCurator } = FULL_ROW;
    const teaser = toGemTeaser(noCurator);
    assert.equal(teaser.curatedBy, null);
  });

  test("a projection is an allowlist: unknown/new columns never leak through", () => {
    const teaser = toGemTeaser({ ...FULL_ROW, secretNewColumn: "x" } as any) as Record<string, unknown>;
    assert.equal("secretNewColumn" in teaser, false);
  });
});
