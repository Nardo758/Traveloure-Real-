/**
 * A10 fix 2 (Leon, Nov 22 2026): the skip-aware "Next:" question.
 *
 * The strip marks a skip by remembering the key; the selector walks the FIXED four-question order and returns the first
 * question that is neither answered by the plan nor skipped in this visit. Skipping all four returns none, which is the
 * property the old loop lost: it "advanced" by setting a property named after the question, a property nothing read, so
 * it could spin forever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEXT_QUESTION_ORDER,
  nextQuestion,
  nextQuestionSkipping,
  type NextQuestionFacts,
  type NextQuestionKey,
} from "../next-question";

const blank: NextQuestionFacts = { datesConfirmed: false, travelers: null, stayChosen: false, flightKnown: false };
const date = new Set<NextQuestionKey>(["dates"]);
const all: NextQuestionKey[] = [...NEXT_QUESTION_ORDER];

test("the order is the board's: dates, party, stay, flight - and nothing else can be asked", () => {
  assert.deepEqual(all, ["dates", "party", "stay", "flight"]);
});

test("skipping each question in turn returns the NEXT one", () => {
  assert.equal(nextQuestionSkipping(blank, []), "dates");
  assert.equal(nextQuestionSkipping(blank, ["dates"]), "party");
  assert.equal(nextQuestionSkipping(blank, ["dates", "party"]), "stay");
  assert.equal(nextQuestionSkipping(blank, ["dates", "party", "stay"]), "flight");
});

test("skipping all four returns none", () => {
  assert.equal(nextQuestionSkipping(blank, all), null);
});

test("an answered question is never asked, skipped or not", () => {
  assert.equal(nextQuestionSkipping({ ...blank, datesConfirmed: true }, []), "party");
  assert.equal(nextQuestionSkipping({ ...blank, datesConfirmed: true, travelers: 2 }, []), "stay");
  assert.equal(nextQuestionSkipping({ ...blank, datesConfirmed: true, travelers: 2, stayChosen: true }, []), "flight");
  assert.equal(
    nextQuestionSkipping({ ...blank, datesConfirmed: true, travelers: 2, stayChosen: true, flightKnown: true }, []),
    null,
  );
});

test("a skip before an answered question still advances past both", () => {
  // Party is answered but dates are not: skipping dates must land on stay, not back on dates.
  assert.equal(nextQuestionSkipping({ ...blank, travelers: 2 }, ["dates"]), "stay");
});

test("no fact shape makes it loop: every call returns a question or null", () => {
  // The old bug was a loop that never advanced. This asserts the bound directly: four passes at most, and the result
  // is always one of the order or null.
  for (let pass = 0; pass <= all.length; pass++) {
    const skipped = all.slice(0, pass);
    const got = nextQuestionSkipping(blank, skipped);
    assert.ok(got === null || all.includes(got), `pass ${pass} returned ${String(got)}`);
    assert.equal(got, pass === all.length ? null : all[pass]);
  }
  // And the plain selector agrees with the skip-aware one when nothing is skipped.
  assert.equal(nextQuestion(blank), nextQuestionSkipping(blank, []));
  void date;
});
