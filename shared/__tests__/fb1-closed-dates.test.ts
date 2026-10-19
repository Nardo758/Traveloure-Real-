/**
 * FB-1 step 5b (ledger `2026-10-19-fb1-closed-dates`), the pure half.
 *   CD1 the value: a list of from–to ranges, a single day as a one-day range; malformed ⇒ null, never repaired
 *   CD2 the expiry day: the day after the last closed date
 *   CD3 admission on the last_admission rule: official https source; every bounding date printed in the quote
 *   CD4 the checker: a stop on a closed date is `closed_on_arrival` / `closed_date`, fix `move_day`, with the fact's
 *       source; it replaces an hours reason for that stop; a stop on an open date is untouched
 *   CD5 the step 3 gate counts it: a version keeping the stop on the closed date fails, one moving it passes
 *   CD6 the words: Marketing's line, and the issue/fix lines
 *
 * Run: npx tsx --test shared/__tests__/fb1-closed-dates.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admitFeasibilityFact, closedDatesExpiryDay, dateAppearsIn, parseClosedDates } from "../feasibility-facts";
import { checkPlan, type PlanCheckInput } from "../plan-check";
import { closedOnDateLine, findingStopLines } from "../optimizer-lead";
import { compareVersionToDraft, fixLine, issueLine } from "../version-check";

const HOURS = [{ weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"], checkedAt: "2026-10-18T00:00:00.000Z", official: true, sourceKind: "official_fact" as const }];
const CLOSED = (ranges: Array<{ from: string; to: string }>) => [
  { value: { ranges, quote: "Closed 2027-11-08 and 2027-12-29 to 2028-01-03." }, checkedAt: "2026-10-19T00:00:00.000Z", sourceUrl: "https://temple.example.jp/news", provenance: "Temple · checked 19 Oct 2026" },
];

/** Monday 2027-11-08 (day 1) and Tuesday 2027-11-09 (day 2). */
function plan(over: Partial<PlanCheckInput> = {}): PlanCheckInput {
  return {
    tripStartIso: "2027-11-08",
    transitCoverage: true,
    stops: [
      { id: "t", title: "Temple", dayNumber: 1, startTime: "08:00", endTime: null, durationMinutes: 60, point: null },
      { id: "m", title: "Market", dayNumber: 2, startTime: "10:00", endTime: null, durationMinutes: 60, point: null },
    ],
    hours: new Map([["t", HOURS], ["m", HOURS]]),
    lastAdmission: new Map(),
    closedDates: new Map([["t", CLOSED([{ from: "2027-11-08", to: "2027-11-08" }])]]),
    lastServices: [],
    anchors: [],
    legs: [],
    energy: [],
    ...over,
  };
}

test("CD1 the value", () => {
  assert.deepEqual(parseClosedDates({ ranges: [{ from: "2027-12-29", to: "2028-01-03" }, { from: "2027-11-08", to: "2027-11-08" }] }), {
    ranges: [{ from: "2027-11-08", to: "2027-11-08" }, { from: "2027-12-29", to: "2028-01-03" }],
  });
  for (const bad of [null, {}, { ranges: [] }, { ranges: [{ from: "2027-11-09", to: "2027-11-08" }] }, { ranges: [{ from: "2027-02-30", to: "2027-03-01" }] }, { ranges: [{ from: "11/08", to: "11/08" }] }]) {
    assert.equal(parseClosedDates(bad), null, JSON.stringify(bad));
  }
});

test("CD2 the expiry day is the day after the last closed date", () => {
  assert.equal(closedDatesExpiryDay(parseClosedDates({ ranges: [{ from: "2027-12-29", to: "2028-01-03" }, { from: "2027-11-08", to: "2027-11-08" }] })!), "2028-01-04");
  assert.equal(closedDatesExpiryDay(parseClosedDates({ ranges: [{ from: "2027-12-31", to: "2027-12-31" }] })!), "2028-01-01");
});

test("CD3 admission: official https source, every bounding date in the quote", () => {
  const ok = { factType: "closed_dates", origin: "crawled", license: "official", sourceUrl: "https://temple.example.jp/news" };
  const ranges = [{ from: "2027-12-29", to: "2028-01-03" }];
  assert.deepEqual(admitFeasibilityFact({ ...ok, value: { ranges, quote: "年末年始休館 12月29日〜1月3日" } }), { ok: true });
  assert.deepEqual(admitFeasibilityFact({ ...ok, value: { ranges, quote: "Closed December 29 – January 3" } }), { ok: true });
  assert.deepEqual(admitFeasibilityFact({ ...ok, value: { ranges, quote: "Closed December 29" } }), { ok: false, reason: "date_not_in_quote" });
  assert.deepEqual(admitFeasibilityFact({ ...ok, license: "editorial", value: { ranges, quote: "12/29–1/3" } }), { ok: false, reason: "not_official" });
  assert.deepEqual(admitFeasibilityFact({ ...ok, sourceUrl: "http://temple.example.jp/", value: { ranges, quote: "12/29–1/3" } }), { ok: false, reason: "no_source_url" });
  assert.deepEqual(admitFeasibilityFact({ ...ok, origin: "places_api", value: { ranges, quote: "12/29–1/3" } }), { ok: false, reason: "origin_not_allowed" });
  assert.deepEqual(admitFeasibilityFact({ ...ok, value: { ranges: [] } }), { ok: false, reason: "bad_value" });
  // A numeric form is never read inside a longer number.
  assert.equal(dateAppearsIn("closed 11/29", "2027-01-29"), false);
  assert.equal(dateAppearsIn("closed 29 Dec", "2027-12-09"), false);
  assert.equal(dateAppearsIn("closed 2027/12/9", "2027-12-09"), true);
});

test("CD4 the checker: closed_date, move_day, the fact's source; replaces the hours reason", () => {
  const r = checkPlan(plan());
  const issue = r.issues.find((i) => i.stop?.itemId === "t")!;
  assert.equal(issue.type, "closed_on_arrival");
  assert.equal(issue.why, "closed_date", "the 08:00 before-opening reason is replaced");
  assert.deepEqual(issue.fix, { action: "move_day", itemId: "t", day: 1 });
  assert.deepEqual(issue.source, { kind: "official_fact", url: "https://temple.example.jp/news", provenance: "Temple · checked 19 Oct 2026" });
  assert.equal(issue.checkedAt, "2026-10-19T00:00:00.000Z");
  assert.equal(r.issues.filter((i) => i.stop?.itemId === "t").length, 1);
  assert.equal(r.issues.some((i) => i.stop?.itemId === "m"), false, "Tuesday is not a closed date");
  // The same plan with no stored closed dates keeps the hours reason.
  const open = checkPlan(plan({ closedDates: new Map() })).issues.find((i) => i.stop?.itemId === "t")!;
  assert.equal(open.why, "before_opening");
  // A stop with no time on a closed date still counts.
  const untimed = checkPlan(plan({ stops: [{ id: "t", title: "Temple", dayNumber: 1, startTime: null, endTime: null, durationMinutes: null, point: null }] }));
  assert.equal(untimed.issues[0]?.why, "closed_date");
  // A range covers its inner days.
  const ranged = checkPlan(plan({ tripStartIso: "2027-12-30", closedDates: new Map([["t", CLOSED([{ from: "2027-12-29", to: "2028-01-03" }])]]) }));
  assert.equal(ranged.issues.find((i) => i.stop?.itemId === "t")?.why, "closed_date");
  // No dates on the plan ⇒ no date-bound check.
  assert.equal(checkPlan(plan({ tripStartIso: null })).issues.some((i) => i.why === "closed_date"), false);
});

test("CD5 the step 3 gate counts it", () => {
  const draftInput = plan();
  const draft = { input: draftInput, result: checkPlan(draftInput) };
  const keep = { ...draftInput, stops: [{ ...draftInput.stops[0], id: "v1", startTime: "10:00" }, { ...draftInput.stops[1], id: "v2" }], hours: new Map([["v1", HOURS], ["v2", HOURS]]), closedDates: new Map([["v1", draftInput.closedDates!.get("t")!]]) };
  const kept = compareVersionToDraft(draft, { input: keep, result: checkPlan(keep) }, new Map([["v1", "t"], ["v2", "m"]]));
  assert.equal(kept.passes, false);
  assert.deepEqual(kept.unresolved.map((i) => i.why), ["closed_date"]);
  const moved = { ...keep, stops: [{ ...keep.stops[0], dayNumber: 2 }, keep.stops[1]] };
  assert.equal(compareVersionToDraft(draft, { input: moved, result: checkPlan(moved) }, new Map([["v1", "t"], ["v2", "m"]])).passes, true);
});

test("CD6 the words", () => {
  assert.equal(closedOnDateLine("2027-11-08"), "Closed on Monday, November 8. Move this stop to another day.");
  const f = checkPlan(plan()).allFindings.find((x) => x.kind === "closed_on_arrival")!;
  assert.deepEqual(findingStopLines(f), ["Temple · Day 1 · 08:00: Closed on Monday, November 8. Move this stop to another day."]);
  const issue = checkPlan(plan()).issues[0];
  assert.equal(issueLine(issue), "Temple · Day 1 — is closed on that date");
  assert.equal(fixLine(issue), "Fix: move it to another day.");
});
