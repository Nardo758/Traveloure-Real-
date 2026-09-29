/**
 * Content facts — the pure rules (ledger `2026-09-29-a5-draft-open-set`; content sourcing brief).
 *   F1  isPublishable: false for places_api and crawled (verified or not), hotel_cache and a traveler
 *       note; true for platform-owned origins; an expert nugget only once verified; a partner or
 *       restricted license is never publishable
 *   F2  origin order: platform-native → verified → Places → crawled → traveler note; unknown last
 *   F3  the provenance line names the source and the check date, and says when a fact may have changed
 *   F4  a source is activatable only with a terms check AND a license class
 *   F5  needForItemType: a meal is dining, anything else a stop's hours
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canActivateSource, factProvenanceLine, isPublishable, needForItemType, originTier } from "../content-facts";

test("F1: isPublishable is derived from origin + license only", () => {
  assert.equal(isPublishable({ origin: "places_api", license: "restricted" }), false);
  assert.equal(isPublishable({ origin: "places_api" }), false);
  assert.equal(isPublishable({ origin: "crawled", license: "official" }), false);
  assert.equal(isPublishable({ origin: "crawled", license: "official", verifiedAt: new Date() }), false, "a verified crawl is still a crawl");
  assert.equal(isPublishable({ origin: "hotel_cache" }), false);
  assert.equal(isPublishable({ origin: "traveler_note" }), false);
  assert.equal(isPublishable({ origin: "expert_nugget" }), false, "unverified nugget");
  assert.equal(isPublishable({ origin: "expert_nugget", verifiedAt: "2026-09-29T00:00:00Z" }), true);
  assert.equal(isPublishable({ origin: "platform_listing" }), true);
  assert.equal(isPublishable({ origin: "gem" }), true);
  assert.equal(isPublishable({ origin: "event" }), true);
  assert.equal(isPublishable({ origin: "platform_listing", license: "partner" }), false);
  assert.equal(isPublishable({ origin: "not_an_origin" }), false);
});

test("F2: the engine's origin order", () => {
  const order = ["platform_listing", "expert_nugget", "places_api", "crawled", "traveler_note", "mystery"].map(originTier);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `tier ${i} after tier ${i - 1}`);
});

test("F3: provenance line", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  assert.equal(
    factProvenanceLine({ origin: "places_api", fetchedAt: "2026-09-29T08:00:00Z", expiresAt: "2026-10-06T08:00:00Z" }, now),
    "Google Maps · checked 29 Sept 2026".replace("Sept", new Date(Date.UTC(2026, 8, 29)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })),
  );
  assert.match(factProvenanceLine({ origin: "places_api", fetchedAt: "2026-08-01T00:00:00Z", expiresAt: "2026-08-08T00:00:00Z" }, now), /may have changed/);
  assert.match(factProvenanceLine({ origin: "expert_nugget", verifiedAt: "2026-09-01", fetchedAt: "2026-09-01" }, now), /^A local expert · verified · checked/);
  assert.equal(factProvenanceLine({ origin: "crawled", sourceName: "Kyoto City Official Travel Guide" } as any, now), "Kyoto City Official Travel Guide");
});

test("F4: no source activates without a terms check and a license class", () => {
  assert.equal(canActivateSource({ termsCheckedAt: null, licenseClass: "official" }), false);
  assert.equal(canActivateSource({ termsCheckedAt: "2026-09-29", licenseClass: null }), false);
  assert.equal(canActivateSource({ termsCheckedAt: "2026-09-29", licenseClass: "made_up" }), false);
  assert.equal(canActivateSource({ termsCheckedAt: "2026-09-29", licenseClass: "official" }), true);
});

test("F5: needForItemType", () => {
  assert.equal(needForItemType("dinner"), "dining");
  assert.equal(needForItemType("Lunch"), "dining");
  assert.equal(needForItemType("attraction"), "stop.hours");
  assert.equal(needForItemType(null), "stop.hours");
});
