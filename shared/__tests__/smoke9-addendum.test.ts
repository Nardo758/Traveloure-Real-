/**
 * Smoke 9 addendum (ledger `2026-10-04-smoke9-addendum`) — the pure rules.
 *   E1 S9-8 the stored fixture: "Gion Matsuri Festival grounds or Gion walking tour" → "Gion walking tour"
 *   E2 S9-8 no non-event alternative ⇒ a supply slot, naming no event
 *   E3 S9-8 an R-p event covering the trip's dates keeps the title; one outside them does not
 *   E4 S9-8 only STRUCTURED dates cover — prose is never parsed into a date
 *   E5 S9-8 the prompt line carries the dates and "no festivals or events unless listed"
 *   E6 S9-2 the lodging predicate and the refusal that points at the ⋯ entry
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPLY_SLOT_EVENT_TITLE,
  aiEventPromptLine,
  eventFactCoversDates,
  eventFallbackTitle,
  isSupplySlot,
  namesAnEvent,
  reduceUncoveredEvent,
} from "../ai-place-text";
import { HAND_ADDED_STAY_LINE, SET_AS_STAY_LABEL, isLodgingItem } from "../where-to-stay";

test("E1 S9-8: the drafted festival title reduces to its own non-event fallback", () => {
  const t = "Gion Matsuri Festival grounds or Gion walking tour";
  assert.equal(namesAnEvent(t), true);
  assert.equal(eventFallbackTitle(t), "Gion walking tour");
  assert.deepEqual(reduceUncoveredEvent(t, []), { title: "Gion walking tour", reduced: true, supplySlot: false });
  assert.equal(eventFallbackTitle("Kyoto Autumn Event / Philosopher's Path stroll"), "Philosopher's Path stroll");
  assert.equal(eventFallbackTitle("Aoi Matsuri parade Alternative: Shimogamo Shrine visit"), "Shimogamo Shrine visit");
});

test("E2 S9-8: with no non-event alternative the item becomes a supply slot naming no event", () => {
  const r = reduceUncoveredEvent("Gion Matsuri Festival", []);
  assert.deepEqual(r, { title: SUPPLY_SLOT_EVENT_TITLE, reduced: true, supplySlot: true });
  assert.equal(namesAnEvent(r.title), false);
  // Both halves name an event ⇒ no fallback.
  assert.equal(eventFallbackTitle("Jidai Matsuri or Kurama Fire Festival"), null);
  // The storage pass blanks the place, so the row reads as a supply slot (R-w's own predicate).
  assert.equal(isSupplySlot({ origin: "ai", locationName: "", latitude: null, longitude: null }), true);
  // A title naming no event is untouched.
  assert.deepEqual(reduceUncoveredEvent("Fushimi Inari Shrine", []), { title: "Fushimi Inari Shrine", reduced: false, supplySlot: false });
});

test("E3 S9-8: a covering R-p event keeps the title; the same title without it is reduced", () => {
  const t = "Gion Matsuri Festival grounds or Gion walking tour";
  assert.equal(reduceUncoveredEvent(t, [{ name: "Gion Matsuri" }]).reduced, false);
  assert.equal(reduceUncoveredEvent(t, [{ name: "Jidai Matsuri" }]).reduced, true, "a different event covers nothing here");
  // Trip 2026-07-14..07-18 overlaps the festival window; a November trip does not.
  const gion = { name: "Gion Matsuri", startDate: "2026-07-01", endDate: "2026-07-31" };
  assert.equal(eventFactCoversDates(gion, "2026-07-14", "2026-07-18"), true);
  assert.equal(eventFactCoversDates(gion, "2026-11-11", "2026-11-15"), false);
  assert.equal(eventFactCoversDates(gion, "2026-06-28", "2026-07-01"), true, "a one-day overlap covers");
});

test("E4 S9-8: only structured dates cover — an event fact with prose dates covers nothing", () => {
  assert.equal(eventFactCoversDates({ text: "Held every July in Gion", query: "Gion Matsuri" }, "2026-07-14", "2026-07-18"), false);
  assert.equal(eventFactCoversDates({ startDate: "July 2026" }, "2026-07-14", "2026-07-18"), false);
  assert.equal(eventFactCoversDates({ startDate: "2026-07-17" }, "2026-07-14", "2026-07-18"), true, "a single day covers when inside");
  assert.equal(eventFactCoversDates({ startDate: "2026-07-17" }, null, null), false, "a plan with no dates is covered by nothing");
});

test("E5 S9-8: the drafting prompt states the trip dates and 'no festivals or events unless listed'", () => {
  const none = aiEventPromptLine("2026-11-11", "2026-11-15", []);
  assert.match(none, /The trip runs 2026-11-11 to 2026-11-15\./);
  assert.match(none, /No festivals or events unless listed here\./);
  assert.match(none, /No events are confirmed on those dates\./);
  const listed = aiEventPromptLine("2026-07-14", "2026-07-18", [{ name: "Gion Matsuri" }]);
  assert.match(listed, /Events confirmed on those dates: Gion Matsuri\./);
});

test("E6 S9-2 amendment: a lodging item is an accommodation row or one whose title names lodging", () => {
  assert.equal(isLodgingItem({ type: "accommodation", title: "Our place" }), true);
  assert.equal(isLodgingItem({ type: "activity", title: "Hotel Granvia Kyoto" }), true);
  assert.equal(isLodgingItem({ type: "activity", title: "Ryokan Yachiyo" }), true);
  assert.equal(isLodgingItem({ type: "activity", title: "Morning walk" }), false);
  assert.equal(SET_AS_STAY_LABEL, "Set as where you're staying");
  assert.ok(HAND_ADDED_STAY_LINE.includes(`"${SET_AS_STAY_LABEL}"`), "the refusal names the ⋯ entry it points at");
});
