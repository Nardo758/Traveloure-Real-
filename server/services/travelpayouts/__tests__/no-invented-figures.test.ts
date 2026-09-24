/**
 * PARTNER SEARCH CARDS CARRY NO INVENTED PRICE OR RATING — board task #1200, ledger
 * `2026-09-23-phase2-honesty`.
 *
 * Several Travelpayouts feeds built their cards from constants: "from $200/night" hotel tiers,
 * 9.2 / 4.6 / 4.5 / 4.8 ratings, a $6/day luggage rate, copied insurance prices. None came from a
 * partner. These cards are search entry points — the partner shows the real price for the
 * traveler's own dates — so they must carry `price: null` and `rating: null` (§13; the result card
 * already renders both as absent).
 *
 * Pure: no network — these five feeds build their cards locally once a token is set.
 *   npx tsx --test server/services/travelpayouts/__tests__/no-invented-figures.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TRAVELPAYOUTS_TOKEN = process.env.TRAVELPAYOUTS_TOKEN || "tp-test-token";

const { searchBooking } = await import("../booking.service");
const { searchAgoda } = await import("../agoda.service");
const { searchKlook } = await import("../klook.service");
const { searchRentalcars } = await import("../rentalcars.service");
const { searchSafetyWingPlans } = await import("../safetywing.service");

const feeds = {
  booking: () => searchBooking({ destination: "Kyoto, Japan" }),
  agoda: () => searchAgoda({ destination: "Kyoto, Japan" }),
  klook: () => searchKlook({ destination: "Kyoto, Japan" } as any),
  rentalcars: () => searchRentalcars({ pickupLocation: "Kyoto, Japan" }),
  safetywing: () => searchSafetyWingPlans({ destination: "USA" }),
};

for (const [name, run] of Object.entries(feeds)) {
  test(`${name}: every card has no price and no rating`, async () => {
    const items = await run();
    assert.ok(items.length > 0, `${name} returned cards`);
    for (const item of items) {
      assert.equal(item.price, null, `${name} ${item.id} invents no price`);
      assert.equal(item.rating, null, `${name} ${item.id} invents no rating`);
      assert.ok(!/from\s+\S*\s*\$?\d/i.test(item.description ?? ""), `${name} ${item.id} description quotes no price`);
    }
  });
}
