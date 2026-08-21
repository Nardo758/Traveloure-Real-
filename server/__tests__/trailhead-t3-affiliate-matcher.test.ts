/**
 * Operation Trailhead LANE T3.3 — affiliate-matcher unit proofs (DB-free, no network).
 *
 * The headline proof: with the SHIPPED config (every AFFILIATE_PROGRAM disabled by the T0 gate), the
 * matcher resolves NOTHING, so a stub that would otherwise match an affiliate stays 'external'. The
 * remaining proofs use a test-local ENABLED registry to show the mechanism is correct for when T0
 * self-unlocks a program — product-level vs program-level, the direct-domain gate (R-T3-d), and the
 * direct-beats-ota order (R-T3-a).
 *
 * Run with:  npx tsx --test server/__tests__/trailhead-t3-affiliate-matcher.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  matchStubToAffiliate,
  type AffiliateMatchInput,
} from "../services/stub-affiliate-matcher";
import { AFFILIATE_PROGRAMS, type AffiliateProgramConfig } from "../config/trailhead.config";

const stub: AffiliateMatchInput = {
  id: "stub-1",
  name: "Arashiyama Bamboo Grove Walking Tour",
  contentType: "attraction",
  latitude: "35.017000",
  longitude: "135.671000",
};

describe("T3.3 affiliate matcher — DISABLED by default (T0 gate)", () => {
  it("every shipped program is disabled", () => {
    for (const p of Object.values(AFFILIATE_PROGRAMS)) {
      assert.equal(p.enabled, false, `${p.key} must ship disabled`);
    }
  });

  it("with the shipped config, the matcher returns null (stub stays external)", () => {
    assert.equal(matchStubToAffiliate(stub), null);
    // Even with catalog products supplied, a disabled program yields nothing.
    assert.equal(
      matchStubToAffiliate(stub, {
        catalogs: { viator: [{ productId: "v-123", name: "Arashiyama Bamboo Grove Walking Tour" }] },
      }),
      null,
    );
  });
});

// ── Enabled-registry proofs (the mechanism T0 will unlock) ────────────────────────────────────────

const ota = (over: Partial<AffiliateProgramConfig> = {}): AffiliateProgramConfig => ({
  key: "viator",
  displayName: "Viator",
  rung: "affiliate_ota",
  enabled: true,
  hasCatalog: true,
  linkBuilderKey: "viator",
  ...over,
});

describe("T3.3 affiliate matcher — mechanism (test-local ENABLED registry)", () => {
  it("product-level match against a recognized catalog", () => {
    const m = matchStubToAffiliate(stub, {
      programs: { viator: ota() },
      catalogs: { viator: [{ productId: "v-9", name: "Arashiyama Bamboo Grove Walking Tour", latitude: "35.017010", longitude: "135.671020" }] },
    });
    assert.ok(m);
    assert.equal(m!.matchType, "product");
    assert.equal(m!.subclass, "affiliate_ota");
    assert.equal(m!.ref, "viator:v-9");
    assert.ok((m!.confidence ?? 0) >= 0.9);
  });

  it("program-level link when the program has no searchable catalog", () => {
    const m = matchStubToAffiliate(stub, {
      programs: { civitatis: ota({ key: "civitatis", displayName: "Civitatis", hasCatalog: false, linkBuilderKey: null }) },
    });
    assert.ok(m);
    assert.equal(m!.matchType, "program");
    assert.equal(m!.ref, "civitatis");
    assert.equal(m!.confidence, null);
  });

  it("R-T3-d: an affiliate_direct program is skipped unless the operator domain is verified for the stub", () => {
    const direct = ota({ key: "operator", displayName: "Operator Direct", rung: "affiliate_direct", hasCatalog: false });
    // Not verified ⇒ skipped ⇒ null.
    assert.equal(matchStubToAffiliate(stub, { programs: { operator: direct } }), null);
    // Verified ⇒ resolves at the direct rung.
    const m = matchStubToAffiliate(stub, { programs: { operator: direct }, verifiedDirectPrograms: ["operator"] });
    assert.ok(m);
    assert.equal(m!.subclass, "affiliate_direct");
  });

  it("R-T3-a: direct beats OTA when both are enabled and eligible", () => {
    const direct = ota({ key: "operator", displayName: "Operator Direct", rung: "affiliate_direct", hasCatalog: false });
    const m = matchStubToAffiliate(stub, {
      programs: { viator: ota(), operator: direct },
      catalogs: { viator: [{ productId: "v-9", name: "Arashiyama Bamboo Grove Walking Tour" }] },
      verifiedDirectPrograms: ["operator"],
    });
    assert.ok(m);
    assert.equal(m!.subclass, "affiliate_direct", "the direct rung must win over the OTA product match");
  });

  it("below the name threshold, a catalog product does not product-match (falls to program-level for an OTA)", () => {
    const m = matchStubToAffiliate(stub, {
      programs: { viator: ota() },
      catalogs: { viator: [{ productId: "v-x", name: "Completely Different Kyoto Cooking Class" }] },
    });
    assert.ok(m);
    assert.equal(m!.matchType, "program", "no product cleared the gate, so a recognized OTA falls to a browse link");
  });
});
