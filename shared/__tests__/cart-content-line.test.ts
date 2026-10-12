/**
 * THE CART'S CONTENT LINE — the admission `POST /api/cart` runs and the one reader predicate.
 * Ledgers `2026-09-26-rc9-external-cart-lines` and `2026-09-26-partner-picks-map-coords`; re-pinned
 * by GW-1 (`2026-10-12-gw1-guard-tags`).
 *
 * WHY THIS FILE EXISTS. Both rulings were pinned by `client/src/lib/__tests__/template-external-add.test.ts`,
 * which R354 deleted together with the experience-template page. The page's pick builder left with
 * it, but the rules it relied on did not: `shared/cart-content-line.ts` is still the admission on
 * `POST /api/cart` (`server/routes.ts`), the content-line predicate in `client/src/pages/cart.tsx`,
 * and the coordinate rule the cart→item projection reads (`cart-projection.service.ts`). These are
 * the surviving proofs, rewritten against the shared module alone.
 *
 * Not re-pinned here, because the behaviour left with the page: the template pick builder
 * (`resolveTemplateExternalAdd`: rails, transfer/place refusals, page ids) and G7 (the builder
 * carrying a pick's own coordinates).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CART_CONTENT_ID_MAX_LENGTH,
  CART_CONTENT_META_KEYS,
  CART_CONTENT_META_VALUE_MAX_LENGTH,
  isAdmissibleContentId,
  isCartContentType,
  isContentCartLine,
  normalizeCartContentCoordinates,
  pickCartContentMeta,
  readCartContentCoordinates,
} from "../cart-content-line";

test("A1: the five content types are admitted; anything else is not a content line", () => {
  for (const t of ["gem", "hotel", "activity", "event", "neighborhood"]) assert.ok(isCartContentType(t), t);
  for (const t of ["transfer", "place", "service", "", null, undefined, 3]) assert.equal(isCartContentType(t), false, String(t));
});

test("A2: an over-long or empty id is refused, never truncated", () => {
  assert.equal(isAdmissibleContentId("x".repeat(CART_CONTENT_ID_MAX_LENGTH)), true);
  assert.equal(isAdmissibleContentId("x".repeat(CART_CONTENT_ID_MAX_LENGTH + 1)), false);
  assert.equal(isAdmissibleContentId(""), false);
  assert.equal(isAdmissibleContentId(42), false);
});

test("A3: the envelope keeps only display strings — never a price (§14)", () => {
  assert.equal(pickCartContentMeta("nope"), undefined);
  assert.equal(pickCartContentMeta(null), undefined);
  assert.deepEqual(pickCartContentMeta({ name: "x", price: "99", city: "", imageUrl: 5 }), { name: "x" });
  const kept = pickCartContentMeta({ name: "Show", description: "2h", city: "Lisbon", amount: 10, totalPrice: "5" });
  assert.deepEqual(kept, { name: "Show", description: "2h", city: "Lisbon" });
  for (const k of Object.keys(kept ?? {})) assert.ok((CART_CONTENT_META_KEYS as readonly string[]).includes(k));
  const long = pickCartContentMeta({ name: "n".repeat(CART_CONTENT_META_VALUE_MAX_LENGTH + 50) });
  assert.equal(long?.name.length, CART_CONTENT_META_VALUE_MAX_LENGTH);
});

test("A4: one content-line predicate", () => {
  assert.equal(isContentCartLine({ isContentItem: true }), true);
  assert.equal(isContentCartLine({ contentId: "a", contentType: "hotel" }), true);
  assert.equal(isContentCartLine({ contentId: "a", contentType: null }), false);
  assert.equal(isContentCartLine({ contentId: null, contentType: "hotel" }), false);
  assert.equal(isContentCartLine({}), false);
});

test("G1: admission keeps a valid pair as normalized strings", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 35.0116, lng: 135.7681 }), {
    name: "Inn",
    lat: "35.0116",
    lng: "135.7681",
  });
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: "35.01160", lng: " -0.1276 " }), {
    name: "Inn",
    lat: "35.0116",
    lng: "-0.1276",
  });
  // Precision is capped at the item column's 7 decimals; the range ends are inclusive.
  assert.deepEqual(normalizeCartContentCoordinates(1.123456789, 2), { lat: "1.1234568", lng: "2" });
  assert.deepEqual(normalizeCartContentCoordinates(-90, 180), { lat: "-90", lng: "180" });
  assert.deepEqual(normalizeCartContentCoordinates(-0, 0), { lat: "0", lng: "0" });
});

test("G2: a half pair drops both halves", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 35 }), { name: "Inn" });
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lng: 135 }), { name: "Inn" });
  assert.equal(normalizeCartContentCoordinates(35, undefined), null);
  assert.equal(normalizeCartContentCoordinates(null, 135), null);
});

test("G3: an out-of-range half drops both halves", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 90.0001, lng: 10 }), { name: "Inn" });
  assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 10, lng: -180.5 }), { name: "Inn" });
  assert.equal(normalizeCartContentCoordinates(-91, 0), null);
  assert.equal(normalizeCartContentCoordinates(0, 181), null);
});

test("G4: a non-numeric half drops both halves", () => {
  const bads: unknown[] = ["", "  ", "abc", "1e2", "0x10", "12,5", NaN, Infinity, -Infinity, true, {}, []];
  for (const bad of bads) {
    assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: bad, lng: 10 }), { name: "Inn" }, String(bad));
    assert.deepEqual(pickCartContentMeta({ name: "Inn", lat: 10, lng: bad }), { name: "Inn" }, String(bad));
  }
});

test("G5: absent stays absent", () => {
  assert.deepEqual(pickCartContentMeta({ name: "Inn", city: "Kyoto" }), { name: "Inn", city: "Kyoto" });
  assert.deepEqual(pickCartContentMeta({}), {});
});

test("G6: the reader returns numbers for a valid stored pair, null otherwise", () => {
  assert.deepEqual(readCartContentCoordinates({ name: "Inn", lat: "35.0116", lng: "135.7681" }), {
    lat: 35.0116,
    lng: 135.7681,
  });
  assert.equal(readCartContentCoordinates({ name: "Inn" }), null);
  assert.equal(readCartContentCoordinates({ lat: "35" }), null);
  assert.equal(readCartContentCoordinates({ lat: "95", lng: "0" }), null);
  assert.equal(readCartContentCoordinates(null), null);
  assert.equal(readCartContentCoordinates("35,135"), null);
});
