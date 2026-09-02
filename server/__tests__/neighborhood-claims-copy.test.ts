/**
 * neighborhood-claims-copy.test.ts — the vocabulary rule (companion §0; Phase 0 D6 ratified).
 *
 * Every expert-facing string this lane ships — the prompt copy, the §5 return templates, the
 * verified line, and the source of every expert-reachable component/page it added or touched —
 * must not contain the words test | exam | score | pass | fail (whole words, case-insensitive),
 * nor any internal claim status. Phase 2 widens this to every string reachable by role `expert`.
 * DB-free.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLAIM_PROMPTS,
  RETURN_TEMPLATES,
  VERIFIED_COPY,
  EVIDENCE_DIMENSIONS,
  CONTINGENCY_TRIGGER_LABELS,
  EXPERT_CONFIDENCE_LABELS,
  HARD_CONSTRAINT_LABELS,
  UNLOCK_COPY,
  EVIDENCE_UNLOCKS,
} from "../../shared/neighborhood-claims";

// Exactly the ruled list (D6): whole words, case-insensitive. "Failed to load…" is not "fail".
const FORBIDDEN = /\b(test|exam|score|pass|fail)\b/i;
const INTERNAL_STATUS = /\b(scored|declined)\b/i;

const EXPERT_FACING_FILES = [
  "client/src/components/neighborhood-claims/claim-capture-form.tsx",
  "client/src/pages/expert/neighborhoods.tsx",
  "client/src/pages/travel-experts.tsx",
];

describe("expert-facing vocabulary — claimed → verified, never test/exam/score/pass/fail", () => {
  it("prompt copy, return templates and the verified line are clean", () => {
    const samples = [
      CLAIM_PROMPTS.heading("Gion"),
      CLAIM_PROMPTS.p1("Gion"),
      CLAIM_PROMPTS.p2("Gion", "evening"),
      CLAIM_PROMPTS.p3("evening"),
      CLAIM_PROMPTS.p4("Gion"),
      VERIFIED_COPY("Gion"),
      ...EVIDENCE_DIMENSIONS.map((d) => RETURN_TEMPLATES[d]("Yasaka Shrine")),
      ...EVIDENCE_UNLOCKS.map((u) => UNLOCK_COPY[u]("Gion")),
      ...Object.values(CONTINGENCY_TRIGGER_LABELS),
      ...Object.values(EXPERT_CONFIDENCE_LABELS),
      ...Object.values(HARD_CONSTRAINT_LABELS),
    ];
    for (const s of samples) {
      assert.doesNotMatch(s, FORBIDDEN, `forbidden word in: ${s}`);
      assert.doesNotMatch(s, /\d/, `a digit in expert-facing copy: ${s}`);
    }
    for (const d of EVIDENCE_DIMENSIONS) {
      assert.equal(RETURN_TEMPLATES[d]("x").toLowerCase().includes(d), false, `return template must not name its dimension: ${d}`);
    }
  });

  it("expert-reachable source files carry none of the forbidden words", () => {
    for (const rel of EXPERT_FACING_FILES) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      // Strip JSX attribute test ids and import lines before scanning prose/code.
      const scannable = src
        .replace(/data-testid=\{?["'`][^"'`]*["'`]\}?/g, "")
        .split("\n")
        .filter((l) => !/^\s*import\s/.test(l))
        .join("\n");
      const m = scannable.match(FORBIDDEN);
      assert.equal(m, null, `${rel}: forbidden word "${m?.[0]}" near: ${scannable.slice(Math.max(0, (m?.index ?? 0) - 60), (m?.index ?? 0) + 60)}`);
    }
  });

  it("the console page never renders an internal claim status word", () => {
    const src = readFileSync(join(process.cwd(), "client/src/pages/expert/neighborhoods.tsx"), "utf8");
    const jsxText = src.match(/>([^<>{}]+)</g) ?? [];
    for (const t of jsxText) assert.doesNotMatch(t, INTERNAL_STATUS, `internal status rendered: ${t}`);
  });
});
