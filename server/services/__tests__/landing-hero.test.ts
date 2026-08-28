/**
 * landing-hero.test.ts — pure unit proofs for the landing hero composers
 * (landing-build lane Phase 1; run: npx tsx --test server/services/__tests__/landing-hero.test.ts).
 *
 * The contract under test (docs/design/LANDING_SPEC.md): every leg is nullable and the
 * hero COLLAPSES HONESTLY — absent data yields null, never a fabricated name, price,
 * score or recruitment line. The wanted derivation MIRRORS discover-location.tsx:1881-1906
 * (uncovered pool, full-list fallback, slot 0) — these tests pin that mirror.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  composeLandingHero,
  deriveWantedSlot,
  dollarsToCents,
  pickAnchorExpert,
} from "../landing-hero.compose";

describe("dollarsToCents", () => {
  test("decimal-dollars string converts to integer cents", () => {
    assert.equal(dollarsToCents("480.00"), 48000);
    assert.equal(dollarsToCents("59.99"), 5999);
    assert.equal(dollarsToCents(19), 1900);
  });
  test("null/undefined/garbage → null, never 0 or NaN", () => {
    assert.equal(dollarsToCents(null), null);
    assert.equal(dollarsToCents(undefined), null);
    assert.equal(dollarsToCents("contact us"), null);
  });
});

describe("pickAnchorExpert", () => {
  test("first neighborhood with a localExpert wins (feed order)", () => {
    const picked = pickAnchorExpert([
      { name: "Gion", localExpert: null },
      { name: "Arashiyama", localExpert: { id: "u2", firstName: "Yuki", lastName: "Flowers" } },
      { name: "Nishiki", localExpert: { id: "u3", firstName: "Kenji", lastName: "S" } },
    ]);
    assert.deepEqual(picked, { id: "u2", name: "Yuki Flowers" });
  });
  test("no neighborhood carries an expert → null (the dev-Kyoto reality)", () => {
    assert.equal(pickAnchorExpert([{ name: "Gion", localExpert: null }, { name: "Nishiki" }]), null);
  });
  test("an expert with no name is skipped, never rendered blank", () => {
    assert.equal(
      pickAnchorExpert([{ name: "Gion", localExpert: { id: "u1", firstName: null, lastName: null } }]),
      null,
    );
  });
});

describe("deriveWantedSlot (mirror of discover-location.tsx:1881)", () => {
  const types = [
    { offering_type_key: "kaiseki_host", display_name: "Evening kaiseki host" },
    { offering_type_key: "tea_guide", display_name: "Tea-district guide" },
  ];
  test("uncovered offering pairs with the first neighborhood", () => {
    const slot = deriveWantedSlot([{ name: "Gion" }], new Set(["tea_guide"]), types);
    assert.deepEqual(slot, { title: "Evening kaiseki host", neighborhood: "Gion" });
  });
  test("empty covered set falls back to the FULL list (the client's slot-data-not-loaded rule)", () => {
    const slot = deriveWantedSlot([{ name: "Gion" }], new Set(), types);
    assert.deepEqual(slot, { title: "Evening kaiseki host", neighborhood: "Gion" });
  });
  test("everything covered also falls back to the full list — same as the client", () => {
    const slot = deriveWantedSlot([{ name: "Gion" }], new Set(["kaiseki_host", "tea_guide"]), types);
    assert.deepEqual(slot, { title: "Evening kaiseki host", neighborhood: "Gion" });
  });
  test("no neighborhoods or no offering types → null, never an invented line", () => {
    assert.equal(deriveWantedSlot([], new Set(), types), null);
    assert.equal(deriveWantedSlot([{ name: "Gion" }], new Set(), []), null);
    assert.equal(deriveWantedSlot([{ name: "  " }], new Set(), types), null);
  });
});

describe("composeLandingHero — honest collapse", () => {
  test("no city at all → every field null", () => {
    const p = composeLandingHero({ topCity: null, anchorExpert: null, gems: [], services: [], wanted: null });
    assert.deepEqual(p, {
      city: null, trend: null, crowd: null,
      anchorExpert: null, gem: null, service: null, wanted: null,
    });
  });
  test("city with thin data → city present, every leg null (never fabricates)", () => {
    const p = composeLandingHero({
      topCity: { cityName: "Porto", trendingScore: 0, crowdLevel: "quiet" },
      anchorExpert: null, gems: [], services: [], wanted: null,
    });
    assert.equal(p.city, "Porto");
    assert.equal(p.trend, 0); // below-floor: 0, not an invented positive
    assert.equal(p.anchorExpert, null);
    assert.equal(p.gem, null);
    assert.equal(p.service, null);
    assert.equal(p.wanted, null);
  });
  test("gem maps placeName/gemScore; unparseable score → null score, gem still shown", () => {
    const p = composeLandingHero({
      topCity: { cityName: "Kyoto" },
      anchorExpert: null,
      gems: [{ placeName: "", gemScore: 99 }, { placeName: "Hanamikoji Street", gemScore: "8.7" }],
      services: [],
      wanted: null,
    });
    assert.deepEqual(p.gem, { name: "Hanamikoji Street", score: 8.7 });
    const q = composeLandingHero({
      topCity: { cityName: "Kyoto" }, anchorExpert: null,
      gems: [{ placeName: "Pontocho Alley", gemScore: undefined }], services: [], wanted: null,
    });
    assert.deepEqual(q.gem, { name: "Pontocho Alley", score: null });
  });
  test("service converts dollars-string price to cents; priceless service keeps null price", () => {
    const p = composeLandingHero({
      topCity: { cityName: "Kyoto" }, anchorExpert: null, gems: [],
      services: [{ serviceName: "Kyoto tea ceremony", price: "480.00" }], wanted: null,
    });
    assert.deepEqual(p.service, { name: "Kyoto tea ceremony", priceCents: 48000 });
    const q = composeLandingHero({
      topCity: { cityName: "Kyoto" }, anchorExpert: null, gems: [],
      services: [{ serviceName: "Custom quote tour", price: null }], wanted: null,
    });
    assert.deepEqual(q.service, { name: "Custom quote tour", priceCents: null });
  });
  test("anchor and wanted pass through untouched — no default names, no default prices", () => {
    const p = composeLandingHero({
      topCity: { cityName: "Kyoto", trendingScore: 92, crowdLevel: "high" },
      anchorExpert: { name: "Yuki Flowers", handle: "yuki-flowers", fromPriceCents: 24900 },
      gems: [], services: [],
      wanted: { title: "Evening kaiseki host", neighborhood: "Gion" },
    });
    assert.equal(p.trend, 92);
    assert.deepEqual(p.anchorExpert, { name: "Yuki Flowers", handle: "yuki-flowers", fromPriceCents: 24900 });
    assert.deepEqual(p.wanted, { title: "Evening kaiseki host", neighborhood: "Gion" });
  });
});
