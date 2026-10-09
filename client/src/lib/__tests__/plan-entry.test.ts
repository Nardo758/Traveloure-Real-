/**
 * E2 — PlanEntry's decisions (ledger `2026-10-09-e2-plan-entry`; decision-maker rulings 1–7).
 *
 *   E1  doors: none → Step 1; a city → Step 2 with the city; an event → Step 2 with city, dates, row
 *   E2  a door's city AND a catalog occasion go straight to the plan; an unknown slug never does (§13)
 *   E3  each group's default occasion is a seeded slug that lands in THAT group (ruling 3)
 *   E4  the occasion is "More specific" when chosen, else the group's default
 *   E5  events: multi-day → trips, one night → moments; > 3 nights asks "which night?"
 *   E6  dates: This weekend, Next month (whole month); events overlapping a window, in order
 *   E7  a typed city we do not serve suggests the same country first, else all eight (ruling 5)
 *   E8  landing view: trips / group travel / a multi-day event → map; the rest → list
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan-entry.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { OCCASION_GROUP_DEFAULT_SLUG, experienceGroupFor, type ExperienceGroupRow } from "@shared/experience-group";
import {
  asksWhichNight,
  canStartPlan,
  chosenOccasionSlug,
  emptyPlanEntry,
  eventNightDates,
  eventsOverlapping,
  initialPlanEntry,
  nextMonth,
  planEntryEventRow,
  planEntryView,
  startsStraightAway,
  suggestedMarketsFor,
  thisWeekend,
  typedCity,
  withEvent,
  withNight,
} from "../plan-entry";

const kyoto = OPERATING_MARKETS.find((m) => m.cityName === "Kyoto")!;
const anchor = (firstDate: string, lastDate: string) => ({ title: "Japanese Grand Prix", firstDate, lastDate, startTime: "14:00", venue: "Suzuka Circuit" });

test("E1: where each door opens", () => {
  assert.equal(initialPlanEntry(null).step, "around");
  const city = initialPlanEntry({ city: "Kyoto", country: "Japan" });
  assert.equal(city.step, "occasion");
  assert.equal(city.state.market?.cityName, "Kyoto");
  const ev = initialPlanEntry({ city: "Kyoto", country: "Japan", experienceSlug: "show", anchor: anchor("2026-10-09", "2026-10-11") });
  assert.equal(ev.step, "occasion");
  assert.equal(ev.state.startDate, "2026-10-09");
  assert.equal(ev.state.endDate, "2026-10-11");
  assert.equal(ev.state.event?.title, "Japanese Grand Prix");
  assert.equal(ev.state.occasionSlug, null, "an event decides its group, not the door's slug");
  assert.equal(initialPlanEntry({ city: "Paris" }).step, "around", "an unserved city is not a pick");
});

test("E2: straight to the plan only with a city AND a catalog occasion", () => {
  const s = initialPlanEntry({ city: "Kyoto", experienceSlug: "wedding" }).state;
  assert.equal(startsStraightAway(s, ["wedding", "travel"]), true);
  assert.equal(startsStraightAway(s, ["travel"]), false, "an unknown slug is asked, never trusted");
  assert.equal(startsStraightAway(initialPlanEntry({ experienceSlug: "wedding" }).state, ["wedding"]), false, "no city ⇒ ask");
});

test("E3: each group's default slug sits in that group (seeded switches)", () => {
  const SEED: Record<string, ExperienceGroupRow> = {
    travel: { defaultStops: "many", defaultDuration: "range", defaultGuests: false },
    "date-night": { defaultStops: "one", defaultDuration: "day", defaultGuests: false },
    birthday: { defaultStops: "one", defaultDuration: "day", defaultGuests: true },
    wedding: { defaultStops: "one", defaultDuration: "range", defaultGuests: true, rolesNeeded: ["venue", "florist"] },
    retreats: { defaultStops: "many", defaultDuration: "range", defaultGuests: true, rolesNeeded: ["accommodation"] },
  };
  for (const [group, slug] of Object.entries(OCCASION_GROUP_DEFAULT_SLUG)) {
    assert.equal(experienceGroupFor(SEED[slug]), group, `${slug} must start a ${group} plan`);
  }
});

test("E4: More specific overrides the group's default", () => {
  const s = { ...emptyPlanEntry(), market: kyoto };
  assert.equal(chosenOccasionSlug(s), "travel");
  assert.equal(chosenOccasionSlug({ ...s, group: "moments" }), "date-night");
  assert.equal(chosenOccasionSlug({ ...s, occasionSlug: "golf-trip" }), "golf-trip");
  assert.equal(canStartPlan(emptyPlanEntry()), false);
  assert.equal(canStartPlan(s), true, "a city is enough — dates stay optional");
});

test("E5: an event sets its group by length; a long run asks which night", () => {
  const ev = (a: string, b: string) => ({ title: "X", city: "Kyoto", country: "Japan", venue: "V", firstDate: a, lastDate: b, startTime: null });
  assert.equal(withEvent(emptyPlanEntry(), ev("2026-10-10", "2026-10-12")).group, "trips");
  assert.equal(withEvent(emptyPlanEntry(), ev("2026-10-10", "2026-10-10")).group, "moments");
  assert.equal(asksWhichNight(ev("2026-10-10", "2026-10-12")), false);
  const long = ev("2026-10-14", "2026-11-05");
  assert.equal(asksWhichNight(long), true);
  assert.equal(eventNightDates(long).length, 23);
  const s = withNight(withEvent(emptyPlanEntry(), long), "2026-10-20");
  assert.equal(s.startDate, "2026-10-20");
  assert.equal(s.endDate, "2026-10-20");
  assert.equal(planEntryEventRow(s)?.eventDate, "2026-10-20", "the event row sits on the chosen night");
  const all = withNight(s, null);
  assert.equal(all.startDate, "2026-10-14");
  assert.equal(all.endDate, "2026-11-05");
});

test("E6: date quick picks and what's on", () => {
  assert.deepEqual(thisWeekend(new Date(2026, 9, 7)), { startDate: "2026-10-10", endDate: "2026-10-11" }); // Wed
  assert.deepEqual(thisWeekend(new Date(2026, 9, 10)), { startDate: "2026-10-10", endDate: "2026-10-11" }); // Sat
  assert.deepEqual(thisWeekend(new Date(2026, 9, 11)), { startDate: "2026-10-11", endDate: "2026-10-11" }); // Sun
  assert.deepEqual(nextMonth(new Date(2026, 9, 9)), { startDate: "2026-11-01", endDate: "2026-11-30" });
  assert.deepEqual(nextMonth(new Date(2026, 11, 9)), { startDate: "2027-01-01", endDate: "2027-01-31" });
  const evs = [
    { id: "b", firstDate: "2026-11-20", lastDate: "2026-11-22" },
    { id: "a", firstDate: "2026-10-30", lastDate: "2026-11-02" },
    { id: "c", firstDate: "2026-12-05", lastDate: "2026-12-05" },
  ];
  assert.deepEqual(eventsOverlapping(evs, "2026-11-01", "2026-11-30").map((e) => e.id), ["a", "b"]);
});

test("E7: an unserved city — same country first, else all eight", () => {
  const india = suggestedMarketsFor("Delhi, India").map((m) => m.cityName).sort();
  assert.deepEqual(india, ["Goa", "Jaipur", "Mumbai"]);
  assert.equal(suggestedMarketsFor("Paris").length, OPERATING_MARKETS.length);
  const t = typedCity("Paris");
  assert.ok(t && "notYet" in t && t.notYet === "Paris");
  const k = typedCity("kyoto");
  assert.ok(k && "market" in k && k.market.cityName === "Kyoto");
  assert.equal(typedCity("   "), null);
});

test("E8: landing view by group", () => {
  const base = { ...emptyPlanEntry(), market: kyoto };
  assert.equal(planEntryView({ ...base, group: "trips" }, null), "map");
  assert.equal(planEntryView({ ...base, group: "group_travel" }, null), "map");
  assert.equal(planEntryView({ ...base, group: "moments" }, null), "list");
  assert.equal(planEntryView({ ...base, group: "celebrations" }, null), "list");
  assert.equal(planEntryView({ ...base, group: "hosted_events" }, null), "list");
  const multiDay = withEvent(base, { title: "X", city: "Kyoto", country: "Japan", venue: "V", firstDate: "2026-10-10", lastDate: "2026-10-12", startTime: null });
  assert.equal(planEntryView({ ...multiDay, group: "moments" }, null), "map", "a multi-day event opens the map");
  // A "More specific" occasion's own group decides.
  assert.equal(planEntryView({ ...base, group: "trips" }, { defaultStops: "one", defaultDuration: "day", defaultGuests: true }), "list");
});

test("E9: a starting group (?group=) seeds the group, an exact key only (E3 ruling 3)", () => {
  assert.equal(initialPlanEntry({ group: "celebrations" }).state.group, "celebrations");
  assert.equal(initialPlanEntry({ group: "nope" as any }).state.group, "trips", "an unknown key is never a group");
  const deep = initialPlanEntry({ city: "Kyoto", experienceSlug: "wedding", group: "hosted_events" });
  assert.equal(deep.step, "occasion", "a city and an occasion land on Step 2");
  assert.equal(deep.state.group, "hosted_events");
});
