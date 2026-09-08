/**
 * THE EXTRACTION DATE ANCHOR — the prompt carries today, and a past date is ASKED about.
 *
 * Lane L21, ledger `2026-09-07-extraction-date-anchor`; Console & AI Concierge brief §11.2
 * finding F5; CLAUDE.md §13, §18 rule 1, Locked Decision 42 D12.
 *
 * WHY THIS EXISTS. F5 is a defect nothing could have caught: `POST /api/trip-context/extract`
 * asked a model for calendar dates with no reference point for "now", the model supplied a year
 * from its own training horizon, and the panel wrote a plan tagged PAST. Every layer behaved
 * correctly — the schema validated `2025-03-10`, the null-strip kept it, the panel rendered it —
 * so the only place the rule can be pinned is the extractor's own contract.
 *
 * These are PURE. No model call, no network, no database, and no reading of the clock: `today` is
 * an argument, so the whole rule is provable and none of it is date-dependent flaky.
 *
 *   A1  the prompt STATES today's date, so a bare month/day has something to resolve against.
 *   A2  the prompt tells the model not to move a past date to another year — the same rule the
 *       server enforces below, said to the party that would otherwise do the inventing.
 *   A3  the prompt still carries its conservatism rules verbatim: this lane changed what the model
 *       KNOWS, not what it is asked to do, and a silently relaxed prompt is the regression.
 *   A4  the vocabulary comes from the CALLER (`eventTypeEnum`), never restated here (§18 rule 1).
 *   A5  a past date is WITHHELD, not repaired — the value is reported back verbatim and no year
 *       is invented on the traveler's behalf (§13).
 *   A6  today itself is KEPT. Today is not the past.
 *   A7  a future date, a null, an absent key and a malformed string all pass through untouched —
 *       this function does one comparison and hides no other problem behind it.
 *   A8  the route uses the pure module and reads the clock ONCE, so the prompt's anchor and the
 *       withhold filter can never disagree about which day today was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildExtractionSystemPrompt,
  extractionDateAnchor,
  withholdPastDates,
} from "../services/trip-context-extraction";

// Fixed, so nothing here depends on when CI runs. Local-time construction matches the anchor's.
const TODAY = new Date(2026, 8, 7); // 2026-09-07
const EVENT_TYPES = ["vacation", "birthday", "proposal"] as const;

test("A1 the prompt states today's date as the anchor", () => {
  const prompt = buildExtractionSystemPrompt(TODAY, EVENT_TYPES);
  assert.equal(extractionDateAnchor(TODAY), "2026-09-07");
  assert.match(prompt, /Today's date is 2026-09-07/);
  assert.match(
    prompt,
    /bare month and day means the NEXT occurrence/,
    "the anchor is useless unless the model is told how to use it — 'March 10' resolving forward is the whole fix",
  );
});

test("A2 the prompt refuses a past date rather than re-yearing it", () => {
  const prompt = buildExtractionSystemPrompt(TODAY, EVENT_TYPES);
  assert.match(prompt, /Never return a date before 2026-09-07/);
  assert.match(
    prompt,
    /return null for it rather than moving it to a different year/,
    "the model is told the SAME rule the server enforces — null, never a substituted year (§13)",
  );
});

test("A3 the conservatism rules this endpoint already had are unchanged", () => {
  const prompt = buildExtractionSystemPrompt(TODAY, EVENT_TYPES);
  for (const rule of [
    /NEVER guess, infer, assume/,
    /its value MUST be null/,
    /Do not compute a date from a vague phrase/,
    /explicitly stated it in their own words/,
  ]) {
    assert.match(prompt, rule, "this lane changed what the model KNOWS, not what it is asked to do");
  }
});

test("A4 the eventType vocabulary comes from the caller, never restated here", () => {
  const prompt = buildExtractionSystemPrompt(TODAY, ["only_this_one"]);
  assert.match(prompt, /clearly applies: only_this_one/);
  assert.ok(
    !/vacation/.test(prompt),
    "shared/schema.ts is the authority on that list; a copy here would drift from it (§18 rule 1)",
  );
});

test("A5 a past date is WITHHELD with its reason, never repaired to another year", () => {
  const { fields, withheld } = withholdPastDates(
    { destination: "Kyoto", startDate: "2025-03-10", endDate: "2025-03-14" },
    TODAY,
  );
  assert.deepEqual(fields, { destination: "Kyoto" }, "the dates are GONE, not corrected");
  assert.deepEqual(withheld, [
    { field: "startDate", value: "2025-03-10", reason: "in_the_past" },
    { field: "endDate", value: "2025-03-14", reason: "in_the_past" },
  ]);
  // §13, the load-bearing half: nothing anywhere in the result carries a manufactured year.
  assert.ok(!JSON.stringify(fields).includes("2026-03-10"), "no year is invented on the traveler's behalf");
});

test("A6 today itself is kept — today is not the past", () => {
  const { fields, withheld } = withholdPastDates({ startDate: "2026-09-07" }, TODAY);
  assert.deepEqual(fields, { startDate: "2026-09-07" });
  assert.deepEqual(withheld, []);
});

test("A7 a future date, a null, an absent key and a malformed value all pass through", () => {
  const cases: Array<Record<string, unknown>> = [
    { startDate: "2026-12-01", endDate: "2027-01-04" },
    { startDate: null },
    { destination: "Kyoto" },
    // Not the shape the schema guarantees — passed through rather than silently dropped, so a
    // different problem is not hidden behind this one.
    { startDate: "next March" },
  ];
  for (const input of cases) {
    const { fields, withheld } = withholdPastDates(input, TODAY);
    assert.deepEqual(fields, input, `unchanged: ${JSON.stringify(input)}`);
    assert.deepEqual(withheld, [], `nothing withheld: ${JSON.stringify(input)}`);
  }
});

test("A8 the route uses the pure module and reads the clock exactly once", () => {
  const route = readFileSync(
    new URL("../routes/trip-context.routes.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /buildExtractionSystemPrompt\(extractionNow, eventTypeEnum\)/);
  assert.match(route, /withholdPastDates\(established, extractionNow\)/);
  assert.equal(
    (route.match(/const extractionNow = new Date\(\)/g) ?? []).length,
    1,
    "ONE reading of the clock, so the prompt's anchor and the filter cannot disagree (§18 rule 1)",
  );
  assert.ok(
    !/const EXTRACTION_SYSTEM_PROMPT = /.test(route),
    "the anchorless constant is GONE, not left beside its replacement",
  );
});
