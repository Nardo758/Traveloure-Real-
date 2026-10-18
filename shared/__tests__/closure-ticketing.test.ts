/**
 * EV-P0 — CLOSURE AND TICKETING RULES READ BY FEASIBILITY (decision-maker, Oct 18, 2026; ledger
 * `2026-10-18-closure-ticketing-feasibility`).
 *
 *   CK1  parseClosure: dates, ranges and weekdays; nothing closed or a malformed value ⇒ null
 *   CK2  closedOnDate: a single date, a range across the new year, a weekday; never on a bad date
 *   CK3  parseTicketingRule: only reservationRequired === true is a rule; bounds on bookAheadDays
 *   CK4  admission: official + https; every closed date in the quote; the day count in the quote
 *   CK5  a stop dated on a closed day is closed_on_arrival / closed_day with a move_day fix citing the closure;
 *        a stop the hours already count is not counted twice
 *   CK6  reservation_required: flagged on an unbooked stop, withheld once booked, never an issue, never in a fix
 *   CK7  a version that moves the stop off the closed day clears it; the reservation flag never gates a version
 *   CK8  the words
 *   CK9  official closure and ticketing facts are public + link_only whoever wrote them
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admitFeasibilityFact, closedOnDate, dateAppearsIn, parseClosure, parseTicketingRule } from "../feasibility-facts";
import { checkPlan, type PlanCheckInput, type PlanCheckStop } from "../plan-check";
import { findingLine, findingStopLines } from "../optimizer-lead";
import { placeFactTags } from "../content-tiers";
import { compareVersionToDraft } from "../version-check";

const SRC = "https://www.kinkakuji.or.jp/";
const fact = (value: unknown) => ({ value, checkedAt: "2026-10-18T00:00:00.000Z", sourceUrl: SRC, provenance: "Kinkaku-ji · checked 18 Oct 2026" });

function stop(over: Partial<PlanCheckStop> & { id: string }): PlanCheckStop {
  return { title: over.id, dayNumber: 1, startTime: "10:00", endTime: "11:00", durationMinutes: 60, point: null, ...over };
}

function input(over: Partial<PlanCheckInput>): PlanCheckInput {
  return {
    tripStartIso: "2026-12-28",
    transitCoverage: true,
    stops: [],
    hours: new Map(),
    lastAdmission: new Map(),
    lastServices: [],
    anchors: [],
    legs: [],
    energy: [],
    ...over,
  };
}

test("CK1 — parseClosure", () => {
  assert.deepEqual(parseClosure({ closedDates: ["2026-12-31"] }), { closedDates: ["2026-12-31"], closedRanges: [] });
  assert.deepEqual(parseClosure({ closedRanges: [{ from: "2026-12-29", to: "2027-01-03" }], closedWeekdays: [3, 3] }), {
    closedDates: [], closedRanges: [{ from: "2026-12-29", to: "2027-01-03" }], closedWeekdays: [3],
  });
  assert.equal(parseClosure({}), null, "a closure that closes nothing is not a fact");
  assert.equal(parseClosure({ closedDates: ["12/29"] }), null);
  assert.equal(parseClosure({ closedRanges: [{ from: "2027-01-03", to: "2026-12-29" }] }), null);
  assert.equal(parseClosure({ closedWeekdays: [7] }), null);
  assert.equal(parseClosure({ closedWeekdays: [] }), null);
});

test("CK2 — closedOnDate", () => {
  const v = parseClosure({ closedDates: ["2026-08-16"], closedRanges: [{ from: "2026-12-29", to: "2027-01-03" }], closedWeekdays: [3] })!;
  assert.equal(closedOnDate(v, "2026-08-16"), true);
  assert.equal(closedOnDate(v, "2027-01-01"), true, "inside a range across the new year");
  assert.equal(closedOnDate(v, "2027-01-06"), true, "a Wednesday");
  assert.equal(closedOnDate(v, "2027-01-05"), false);
  assert.equal(closedOnDate(v, "not-a-date"), false);
});

test("CK3 — parseTicketingRule", () => {
  assert.deepEqual(parseTicketingRule({ reservationRequired: true }), { reservationRequired: true });
  assert.deepEqual(parseTicketingRule({ reservationRequired: true, bookAheadDays: 3, timedEntry: true }), { reservationRequired: true, bookAheadDays: 3, timedEntry: true });
  assert.equal(parseTicketingRule({ reservationRequired: false }), null, "a page saying no reservation is not a rule");
  assert.equal(parseTicketingRule({ reservationRequired: "yes" }), null);
  assert.equal(parseTicketingRule({ reservationRequired: true, bookAheadDays: -1 }), null);
  assert.equal(parseTicketingRule({ reservationRequired: true, timedEntry: "yes" }), null);
});

test("CK4 — admission", () => {
  const ok = (factType: string, value: unknown, over: Record<string, unknown> = {}) =>
    admitFeasibilityFact({ factType, value, origin: "crawled", license: "official", sourceUrl: SRC, ...over });
  assert.deepEqual(ok("closure", { closedRanges: [{ from: "2026-12-29", to: "2027-01-03" }], quote: "年末年始（12月29日～1月3日）は休館" }), { ok: true });
  assert.deepEqual(ok("closure", { closedDates: ["2026-12-31"], quote: "Closed Dec 29" }), { ok: false, reason: "date_not_in_quote" });
  assert.deepEqual(ok("closure", { closedDates: ["2026-12-31"] }, { license: "editorial" }), { ok: false, reason: "not_official" });
  assert.deepEqual(ok("closure", { closedDates: ["2026-12-31"] }, { sourceUrl: "http://x.jp/" }), { ok: false, reason: "no_source_url" });
  assert.deepEqual(ok("closure", { text: "closed at new year" }), { ok: false, reason: "bad_value" });
  assert.deepEqual(ok("ticketing_rule", { reservationRequired: true, bookAheadDays: 3, quote: "Reserve at least 3 days ahead." }), { ok: true });
  assert.deepEqual(ok("ticketing_rule", { reservationRequired: true, bookAheadDays: 7, quote: "Reserve ahead." }), { ok: false, reason: "number_not_in_quote" });
  assert.deepEqual(ok("ticketing_rule", { reservationRequired: true }, { origin: "places_api" }), { ok: false, reason: "origin_not_allowed" });
  assert.equal(dateAppearsIn("Closed 12/290", "2026-12-29"), false, "a date is matched whole, never inside a longer number");
});

test("CK5 — a closure fact closes a dated stop; the hours' own count is not doubled", () => {
  const hoursClosed = { weekdayDescriptions: ["Tuesday: Closed"], official: true, checkedAt: "2026-10-18T00:00:00.000Z", sourceKind: "official_fact" as const };
  const r = checkPlan(input({
    stops: [stop({ id: "kinkaku" }), stop({ id: "both", dayNumber: 2 }), stop({ id: "open", dayNumber: 3 })],
    hours: new Map([["both", [hoursClosed]]]),
    closures: new Map([
      ["kinkaku", [fact({ closedRanges: [{ from: "2026-12-28", to: "2026-12-29" }] })]],
      ["both", [fact({ closedDates: ["2026-12-29"] })]],
      ["open", [fact({ closedDates: ["2027-02-01"] })]],
    ]),
  }));
  const closed = r.allFindings.find((f) => f.kind === "closed_on_arrival")!;
  assert.equal(closed.count, 2, "kinkaku from the closure, 'both' once (from its hours), 'open' not at all");
  const issue = r.issues.find((i) => i.stop?.itemId === "kinkaku")!;
  assert.equal(issue.why, "closed_day");
  assert.deepEqual(issue.fix, { action: "move_day", itemId: "kinkaku", day: 1 });
  assert.deepEqual(issue.source, { kind: "official_fact", url: SRC, provenance: "Kinkaku-ji · checked 18 Oct 2026" });
  assert.equal(r.issues.filter((i) => i.stop?.itemId === "both").length, 1);
  // A dated stop with no start time is still closed that day.
  const untimed = checkPlan(input({ stops: [stop({ id: "k", startTime: null })], closures: new Map([["k", [fact({ closedDates: ["2026-12-28"] })]]]) }));
  assert.equal(untimed.allFindings.find((f) => f.kind === "closed_on_arrival")?.count, 1);
  // No trip date ⇒ nothing can be checked.
  const undated = checkPlan(input({ tripStartIso: null, stops: [stop({ id: "k" })], closures: new Map([["k", [fact({ closedDates: ["2026-12-28"] })]]]) }));
  assert.equal(undated.allFindings.length, 0);
});

test("CK6 — reservation_required: flagged unbooked, withheld booked, never an issue", () => {
  const rules = new Map([
    ["ghibli", [fact({ reservationRequired: true, bookAheadDays: 30 })]],
    ["booked", [fact({ reservationRequired: true })]],
  ]);
  const r = checkPlan(input({ stops: [stop({ id: "ghibli" }), stop({ id: "booked", booked: true }), stop({ id: "free" })], ticketingRules: rules }));
  const f = r.allFindings.find((x) => x.kind === "reservation_required")!;
  assert.equal(f.count, 1);
  assert.deepEqual(f.stops?.map((s) => s.itemId), ["ghibli"]);
  assert.equal(r.issues.some((i) => i.type === "reservation_required"), false, "a flag only — no issue, no fix");
  // Unparseable rule rows raise nothing.
  const bad = checkPlan(input({ stops: [stop({ id: "x" })], ticketingRules: new Map([["x", [fact({ reservationRequired: false })]]]) }));
  assert.equal(bad.allFindings.length, 0);
});

test("CK7 — versions: moving off the closed day clears it; the reservation never gates", () => {
  const closures = new Map([["k", [fact({ closedDates: ["2026-12-28"] })]]]);
  const rules = new Map([["k", [fact({ reservationRequired: true })]]]);
  const draftInput = input({ stops: [stop({ id: "k" })], closures, ticketingRules: rules });
  const draft = { input: draftInput, result: checkPlan(draftInput) };
  const vIn = input({ stops: [stop({ id: "v1", dayNumber: 2 })], closures: new Map([["v1", closures.get("k")!]]), ticketingRules: new Map([["v1", rules.get("k")!]]) });
  const version = { input: vIn, result: checkPlan(vIn) };
  assert.equal(version.result.allFindings.some((x) => x.kind === "reservation_required"), true, "still flagged on the version");
  const verdict = compareVersionToDraft(draft as any, version as any, new Map([["v1", "k"]]));
  assert.equal(verdict.passes, true, JSON.stringify(verdict));
});

test("CK8 — the words", () => {
  assert.equal(findingLine({ kind: "reservation_required", count: 1, days: [1] }), "1 stop needs a reservation before you go");
  assert.equal(findingLine({ kind: "reservation_required", count: 2, days: [1] }), "2 stops need a reservation before you go");
  assert.deepEqual(findingStopLines({ kind: "reservation_required", count: 1, days: [2], stops: [{ itemId: "g", title: "Ghibli Museum", day: 2, reason: "reservation_required", startMin: 600 }] }), [
    "Ghibli Museum · Day 2 · 10:00 needs a reservation",
  ]);
});

test("CK9 — official closure and ticketing facts are public + link_only whoever wrote them", () => {
  for (const t of ["closure", "ticketing_rule"]) {
    assert.deepEqual(placeFactTags("crawled", "official", t), { sourceClass: "public", reuseClass: "link_only" });
    assert.deepEqual(placeFactTags("expert_nugget", "official", t), { sourceClass: "public", reuseClass: "link_only" }, `${t}: an expert citing an official page`);
    assert.deepEqual(placeFactTags("expert_nugget", null, t), { sourceClass: "local", reuseClass: "reusable" });
  }
});
