/**
 * Step 6 drafting consistency (R-aa, R-w, R-bc; ledger `2026-10-04-step6-trip-card`).
 *   D1 the ONE flight-window rule drops a departure-day stop past the cut-off and an arrival-day stop
 *      before arrival + buffer, keeps the AI's own travel rows — canonical items AND stored days
 *   D2 ALL THREE drafting paths call it: the free draft route, the shared snapshot writer (Plus
 *      occasion drafts, save-as-trip) and the trip generate route
 *   D3 a festival title with no event fact never survives the trip generate route's storage pass
 *   D4 every drafting prompt carries the meal windows, "no festivals or events unless listed" and
 *      the season line
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canonicalWithinFlightWindows, daysWithinFlightWindows } from "../draft-flight-windows";
import { reduceUncoveredEventActivities } from "../ai-draft-sanitize";
import { SUPPLY_SLOT_EVENT_TITLE } from "@shared/ai-place-text";

const anchors = [
  { anchorType: "flight_arrival", anchorDatetime: "2026-11-11T09:05:00", bufferBefore: 0, bufferAfter: 120, location: "KIX", isImmovable: true },
  { anchorType: "flight_departure", anchorDatetime: "2026-11-15T14:00:00", bufferBefore: 150, bufferAfter: 0, location: "KIX", isImmovable: true },
] as any[];
const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");

test("D1: one rule — canonical items and stored days", () => {
  const items = [
    { dayNumber: 1, title: "Arrive at Kansai International Airport", time: "09:05", durationMinutes: 60, location: "KIX" },
    { dayNumber: 1, title: "Fushimi Inari", time: "10:00", durationMinutes: 90, location: "Fushimi" },
    { dayNumber: 1, title: "Nishiki lunch", time: "12:00", durationMinutes: 60, location: "Nakagyo" },
    { dayNumber: 5, title: "Breakfast", time: "08:00", durationMinutes: 60, location: "Nakagyo" },
    { dayNumber: 5, title: "Kiyomizu-dera", time: "11:00", durationMinutes: 90, location: "Higashiyama" },
    { dayNumber: 5, title: "Dinner in Gion", time: "18:00", durationMinutes: 90, location: "Gion" },
  ];
  const cut = canonicalWithinFlightWindows(items, anchors, "2026-11-11");
  assert.deepEqual(cut.dropped.map((x) => x.title), ["Fushimi Inari", "Kiyomizu-dera", "Dinner in Gion"]);
  assert.ok(cut.kept.some((x) => /Arrive at Kansai/.test(x.title)), "the AI's own arrival row is kept (adopted as the travel row)");
  const days = daysWithinFlightWindows(
    [{ day: 5, activities: [{ title: "Breakfast", time: "08:00 AM", durationMinutes: 60, locationName: "Nakagyo" }, { title: "Dinner", time: "06:00 PM", durationMinutes: 90, locationName: "Gion" }] }],
    anchors,
    "2026-11-11",
  );
  assert.deepEqual(days[0].activities.map((a: any) => a.title), ["Breakfast"], "12-hour times read by the same rule");
  assert.deepEqual(canonicalWithinFlightWindows(items, [], "2026-11-11").kept.length, items.length, "no flight ⇒ nothing dropped");
});

test("D2: the free draft, the snapshot writer and the trip generate route all call the ONE rule", () => {
  assert.match(read("server/routes/content.routes.ts"), /canonicalWithinFlightWindows\(normalizedResult\.canonicalItems/);
  const writer = read("server/services/content-query.service.ts");
  assert.match(writer, /canonicalWithinFlightWindows\(input\.canonicalItems/);
  assert.match(writer, /storage\.getTemporalAnchors\(input\.tripId\)/);
  const gen = read("server/routes.ts");
  assert.match(gen, /daysWithinFlightWindows\(itineraryData\.days, tripAnchors/);
  assert.doesNotMatch(read("server/routes/content.routes.ts"), /withinFlightWindows\(normalizedResult\.canonicalItems, tripAnchors as any, startIso, \{/, "no inline copy of the rule");
});

test("D3: an uncovered festival title never survives the trip generate route", () => {
  const out = reduceUncoveredEventActivities(
    [
      { title: "Jidai Matsuri procession", description: "Watch the Jidai Matsuri. Then tea.", locationName: "Heian Shrine" },
      { title: "Kinkaku-ji", description: "Golden pavilion.", locationName: "Kita" },
    ],
    [],
  );
  assert.doesNotMatch(out[0].title, /Matsuri/i);
  assert.doesNotMatch(out[0].description, /Matsuri/i);
  assert.equal(out[1].title, "Kinkaku-ji");
  const covered = reduceUncoveredEventActivities([{ title: "Jidai Matsuri procession", locationName: "Heian Shrine" }], [{ name: "Jidai Matsuri" }]);
  assert.equal(covered[0].title, "Jidai Matsuri procession", "a confirmed event may be named");
  const slot = reduceUncoveredEventActivities([{ title: "Festival", locationName: "Gion" }], []);
  assert.ok(slot[0].title === SUPPLY_SLOT_EVENT_TITLE || !/festival/i.test(slot[0].title));
});

test("D4: every drafting prompt carries meals, events and seasons", () => {
  const gen = read("server/routes.ts");
  assert.match(gen, /Meals at meal times: \$\{AI_MEAL_PROMPT_LINE\}/);
  assert.match(gen, /aiEventPromptLine\(tripStartIso, tripEndIso, coveringEvents\)/);
  assert.match(gen, /seasonPromptLineForTrip\(/);
  const ai = read("server/services/ai-generation.service.ts");
  assert.match(ai, /seasonPromptLineForTrip\(/);
  assert.match(ai, /Season: \$\{seasonLine\}/);
  assert.match(read("server/services/content-facts/covering-events.ts"), /cityEventCoversDates\(/, "seeded city events are confirmed events too");
});
