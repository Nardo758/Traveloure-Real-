/**
 * TC-3b — the ride recommender, pure (ledger `2026-10-11-tc3b-ride-recommender`; rulings 1–4, Oct 11, 2026).
 *
 *   RR1 a ride fits a corridor: boarding and exit in walking range, the first departure after leaving that still
 *       arrives in time; walk minutes and extra minutes over the routed leg
 *   RR2 nothing is guessed: no departures that day, no duration, no window, out of range ⇒ no fit; limited
 *       mobility walks 400 m, not 1,200
 *   RR3 hard filters hide: a child under the stated minimum height, a wheelchair with accessibility unknown, a
 *       booking lead the day can't meet, a past day
 *   RR4 never on a deciding leg (stop with a stored last_admission fact), a skipped corridor, or a ride's own legs
 *   RR5 one suggestion per corridor, at most three per day, best first; out-one-way-back-another is a bonus
 *   RR6 soft ranking only reorders: budget weighs the operator fare, pace weighs extra minutes
 *   RR7 the free plan's teaser is a count per day; no fit ⇒ no day
 *   RR8 the free draft never inserts a ride: its insert writes no provider_service_id
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RIDE_SUGGESTIONS_PER_DAY,
  corridorKey,
  fitRideToCorridor,
  recommendRides,
  rideHardFilter,
  rideTeaserByDay,
  rideWalkRangeMeters,
  type RideCatalogEntry,
  type RideCorridor,
  type RideRankContext,
} from "../ride-recommender";

const DATE = "2026-11-02";
const SAGA = { name: "Torokko Saga Station", lat: 35.0185888, lng: 135.6807067 };
const KAMEOKA = { name: "Torokko Kameoka Station", lat: 35.0131065, lng: 135.606831 };

function ride(over: Partial<RideCatalogEntry> = {}): RideCatalogEntry {
  return {
    serviceId: "sagano-down",
    title: "Sagano Romantic Train (to Kameoka)",
    boarding: SAGA,
    exit: KAMEOKA,
    durationMinutes: 25,
    departuresByDate: { [DATE]: ["09:02", "10:02", "11:02"] },
    childMinHeightCm: null,
    bookingWindowDays: null,
    wheelchairAccessible: null,
    fare: { currency: "JPY", adult: 880, child: 440 },
    pairServiceIds: [],
    ...over,
  };
}

function corridor(over: Partial<RideCorridor> = {}): RideCorridor {
  return {
    dayNumber: 1,
    dateIso: DATE,
    legId: "leg-1",
    fromItemId: "a",
    toItemId: "b",
    from: { lat: 35.0189, lng: 135.6812 }, // ~55 m from the Saga station
    to: { lat: 35.0136, lng: 135.6075 }, // ~90 m from Kameoka
    leaveAt: 9 * 60 + 30,
    arriveAt: 11 * 60,
    legMinutes: 40,
    ...over,
  };
}

const ctx = (over: Partial<RideRankContext> = {}): RideRankContext => ({ todayIso: "2026-10-11", ...over });

test("RR1 the first departure after leaving that still arrives in time; walk and extra minutes", () => {
  const fit = fitRideToCorridor(ride(), corridor(), rideWalkRangeMeters(null));
  assert.ok(fit);
  assert.equal(fit!.departure, "10:02"); // 09:02 leaves before the traveler does
  assert.equal(fit!.arrival, "10:27");
  assert.equal(fit!.walkToMinutes, 1);
  assert.equal(fit!.walkFromMinutes, 2); // ~90 m at 80 m/min, rounded up
  assert.equal(fit!.extraMinutes, 1 + 25 + 2 - 40);
  assert.deepEqual(fit!.fare, { currency: "JPY", adult: 880, child: 440 });
  assert.equal(corridorKey("a", "b"), "a>b");
});

test("RR2 nothing is guessed — no departures, no duration, no window, out of range", () => {
  const walk = rideWalkRangeMeters(null);
  assert.equal(fitRideToCorridor(ride({ departuresByDate: {} }), corridor(), walk), null);
  assert.equal(fitRideToCorridor(ride({ durationMinutes: null }), corridor(), walk), null);
  assert.equal(fitRideToCorridor(ride(), corridor({ leaveAt: null }), walk), null);
  assert.equal(fitRideToCorridor(ride(), corridor({ arriveAt: null }), walk), null);
  assert.equal(fitRideToCorridor(ride(), corridor({ arriveAt: 10 * 60 + 20 }), walk), null); // 10:02 arrives 10:27
  assert.equal(fitRideToCorridor(ride(), corridor({ from: { lat: 35.03, lng: 135.68 } }), walk), null); // ~1.3 km away
  // ~700 m from the boarding point: fine on foot, not for limited mobility
  const far = corridor({ from: { lat: 35.0185888, lng: 135.6884 } });
  assert.ok(fitRideToCorridor(ride(), far, rideWalkRangeMeters("standard")));
  assert.equal(fitRideToCorridor(ride(), far, rideWalkRangeMeters("limited")), null);
  assert.equal(rideWalkRangeMeters("limited"), 400);
  assert.equal(rideWalkRangeMeters(null), 1200);
});

test("RR3 hard filters hide what the ride makes impossible", () => {
  const hozu = ride({ childMinHeightCm: 80 });
  assert.equal(rideHardFilter(hozu, DATE, ctx({ childHeightsCm: [75, 120] })), "child_height");
  assert.equal(rideHardFilter(hozu, DATE, ctx({ childHeightsCm: [80] })), null);
  assert.equal(rideHardFilter(ride(), DATE, ctx({ mobility: "wheelchair" })), "wheelchair_unknown");
  assert.equal(rideHardFilter(ride({ wheelchairAccessible: true }), DATE, ctx({ mobility: "wheelchair" })), null);
  assert.equal(rideHardFilter(ride({ bookingWindowDays: 30 }), DATE, ctx()), "booking_lead"); // 22 days ahead
  assert.equal(rideHardFilter(ride({ bookingWindowDays: 7 }), DATE, ctx()), null);
  assert.equal(rideHardFilter(ride(), "2026-10-10", ctx()), "past_day");
  assert.equal(rideHardFilter(ride(), null, ctx()), "no_date");
  assert.deepEqual(recommendRides([corridor()], [hozu], ctx({ childHeightsCm: [75] })), []);
});

test("RR4 never on a deciding leg, a skipped corridor, or a ride's own legs", () => {
  const c = corridor();
  assert.equal(recommendRides([c], [ride()], ctx()).length, 1);
  assert.deepEqual(recommendRides([c], [ride()], ctx({ decidingItemIds: new Set(["b"]) })), []);
  assert.deepEqual(recommendRides([c], [ride()], ctx({ skippedCorridors: new Set([corridorKey("a", "b")]) })), []);
  assert.deepEqual(recommendRides([c], [ride()], ctx({ rideItemIds: new Set(["a"]) })), []);
  // the deciding rule reads the stop ARRIVED at, not the one left
  assert.equal(recommendRides([c], [ride()], ctx({ decidingItemIds: new Set(["a"]) })).length, 1);
});

test("RR5 one per corridor, at most three per day, best first; the return pair earns its bonus", () => {
  const slow = ride({ serviceId: "slow", durationMinutes: 45 });
  const one = recommendRides([corridor()], [slow, ride()], ctx());
  assert.equal(one.length, 1);
  assert.equal(one[0].serviceId, "sagano-down"); // fewer extra minutes wins
  const many = [1, 2, 3, 4, 5].map((n) => corridor({ legId: `leg-${n}`, fromItemId: `a${n}`, toItemId: `b${n}` }));
  const capped = recommendRides(many, [ride()], ctx());
  assert.equal(capped.length, RIDE_SUGGESTIONS_PER_DAY);
  const day2 = recommendRides([...many, corridor({ dayNumber: 2, legId: "x", fromItemId: "x1", toItemId: "x2" })], [ride()], ctx());
  assert.equal(day2.filter((s) => s.dayNumber === 2).length, 1);
  // out on the down train, back on the up train: both corridors carry the bonus
  const up = ride({ serviceId: "sagano-up", boarding: KAMEOKA, exit: SAGA, departuresByDate: { [DATE]: ["14:30"] } });
  const back = corridor({ legId: "leg-back", fromItemId: "c", toItemId: "d", from: corridor().to, to: corridor().from, leaveAt: 14 * 60, arriveAt: 15 * 60 + 30 });
  const pair = recommendRides([corridor(), back], [ride(), up], ctx());
  assert.equal(pair.length, 2);
  assert.ok(pair.every((s) => s.returnPair));
  const alone = recommendRides([corridor()], [ride(), up], ctx());
  assert.equal(alone[0].returnPair, false);
});

test("RR6 soft ranking reorders, never hides", () => {
  const dear = ride({ serviceId: "dear", fare: { currency: "JPY", adult: 6000, child: 4500 } });
  const cheap = ride({ serviceId: "cheap", durationMinutes: 30 });
  assert.equal(recommendRides([corridor()], [dear, cheap], ctx())[0].serviceId, "dear"); // 5 fewer minutes
  assert.equal(recommendRides([corridor()], [dear, cheap], ctx({ budgetBand: "budget" }))[0].serviceId, "cheap");
  const relaxed = recommendRides([corridor()], [ride({ durationMinutes: 50 })], ctx({ pace: "relaxed" }));
  const packed = recommendRides([corridor()], [ride({ durationMinutes: 50 })], ctx({ pace: "packed" }));
  assert.equal(relaxed.length, 1);
  assert.equal(packed.length, 1);
  assert.ok(relaxed[0].score > packed[0].score);
});

test("RR7 the free plan's teaser is a count per day; no fit means no day", () => {
  const free = [corridor({ legId: null, legMinutes: null }), corridor({ legId: null, legMinutes: null, dayNumber: 2, fromItemId: "p", toItemId: "q", leaveAt: 16 * 60 })];
  const t = rideTeaserByDay(free, [ride()], ctx());
  assert.deepEqual(t.get(1), { rides: 1 });
  assert.equal(t.has(2), false); // the last departure (11:02) is before 16:00
  const s = recommendRides(free, [ride()], ctx());
  assert.equal(s[0].extraMinutes, null); // a free corridor has no leg minutes to compare
});

test("RR8 the free draft's item insert never writes a provider_service_id", () => {
  const src = readFileSync(new URL("../../server/services/content-query.service.ts", import.meta.url), "utf8");
  const start = src.indexOf("export async function saveGeneratedItinerarySnapshot");
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("\nexport ", start + 10));
  assert.ok(/insert\(itineraryItems\)/.test(body));
  assert.equal(/providerServiceId|provider_service_id/.test(body), false);
});
