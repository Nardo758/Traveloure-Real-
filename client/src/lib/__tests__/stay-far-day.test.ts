/**
 * Row 244 (ledger `2026-10-30-row244-stay-day-closeness`): the far-day sentence on the stay card, read from the
 * server's `dayCloseness`. The card computes nothing. "Day {n} is a longer trip from here." is HELD FOR LEON.
 *
 *   F1  one line per day the server marks not near, Day n = dayIndex + 1
 *   F2  no list, an empty list, or every day near ⇒ no line
 *   F3  the routed card model carries the pick's list; "Close to N of M days" is unchanged
 *   F4  AnchorPanel draws the lines and holds no copy of the sentence
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { STAY_FAR_DAY_COPY, stayCardModel, stayClosenessLine, stayFarDayLines } from "../stay-card";

test("F1 one line per far day", () => {
  assert.deepEqual(
    stayFarDayLines([
      { dayIndex: 0, nearStops: true, source: "routed" },
      { dayIndex: 2, nearStops: false, source: "routed" },
      { dayIndex: 4, nearStops: false, source: "routed" },
    ]),
    ["Day 3 is a longer trip from here.", "Day 5 is a longer trip from here."],
  );
  assert.equal(STAY_FAR_DAY_COPY.farDay(3), "Day 3 is a longer trip from here.");
});

test("F2 nothing to say says nothing", () => {
  assert.deepEqual(stayFarDayLines(undefined), []);
  assert.deepEqual(stayFarDayLines(null), []);
  assert.deepEqual(stayFarDayLines([]), []);
  assert.deepEqual(stayFarDayLines([{ dayIndex: 0, nearStops: true, source: "straight_line" }]), []);
});

test("F3 the routed model carries the list; the N-of-M line is unchanged", () => {
  const days = [{ dayIndex: 1, nearStops: false, source: "routed" as const }];
  const model = stayCardModel({
    tier: "routed",
    pick: { kind: "hotel_cache", id: "h1", name: "Fixture Inn" } as any,
    scoredCount: 3,
    candidateCount: 5,
    changed: false,
    computedAt: "t",
    closeness: { closeDays: 1, locatedDays: 2, basis: "routed" },
    dayCloseness: days,
  })!;
  assert.deepEqual(model.hotels[0].dayCloseness, days);
  assert.equal(stayClosenessLine({ closeDays: 1, locatedDays: 2, basis: "routed" }), "Close to 1 of 2 days");
  const legacy = stayCardModel({ tier: "routed", pick: { kind: "hotel_cache", id: "h1", name: "Fixture Inn" } as any, scoredCount: 3, candidateCount: 5, changed: false, computedAt: "t", closeness: null })!;
  assert.equal("dayCloseness" in legacy.hotels[0], false);
});

test("F4 AnchorPanel draws the lines from the helper", () => {
  const src = fs.readFileSync("client/src/components/plan/AnchorPanel.tsx", "utf8");
  assert.match(src, /stayFarDayLines\(h\.dayCloseness\)/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /longer trip from here/);
});
