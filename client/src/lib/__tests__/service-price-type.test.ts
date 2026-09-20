/**
 * SERVICE PRICE-TYPE MAPPERS — round-trip pin (ledger `2026-09-20-quote-listing-goes-live`).
 *
 * The wizard's display labels and `provider_services.price_type` must round-trip through BOTH
 * directions for every value, `custom_quote` included — a listing whose price authority is a
 * `service_quotes` row it issues per request, never a number in this form (Locked Decision 49;
 * `server/services/listing-price-gate.ts` is the server half of this same fix).
 *
 * Run: npx tsx --test client/src/lib/__tests__/service-price-type.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapPriceTypeFromBackend,
  mapPriceTypeToBackend,
  mapDefaultPriceTypeHint,
  type ServicePriceTypeDisplay,
} from "../service-price-type";

const PAIRS: Array<[ServicePriceTypeDisplay, string]> = [
  ["Fixed", "fixed"],
  ["Range", "range"],
  ["Per-person", "per_person"],
  ["Hourly", "hourly"],
  ["Package tiers", "package_tiers"],
  ["Per-event", "per_event"],
  ["Custom quote", "custom_quote"],
];

test("every display value maps to its wire value and back", () => {
  for (const [display, wire] of PAIRS) {
    assert.equal(mapPriceTypeToBackend(display), wire, `${display} -> backend`);
    assert.equal(mapPriceTypeFromBackend(wire), display, `${wire} -> display`);
  }
});

test("custom_quote round-trips (the defect's exact gap — the wizard had no way to select or display it)", () => {
  assert.equal(mapPriceTypeToBackend("Custom quote"), "custom_quote");
  assert.equal(mapPriceTypeFromBackend("custom_quote"), "Custom quote");
});

test("an unrecognised or absent backend value falls back to Fixed, never a fabricated selection (§13)", () => {
  assert.equal(mapPriceTypeFromBackend(null), "Fixed");
  assert.equal(mapPriceTypeFromBackend(undefined), "Fixed");
  assert.equal(mapPriceTypeFromBackend("not_a_real_price_type"), "Fixed");
});

test("mapDefaultPriceTypeHint also recognises custom_quote, alongside every other hint", () => {
  for (const [display, wire] of PAIRS) {
    assert.equal(mapDefaultPriceTypeHint(wire), display, `hint ${wire} -> ${display}`);
  }
  assert.equal(mapDefaultPriceTypeHint("not_a_real_hint"), null);
});
