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

// P0 legs ruling 5 (ledger `2026-10-10-p0-legs-baseline`): the configured alias pass.
test("P0-5: a market's districts and aliases resolve to that market", () => {
  for (const d of ["Arashiyama", "Gion, Kyoto", "Higashiyama", "Fushimi Inari", "Kyoto Prefecture", "Kyoto Station", "Arashiyama, Kyoto, Japan"]) {
    assert.equal(resolveMarketSlug(d), "kyoto", `${d} → kyoto`);
  }
  assert.equal(resolveMarketSlug("Bombay"), "mumbai");
  assert.equal(resolveMarketSlug("Panjim, Goa"), "goa");
  assert.equal(resolveMarketSlug("Leith"), "edinburgh");
  assert.equal(resolveMarketSlug("Usaquén"), "bogota", "accents ignored");
  assert.equal(resolveMarketSlug("Cartagena de Indias"), "cartagena");
});

test("P0-5: whole words only, notIf vetoes, two markets ⇒ null", () => {
  assert.equal(resolveMarketSlug("Porto Alegre, Brazil"), null, "another Porto");
  assert.equal(resolveMarketSlug("Cartagena, Spain"), null, "another Cartagena");
  assert.equal(resolveMarketSlug("Edinburgh, Indiana"), null, "another Edinburgh");
  assert.equal(resolveMarketSlug("Kyoto and Mumbai"), null, "two markets is no answer");
  assert.equal(resolveMarketSlug("Gionville"), null, "an alias inside a longer word is not a match");
  assert.equal(resolveMarketSlug("tokyo, japan"), null);
});
