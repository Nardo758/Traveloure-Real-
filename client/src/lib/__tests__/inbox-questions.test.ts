/**
 * L2-9 — the inbox Questions tab's client wording (ledger `2026-10-05-inbox-questions-tab`).
 *   Q1 a question's words are the traveler's; a question asked with no text says so, never invents one
 *   Q2 the context line omits an unknown city rather than printing a placeholder
 *   Q3 the tab label carries a count only when there are questions — never "(0)"
 *   Q4 a refused answer is worded from the server's status/code; the server's own 400 message is relayed
 *
 * Pure — no DOM, no network. Run: npx tsx --test client/src/lib/__tests__/inbox-questions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answerRefusal, questionContext, questionText, questionsTabLabel } from "../inbox-questions";

describe("Q1 question text", () => {
  it("is the traveler's own words, trimmed", () => {
    assert.deepEqual(questionText({ question: "  Is it busy at 7am? " }), { text: "Is it busy at 7am?", written: true });
  });
  it("a null or blank question says it was asked without text", () => {
    for (const question of [null, "", "   "]) {
      assert.deepEqual(questionText({ question }), { text: "Asked about this stop without writing a question", written: false });
    }
  });
});

describe("Q2 context line", () => {
  it("day, stop and city", () => {
    assert.equal(questionContext({ dayNumber: 2, itemTitle: "Fushimi Inari", city: "Kyoto" }), "Day 2 · Fushimi Inari · Kyoto");
  });
  it("no city is omitted, never 'Unknown'", () => {
    assert.equal(questionContext({ dayNumber: 1, itemTitle: "Nishiki Market", city: null }), "Day 1 · Nishiki Market");
  });
});

describe("Q3 tab label", () => {
  it("counts only when there are questions", () => {
    assert.equal(questionsTabLabel(3), "Questions (3)");
    assert.equal(questionsTabLabel(0), "Questions");
    assert.equal(questionsTabLabel(undefined), "Questions");
  });
});

describe("Q4 refusals", () => {
  it("409 / already_answered, 404, the server's own 400, anything else", () => {
    assert.equal(answerRefusal(409, { code: "already_answered" }), "Another local already answered this question.");
    assert.equal(answerRefusal(404, { code: "not_found" }), "This question is no longer open to you.");
    assert.equal(answerRefusal(400, { code: "invalid_body", message: "An answer is 1–2000 characters" }), "An answer is 1–2000 characters");
    assert.equal(answerRefusal(500, null), "Your answer wasn't sent. Try again.");
  });
});
