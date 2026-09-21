/**
 * landing-hero.test.ts — pure unit proofs for the landing hero composers
 * (landing-build lane Phase 1; run: npx tsx --test server/services/__tests__/landing-hero.test.ts).
 *
 * The contract under test: live legs remain nullable, while the client may render clearly
 * representative cards for absent inventory. Wanted needs are city-scoped and render only
 * when coverage is known; unknown coverage never becomes a demand claim.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  composeLandingHero,
  deriveWantedSlots,
  dollarsToCents,
  pickAnchorExpert,
} from "../landing-hero.compose";
import { resolveLandingHeroWanted } from "../landing-hero-wanted.service";

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

describe("deriveWantedSlots — city-scoped, known coverage only", () => {
  const types = [
    { offering_type_key: "kaiseki_host", display_name: "Evening kaiseki host" },
    { offering_type_key: "tea_guide", display_name: "Tea-district guide" },
  ];
  test("unknown coverage omits the strip rather than turning uncertainty into Wanted", () => {
    assert.equal(deriveWantedSlots("Kyoto", null, types), null);
  });
  test("known empty coverage returns every real offering at city level", () => {
    assert.deepEqual(deriveWantedSlots("Kyoto", new Set(), types), [
      { title: "Evening kaiseki host", city: "Kyoto" },
      { title: "Tea-district guide", city: "Kyoto" },
    ]);
  });
  test("known partial coverage returns only uncovered real offerings", () => {
    assert.deepEqual(deriveWantedSlots("Kyoto", new Set(["tea_guide"]), types), [
      { title: "Evening kaiseki host", city: "Kyoto" },
    ]);
  });
  test("known full coverage and missing inputs return an empty list, never invented demand", () => {
    assert.deepEqual(deriveWantedSlots("Kyoto", new Set(["kaiseki_host", "tea_guide"]), types), []);
    assert.deepEqual(deriveWantedSlots("Kyoto", new Set(), []), []);
    assert.deepEqual(deriveWantedSlots("  ", new Set(), types), []);
  });
});

describe("resolveLandingHeroWanted — route coverage boundary", () => {
  const types = [
    { offering_type_key: "photo", display_name: "Event photographer" },
    { offering_type_key: "guide", display_name: "Local guide" },
  ];

  test("a swallowed-query-style failure remains unknown and omits Wanted", async () => {
    let received: Record<string, unknown> | null = null;
    const wanted = await resolveLandingHeroWanted("Goa", types, async (opts) => {
      received = opts;
      throw new Error("coverage unavailable");
    });
    assert.equal(wanted, null);
    assert.deepEqual(received, {
      marketCity: "goa",
      includePackages: true,
      throwOnError: true,
    });
  });

  test("an offering-catalog lookup failure remains unknown and skips coverage gathering", async () => {
    let gathered = false;
    const wanted = await resolveLandingHeroWanted("Goa", null, async () => {
      gathered = true;
      return [];
    });
    assert.equal(wanted, null);
    assert.equal(gathered, false);
  });

  test("coverage is gathered at city scope with no neighborhood restriction", async () => {
    const wanted = await resolveLandingHeroWanted("Goa", types, async (opts) => {
      assert.ok(!("neighborhoodIds" in opts));
      return [{ offeringId: "guide" }];
    });
    assert.deepEqual(wanted, [{ title: "Event photographer", city: "Goa" }]);
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
  test("existing image URLs pass through for photo-backed tiles", () => {
    const p = composeLandingHero({
      topCity: { cityName: "Cartagena" },
      anchorExpert: {
        name: "Local Guide",
        handle: "local-guide",
        fromPriceCents: 14900,
        imageUrl: "https://example.test/expert.jpg",
      },
      gems: [{ placeName: "Night Market", gemScore: 96, imageUrl: "https://example.test/gem.jpg" }],
      services: [
        {
          serviceName: "Local Planning",
          price: "149.00",
          serviceImage: "https://example.test/service.jpg",
        },
      ],
      wanted: null,
    });
    assert.equal(p.anchorExpert?.imageUrl, "https://example.test/expert.jpg");
    assert.equal(p.gem?.imageUrl, "https://example.test/gem.jpg");
    assert.equal(p.service?.imageUrl, "https://example.test/service.jpg");
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
  test("anchor and wanted list pass through untouched — no default names, prices, or neighborhoods", () => {
    const p = composeLandingHero({
      topCity: { cityName: "Kyoto", trendingScore: 92, crowdLevel: "high" },
      anchorExpert: { name: "Yuki Flowers", handle: "yuki-flowers", fromPriceCents: 24900 },
      gems: [], services: [],
      wanted: [{ title: "Evening kaiseki host", city: "Kyoto" }],
    });
    assert.equal(p.trend, 92);
    assert.deepEqual(p.anchorExpert, { name: "Yuki Flowers", handle: "yuki-flowers", fromPriceCents: 24900 });
    assert.deepEqual(p.wanted, [{ title: "Evening kaiseki host", city: "Kyoto" }]);
  });
});
