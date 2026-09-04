/**
 * Wanted-slot recruitment deep-link — gap 15 of the Ways-to-Earn audit
 * (ledger `2026-09-04-earn-contained-fixes`).
 *
 * The rule under test: a param is emitted ONLY when a real value stands behind it,
 * and `offeringTypeKey` in particular is emitted only for a key the expert catalog
 * actually gave us. The feed's "catalog hasn't loaded" state is an EMPTY key, and an
 * empty key must produce no param — a placeholder there is a value the migration-107
 * FK cannot hold and the wizard would silently clamp to NULL (§13, ruling 36's own
 * lesson one surface over).
 *
 * Run: npx tsx --test client/src/lib/__tests__/wanted-slot-link.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWantedSlotSignupHref, WANTED_SLOT_EXPERT_TYPE } from "../wanted-slot-link";

const params = (href: string) => new URLSearchParams(href.slice(href.indexOf("?") + 1));

describe("wanted-slot signup href", () => {
  it("always names the local_expert track", () => {
    assert.equal(WANTED_SLOT_EXPERT_TYPE, "local_expert");
    for (const input of [
      {},
      { city: "Kyoto" },
      { city: "Kyoto", neighborhoodName: "Gion", offeringKey: "city_orientation", offeringLabel: "City Orientation" },
    ]) {
      assert.equal(params(buildWantedSlotSignupHref(input)).get("type"), "local_expert");
    }
  });

  it("carries city, neighbourhood and BOTH offering params when all are real", () => {
    const p = params(
      buildWantedSlotSignupHref({
        city: "Kyoto",
        neighborhoodName: "Gion",
        offeringKey: "city_orientation",
        offeringLabel: "City Orientation",
      }),
    );
    assert.equal(p.get("city"), "Kyoto");
    assert.equal(p.get("neighborhood"), "Gion");
    assert.equal(p.get("offeringTypeKey"), "city_orientation");
    assert.equal(p.get("offeringName"), "City Orientation");
  });

  it("emits the canonical param name, never the legacy `offering`", () => {
    const href = buildWantedSlotSignupHref({ offeringKey: "k", offeringLabel: "Label" });
    assert.ok(!params(href).has("offering"), "`offering` is a param the wizard never reads");
  });

  it("omits BOTH offering params when the key is empty — never a placeholder", () => {
    for (const key of ["", "   ", null, undefined]) {
      const p = params(buildWantedSlotSignupHref({ city: "Kyoto", offeringKey: key, offeringLabel: "Local expert guide" }));
      assert.ok(!p.has("offeringTypeKey"), `key ${JSON.stringify(key)} must not produce offeringTypeKey`);
      assert.ok(!p.has("offeringName"), "offeringName must not ride alone");
      assert.equal(p.get("city"), "Kyoto", "the rest of the link still works");
    }
  });

  it("omits a blank city or neighbourhood rather than sending an empty param", () => {
    const p = params(buildWantedSlotSignupHref({ city: "  ", neighborhoodName: "" }));
    assert.ok(!p.has("city"));
    assert.ok(!p.has("neighborhood"));
  });

  it("keeps offeringTypeKey when the label is missing (the key is the recordable half)", () => {
    const p = params(buildWantedSlotSignupHref({ offeringKey: "city_orientation" }));
    assert.equal(p.get("offeringTypeKey"), "city_orientation");
    assert.ok(!p.has("offeringName"));
  });

  it("URL-encodes values with spaces and punctuation", () => {
    const href = buildWantedSlotSignupHref({
      city: "Bogotá",
      neighborhoodName: "La Candelaria & Centro",
      offeringKey: "city_orientation",
      offeringLabel: "City Orientation",
    });
    assert.ok(href.startsWith("/become-expert?"));
    const p = params(href);
    assert.equal(p.get("city"), "Bogotá");
    assert.equal(p.get("neighborhood"), "La Candelaria & Centro");
  });

  it("trims surrounding whitespace off every emitted value", () => {
    const p = params(buildWantedSlotSignupHref({ city: " Kyoto ", neighborhoodName: " Gion ", offeringKey: " k " , offeringLabel: " L " }));
    assert.equal(p.get("city"), "Kyoto");
    assert.equal(p.get("neighborhood"), "Gion");
    assert.equal(p.get("offeringTypeKey"), "k");
    assert.equal(p.get("offeringName"), "L");
  });
});
