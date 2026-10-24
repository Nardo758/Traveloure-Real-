/**
 * H-10 — ?group= and the city the traveler already chose carry into the Start a
 * plan pop-up through props / React state only. The Experiences nav stays the
 * five group links (ledger 2026-10-07-nav-experience-groups).
 *
 * Q15.2 (already on main): opening the pop-up writes nothing to localStorage,
 * sessionStorage, cookies, or the server. P8 pins the event door; this file does
 * not edit it. The experiences door must not set `experienceSlug`, because open()
 * still writes that one field to the pen (C6).
 *
 * Run: npx tsx --test client/src/lib/__tests__/h10-experiences-popup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as planEntry from "../plan-entry";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const kyotoPick = {
  city: "Kyoto",
  country: "Japan",
  group: "celebrations" as const,
  occasionSlug: null,
};

test("H-10: a chosen group and city open on dates and party, not on A trip", () => {
  const page = planEntry.initialPlanEntry({ city: "Kyoto", country: "Japan", group: "celebrations" });
  assert.equal(page.state.group, "celebrations");
  assert.equal(page.state.market?.cityName, "Kyoto");
  assert.equal(page.step, "details", "?group= and a city ask only for dates and party");
  assert.notEqual(page.state.group, "trips");

  const groupOnly = planEntry.initialPlanEntry({ group: "celebrations" });
  assert.equal(groupOnly.state.group, "celebrations");
  assert.equal(groupOnly.step, "around", "a group with no city is still the first question");
  assert.equal(groupOnly.state.market, null);

  assert.equal(planEntry.initialPlanEntry({ group: "xyz" as "trips" }).state.group, "trips");
});

test("H-10: a catalog occasion deep link stays on the occasion step", () => {
  const wedding = planEntry.initialPlanEntry({
    city: "Kyoto",
    country: "Japan",
    experienceSlug: "wedding",
    group: "hosted_events",
  });
  assert.equal(wedding.step, "occasion");
  assert.equal(wedding.state.occasionSlug, "wedding");
  assert.equal(wedding.state.group, "hosted_events");
});

test("H-10: an event anchor is not moved onto dates and party", () => {
  const ev = planEntry.initialPlanEntry({
    city: "Kyoto",
    country: "Japan",
    experienceSlug: "show",
    group: "celebrations",
    askDatesAndParty: true,
    anchor: { title: "Japanese Grand Prix", firstDate: "2026-10-09", lastDate: "2026-10-11", startTime: "14:00", venue: "Suzuka Circuit" },
  });
  assert.equal(ev.step, "occasion");
  assert.equal(ev.state.event?.title, "Japanese Grand Prix");
  assert.equal(ev.state.startDate, "2026-10-09");
});

test("H-10: the pop-up source carries the group and city and never the pen slug", () => {
  const build = planEntry.experiencesPopupSource;
  assert.equal(typeof build, "function");
  const src = build!("?group=celebrations", kyotoPick);
  assert.equal(src.group, "celebrations");
  assert.equal(src.city, "Kyoto");
  assert.equal(src.country, "Japan");
  assert.equal(src.askDatesAndParty, true);
  assert.equal(src.carriedOccasionSlug, undefined);
  assert.equal("experienceSlug" in src, false, "experienceSlug would be written to sessionStorage on open");
  assert.equal("startDate" in src, false);
  assert.doesNotMatch(build!.toString(), /localStorage|sessionStorage|document\.cookie|updateTripContext/);

  const opened = planEntry.initialPlanEntry({ newPlan: true, ...src });
  assert.equal(opened.step, "details");
  assert.equal(opened.state.group, "celebrations");
  assert.equal(opened.state.market?.cityName, "Kyoto");
  assert.notEqual(opened.state.group, "trips");

  const specific = build!("group=celebrations", { ...kyotoPick, occasionSlug: "birthday" });
  assert.equal(specific.carriedOccasionSlug, "birthday");
  assert.equal("experienceSlug" in specific, false);
  const kept = planEntry.initialPlanEntry(specific);
  assert.equal(kept.step, "details");
  assert.equal(kept.state.occasionSlug, "birthday");
  assert.equal(kept.state.market?.cityName, "Kyoto");
  assert.equal(kept.state.group, "celebrations");

  const urlOnly = build!("group=celebrations", null);
  assert.equal(urlOnly.group, "celebrations");
  assert.equal(urlOnly.city, undefined);
  assert.equal(urlOnly.askDatesAndParty, undefined);

  const bad = build!("group=xyz", null);
  assert.equal(bad.group, undefined);
  assert.equal(bad.askDatesAndParty, undefined);
  assert.equal(build!("group=", { city: null, country: null, group: null, occasionSlug: null }).group, undefined);

  const clickedWins = build!("group=trips&destination=Porto", kyotoPick);
  assert.equal(clickedWins.city, "Kyoto");
  assert.equal(clickedWins.group, "celebrations");
});

test("H-10: Start a plan reads the carry and open() writes nothing", () => {
  const layout = read("client/src/components/layout.tsx");
  assert.equal((layout.match(/openPlanning\(\{ newPlan: true \}\)/g) ?? []).length, 0);
  assert.match(layout, /experiencesPopupSource\(search, experiencesPick\)/);

  const open = read("client/src/contexts/PlanningContext.tsx").slice(
    read("client/src/contexts/PlanningContext.tsx").indexOf("const open = useCallback("),
    read("client/src/contexts/PlanningContext.tsx").indexOf("const close = useCallback("),
  );
  assert.ok(open.length > 0);
  assert.equal(/pendingEvents/.test(open), false);
  assert.equal(/startDate:/.test(open), false);
  assert.equal(/localStorage|sessionStorage|document\.cookie/.test(open), false);
  assert.equal(/carriedOccasionSlug|askDatesAndParty|experiencesPick/.test(open), false);
  assert.match(open, /next\?\.experienceSlug && !getTripContext\(\)\.tripId/);
});
