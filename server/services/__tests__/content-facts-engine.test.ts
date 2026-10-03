/**
 * A5 content facts — the engine half with no database (ledger `2026-09-29-a5-draft-open-set`).
 *   P1  the upsell engine orders facts by origin, then verified, then fresh, then newest
 *   P2  PlacesAdapter (stubbed fetch): one call ⇒ location/hours/price/dining facts; the call's cost
 *       on ONE row; every fact expires within 30 days; origin places_api, license restricted, never
 *       publishable
 *   P3  PlacesAdapter switched off, or no key ⇒ no call and no facts
 *   P4  a non-ok answer throws (the caller logs it; nothing is guessed)
 *   P5  the address (ledger `2026-09-30-places-address`): the field mask is the A5 eight plus exactly
 *       `formattedAddress` and `shortFormattedAddress`; an `address` fact keeps whichever forms Google
 *       gave, verbatim; neither ⇒ no address fact
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankFactsByOrigin } from "../upsell-engine.service";
import { PlacesAdapter, sourcesForNeed } from "../content-facts/places-adapter";
import { isPublishable } from "@shared/content-facts";

test("P1: rankFactsByOrigin", () => {
  const now = new Date("2026-09-29T00:00:00Z");
  const facts = [
    { id: "crawl", origin: "crawled", fetchedAt: "2026-09-28" },
    { id: "places-old", origin: "places_api", fetchedAt: "2026-09-01", expiresAt: "2026-09-08" },
    { id: "places-new", origin: "places_api", fetchedAt: "2026-09-20", expiresAt: "2026-10-20" },
    { id: "nugget", origin: "expert_nugget", fetchedAt: "2026-01-01", verifiedAt: "2026-01-02" },
    { id: "nugget-unverified", origin: "expert_nugget", fetchedAt: "2026-09-28" },
    { id: "listing", origin: "platform_listing", fetchedAt: "2025-01-01" },
    { id: "note", origin: "traveler_note", fetchedAt: "2026-09-28" },
  ];
  assert.deepEqual(
    rankFactsByOrigin(facts, now).map((f) => f.id),
    ["listing", "nugget", "nugget-unverified", "places-new", "places-old", "crawl", "note"],
  );
});

const placeBody = {
  places: [
    {
      id: "ChIJ-kinkaku",
      displayName: { text: "Kinkaku-ji" },
      location: { latitude: 35.0394, longitude: 135.7292 },
      regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"] },
      priceLevel: "PRICE_LEVEL_INEXPENSIVE",
      googleMapsUri: "https://maps.google.com/?cid=1",
    },
  ],
};

test("P2: one call ⇒ provenance-carrying facts, cost once, ≤ 30 days", async () => {
  const calls: any[] = [];
  const a = new PlacesAdapter(
    async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => placeBody };
    },
    () => "test-key",
    () => true,
  );
  const facts = await a.fetch({ need: "stop.hours", market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto, Japan" }, budgetCents: 0 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.headers["X-Goog-FieldMask"], /regularOpeningHours/);
  assert.equal(JSON.parse(calls[0].init.body).textQuery, "Kinkaku-ji, Kyoto, Japan");
  assert.deepEqual(facts.map((f) => f.factType), ["location", "hours", "price"]);
  assert.equal(facts.filter((f) => f.costCents > 0).length, 1, "the call's cost is recorded on one row");
  for (const f of facts) {
    assert.equal(f.origin, "places_api");
    assert.equal(f.license, "restricted");
    assert.equal(f.placeRef, "ChIJ-kinkaku");
    assert.equal(f.sourceUrl, "https://maps.google.com/?cid=1");
    assert.ok(f.expiresAt!.getTime() - f.fetchedAt.getTime() <= 30 * 86_400_000, "Google's 30-day cache cap");
    assert.equal(isPublishable(f), false);
  }
  assert.deepEqual(facts[0].value, { lat: 35.0394, lng: 135.7292, name: "Kinkaku-ji", query: "Kinkaku-ji, Kyoto, Japan" });
});

test("P3: switched off, or no key ⇒ nothing is called", async () => {
  let called = 0;
  const f = async () => {
    called += 1;
    return { ok: true, status: 200, json: async () => placeBody };
  };
  const off = new PlacesAdapter(f, () => "k", () => false);
  assert.deepEqual(await off.fetch({ need: "stop.hours", market: null, query: { text: "x", city: null }, budgetCents: 0 }), []);
  assert.equal(off.covers("stop.hours"), false);
  assert.deepEqual(sourcesForNeed("stop.hours", null, [off]), []);
  const noKey = new PlacesAdapter(f, () => undefined, () => true);
  assert.deepEqual(await noKey.fetch({ need: "stop.hours", market: null, query: { text: "x", city: null }, budgetCents: 0 }), []);
  assert.equal(called, 0);
  const on = new PlacesAdapter(f, () => "k", () => true);
  assert.equal(on.covers("stop.ticketing"), false, "Places does not cover ticketing rules (brief §9)");
});

test("P4: a non-ok answer throws", async () => {
  const a = new PlacesAdapter(async () => ({ ok: false, status: 403, json: async () => ({}) }), () => "k", () => true);
  await assert.rejects(a.fetch({ need: "dining", market: null, query: { text: "x", city: null }, budgetCents: 0 }), /403/);
});

test("P5: the address — two fields added to the mask, both forms kept, neither ⇒ none", async () => {
  const masks: string[] = [];
  const answer = (extra: Record<string, unknown>) =>
    new PlacesAdapter(
      async (_url, init) => {
        masks.push(init.headers["X-Goog-FieldMask"]);
        return { ok: true, status: 200, json: async () => ({ places: [{ id: "ChIJ-a", location: { latitude: 35, longitude: 135.7 }, ...extra }] }) };
      },
      () => "k",
      () => true,
    );
  const req = { need: "stop.hours" as const, market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto, Japan" }, budgetCents: 0 };
  const both = await answer({ formattedAddress: " 1 Kinkakujicho, Kita Ward, Kyoto, 603-8361, Japan ", shortFormattedAddress: "1 Kinkakujicho, Kita Ward" }).fetch(req);
  assert.deepEqual(masks[0].split(","), [
    "places.id", "places.displayName", "places.location", "places.regularOpeningHours.weekdayDescriptions",
    "places.priceLevel", "places.googleMapsUri", "places.reservable", "places.servesVegetarianFood",
    "places.formattedAddress", "places.shortFormattedAddress",
    // Smoke 7 (ledger `2026-10-03-no-ward-pins`): the result's types — a rename needs a point of interest.
    "places.types",
  ]);
  const addr = both.find((f) => f.factType === "address")!;
  assert.deepEqual(addr.value, { query: "Kinkaku-ji, Kyoto, Japan", formattedAddress: "1 Kinkakujicho, Kita Ward, Kyoto, 603-8361, Japan", shortFormattedAddress: "1 Kinkakujicho, Kita Ward" });
  assert.equal(addr.origin, "places_api");
  assert.equal(isPublishable(addr), false);
  assert.ok(addr.expiresAt!.getTime() - addr.fetchedAt.getTime() <= 30 * 86_400_000);
  assert.equal(both.filter((f) => f.costCents > 0).length, 1, "still one call's cost");
  const shortOnly = await answer({ shortFormattedAddress: "Kita Ward" }).fetch(req);
  assert.deepEqual(shortOnly.find((f) => f.factType === "address")!.value, { query: "Kinkaku-ji, Kyoto, Japan", shortFormattedAddress: "Kita Ward" });
  const none = await answer({ formattedAddress: "  " }).fetch(req);
  assert.equal(none.some((f) => f.factType === "address"), false);
});
