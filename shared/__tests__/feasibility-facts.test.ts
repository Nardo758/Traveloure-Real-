/**
 * FD-3 — feasibility facts, findings and the day line, pure (ledger `2026-10-10-fd3-feasibility`;
 * brief docs/planning/briefs/fd-3-feasibility.md).
 *
 *   FF1  admission: an unsourced, non-official, non-https or wrongly-written fact is refused by name
 *   FF2  admission: a structured time the quote does not print is refused (never a model's number)
 *   FF3  last_admission parses strictly; the season gates the minute (wrapping the new year too)
 *   FF4  last_service parses strictly; validity and weekday gate it; 00:20 is the previous evening's service
 *   FF5  after_last_admission compares the ARRIVAL with last entry; equal is still in
 *   FF6  closes_before_visit_end compares the visit's END with closing; a stop closed on arrival is not counted twice;
 *        no end time and no duration ⇒ unchecked
 *   FF7  last_service_missed: none stored ⇒ unchecked; any still running ⇒ none; all passed ⇒ counted;
 *        an inferred ride reads hedged ("may leave"), a stored leg plain
 *   FF8  the day line: honest counts, "not checked" when nothing is stored, no last-train clause without rides
 *   FF9  the re-check reports the new kinds; the tags are public + link_only for either writer
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admitFeasibilityFact,
  lastAdmissionMinutes,
  lastServiceMinutes,
  parseLastAdmission,
  parseLastService,
  timeAppearsIn,
} from "../feasibility-facts";
import { afterLastAdmission, closedOnArrival, closesBeforeVisitEnd, findingLine, lastServiceMissed, type HoursFact } from "../optimizer-lead";
import { feasibilityLine, isRideMode } from "../plan-feasibility";
import { recheckConflicts } from "../facts-recheck";
import { placeFactTags } from "../content-tiers";

const LA = { byWeekday: { "1": "16:30", "2": "16:30" } };
const ok = (over: Record<string, unknown> = {}) => ({
  factType: "last_admission",
  value: { ...LA, quote: "Last admission 16:30" },
  origin: "crawled",
  license: "official",
  sourceUrl: "https://www.kiyomizudera.or.jp/en/",
  ...over,
});

test("FF1 — admission refuses unsourced, unofficial and wrongly-written facts by name", () => {
  assert.deepEqual(admitFeasibilityFact(ok()), { ok: true });
  assert.deepEqual(admitFeasibilityFact(ok({ sourceUrl: null })), { ok: false, reason: "no_source_url" });
  assert.deepEqual(admitFeasibilityFact(ok({ sourceUrl: "http://example.jp/" })), { ok: false, reason: "no_source_url" });
  assert.deepEqual(admitFeasibilityFact(ok({ license: "editorial" })), { ok: false, reason: "not_official" });
  assert.deepEqual(admitFeasibilityFact(ok({ license: null })), { ok: false, reason: "not_official" });
  assert.deepEqual(admitFeasibilityFact(ok({ origin: "places_api" })), { ok: false, reason: "origin_not_allowed" });
  assert.deepEqual(admitFeasibilityFact(ok({ origin: "traveler_note" })), { ok: false, reason: "origin_not_allowed" });
  assert.deepEqual(admitFeasibilityFact(ok({ value: { text: "last entry 4:30" } })), { ok: false, reason: "bad_value" });
  assert.deepEqual(admitFeasibilityFact(ok({ factType: "hours" })), { ok: false, reason: "not_feasibility_type" });
  // An expert citing an official page is admitted (the screen is the expert-content lane's).
  assert.deepEqual(admitFeasibilityFact(ok({ origin: "expert_nugget", value: LA })), { ok: true });
});

test("FF2 — a time the quote does not print is refused", () => {
  assert.deepEqual(admitFeasibilityFact(ok({ value: { ...LA, quote: "Open until 17:00" } })), { ok: false, reason: "time_not_in_quote" });
  assert.equal(timeAppearsIn("Last entry 4:30 pm", "16:30"), true);
  assert.equal(timeAppearsIn("最終入場 16時30分", "16:30"), true);
  assert.equal(timeAppearsIn("Last entry 5pm", "17:00"), true);
  assert.equal(timeAppearsIn("Last entry 5:30", "16:30"), false);
});

test("FF3 — last_admission parses strictly and the season gates it", () => {
  assert.equal(parseLastAdmission({ byWeekday: { "1": "4:30" } }), null);
  assert.equal(parseLastAdmission({ byWeekday: { "7": "16:30" } }), null);
  assert.equal(parseLastAdmission({ byWeekday: { "1": null } }), null, "nothing stated is no fact");
  const v = parseLastAdmission({ byWeekday: { "1": "16:30" }, season: { from: "03-01", to: "11-30" } })!;
  assert.equal(lastAdmissionMinutes(v, "2027-11-08"), 16 * 60 + 30, "a Monday in season");
  assert.equal(lastAdmissionMinutes(v, "2027-12-06"), null, "a Monday out of season");
  assert.equal(lastAdmissionMinutes(v, "2027-11-09"), null, "a Tuesday is unstated");
  const winter = parseLastAdmission({ byWeekday: { "1": "16:00" }, season: { from: "12-01", to: "02-28" } })!;
  assert.equal(lastAdmissionMinutes(winter, "2028-01-03"), 16 * 60, "the season wraps the new year");
});

test("FF4 — last_service parses strictly; validity, weekday and the after-midnight departure", () => {
  const base = { operator: "Keihan", line: "Main Line", station: "Gion-Shijo", lastDeparture: "00:20", weekdays: [1, 2, 3, 4, 5], validFrom: "2027-03-01", validTo: "2028-03-01" };
  assert.equal(parseLastService({ ...base, line: null, station: null }), null);
  assert.equal(parseLastService({ ...base, validFrom: "2028-04-01" }), null, "from after to");
  const v = parseLastService(base)!;
  assert.equal(lastServiceMinutes(v, "2027-11-08"), 24 * 60 + 20, "00:20 is the Monday evening's service");
  assert.equal(lastServiceMinutes(v, "2027-11-07"), null, "Sunday is not in its weekdays");
  assert.equal(lastServiceMinutes(v, "2029-01-01"), null, "out of validity");
  assert.deepEqual(
    admitFeasibilityFact({ factType: "last_service", value: { ...base, quote: "最終 0時20分" }, origin: "crawled", license: "official", sourceUrl: "https://www.keihan.co.jp/" }),
    { ok: true },
  );
});

const item = (id: string, startTime: string | null, over: Record<string, unknown> = {}) => ({ id, dayNumber: 1, dateIso: "2027-11-08", startTime, ...over });
const hours = (line: string): HoursFact => ({ weekdayDescriptions: [`Monday: ${line}`], checkedAt: "2027-11-06T00:00:00Z" });

test("FF5 — after_last_admission compares the arrival with last entry", () => {
  const entry = new Map([["a", 16 * 60 + 30], ["b", 16 * 60 + 30], ["c", 16 * 60 + 30]]);
  const f = afterLastAdmission([item("a", "16:45"), item("b", "16:30"), item("c", null), item("d", "17:00")], entry);
  assert.deepEqual(f, { kind: "after_last_admission", count: 1, days: [1] });
  assert.equal(findingLine(f!), "1 stop is reached after last entry");
});

test("FF6 — closes_before_visit_end compares the visit's end with closing", () => {
  const h = new Map([["a", hours("9:00 AM – 5:00 PM")], ["b", hours("9:00 AM – 5:00 PM")], ["c", hours("9:00 AM – 5:00 PM")], ["d", hours("9:00 AM – 5:00 PM")]]);
  const items = [
    item("a", "16:00", { durationMinutes: 90 }), // ends 17:30 — put out
    item("b", "15:00", { endTime: "16:30" }), // ends in time
    item("c", "18:00", { durationMinutes: 60 }), // closed on arrival — closed_on_arrival's, not this
    item("d", "16:00"), // no end and no duration — unchecked
  ];
  const f = closesBeforeVisitEnd(items, h, "2027-11-08");
  assert.deepEqual(f, { kind: "closes_before_visit_end", count: 1, days: [1] });
  assert.equal(closedOnArrival(items, h, "2027-11-08")?.count, 1, "the arrival check is unchanged");
  assert.equal(findingLine(f!), "1 stop closes before your visit ends");
});

test("FF7 — last_service_missed: the three branches, and the hedged line for an inferred ride", () => {
  // Branch 1: nothing stored near the start ⇒ not checked, no finding.
  assert.equal(lastServiceMissed([{ dayNumber: 1, departMin: 25 * 60, lastDepartures: [] }]), null);
  // Branch 2: any stored service still running at departure ⇒ no finding.
  assert.equal(lastServiceMissed([{ dayNumber: 1, departMin: 23 * 60 + 30, lastDepartures: [23 * 60, 24 * 60 + 20] }]), null);
  // Branch 3: every stored service has passed ⇒ the ride counts.
  const stored = lastServiceMissed([{ dayNumber: 1, departMin: 24 * 60 + 40, lastDepartures: [24 * 60 + 20, 23 * 60 + 50] }]);
  assert.deepEqual(stored, { kind: "last_service_missed", count: 1, days: [1] });
  assert.equal(findingLine(stored!), "1 ride leaves after the last train or bus", "a stored leg keeps the plain form");
  const inferred = lastServiceMissed([
    { dayNumber: 1, departMin: 24 * 60 + 40, lastDepartures: [24 * 60 + 20], inferred: true },
    { dayNumber: 2, departMin: 24 * 60 + 40, lastDepartures: [24 * 60 + 20] },
  ]);
  assert.deepEqual(inferred, { kind: "last_service_missed", count: 2, days: [1, 2], inferred: true });
  assert.equal(findingLine(inferred!), "2 rides may leave after the last train or bus");
});

test("FF8 — the day line: honest counts, not checked, no last-train clause without rides", () => {
  assert.equal(
    feasibilityLine({ stops: 6, hoursChecked: 5, lastEntryChecked: 0, rides: 2, ridesChecked: 0 }),
    "Hours checked for 5 of 6 stops · last entry not checked · last trains not checked",
  );
  assert.equal(
    feasibilityLine({ stops: 3, hoursChecked: 0, lastEntryChecked: 1, rides: 1, ridesChecked: 1 }),
    "Hours not checked · last entry checked for 1 of 3 stops · last trains checked for 1 of 1 ride",
  );
  assert.equal(feasibilityLine({ stops: 1, hoursChecked: 1, lastEntryChecked: 0, rides: 0, ridesChecked: 0 }), "Hours checked for 1 of 1 stop · last entry not checked");
  assert.equal(feasibilityLine({ stops: 0, hoursChecked: 0, lastEntryChecked: 0, rides: 0, ridesChecked: 0 }), null);
  assert.equal(feasibilityLine(null), null);
  const line = feasibilityLine({ stops: 2, hoursChecked: 1, lastEntryChecked: 1, rides: 1, ridesChecked: 1 })!;
  assert.equal(/public|local/i.test(line), false, "no tier words");
  assert.equal(isRideMode("train"), true);
  assert.equal(isRideMode("walk"), false);
});

test("FF9 — the re-check reports the new kinds; tags are public + link_only for either writer", () => {
  const kinds = recheckConflicts([
    { kind: "after_last_admission", count: 1, days: [1] },
    { kind: "closes_before_visit_end", count: 1, days: [1] },
    { kind: "last_service_missed", count: 1, days: [1] },
    { kind: "pace_over", count: 1, days: [1] },
  ]).map((f) => f.kind);
  assert.deepEqual(kinds, ["after_last_admission", "closes_before_visit_end", "last_service_missed"]);
  assert.deepEqual(placeFactTags("crawled", "official", "last_admission"), { sourceClass: "public", reuseClass: "link_only" });
  assert.deepEqual(placeFactTags("expert_nugget", "official", "last_service"), { sourceClass: "public", reuseClass: "link_only" });
  assert.deepEqual(placeFactTags("expert_nugget", null, "tip"), { sourceClass: "local", reuseClass: "reusable" }, "other facts unchanged");
});
