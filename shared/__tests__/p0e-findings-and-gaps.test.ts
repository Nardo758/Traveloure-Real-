/**
 * P0-e (decision-maker, Oct 12, 2026; ledger `2026-10-12-p0e-findings-and-gaps`) — the pure rules.
 *
 *   PE1 item 4: the name check — occasion words are generic; a title naming only the market's neighbourhoods
 *       or wards is an area; the two Kyoto examples are placeholders; a real place is not
 *   PE2 item 2: the hours fact for a date — the season that covers it, the Places list as fallback
 *   PE3 item 2: the last entry for a date — every candidate, not only the first stored
 *   PE4 item 2: the five approved stop lines, and the time label
 *   PE5 item 4: the gap list splits by kind; each group omitted when empty
 *
 * Run: npx tsx --test shared/__tests__/p0e-findings-and-gaps.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { namedPlaceTokens, unnamedPlaceReason } from "../place-name-gate";
import { MARKET_WARDS } from "../market-wards";
import { hoursFactForDate, lastAdmissionForDate } from "../feasibility-facts";
import { UNLOCATED_PLACEHOLDERS_HEAD, UNLOCATED_PLACES_HEAD, clockLabel, closedOnArrival, findingStopLines, unlocatedStopGroups } from "../optimizer-lead";

const KYOTO_AREAS = [...MARKET_WARDS.kyoto, "Gion", "Higashiyama", "Arashiyama", "Pontocho", "Kyoto Station Area", "Nishijin", "Kawaramachi / Sanjo", "Fushimi"];

test("PE1 the name check: the two Kyoto examples are placeholders, real places are not", () => {
  assert.equal(namedPlaceTokens({ title: "Kaiseki Farewell Dinner" }, "Kyoto").size, 0, "farewell is an occasion word");
  assert.equal(unnamedPlaceReason({ title: "Kaiseki Farewell Dinner" }, "Kyoto", KYOTO_AREAS), "no_named_tokens");
  assert.equal(unnamedPlaceReason({ title: "Late Dinner in Shimogyo" }, "Kyoto", KYOTO_AREAS), "area_title", "only a ward's name");
  assert.equal(unnamedPlaceReason({ title: "Welcome Picnic in Higashiyama" }, "Kyoto", KYOTO_AREAS), "area_title", "only a neighbourhood's name");
  assert.equal(unnamedPlaceReason({ title: "Ginkaku-ji Temple" }, "Kyoto", KYOTO_AREAS), null);
  const withGinkaku = [...KYOTO_AREAS, "Ginkaku-ji & Philosopher's Path"];
  assert.equal(unnamedPlaceReason({ title: "Ginkaku-ji Temple" }, "Kyoto", withGinkaku), null, "a word of a longer neighbourhood name is still the temple");
  assert.equal(unnamedPlaceReason({ title: "Philosopher's Path" }, "Kyoto", withGinkaku), null, "the path is not the whole neighbourhood");
  assert.equal(unnamedPlaceReason({ title: "Ginkaku-ji & Philosopher's Path" }, "Kyoto", withGinkaku), "area_title", "the neighbourhood's own name");
  assert.equal(unnamedPlaceReason({ title: "Fushimi Inari Shrine" }, "Kyoto", KYOTO_AREAS), null, "a ward's name beside a place's is still a place");
  assert.equal(unnamedPlaceReason({ title: "Late Dinner in Shimogyo" }, "Kyoto"), null, "with no area names known the title is read as before");
  assert.equal(unnamedPlaceReason({ title: "Gion Walk" }, "Kyoto"), "area_title", "smoke 7's words still apply");
});

const places = { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"], checkedAt: null, official: false };
const summer = { weekdayDescriptions: ["Monday: 8:30 AM – 5:00 PM"], checkedAt: null, official: true, season: { from: "03-01", to: "11-30" } };
const winter = { weekdayDescriptions: ["Monday: 9:00 AM – 4:30 PM"], checkedAt: null, official: true, season: { from: "12-01", to: "02-28" } };

test("PE2 the hours for a date: the covering season, then the Places list", () => {
  assert.equal(hoursFactForDate([summer, winter, places], "2027-07-12"), summer);
  assert.equal(hoursFactForDate([summer, winter, places], "2027-01-11"), winter, "the winter season wraps the year end");
  assert.equal(hoursFactForDate([summer, places], "2027-01-11"), places, "no season covers it ⇒ the Places list");
  assert.equal(hoursFactForDate([summer], "2027-01-11"), null, "nothing covers it ⇒ unchecked, never a guess");
  // Ginkaku-ji at 16:45 on a winter Monday: after the 16:30 close; on a summer Monday: open.
  const at = (fact: typeof places) => closedOnArrival([{ id: "g", title: "Ginkaku-ji Temple", dayNumber: 2, dateIso: "2027-01-11", startTime: "16:45" }], new Map([["g", fact]]), "2027-01-10");
  assert.deepEqual(findingStopLines(at(hoursFactForDate([summer, winter, places], "2027-01-11")!)!), ["Ginkaku-ji Temple · Day 2 · 16:45 starts after closing (4:30 PM)"]);
  assert.equal(at(summer), null);
});

test("PE3 the last entry for a date reads every candidate", () => {
  const w = { byWeekday: { "1": "16:00" }, season: { from: "12-01", to: "02-28" } };
  const s = { byWeekday: { "1": "16:30" }, season: { from: "03-01", to: "11-30" } };
  assert.equal(lastAdmissionForDate([w, s], "2027-07-12"), 16 * 60 + 30, "the winter fact stored first does not hide summer");
  assert.equal(lastAdmissionForDate([w, s], "2027-01-11"), 16 * 60);
  assert.equal(lastAdmissionForDate([w], "2027-07-12"), null);
});

test("PE4 the five approved stop lines", () => {
  const f = (reason: any, atMin?: number) =>
    findingStopLines({ kind: "closed_on_arrival", count: 1, days: [2], stops: [{ itemId: "g", title: "Ginkaku-ji Temple", day: 2, reason, ...(atMin != null ? { atMin } : {}) }] });
  assert.deepEqual(f("after_closing", 17 * 60), ["Ginkaku-ji Temple · Day 2 starts after closing (5:00 PM)"]);
  assert.deepEqual(f("before_opening", 9 * 60), ["Ginkaku-ji Temple · Day 2 starts before opening (9:00 AM)"]);
  assert.deepEqual(f("closed_day"), ["Ginkaku-ji Temple · Day 2 is closed that day"]);
  assert.deepEqual(f("closes_early", 17 * 60), ["Ginkaku-ji Temple · Day 2 closes at 5:00 PM, before your visit ends"]);
  assert.deepEqual(f("after_last_entry", 16 * 60 + 30), ["Ginkaku-ji Temple · Day 2 arrives after last entry (4:30 PM)"]);
  assert.equal(clockLabel(0), "12:00 AM");
  assert.equal(clockLabel(12 * 60 + 5), "12:05 PM");
  assert.equal(clockLabel(25 * 60), "1:00 AM", "a range past midnight reads as the clock");
});

test("PE5 the gap list splits by kind", () => {
  const groups = unlocatedStopGroups({
    complete: false,
    unlocated: [
      { day: 1, title: "Soba Restaurant Owariya" },
      { day: 2, title: "Late Dinner in Shimogyo", placeholder: true },
      { day: 3, title: "Kaiseki Farewell Dinner", placeholder: true },
    ],
  });
  assert.deepEqual(groups, [
    { kind: "place", heading: UNLOCATED_PLACES_HEAD, lines: ["Day 1 · Soba Restaurant Owariya"] },
    { kind: "placeholder", heading: UNLOCATED_PLACEHOLDERS_HEAD, lines: ["Day 2 · Late Dinner in Shimogyo", "Day 3 · Kaiseki Farewell Dinner"] },
  ]);
  assert.deepEqual(unlocatedStopGroups({ complete: false, unlocated: [{ day: 1, title: "X" }] }).map((g) => g.kind), ["place"], "an empty group is omitted");
  assert.deepEqual(unlocatedStopGroups(null), []);
});
