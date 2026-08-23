/**
 * Item 2 Phase 2 — the affiliate-booking CTA guard is fail-closed (§16/§13).
 *
 * Run with: npx tsx --test client/src/components/plancard/__tests__/affiliate-booking.test.ts
 *
 * The one thing that must never happen: a "Book via your Traveloure agent" button on an item that
 * isn't actually agent-bookable — a dead button, or one that would try to book without a token.
 * These pure tests assert resolveAffiliateBooking returns a payload ONLY for an `affiliate_bookable`
 * row carrying a real opaque token, and null for every other shape (including the common case —
 * no affiliate grounding at all — so the CTA is inert on every item until the server stamps it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveAffiliateBooking } = await import("../affiliate-booking");

test("an affiliate_bookable row with a token is offered via the agent rail", () => {
  const r = resolveAffiliateBooking({
    affiliateBooking: { productId: "p1", bookingToken: "tok_abc", bookingType: "affiliate_bookable", title: "Bamboo e-Bike" },
  });
  assert.ok(r, "should resolve a booking");
  assert.equal(r!.bookingToken, "tok_abc");
});

test("no affiliate grounding → null (the common case; CTA inert on every item today)", () => {
  assert.equal(resolveAffiliateBooking({}), null);
  assert.equal(resolveAffiliateBooking({ affiliateBooking: null }), null);
});

test("in_platform_bookable is NOT the agent CTA (that's add-to-cart, handled elsewhere)", () => {
  assert.equal(
    resolveAffiliateBooking({ affiliateBooking: { productId: "p2", bookingToken: "tok_x", bookingType: "in_platform_bookable" } }),
    null,
  );
});

test("an unclassified bookingType never renders the agent CTA (§13)", () => {
  assert.equal(
    resolveAffiliateBooking({ affiliateBooking: { productId: "p3", bookingToken: "tok_y", bookingType: "" } }),
    null,
  );
});

test("a token-less affiliate_bookable row is not bookable (§16 — no token, no button)", () => {
  assert.equal(
    resolveAffiliateBooking({ affiliateBooking: { productId: "p4", bookingToken: "", bookingType: "affiliate_bookable" } }),
    null,
  );
});
