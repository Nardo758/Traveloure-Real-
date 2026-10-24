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
 *   E9  SH-1 Launch PR 5 (ledger `2026-10-22-sh1-launch-pr5`): the night picker offers a series' shows still to come,
 *       or a run's nights from the market's today; no market ⇒ no picker; the mint dates start no earlier than the
 *       market's today (UTC with no market); an event pick inside the pop-up carries "show", "More specific" overrides
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan-entry.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { OCCASION_GROUP_DEFAULT_SLUG, experienceGroupFor, type ExperienceGroupRow } from "@shared/experience-group";
import {
  asksWhichNight,
  canStartPlan,
  browseDatesFromPen,
  choosePlanEntryGroup,
  chosenOccasionSlug,
  emptyPlanEntry,
  eventNightDates,
  eventsOverlapping,
  initialPlanEntry,
  nextMonth,
  nightPickerOptions,
  planEntryMintDates,
  withSeriesShows,
  EVENT_OCCASION_SLUG,
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
  assert.equal(ev.state.occasionSlug, "show", "the door's slug is kept; the group follows the nights (SH-1 Q16)");
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

test("E9: the night picker and the mint dates read the market's today", () => {
  // 2027-03-10 23:30 UTC is already 2027-03-11 in Kyoto.
  const now = new Date("2027-03-10T23:30:00Z");
  const ev = (a: string, b: string, over: Record<string, unknown> = {}) => ({ title: "X", city: "Kyoto", country: "Japan", venue: "V", firstDate: a, lastDate: b, startTime: null, ...over });
  // A contiguous run: nights from the market's today on.
  const run = withEvent(emptyPlanEntry(), ev("2027-03-08", "2027-03-20"), null, now);
  assert.deepEqual(nightPickerOptions(run, now)?.[0], "2027-03-11");
  assert.equal(nightPickerOptions(run, now)?.length, 10);
  // A series of shows: the shows still to come, not a range.
  const shows = ["2027-03-05", "2027-03-11", "2027-03-14", "2027-03-20"];
  const series = withEvent(emptyPlanEntry(), ev("2027-03-11", "2027-03-11", { showDates: shows }), EVENT_OCCASION_SLUG, now);
  assert.deepEqual(nightPickerOptions(series, now), ["2027-03-11", "2027-03-14", "2027-03-20"]);
  assert.equal(series.occasionSlug, "show", "an event pick inside the pop-up carries show");
  assert.equal(series.group, "moments", "the group follows the nights");
  // One show left ⇒ nothing to pick.
  assert.equal(nightPickerOptions(series, new Date("2027-03-15T00:00:00Z")), null);
  // No market ⇒ no picker.
  assert.equal(nightPickerOptions({ event: run.event, market: null }, now), null);
  // The mint dates: the start moves to the market's today; UTC today with no market.
  assert.deepEqual(planEntryMintDates({ startDate: "2027-03-08", endDate: "2027-03-20", market: run.market }, now), { startDate: "2027-03-11", endDate: "2027-03-20" });
  assert.deepEqual(planEntryMintDates({ startDate: "2027-03-08", endDate: "2027-03-20", market: null }, now), { startDate: "2027-03-10", endDate: "2027-03-20" });
  assert.deepEqual(planEntryMintDates({ startDate: "2027-04-01", endDate: "2027-04-02", market: run.market }, now), { startDate: "2027-04-01", endDate: "2027-04-02" });
  assert.equal(planEntryMintDates({ startDate: null, endDate: null, market: null }, now), null);
});

test("H-08: choosing the event's own group keeps the door occasion; a one-day date stays", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const one = withEvent(
    emptyPlanEntry(),
    { title: "Noh", city: "Kyoto", country: "Japan", venue: "Hall", firstDate: "2026-10-25", lastDate: "2026-10-25", startTime: null },
    EVENT_OCCASION_SLUG,
    now,
  );
  assert.equal(one.startDate, "2026-10-25", "a one-day event date already carries over");
  assert.equal(one.endDate, "2026-10-25");
  assert.equal(one.group, "moments");
  const kept = { ...one, ...choosePlanEntryGroup(one, "moments") };
  assert.equal(chosenOccasionSlug(kept), "show", "A moment keeps the door's show, not Date Night");
  const other = { ...one, ...choosePlanEntryGroup(one, "trips") };
  assert.equal(other.occasionSlug, null);
  assert.equal(chosenOccasionSlug(other), "travel", "a different group uses that group's default");
  const plain = { ...emptyPlanEntry(), group: "moments" as const };
  assert.equal(chosenOccasionSlug({ ...plain, ...choosePlanEntryGroup(plain, "moments") }), "date-night");
  const panel = readFileSync("client/src/components/plan/PlanEntry.tsx", "utf8");
  const occasion = panel.slice(panel.indexOf('aria-label="Occasion"'));
  assert.match(occasion, /choosePlanEntryGroup\(s, key\)/);
});

test("P-02: a city page takes dates only from a started plan, and never a past night", () => {
  const pen = { startDate: "2026-10-14", endDate: "2026-11-05" };
  assert.equal(browseDatesFromPen(pen, "2026-10-24"), null, "opening Plan around it is not a plan");
  assert.deepEqual(browseDatesFromPen({ ...pen, tripId: "trip-1" }, "2026-10-24"), {
    startDate: "2026-10-24",
    endDate: "2026-11-05",
  });
  assert.equal(
    browseDatesFromPen({ tripId: "trip-1", startDate: "2026-10-01", endDate: "2026-10-10" }, "2026-10-24"),
    null,
    "a plan that already ended contributes no dates",
  );
  assert.deepEqual(
    browseDatesFromPen({ tripId: "trip-1", startDate: "2026-11-02", endDate: "2026-11-05" }, "2026-10-24"),
    { startDate: "2026-11-02", endDate: "2026-11-05" },
  );
  const page = readFileSync("client/src/pages/discover-location.tsx", "utf8");
  assert.match(page, /browseDatesFromPen\(tripCtx, marketToday\(/);
});

test("R-10: the clicked show is the plan's date, not the series' first show and not an open trip's dates", () => {
  // 2026-10-20 12:00 UTC is still 2026-10-20 in Kyoto, before both shows.
  const now = new Date("2026-10-20T12:00:00Z");
  const shows = ["2026-10-24", "2026-10-25"];
  const openTrip = { ...emptyPlanEntry(), startDate: "2026-06-14", endDate: "2026-06-21" };
  const oct25 = {
    title: "YOASOBI Chowakusei dome tour",
    city: "Kyoto",
    country: "Japan",
    venue: "Kyocera Dome Osaka",
    firstDate: "2026-10-25",
    lastDate: "2026-10-25",
    startTime: "18:00",
    showDates: shows,
  };
  const s = withEvent(openTrip, oct25, EVENT_OCCASION_SLUG, now);
  assert.equal(s.startDate, "2026-10-25", "the clicked show, not the open trip's June window and not Oct 24");
  assert.equal(s.endDate, "2026-10-25");
  assert.equal(s.night, "2026-10-25");
  assert.equal(planEntryEventRow(s)?.eventDate, "2026-10-25");
  const one = withEvent(emptyPlanEntry(), { ...oct25, showDates: undefined }, EVENT_OCCASION_SLUG, now);
  assert.equal(one.startDate, "2026-10-25", "a one-day event with no series list keeps its own date");
  assert.equal(one.endDate, "2026-10-25");
});

test("E10: a series' show dates come from its sibling rows on one series_key", () => {
  const now = new Date("2027-03-10T23:30:00Z");
  const picked = withEvent(emptyPlanEntry(), { title: "Noh", city: "Kyoto", country: "Japan", venue: "Hall", firstDate: "2027-03-14", lastDate: "2027-03-14", startTime: null, seriesKey: "noh-2027" }, EVENT_OCCASION_SLUG, now);
  const rows = [
    { seriesKey: "noh-2027", firstDate: "2027-03-11" },
    { seriesKey: "noh-2027", firstDate: "2027-03-14" },
    { seriesKey: "noh-2027", firstDate: "2027-03-20" },
    { seriesKey: "other", firstDate: "2027-03-12" },
  ];
  const s = withSeriesShows(picked, rows);
  assert.deepEqual(s.event?.showDates, ["2027-03-11", "2027-03-14", "2027-03-20"]);
  assert.equal(s.night, "2027-03-14", "the picked show stays the chosen night");
  assert.deepEqual(nightPickerOptions(s, now), ["2027-03-11", "2027-03-14", "2027-03-20"]);
  assert.equal(withSeriesShows(picked, rows.slice(1, 2)), picked, "one show is not a series");
});
