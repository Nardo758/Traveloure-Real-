/**
 * CATALOG PREVIEW UPGRADE — pure unit proof for client/src/lib/catalog-preview-presentation.ts.
 *
 * Negatives first: the risk in a chip/CTA/price/rating derivation is always the same shape —
 * inventing a location, credential or price the row doesn't carry (§13). These are proven
 * before the happy paths.
 *
 * Run: npx tsx --test client/src/lib/__tests__/catalog-preview-presentation.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveLocationPinChip,
  deriveBookingCta,
  derivePreviewPrice,
  derivePreviewRating,
} from "../catalog-preview-presentation";

// ── NEGATIVES ───────────────────────────────────────────────────────────────────────────

test("N1: no chip when nothing is known — never a guessed location", () => {
  assert.equal(deriveLocationPinChip({}), null);
  assert.equal(deriveLocationPinChip({ productShape: "bundle", deliveryMethod: null }), null);
});

test("N2: an unrecognized delivery method yields no chip rather than a blank 'Remote · '", () => {
  assert.equal(deriveLocationPinChip({ deliveryMethod: "carrier_pigeon" as any }), null);
});

test("N3: hidden booking mode renders NO CTA at all (not a disabled button)", () => {
  assert.equal(deriveBookingCta("hidden"), null);
});

test("N4: derivePreviewRating never invents a 'New' badge for zero reviews (§13 — omit, don't fabricate)", () => {
  assert.equal(derivePreviewRating({ rating: null, count: 0 }), null);
  assert.equal(derivePreviewRating({ rating: "4.8", count: 0 }), null);
  assert.equal(derivePreviewRating({ rating: null, count: 5 }), null);
});

test("N5: a non-numeric price renders the honest 'Custom quote', not '$NaN'", () => {
  const display = derivePreviewPrice({ price: "call for quote", showPrice: true });
  assert.equal(display.text, "Custom quote");
  assert.equal(display.quote, true);
});

test("N6: showPrice=false hides the price without fabricating replacement copy (mock's own treatment)", () => {
  const display = derivePreviewPrice({ price: 680, showPrice: false });
  assert.equal(display.hidden, true);
  // the formatted text is still derived (so a caller can lay it out with `visibility:hidden`
  // and keep the footer row's height consistent) — it is just marked hidden, not blanked.
  assert.equal(display.text, "$680");
});

// ── POSITIVES ───────────────────────────────────────────────────────────────────────────

test("P1: a property or a room is shown as an approximate area (privacy), even with a real city", () => {
  assert.equal(deriveLocationPinChip({ productShape: "property", city: "Kyoto" }), "Approximate area");
  assert.equal(deriveLocationPinChip({ productShape: "property_room", city: "Kyoto" }), "Approximate area");
});

test("P2: a real city wins over a remote delivery method (city is the more specific fact)", () => {
  assert.equal(deriveLocationPinChip({ city: "Kyoto", deliveryMethod: "pdf" }), "Kyoto");
});

test("P3: a remote delivery method with no city renders 'Remote · <label>'", () => {
  assert.equal(deriveLocationPinChip({ deliveryMethod: "pdf" }), "Remote · PDF");
  assert.equal(deriveLocationPinChip({ deliveryMethod: "video" }), "Remote · Video");
  assert.equal(deriveLocationPinChip({ deliveryMethod: "call" }), "Remote · Call");
  assert.equal(deriveLocationPinChip({ deliveryMethod: "voice_notes" }), "Remote · Voice notes");
  assert.equal(deriveLocationPinChip({ deliveryMethod: "async_messaging" }), "Remote · Messaging");
});

test("P4: place-anchored methods (in_person/hybrid) never render as 'Remote'", () => {
  assert.equal(deriveLocationPinChip({ deliveryMethod: "in_person" }), null);
  assert.equal(deriveLocationPinChip({ deliveryMethod: "hybrid" }), null);
});

test("P5: booking CTA — instant is solid 'Book', request is outlined 'Request to book'", () => {
  assert.deepEqual(deriveBookingCta("instant"), { label: "Book", variant: "solid" });
  assert.deepEqual(deriveBookingCta(undefined), { label: "Book", variant: "solid" });
  assert.deepEqual(deriveBookingCta("request"), { label: "Request to book", variant: "outline" });
});

test("P6: a plain numeric price formats as '$N' with no unit when none applies", () => {
  const display = derivePreviewPrice({ price: 680, showPrice: true });
  assert.equal(display.hidden, false);
  assert.equal(display.text, "$680");
  assert.equal(display.unit, null);
  assert.equal(display.quote, false);
});

test("P7: pricing unit suffixes mirror the mock's '/day'-style vocabulary for known price types", () => {
  assert.equal(derivePreviewPrice({ price: 1, priceType: "hourly" }).unit, "/hr");
  assert.equal(derivePreviewPrice({ price: 1, priceType: "per_event" }).unit, "/event");
  assert.equal(derivePreviewPrice({ price: 1, priceType: "per_person" }).unit, "/person");
  assert.equal(derivePreviewPrice({ price: 1, pricingUnit: "per_night" }).unit, "/night");
});

test("P8: a package-tiers price renders 'From $N' in the quote style, like 'From $2,400'", () => {
  const display = derivePreviewPrice({ price: 2400, priceType: "package_tiers" });
  assert.equal(display.text, "From $2400");
  assert.equal(display.quote, true);
});

test("P9: a non-integer price keeps two decimal places (e.g. $0.08/word translation pricing)", () => {
  const display = derivePreviewPrice({ price: 0.08 });
  assert.equal(display.text, "$0.08");
});

test("P10: real reviews render stars + count, never fabricated", () => {
  assert.deepEqual(derivePreviewRating({ rating: "4.8", count: 12 }), { stars: 4.8, count: 12 });
});
