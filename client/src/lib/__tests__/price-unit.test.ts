/**
 * THE ONE price-unit derivation — pure unit proof for client/src/lib/price-unit.ts
 * (ledger `2026-09-14-price-unit-one-derivation`, CLAUDE.md §18 rule 1 / §13).
 *
 * Negatives first, because the defect this module exists to end is a FABRICATED unit: the
 * listing page rendered "per service" over a `per_person` listing (production QA 2026-09-13,
 * Napa Valley Wine Experience, $195) because its local chain had no per_person branch and a
 * catch-all below it. N1–N5 pin that an unknown / absent / model-only input derives NOTHING,
 * so a caller can never be handed a unit to print for a fact it does not have.
 *
 * P6–P9 pin the exact spellings the four surfaces rendered BEFORE this module existed, so a
 * later edit to the tables cannot quietly re-word a traveler-facing label.
 *
 * NOT COVERED HERE: the amount, its formatting, and each surface's own fallback copy
 * ("Custom quote", "contact the provider for pricing", a bare dollar amount) — those are
 * caller-side copy decisions this module deliberately does not own, and they are asserted
 * where they are authored, not here. Nothing in this file reads a price.
 *
 * Run: npx tsx --test client/src/lib/__tests__/price-unit.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePriceUnit,
  priceUnitSuffix,
  priceUnitPhrase,
  priceUnitWord,
} from "../price-unit";

// ── NEGATIVES ───────────────────────────────────────────────────────────────────────────

test("N1: nothing known derives NOTHING — never a default unit", () => {
  assert.equal(resolvePriceUnit({}), null);
  assert.equal(resolvePriceUnit({ priceType: null, pricingUnit: null }), null);
  assert.equal(resolvePriceUnit({ priceType: undefined, pricingUnit: undefined }), null);
  assert.equal(priceUnitSuffix({}), null);
  assert.equal(priceUnitPhrase({}), null);
});

test("N2: an unrecognized priceType/pricingUnit derives NOTHING, never a nearest guess", () => {
  assert.equal(resolvePriceUnit({ priceType: "per_fortnight" }), null);
  assert.equal(resolvePriceUnit({ pricingUnit: "per_carriage" }), null);
  assert.equal(resolvePriceUnit({ priceType: "PER_PERSON" }), null, "the match is exact, not case-folded");
  assert.equal(resolvePriceUnit({ priceType: "" }), null);
});

test("N3: the pricing MODELS name no unit — a model is not a unit (§13)", () => {
  for (const priceType of ["fixed", "variable", "custom_quote", "package_tiers", "range"]) {
    assert.equal(resolvePriceUnit({ priceType }), null, `${priceType} must derive no unit`);
    assert.equal(priceUnitSuffix({ priceType }), null);
    assert.equal(priceUnitPhrase({ priceType }), null);
  }
});

test("N4: no spelling of the answer is ever the literal 'per service'", () => {
  const inputs = [
    {}, { priceType: "fixed" }, { priceType: "per_person" }, { priceType: "hourly" },
    { priceType: "per_event" }, { pricingUnit: "per_night" }, { priceType: "range" },
  ];
  for (const input of inputs) {
    assert.notEqual(priceUnitPhrase(input), "per service");
    assert.notEqual(priceUnitSuffix(input), "/service");
  }
});

test("N5: the module supplies no fallback copy of its own — null is the whole answer", () => {
  // A caller must choose its own honest absence; this module never returns a string for a
  // row it cannot classify.
  assert.equal(typeof priceUnitSuffix({ priceType: "fixed" }), "object"); // i.e. null
  assert.equal(typeof priceUnitPhrase({ priceType: "fixed" }), "object");
});

// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────

test("P1: `per_person` derives a unit — the hole the listing page fell through", () => {
  assert.equal(resolvePriceUnit({ priceType: "per_person" }), "person");
  assert.equal(priceUnitSuffix({ priceType: "per_person" }), "/person");
  assert.equal(priceUnitPhrase({ priceType: "per_person" }), "per person");
  assert.equal(priceUnitWord("person"), "person");
});

// ── PRECEDENCE ──────────────────────────────────────────────────────────────────────────

test("P2: `pricingUnit` is read BEFORE `priceType` — the property rung's own answer wins", () => {
  assert.equal(resolvePriceUnit({ priceType: "per_person", pricingUnit: "per_night" }), "night");
  assert.equal(resolvePriceUnit({ priceType: "hourly", pricingUnit: "per_night" }), "night");
  // and an unrecognized pricingUnit does not BLOCK the priceType answer
  assert.equal(resolvePriceUnit({ priceType: "hourly", pricingUnit: "per_carriage" }), "hour");
  assert.equal(resolvePriceUnit({ priceType: "hourly", pricingUnit: null }), "hour");
});

// ── THE FULL MAPPING ────────────────────────────────────────────────────────────────────

test("P3: every derivable priceType, exhaustively", () => {
  assert.equal(resolvePriceUnit({ priceType: "hourly" }), "hour");
  assert.equal(resolvePriceUnit({ priceType: "per_event" }), "event");
  assert.equal(resolvePriceUnit({ priceType: "per_person" }), "person");
});

test("P4: every derivable pricingUnit, exhaustively", () => {
  assert.equal(resolvePriceUnit({ pricingUnit: "per_night" }), "night");
  assert.equal(resolvePriceUnit({ pricingUnit: "per_person" }), "person");
  assert.equal(resolvePriceUnit({ pricingUnit: "per_hour" }), "hour");
  assert.equal(resolvePriceUnit({ pricingUnit: "per_group" }), "group");
});

test("P5: the two presentations are two spellings of ONE derived unit", () => {
  // hour is the one unit whose short and long spellings differ — the card register says "/hr"
  // and the phrase register says "per hour", and both come from the same derivation.
  assert.equal(resolvePriceUnit({ priceType: "hourly" }), "hour");
  assert.equal(priceUnitSuffix({ priceType: "hourly" }), "/hr");
  assert.equal(priceUnitPhrase({ priceType: "hourly" }), "per hour");
});

// ── THE PRE-EXISTING LABELS, PRESERVED ──────────────────────────────────────────────────

test("P6: Catalog preview suffixes are byte-identical to the local copy this replaced", () => {
  assert.equal(priceUnitSuffix({ pricingUnit: "per_night" }), "/night");
  assert.equal(priceUnitSuffix({ priceType: "hourly" }), "/hr");
  assert.equal(priceUnitSuffix({ priceType: "per_event" }), "/event");
  assert.equal(priceUnitSuffix({ priceType: "per_person" }), "/person");
});

test("P7: storefront phrases are byte-identical to the local copy this replaced", () => {
  assert.equal(priceUnitPhrase({ pricingUnit: "per_night" }), "per night");
  assert.equal(priceUnitPhrase({ priceType: "per_person" }), "per person");
  assert.equal(priceUnitPhrase({ priceType: "hourly" }), "per hour");
  assert.equal(priceUnitPhrase({ priceType: "per_event" }), "per event");
});

test("P8: Distribute roster suffixes are byte-identical to the local copy this replaced", () => {
  assert.equal(priceUnitSuffix({ pricingUnit: "per_person" }), "/person");
  assert.equal(priceUnitSuffix({ pricingUnit: "per_group" }), "/group");
  assert.equal(priceUnitSuffix({ pricingUnit: "per_night" }), "/night");
  assert.equal(priceUnitSuffix({ pricingUnit: "per_hour" }), "/hr");
});

test("P9: the listing page's own spaced-slash register composes from the bare short word", () => {
  assert.equal(priceUnitWord("night"), "night");
  assert.equal(priceUnitWord("hour"), "hr");
  assert.equal(priceUnitWord("event"), "event");
  assert.equal(priceUnitWord("group"), "group");
});

test("P10 (Locked Decision 56): a per-person price BASIS reads per person; per booking or unstated adds no unit", () => {
  assert.equal(resolvePriceUnit({ priceType: "fixed", priceBasis: "per_person" }), "person");
  assert.equal(priceUnitPhrase({ priceType: "fixed", priceBasis: "per_person" }), "per person");
  assert.equal(resolvePriceUnit({ priceType: "fixed", priceBasis: "per_booking" }), null);
  assert.equal(resolvePriceUnit({ priceType: "fixed", priceBasis: null }), null);
  // pricingUnit still wins: a per-night stay is per night whatever the basis says.
  assert.equal(resolvePriceUnit({ pricingUnit: "per_night", priceBasis: "per_person" }), "night");
});
