/**
 * FB-1 step 5c (ledger `2026-10-19-fb1-timed-entry`), the pure half.
 *   TE1 the value { required: true, opensDaysAhead?: N }; admission on the last_admission rule; N only when in the quote
 *   TE2 the checker: one `timed_entry_required` issue per stop with an admitted fact, fix `book_ahead`, the official link;
 *       never a card finding
 *   TE3 flag-only in the step 3 gate: a version keeping the place still carries it and passes; never unresolved, added
 *       or not-checkable
 *   TE4 never in the paid run's change list; the issue and fix lines
 *
 * Run: npx tsx --test shared/__tests__/fb1-timed-entry.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admitFeasibilityFact, numberAppearsIn, parseTimedEntryRequired } from "../feasibility-facts";
import { checkPlan, isFlagOnlyIssue, type PlanCheckInput } from "../plan-check";
import { compareVersionToDraft, fixLine, fixedVersionDescriptor, issueLine } from "../version-check";

const HOURS = [{ weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"], checkedAt: "2026-10-18T00:00:00.000Z", official: true, sourceKind: "official_fact" as const }];
const TE = [{ value: { required: true, opensDaysAhead: 30, quote: "Reservations open 30 days in advance." }, checkedAt: "2026-10-19T00:00:00.000Z", sourceUrl: "https://villa.example.jp/visit", provenance: "Villa · checked 19 Oct 2026" }];

/** Monday 2027-11-08: the Villa needs a timed slot; the Temple is reached before it opens. */
function plan(over: Partial<PlanCheckInput> = {}): PlanCheckInput {
  return {
    tripStartIso: "2027-11-08",
    transitCoverage: true,
    stops: [
      { id: "v", title: "Villa", dayNumber: 1, startTime: "10:00", endTime: null, durationMinutes: 60, point: null },
      { id: "t", title: "Temple", dayNumber: 1, startTime: "08:00", endTime: null, durationMinutes: 60, point: null },
    ],
    hours: new Map([["v", HOURS], ["t", HOURS]]),
    lastAdmission: new Map(),
    timedEntry: new Map([["v", TE]]),
    lastServices: [],
    anchors: [],
    legs: [],
    energy: [],
    ...over,
  };
}

test("TE1 the value and its admission", () => {
  assert.deepEqual(parseTimedEntryRequired({ required: true }), { required: true });
  assert.deepEqual(parseTimedEntryRequired({ required: true, opensDaysAhead: 30, at: "10:00" }), { required: true, opensDaysAhead: 30 }, "no time is kept");
  for (const bad of [null, {}, { required: false }, { required: "yes" }, { required: true, opensDaysAhead: 0 }, { required: true, opensDaysAhead: 2.5 }]) {
    assert.equal(parseTimedEntryRequired(bad), null, JSON.stringify(bad));
  }
  const ok = { factType: "timed_entry_required", origin: "crawled", license: "official", sourceUrl: "https://villa.example.jp/visit" };
  assert.deepEqual(admitFeasibilityFact({ ...ok, value: { required: true, quote: "Entry by timed reservation only." } }), { ok: true });
  assert.deepEqual(admitFeasibilityFact({ ...ok, value: { required: true, opensDaysAhead: 30, quote: "予約は30日前から" } }), { ok: true });
  assert.deepEqual(admitFeasibilityFact({ ...ok, value: { required: true, opensDaysAhead: 30, quote: "Reservations open a month ahead." } }), { ok: false, reason: "days_not_in_quote" });
  assert.deepEqual(admitFeasibilityFact({ ...ok, license: "editorial", value: { required: true } }), { ok: false, reason: "not_official" });
  assert.deepEqual(admitFeasibilityFact({ ...ok, sourceUrl: null, value: { required: true } }), { ok: false, reason: "no_source_url" });
  assert.equal(numberAppearsIn("open 130 days ahead", 30), false, "never inside a longer number");
});

test("TE2 the checker: one flag-only issue per stop, never a card finding", () => {
  const r = checkPlan(plan());
  const te = r.issues.filter((i) => i.type === "timed_entry_required");
  assert.deepEqual(te.map((i) => ({ day: i.day, stop: i.stop?.itemId, why: i.why, fix: i.fix, source: i.source, checkedAt: i.checkedAt })), [
    { day: 1, stop: "v", why: "timed_entry_required", fix: { action: "book_ahead", itemId: "v", day: 1 }, source: { kind: "official_fact", url: "https://villa.example.jp/visit", provenance: "Villa · checked 19 Oct 2026" }, checkedAt: "2026-10-19T00:00:00.000Z" },
  ]);
  assert.equal(isFlagOnlyIssue(te[0]), true);
  assert.equal(r.issues.filter((i) => !isFlagOnlyIssue(i)).length, 1, "the Temple's before-opening issue is not flag-only");
  assert.equal(r.allFindings.some((f) => f.kind === "timed_entry_required"), false, "not on the Optimize card");
  assert.deepEqual(checkPlan(plan({ timedEntry: undefined })).findings, r.findings, "the card is unchanged by the flag");
  assert.equal(checkPlan(plan({ timedEntry: new Map([["v", [{ ...TE[0], value: { required: false } }]]]) })).issues.some((i) => i.type === "timed_entry_required"), false);
});

test("TE3 flag-only in the gate: kept, shown, and the version passes", () => {
  const draftInput = plan();
  const draft = { input: draftInput, result: checkPlan(draftInput) };
  const v = { ...draftInput, stops: [{ ...draftInput.stops[0], id: "v1" }, { ...draftInput.stops[1], id: "t1", startTime: "10:00" }], hours: new Map([["v1", HOURS], ["t1", HOURS]]), timedEntry: new Map([["v1", TE]]) };
  const vr = checkPlan(v);
  assert.equal(vr.issues.some((i) => i.type === "timed_entry_required" && i.stop?.itemId === "v1"), true, "still shown on the version");
  const verdict = compareVersionToDraft(draft, { input: v, result: vr }, new Map([["v1", "v"], ["t1", "t"]]));
  assert.equal(verdict.passes, true);
  assert.deepEqual(verdict.unresolved, []);
  assert.deepEqual(verdict.added, []);
  assert.deepEqual(verdict.notCheckable, []);
  assert.equal(verdict.coverage.reduced, false);
  // A version that ADDS the place (the draft did not carry the fact) is not held for it either.
  const noFlagDraft = { input: plan({ timedEntry: new Map() }), result: checkPlan(plan({ timedEntry: new Map() })) };
  assert.equal(compareVersionToDraft(noFlagDraft, { input: v, result: vr }, new Map([["v1", "v"], ["t1", "t"]])).passes, true);
});

test("TE4 never in the paid run's change list; the words", () => {
  const r = checkPlan(plan());
  const d = fixedVersionDescriptor(r.issues, (id) => (id === "v" ? "S1" : "S2"));
  assert.equal(d.strategy.includes("Villa"), false, "the flag is not a change to make");
  assert.equal(d.strategy.includes("Temple"), true);
  const onlyFlag = fixedVersionDescriptor(r.issues.filter(isFlagOnlyIssue), () => null);
  assert.match(onlyFlag.strategy, /No problems were found/);
  const te = r.issues.find((i) => i.type === "timed_entry_required")!;
  assert.equal(issueLine(te), "Villa · Day 1 — needs a timed slot reserved on the official site");
  assert.equal(fixLine(te), "Fix: reserve a slot on the official site.");
});
