/**
 * provider-directory-listings.test.ts — which listings a /providers card names, and when one of
 * them may say "Most booked" (server/services/provider-directory-listings.ts; ledger
 * `2026-09-23-provider-directory-card`). Each test names the claim the card would make if the rule
 * broke.
 *
 *   L1  most-booked first, then best-rated, then newest; at most three named
 *   L2  "Most booked" only for a strict, non-zero leader — never on a tie, never on zero
 *   L3  a hidden price is never published, and no booking count or rating rides the output
 *   L4  the "From" figure is the one shared rule, over every listing
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  directoryCardListings,
  rankDirectoryListings,
  type DirectoryListingFacts,
} from "../services/provider-directory-listings";
import { lowestListedPrice } from "@shared/listing-price";

const listing = (over: Partial<DirectoryListingFacts> & { id: string }): DirectoryListingFacts => ({
  name: over.id,
  price: "50",
  showPrice: true,
  priceType: "fixed",
  pricingUnit: null,
  bookingCount: 0,
  averageRating: null,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

test("L1 order: bookings, then rating, then newest; the card names three", () => {
  const ranked = rankDirectoryListings([
    listing({ id: "old-unrated" , createdAt: "2025-01-01T00:00:00Z" }),
    listing({ id: "new-unrated", createdAt: "2026-06-01T00:00:00Z" }),
    listing({ id: "rated", averageRating: 4.9 }),
    listing({ id: "booked-twice", bookingCount: 2 }),
    listing({ id: "booked-five", bookingCount: 5, averageRating: 3.1 }),
  ]);
  assert.deepEqual(ranked.map((l) => l.id), ["booked-five", "booked-twice", "rated", "new-unrated", "old-unrated"]);
  const card = directoryCardListings(ranked);
  assert.equal(card.length, 3);
  assert.deepEqual(card.map((l) => l.id), ["booked-five", "booked-twice", "rated"]);
});

test("L2 'Most booked' is a strict leader with at least one booking", () => {
  const lead = directoryCardListings([listing({ id: "a", bookingCount: 4 }), listing({ id: "b", bookingCount: 3 })]);
  assert.deepEqual(lead.map((l) => l.mostBooked), [true, false]);

  const tie = directoryCardListings([listing({ id: "a", bookingCount: 3 }), listing({ id: "b", bookingCount: 3 })]);
  assert.deepEqual(tie.map((l) => l.mostBooked), [false, false], "a tie has no single most-booked listing");

  const none = directoryCardListings([listing({ id: "a" }), listing({ id: "b" })]);
  assert.deepEqual(none.map((l) => l.mostBooked), [false, false], "no bookings is no claim");

  const only = directoryCardListings([listing({ id: "a", bookingCount: 1 })]);
  assert.equal(only[0].mostBooked, true, "a single booked listing leads by definition");

  const bad = directoryCardListings([listing({ id: "a", bookingCount: Number.NaN }), listing({ id: "b", bookingCount: -2 })]);
  assert.deepEqual(bad.map((l) => l.mostBooked), [false, false], "a non-count is zero, never a lead");
});

test("L3 a hidden price stays hidden; counts and ratings never leave the function", () => {
  const [row] = directoryCardListings([listing({ id: "a", price: "120", showPrice: false, bookingCount: 9, averageRating: 4.2 })]);
  assert.equal(row.price, null);
  assert.deepEqual(Object.keys(row).sort(), ["id", "mostBooked", "name", "price", "priceType", "pricingUnit"]);
});

test("L4 the From figure ignores hidden, missing and non-positive prices, across every listing", () => {
  assert.equal(
    lowestListedPrice([
      { price: "40", showPrice: false },
      { price: null },
      { price: "0" },
      { price: "abc" },
      { price: "145.00" },
      { price: "85.50", showPrice: null },
    ]),
    85.5,
  );
  assert.equal(lowestListedPrice([{ price: "0" }, { price: "10", showPrice: false }]), null);
  assert.equal(lowestListedPrice([]), null);
});
