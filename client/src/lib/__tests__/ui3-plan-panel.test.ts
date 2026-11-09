/**
 * UI-3 — the plan panel's card family and the budget in words (rows 13 and 16).
 *
 *   E1 the Expert card is a board card: card radius, p-4, the family's 11px / 0.08em eyebrow — no
 *      console `Card` chrome and no 10px mono eyebrow left in it
 *   E2 every control and sentence it carried survives: the testids the conformance inventory reads
 *      (`slip-rail-expert`, `-name`, `-standing`, `-others`, `-storefront`) and the one message slot
 *   E3 the budget is "budget display only": the SAME `planBudgetLine` sentence, read at body size in
 *      the canvas's muted ink — the slice never composes or rewords it
 *   E4 the panel still mounts exactly its three pieces (Expert · Plan · Build), so a restyle cannot
 *      quietly drop one
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui3-plan-panel.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const RAIL = fs.readFileSync("client/src/components/plancard/SlipRail.tsx", "utf8");
const EXPERT = RAIL.slice(RAIL.indexOf("function ExpertCard("), RAIL.indexOf("// ── Coordination"));
const PANEL = RAIL.slice(RAIL.indexOf("export function SlipRail("), RAIL.indexOf("export function useSlipAdvisor"));

describe("UI-3 — the Expert card takes the board's face", () => {
  it("E1 board card chrome, not the console's", () => {
    assert.ok(EXPERT.length > 0, "the card is addressable");
    assert.match(EXPERT, /rounded-\[var\(--slip-radius-card\)\] border border-\[color:var\(--slip-line\)\] bg-\[color:var\(--slip-card\)\] p-4/);
    assert.match(EXPERT, /text-\[11px\] font-semibold uppercase tracking-\[0\.08em\] text-\[color:var\(--slip-muted\)\]/, "the family's eyebrow");
    // The console's Card wrapper and its 10px mono eyebrow are gone from THIS card.
    assert.doesNotMatch(EXPERT, /<CardContent/, "no CardContent chrome");
    assert.doesNotMatch(EXPERT, /font-mono text-\[10px\]/, "no 10px mono eyebrow");
    assert.doesNotMatch(EXPERT, /text-muted-foreground/, "canvas ink, not the console's muted token");
  });

  it("E2 the card still says and carries everything it did", () => {
    for (const id of [
      'data-testid="slip-rail-expert"',
      'data-testid="slip-rail-expert-name"',
      'data-testid="slip-rail-expert-standing"',
      'data-testid="slip-rail-expert-others"',
      'testId="slip-rail-expert-storefront"',
    ]) {
      assert.ok(EXPERT.includes(id), `${id} survives the restyle`);
    }
    assert.ok(EXPERT.includes("{messageControl}"), "the ONE message control still renders inside the card");
    // §13 both ways: no standing ⇒ no line; no other advisors ⇒ no line.
    assert.match(EXPERT, /\{standing && \(/, "standing is still gated, never 'status unknown'");
    assert.match(EXPERT, /\{otherAdvisorsLine && \(/, "the other-advisors line is still gated");
    // The identity read is unchanged: the judge is the shared state, not a new derivation here.
    assert.match(EXPERT, /expertState\.kind !== "message"/);
  });
});

describe("UI-3 — the budget, display only", () => {
  it("E3 the SAME sentence at body size in the canvas ink", () => {
    const budgetAt = RAIL.indexOf('data-testid="slip-plan-budget"');
    // The element itself, so a comment cannot satisfy (or fail) the checks below.
    const budget = RAIL.slice(RAIL.lastIndexOf("<p", budgetAt), budgetAt + 120);
    assert.match(budget, /text-\[13px\]/, "body size");
    assert.match(budget, /text-\[color:var\(--slip-muted\)\]/, "canvas muted ink");
    assert.match(budget, /\{budgetLine\}/, "the composed line, rendered as given");
    // "Budget display only" means the slice neither composes nor totals anything here.
    assert.doesNotMatch(budget, /planBudgetLine|reduce\(|Number\(/, "no recomputation in the renderer");
    // The prop still arrives resolved from the caller.
    assert.match(RAIL, /budgetLine: string \| null;/);
  });

  it("E4 the panel still mounts its three pieces", () => {
    assert.match(PANEL, /data-testid="slip-plan-panel"/);
    for (const piece of ["<ExpertCard", "<PlanCard", "<BuildCard"]) {
      assert.ok(PANEL.includes(piece), `${piece} is still mounted by the panel`);
    }
    assert.doesNotMatch(PANEL, /<Card\b/, "the panel itself carries no console card chrome");
  });
});
