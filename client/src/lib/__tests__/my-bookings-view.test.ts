/**
 * Ledger `2026-09-25-p1-approve-and-quotes` (Pass 3 finding P3-T2-QUOTE-INVISIBLE-WITHOUT-BOOKINGS):
 * a traveler whose only row is a quote must still get the tab block, opened on Quotes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { myBookingsDefaultTab, myBookingsShowsEmptyState } from "../my-bookings-view";

test("V1 · a quote alone keeps the tabs on screen and opens Quotes", () => {
  const v = { bookingCount: 0, purchaseCount: 0, quoteCount: 1 };
  assert.equal(myBookingsShowsEmptyState(v), false);
  assert.equal(myBookingsDefaultTab(v), "quotes");
});

test("V2 · nothing at all is the empty state", () => {
  assert.equal(myBookingsShowsEmptyState({ bookingCount: 0, purchaseCount: 0, quoteCount: 0 }), true);
});

test("V3 · bookings open All; purchases without bookings open Trips — quotes never outrank either", () => {
  assert.equal(myBookingsDefaultTab({ bookingCount: 2, purchaseCount: 1, quoteCount: 3 }), "all");
  assert.equal(myBookingsDefaultTab({ bookingCount: 0, purchaseCount: 1, quoteCount: 3 }), "packages");
});
