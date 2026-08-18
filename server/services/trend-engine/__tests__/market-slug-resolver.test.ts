/**
 * 2A.3 / R8 — pure unit test for resolveMarketSlug (no DB).
 * Run: tsx --test server/services/trend-engine/__tests__/market-slug-resolver.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMarketSlug, OPERATING_MARKETS } from "../operating-markets";

test("R8: Kyoto variants (the only real in-set volume, Q3) resolve to 'kyoto'", () => {
  assert.equal(resolveMarketSlug("kyoto"), "kyoto");
  assert.equal(resolveMarketSlug("Kyoto"), "kyoto");
  assert.equal(resolveMarketSlug("kyoto, japan"), "kyoto", "country suffix dropped");
  assert.equal(resolveMarketSlug("  Kyoto , Japan "), "kyoto", "trimmed");
});

test("R8: every operating market resolves by cityName and by marketKey", () => {
  for (const m of OPERATING_MARKETS) {
    assert.equal(resolveMarketSlug(m.cityName), m.marketKey, `${m.cityName} → ${m.marketKey}`);
    assert.equal(resolveMarketSlug(m.marketKey), m.marketKey, `${m.marketKey} → ${m.marketKey}`);
  }
});

test("R8: Bogotá resolves with OR without the accent (cityName vs marketKey)", () => {
  assert.equal(resolveMarketSlug("Bogotá"), "bogota", "accented cityName");
  assert.equal(resolveMarketSlug("bogota"), "bogota", "unaccented marketKey");
  assert.equal(resolveMarketSlug("Bogotá, Colombia"), "bogota");
});

test("R8/R13: destinations OUTSIDE the 8 markets resolve to null (unmapped bucket, §13)", () => {
  // Q3's real out-of-set clusters — must NOT be forced onto a market.
  for (const d of ["lisbon", "san francisco", "paris, france", "barcelona, spain", "tokyo, japan", "new york"]) {
    assert.equal(resolveMarketSlug(d), null, `${d} is outside the 8`);
  }
});

test("R8: junk and empty resolve to null, never a guess", () => {
  for (const d of ["l", "unknown", "ci test destination", "nara,", "", "   ", null, undefined]) {
    assert.equal(resolveMarketSlug(d as any), null, `${JSON.stringify(d)} → null`);
  }
});
