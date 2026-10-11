/**
 * TC-3c — "A better way there", the client's words (ledger `2026-10-11-tc3c-better-way-line`).
 *
 *   BW1 the line is drawn only for the exact pair the server suggested; nothing else is looked up
 *   BW2 minutes and money are the operator's: "+N min" / "N min faster" / "same time", "¥880 per adult";
 *       a figure the server did not send is omitted, never invented
 *   BW3 the swap card's steps read in travel order, and the swap body is the suggestion's own departure
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RIDE_SWAP_LINE,
  rideExtraMinutesLine,
  rideFareLine,
  rideInsertBodyFor,
  rideSuggestionFor,
  rideSwapSteps,
  rideSwapSummary,
  type RideSuggestionView,
} from "../ride-suggestions";

const s: RideSuggestionView = {
  dayNumber: 2,
  legId: "leg-1",
  fromItemId: "a",
  toItemId: "b",
  corridorKey: "a>b",
  serviceId: "sagano-down",
  title: "Sagano Romantic Train",
  departure: "10:02",
  arrival: "10:27",
  boardingName: "Torokko Saga Station",
  exitName: "Torokko Kameoka Station",
  walkToMinutes: 4,
  walkFromMinutes: 6,
  rideMinutes: 25,
  extraMinutes: 12,
  fare: { currency: "JPY", adult: 880, child: 440 },
  returnPair: false,
};

test("BW1 only the exact pair the server suggested", () => {
  const days = [{ activities: [{ id: "a" }, { id: "b" }, { id: "c" }], rideSuggestions: [s] }];
  assert.equal(rideSuggestionFor(days, "a", "b"), s);
  assert.equal(rideSuggestionFor(days, "b", "c"), null);
  assert.equal(rideSuggestionFor(days, "b", "a"), null);
  assert.equal(rideSuggestionFor([{ activities: [{ id: "a" }, { id: "b" }] }], "a", "b"), null);
  assert.equal(rideSuggestionFor(null, "a", "b"), null);
});

test("BW2 the operator's minutes and money; nothing invented", () => {
  assert.equal(rideExtraMinutesLine(12), "+12 min");
  assert.equal(rideExtraMinutesLine(-8), "8 min faster");
  assert.equal(rideExtraMinutesLine(0), "same time");
  assert.equal(rideExtraMinutesLine(null), null);
  assert.equal(rideFareLine({ currency: "JPY", adult: 6000, child: 4500 }), "¥6,000 per adult");
  assert.equal(rideFareLine({ currency: "JPY", adult: null, child: 440 }), null);
  assert.equal(rideFareLine(null), null);
  assert.equal(rideSwapSummary(s), `${RIDE_SWAP_LINE} · Sagano Romantic Train 10:02 · +12 min · ¥880 per adult`);
  assert.equal(rideSwapSummary({ ...s, extraMinutes: null, fare: null }), `${RIDE_SWAP_LINE} · Sagano Romantic Train 10:02`);
});

test("BW3 steps in travel order; the swap body is the suggestion's own departure", () => {
  assert.deepEqual(rideSwapSteps(s), [
    "Walk to Torokko Saga Station (4 min walk)",
    "Sagano Romantic Train, 10:02 → 10:27 (25 min)",
    "Walk on from Torokko Kameoka Station (6 min walk)",
  ]);
  assert.deepEqual(rideInsertBodyFor(s), { serviceId: "sagano-down", dayNumber: 2, afterItemId: "a", departureTime: "10:02" });
});
