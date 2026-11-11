/**
 * Local-expert knowledge-proof length (Leon, Nov 11, 2026, 12:16 PM ET).
 *
 * The counter, the continue gate and insertLocalExpertFormSchema import one
 * constant pair and one count. 249 is rejected, 250 is accepted, and space
 * padding does not move the count.
 *
 *   npx tsx --test shared/__tests__/expert-answer-length.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { insertLocalExpertFormSchema } from "../schema";
import {
  EXPERT_ANSWER_MIN_CHARS,
  EXPERT_ANSWER_TARGET_CHARS,
  countExpertAnswerChars,
  expertAnswerCounterLine,
  expertAnswerMinimumLine,
} from "../expert-answer-length";

const ROOT = path.resolve(import.meta.dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function localExpert(answer: string) {
  const meets = "a".repeat(EXPERT_ANSWER_MIN_CHARS);
  return {
    expertType: "local_expert" as const,
    firstName: "Jamie",
    lastName: "Doe",
    email: "jamie@example.com",
    city: "Kyoto",
    country: "Japan",
    localSpecialties: ["hidden temples"],
    knowledgeProofAnswers: [
      { question: "Q1", answer },
      { question: "Q2", answer: meets },
      { question: "Q3", answer: meets },
    ],
  };
}

test("the shared pair is 250 minimum and 750 target", () => {
  assert.equal(EXPERT_ANSWER_MIN_CHARS, 250);
  assert.equal(EXPERT_ANSWER_TARGET_CHARS, 750);
  assert.ok(EXPERT_ANSWER_TARGET_CHARS > EXPERT_ANSWER_MIN_CHARS);
});

test("count is trimmed length with whitespace runs collapsed", () => {
  assert.equal(countExpertAnswerChars(""), 0);
  assert.equal(countExpertAnswerChars("   \n\t  "), 0);
  assert.equal(countExpertAnswerChars("d"), 1);
  // A row of single letters is characters, not one word per letter.
  assert.equal(countExpertAnswerChars("d d d d"), 7);
  assert.equal(countExpertAnswerChars("d ".repeat(52)), 103);
  assert.equal(countExpertAnswerChars("a".repeat(249)), 249);
  assert.equal(countExpertAnswerChars("a".repeat(250)), 250);
  assert.equal(countExpertAnswerChars(`${"a".repeat(250)}${" ".repeat(80)}`), 250);
  assert.equal(countExpertAnswerChars(`${" ".repeat(80)}${"a".repeat(249)}`), 249);
  assert.equal(countExpertAnswerChars(`${"a".repeat(124)}${" ".repeat(30)}${"a".repeat(125)}`), 250);
  assert.equal(countExpertAnswerChars(`${"a".repeat(124)}${" \n\t ".repeat(10)}${"a".repeat(124)}`), 249);
});

test("the counter line and the server message use the same count", () => {
  assert.equal(expertAnswerMinimumLine(1), "1 characters — minimum 250 to continue");
  assert.equal(expertAnswerCounterLine(1), expertAnswerMinimumLine(1));
  assert.equal(expertAnswerCounterLine(249), "249 characters — minimum 250 to continue");
  assert.equal(expertAnswerCounterLine(250), "250 characters — aim for 750 for best results");
  assert.equal(expertAnswerCounterLine(749), "749 characters — aim for 750 for best results");
  assert.equal(expertAnswerCounterLine(750), "750 characters ✓ Great detail");
  const padded = `${" ".repeat(40)}${"a".repeat(249)}${" ".repeat(40)}`;
  assert.equal(expertAnswerCounterLine(countExpertAnswerChars(padded)), expertAnswerMinimumLine(249));
});

test("the schema rejects 249, accepts 250, and ignores space padding", () => {
  const short = insertLocalExpertFormSchema.safeParse(localExpert("a".repeat(249)));
  assert.equal(short.success, false);
  if (!short.success) {
    const issue = short.error.issues.find((item) => item.path[0] === "knowledgeProofAnswers");
    assert.ok(issue, "a short answer is an issue");
    assert.equal(issue?.message, expertAnswerMinimumLine(249));
    assert.equal(issue?.message, expertAnswerCounterLine(249));
  }

  assert.equal(insertLocalExpertFormSchema.safeParse(localExpert("a".repeat(250))).success, true);
  assert.equal(
    insertLocalExpertFormSchema.safeParse(localExpert(`${"a".repeat(250)}${" ".repeat(100)}`)).success,
    true,
  );
  assert.equal(
    insertLocalExpertFormSchema.safeParse(localExpert(`${" ".repeat(100)}${"a".repeat(249)}${" \t\n".repeat(20)}`)).success,
    false,
  );
  assert.equal(
    insertLocalExpertFormSchema.safeParse(
      localExpert(`${"a".repeat(124)}${" ".repeat(40)}${"a".repeat(125)}`),
    ).success,
    true,
  );
  assert.equal(
    insertLocalExpertFormSchema.safeParse(
      localExpert(`${"a".repeat(124)}${" ".repeat(40)}${"a".repeat(124)}`),
    ).success,
    false,
  );
});

test("an omitted essay array is still the pre-existing content gate", () => {
  assert.equal(
    insertLocalExpertFormSchema.safeParse({
      expertType: "local_expert",
      city: "Kyoto",
      country: "Japan",
    }).success,
    true,
  );
  assert.equal(
    insertLocalExpertFormSchema.safeParse({
      expertType: "travel_expert",
      destinations: ["Paris"],
      knowledgeProofAnswers: [
        { question: "Q1", answer: "d d d d" },
      ],
    }).success,
    true,
  );
});

test("the client counter, the continue gate and the schema import the same module", () => {
  const client = read("client/src/pages/travel-experts.tsx");
  const schema = read("shared/schema.ts");
  const clientImport = client.match(/import\s*\{([^}]+)\}\s*from\s*"@shared\/expert-answer-length"/);
  const schemaImport = schema.match(/import\s*\{([^}]+)\}\s*from\s*"\.\/expert-answer-length"/);
  assert.ok(clientImport, "client imports @shared/expert-answer-length");
  assert.ok(schemaImport, "schema imports ./expert-answer-length");
  for (const block of [clientImport?.[1] ?? "", schemaImport?.[1] ?? ""]) {
    assert.match(block, /EXPERT_ANSWER_MIN_CHARS/);
    assert.match(block, /EXPERT_ANSWER_TARGET_CHARS/);
    assert.match(block, /countExpertAnswerChars/);
  }
  assert.match(client, /countExpertAnswerChars\(a\) >= EXPERT_ANSWER_MIN_CHARS/);
  assert.match(client, /expertAnswerCounterLine\(count\)/);
  assert.match(schema, /countExpertAnswerChars\(expertAnswerText\(entry\)\)/);
  assert.match(schema, /count < EXPERT_ANSWER_MIN_CHARS/);
  assert.doesNotMatch(client, /split\(\/\\s\+\/\)/);
  assert.doesNotMatch(client, /50 words|150 words|words >= 50|words < 150/);
});
