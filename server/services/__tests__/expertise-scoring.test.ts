/**
 * CC-6 pin: normalizeKnowledgeProofAnswers must accept BOTH shapes the answers appear in —
 * plain strings, and the { question, answer } objects the onboarding form actually submits
 * (client/src/pages/travel-experts.tsx:446) and that are what's stored in
 * local_expert_forms.knowledge_proof_answers (jsonb). Before this fix, the scoring call sites
 * in server/routes.ts cast the stored value `as string[]` — a TS-only assertion that doesn't
 * coerce data — so the real objects flowed into a caller whose only defense was this
 * normalizer already handling both shapes; if it didn't, scoring would silently degrade to
 * "unscored" for every real submission (only object-shaped answers are ever stored).
 *
 * Pure function, no network/API key required. Run with:
 *   npx tsx --test server/services/__tests__/expertise-scoring.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeKnowledgeProofAnswers } from "../expertise-scoring.service";

const QUESTIONS = ["Q1 text", "Q2 text", "Q3 text"];

describe("normalizeKnowledgeProofAnswers (CC-6)", () => {
  it("maps the REAL stored shape — {question, answer}[] — to {q, a} pairs", () => {
    const stored = [
      { question: "Q1 text", answer: "Answer one is here" },
      { question: "Q2 text", answer: "Answer two is here" },
    ];
    const result = normalizeKnowledgeProofAnswers(stored, QUESTIONS);
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { q: "Q1 text", a: "Answer one is here" });
    assert.deepEqual(result[1], { q: "Q2 text", a: "Answer two is here" });
  });

  it("passes plain string[] through unchanged (legacy/alternate shape)", () => {
    const legacy = ["Answer one", "Answer two", "Answer three"];
    const result = normalizeKnowledgeProofAnswers(legacy, QUESTIONS);
    assert.equal(result.length, 3);
    assert.deepEqual(
      result.map((p) => p.a),
      legacy,
    );
    // Positional question is filled in from `questions` for the string shape.
    assert.deepEqual(
      result.map((p) => p.q),
      QUESTIONS,
    );
  });

  it("handles a MIXED array of both shapes in the same call", () => {
    const mixed = ["plain string answer", { question: "Q2 text", answer: "object answer" }];
    const result = normalizeKnowledgeProofAnswers(mixed as any, QUESTIONS);
    assert.equal(result.length, 2);
    assert.equal(result[0].a, "plain string answer");
    assert.equal(result[1].a, "object answer");
    assert.equal(result[1].q, "Q2 text");
  });

  it("prefers the stored question over the positional default when both exist", () => {
    const stored = [{ question: "a custom re-asked question", answer: "some answer" }];
    const result = normalizeKnowledgeProofAnswers(stored, QUESTIONS);
    assert.equal(result[0].q, "a custom re-asked question");
  });

  it("falls back to the positional question when the object omits `question`", () => {
    const stored = [{ answer: "some answer" }];
    const result = normalizeKnowledgeProofAnswers(stored, QUESTIONS);
    assert.equal(result[0].q, "Q1 text");
  });

  it("drops blank/whitespace-only answers regardless of shape", () => {
    const mixed = ["   ", { question: "Q2 text", answer: "" }, { question: "Q3 text", answer: "real answer" }];
    const result = normalizeKnowledgeProofAnswers(mixed as any, QUESTIONS);
    assert.equal(result.length, 1);
    assert.equal(result[0].a, "real answer");
  });

  it("drops entries missing `answer` entirely (object shape) without throwing", () => {
    const stored = [{ question: "Q1 text" }, { question: "Q2 text", answer: "kept" }];
    const result = normalizeKnowledgeProofAnswers(stored, QUESTIONS);
    assert.equal(result.length, 1);
    assert.equal(result[0].a, "kept");
  });

  it("returns an empty array for an empty/undefined input, never throws", () => {
    assert.deepEqual(normalizeKnowledgeProofAnswers([], QUESTIONS), []);
    assert.deepEqual(normalizeKnowledgeProofAnswers(undefined as any, QUESTIONS), []);
  });
});
