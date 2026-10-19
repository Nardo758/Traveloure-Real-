/**
 * SH-1 item 4 — an event outside its market city (ledger `2026-10-19-sh1-venue-city`).
 *
 *   VC1  threshold unset: a stated locality other than the market city is outside; none, or the city itself, is in
 *   VC2  threshold set (a fixture value — Leon sets the real one): the straight-line distance from the market centre
 *        decides; a venue with no point falls back to the locality rule
 *   VC3  the copy: "In Osaka"; "{Venue}, {Venue city} · Outside the city, planned from {City}"
 *   VC4  an outside event is not listed or counted under its market city, only under "all"; it counts toward its
 *        venue city in "N events · N cities"
 *   VC5  the setting: a positive number of km, nothing else; unset reads as null
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventPlacement, isValidOutsideCityThresholdSetting, parseOutsideCityThresholdKm, venueCityLabel } from "../city-events";
import { countedCityKey, eventPlace, matchesCity } from "../events-calendar";

// Placeholder points (not real places): the centre at 0,0; "near" ~1 km away, "far" ~111 km away.
const centre = { lat: 0, lng: 0 };
const near = { venueLat: 0.009, venueLng: 0 };
const far = { venueLat: 1, venueLng: 0 };
const FIXTURE_KM = 50;

test("VC1 — threshold unset: the venue's city decides", () => {
  assert.deepEqual(eventPlacement({ city: "Kyoto", venueLocality: "Osaka", ...near, centre, thresholdKm: null }), { outsideCity: true, venueCity: "Osaka" });
  assert.deepEqual(eventPlacement({ city: "Kyoto", venueLocality: null, ...far, centre, thresholdKm: null }), { outsideCity: false, venueCity: null });
  assert.deepEqual(eventPlacement({ city: "Kyoto", venueLocality: " kyoto ", venueLat: null, venueLng: null, centre, thresholdKm: null }), { outsideCity: false, venueCity: null });
});

test("VC2 — threshold set: the straight-line distance decides", () => {
  assert.deepEqual(eventPlacement({ city: "Kyoto", venueLocality: "Osaka", ...near, centre, thresholdKm: FIXTURE_KM }), { outsideCity: false, venueCity: null });
  assert.deepEqual(eventPlacement({ city: "Kyoto", venueLocality: "Suzuka", ...far, centre, thresholdKm: FIXTURE_KM }), { outsideCity: true, venueCity: "Suzuka" });
  assert.deepEqual(eventPlacement({ city: "Kyoto", venueLocality: null, ...far, centre, thresholdKm: FIXTURE_KM }), { outsideCity: true, venueCity: null }, "outside, venue city not stated: never guessed");
  assert.deepEqual(eventPlacement({ city: "Kyoto", venueLocality: "Osaka", venueLat: null, venueLng: null, centre, thresholdKm: FIXTURE_KM }), { outsideCity: true, venueCity: "Osaka" }, "no point ⇒ the locality rule");
});

const card = (over: Record<string, unknown>) =>
  ({ venue: "Kyocera Dome Osaka", city: "Kyoto", marketKey: "kyoto", venueLocality: "Osaka", outsideCity: true, venueCity: "Osaka", ...over }) as any;

test("VC3 — the copy", () => {
  assert.equal(venueCityLabel(card({})), "In Osaka");
  assert.equal(venueCityLabel(card({ outsideCity: false })), null);
  assert.equal(eventPlace(card({})), "Kyocera Dome Osaka, Osaka · Outside the city, planned from Kyoto");
  assert.equal(eventPlace(card({ venueCity: null })), "Kyocera Dome Osaka · Outside the city, planned from Kyoto");
  assert.equal(eventPlace(card({ outsideCity: false, venueCity: null, venue: "Kyoto Concert Hall" })), "Kyoto Concert Hall · Kyoto");
});

test("VC4 — not counted for the market city", () => {
  const out = card({});
  const inside = card({ outsideCity: false, venueCity: null, venue: "Kyoto Concert Hall", venueLocality: null });
  assert.equal(matchesCity(out, "kyoto"), false);
  assert.equal(matchesCity(out, "all"), true);
  assert.equal(matchesCity(inside, "kyoto"), true);
  assert.equal(new Set([out, inside].map(countedCityKey)).size, 2);
  assert.notEqual(countedCityKey(out), "kyoto");
});

test("VC5 — the setting", () => {
  assert.equal(parseOutsideCityThresholdKm(null), null);
  assert.equal(parseOutsideCityThresholdKm(""), null);
  assert.equal(parseOutsideCityThresholdKm("0"), null);
  assert.equal(parseOutsideCityThresholdKm("12.5"), 12.5);
  assert.equal(isValidOutsideCityThresholdSetting("12.5"), true);
  for (const bad of ["0", "-3", "ten", "1e3", ""]) assert.equal(isValidOutsideCityThresholdSetting(bad), false, bad);
});
