/**
 * The Places field mask decides the SKU tier (decision-maker ruling, Oct 3, 2026, from Replit's SKU
 * read of a6e8741 — `reservable` + `servesVegetarianFood` billed every call at Enterprise +
 * Atmosphere, 4¢, instead of Enterprise, 2¢).
 *   F1 a temple (need `stop.hours`) asks the default mask and NO Atmosphere field; tier Enterprise
 *   F2 a restaurant (need `dining`) adds exactly `reservable`, and nothing else; tier Enterprise + Atmosphere
 *   F3 the Details call sends that mask, prices the cost column by its tier, and tags each draft with it
 *   F4 config defaults: ID lookup 0¢, Details 2¢ (list prices; Replit confirms actual billing)
 *
 * Run: npx tsx --test server/utils/__tests__/places-field-mask.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLACES_ATMOSPHERE_FIELDS,
  PLACES_BASE_FIELDS,
  PlacesAdapter,
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
