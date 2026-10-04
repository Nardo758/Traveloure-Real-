/**
 * The Places field mask decides the SKU tier (decision-maker ruling, Oct 3, 2026, from Replit's SKU
 * read of a6e8741 — `reservable` + `servesVegetarianFood` billed every call at Enterprise +
 * Atmosphere, 4¢, instead of Enterprise, 2¢).
 *   F1 a temple (need `stop.hours`) asks the default mask and NO Atmosphere field; tier Enterprise
 *   F2 a restaurant (need `dining`) adds exactly `reservable`, and nothing else; tier Enterprise + Atmosphere
 *   F3 the Details call sends that mask, prices the cost column by its tier, and tags each draft with it
 *   F4 config defaults: ID lookup 0¢, Details 2¢ (list prices; Replit confirms actual billing)
 *   F5 smoke 8 item 2: every call asks languageCode=en; the area comes from addressComponents (ward,
 *      sublocality_level_1, locality) — with Tenryu-ji's JAPANESE formattedAddress the area is still
 *      "Ukyo Ward, Kyoto", and no components ⇒ no area (the formatted string is never parsed)
 *
 * Run: npx tsx --test server/utils/__tests__/places-field-mask.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLACES_ATMOSPHERE_FIELDS,
  PLACES_BASE_FIELDS,
  PlacesAdapter,
  placesAreaText,
  placesFieldMask,
} from "../../services/content-facts/places-adapter";
import { placesDetailsCostCents, placesIdLookupCostCents } from "../../config/content-facts.config";

const ATMOSPHERE = new Set<string>(PLACES_ATMOSPHERE_FIELDS);

test("F1 a temple asks no Atmosphere field", () => {
  const m = placesFieldMask("stop.hours");
  assert.deepEqual(m.fields, [...PLACES_BASE_FIELDS]);
  assert.deepEqual(m.fields.filter((f) => ATMOSPHERE.has(f)), []);
  assert.equal(m.sku, "details_enterprise");
  for (const f of ["displayName", "location", "formattedAddress", "shortFormattedAddress", "regularOpeningHours.weekdayDescriptions"]) {
    assert.ok(m.fields.includes(f), f);
  }
  assert.ok(!m.fields.includes("priceLevel"));
});

test("F2 a restaurant adds exactly `reservable`", () => {
  const m = placesFieldMask("dining");
  const added = m.fields.filter((f) => !(PLACES_BASE_FIELDS as readonly string[]).includes(f));
  assert.deepEqual(added, ["reservable"]);
  assert.deepEqual(m.fields.filter((f) => ATMOSPHERE.has(f)), ["reservable"]);
  assert.equal(m.sku, "details_enterprise_atmosphere");
});

test("F3 the Details call sends the mask and prices by its tier", async () => {
  delete process.env.PLACES_DETAILS_COST_CENTS;
  delete process.env.PLACES_DETAILS_ATMOSPHERE_COST_CENTS;
  const masks: string[] = [];
  const a = new PlacesAdapter(
    async (_url, init) => {
      masks.push(init.headers["X-Goog-FieldMask"]);
      return { ok: true, status: 200, json: async () => ({ id: "ChIJ-x", displayName: { text: "X" }, location: { latitude: 35, longitude: 135.7 }, reservable: true }) };
    },
    () => "k",
    () => true,
  );
  const temple = await a.fetchByPlaceId("ChIJ-x", { need: "stop.hours", market: "kyoto", query: { text: "Kodai-ji", city: "Kyoto" }, budgetCents: 0 });
  const food = await a.fetchByPlaceId("ChIJ-x", { need: "dining", market: "kyoto", query: { text: "Gion Karyo", city: "Kyoto" }, budgetCents: 0 });
  assert.equal(masks[0], PLACES_BASE_FIELDS.join(","));
  assert.equal(masks[1], [...PLACES_BASE_FIELDS, "reservable"].join(","));
  assert.equal(temple.reduce((n, d) => n + d.costCents, 0), 2);
  assert.equal(food.reduce((n, d) => n + d.costCents, 0), 2.5);
  assert.ok(temple.every((d) => d.sku === "details_enterprise"));
  assert.ok(food.every((d) => d.sku === "details_enterprise_atmosphere"));
  assert.ok(food.some((d) => d.factType === "dining_basics" && d.value.reservable === true && !("servesVegetarianFood" in d.value)));
});

test("F4 config defaults", () => {
  delete process.env.PLACES_ID_LOOKUP_COST_CENTS;
  delete process.env.PLACES_DETAILS_COST_CENTS;
  assert.equal(placesIdLookupCostCents(), 0);
  assert.equal(placesDetailsCostCents(), 2);
});

test("F5 languageCode=en on every call; the area comes from addressComponents, never the formatted string", async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  // Tenryu-ji as Google answers it in the field: the formatted address in Japanese, the components in English.
  const tenryuji = {
    id: "ChIJ-tenryuji",
    displayName: { text: "Tenryu-ji" },
    location: { latitude: 35.0158, longitude: 135.6737 },
    formattedAddress: "日本、〒616-8385 京都府京都市右京区嵯峨天龍寺芒ノ馬場町６８",
    addressComponents: [
      { longText: "68", shortText: "68", types: ["premise"] },
      { longText: "Sagatenryuji Susukinobabacho", shortText: "Sagatenryuji Susukinobabacho", types: ["sublocality_level_2", "sublocality", "political"] },
      { longText: "Ukyo Ward", shortText: "Ukyo Ward", types: ["ward", "political"] },
      { longText: "Kyoto", shortText: "Kyoto", types: ["locality", "political"] },
      { longText: "Kyoto", shortText: "Kyoto", types: ["administrative_area_level_1", "political"] },
      { longText: "Japan", shortText: "JP", types: ["country", "political"] },
      { longText: "616-8385", shortText: "616-8385", types: ["postal_code"] },
    ],
  };
  const a = new PlacesAdapter(
    async (url, init) => {
      calls.push({ url, body: init.body });
      if (url.includes(":searchText")) return { ok: true, status: 200, json: async () => ({ places: [tenryuji] }) };
      return { ok: true, status: 200, json: async () => tenryuji };
    },
    () => "k",
    () => true,
  );
  const req = { need: "stop.hours" as const, market: "kyoto", query: { text: "Tenryu-ji", city: "Kyoto" }, budgetCents: 0 };
  assert.equal(await a.resolvePlaceId(req), "ChIJ-tenryuji");
  const details = await a.fetchByPlaceId("ChIJ-tenryuji", req);
  const legacy = await a.fetch(req);
  assert.equal(calls.length, 3);
  for (const c of calls) {
    if (c.body) assert.equal(JSON.parse(c.body).languageCode, "en", c.url);
    else assert.match(c.url, /[?&]languageCode=en\b/);
  }
  assert.ok(PLACES_BASE_FIELDS.includes("addressComponents" as any));
  for (const drafts of [details, legacy]) {
    const addr = drafts.find((d) => d.factType === "address")!;
    assert.equal(addr.value.area, "Ukyo Ward, Kyoto");
    assert.equal(addr.value.formattedAddress, tenryuji.formattedAddress, "kept verbatim, never parsed");
  }
  // The order is ward → sublocality_level_1 → locality, duplicates dropped; nothing ⇒ null.
  assert.equal(placesAreaText([{ longText: "Gion", types: ["sublocality_level_1"] }, { longText: "Higashiyama Ward", types: ["ward"] }]), "Higashiyama Ward, Gion");
  assert.equal(placesAreaText([{ longText: "Kyoto", types: ["locality"] }, { longText: "Kyoto", types: ["sublocality_level_1"] }]), "Kyoto");
  assert.equal(placesAreaText(undefined), null);
  assert.equal(placesAreaText([{ longText: "616-8385", types: ["postal_code"] }]), null);
  // No components: the English-looking formatted address is still not parsed for an area.
  const plain = new PlacesAdapter(
    async () => ({ ok: true, status: 200, json: async () => ({ id: "ChIJ-x", formattedAddress: "1 Kinkakujicho, Kita Ward, Kyoto" }) }),
    () => "k",
    () => true,
  );
  const noArea = (await plain.fetchByPlaceId("ChIJ-x", req)).find((d) => d.factType === "address")!;
  assert.equal("area" in noArea.value, false);
});
