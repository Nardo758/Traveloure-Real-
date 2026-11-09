/**
 * UI-5a — the Versions page and board SHELLS (ruled 2026-11-09).
 *
 * Layout only. The board's rules — PLAN-3's collapse/reveal, the re-time gate, the apply rails — are
 * pinned by their own suites (`versions-board.test.ts` VB1–VB9, `plan3-unchanged-days.test.tsx`
 * U1–U3, `slip-versions-board.test.ts` V1–V5); this file pins what THIS slice changed and nothing
 * else, so a later restyle cannot quietly unify one edge back into a step.
 *
 *   V1 the page has a header: an h1 with the plan's name, the back link above it
 *   V2 the run line takes the card family's eyebrow metrics
 *   V3 every day-level surface takes a radius TOKEN (no rounded-xl / rounded-lg left)
 *   V4 the board's own states use the display face for their headings
 *   V5 the reveal and re-time wiring this slice must not touch is still there
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui5a-versions-shells.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const PAGE = fs.readFileSync("client/src/pages/plan-versions.tsx", "utf8");
const BOARD = fs.readFileSync("client/src/components/plancard/VersionsBoard.tsx", "utf8");

describe("UI-5a — the Versions page shell", () => {
  it("V1 the page header carries the plan's name as its h1, under the back control", () => {
    const header = PAGE.slice(PAGE.indexOf('data-testid="plan-versions-header"'), PAGE.indexOf("runState === \"building\""));
    assert.ok(header.length > 0, "the header is addressable");
    assert.match(header, /<h1/, "the page has a title where a title goes — not a muted <p> on the right");
    assert.match(header, /data-testid="plan-versions-title"/);
    assert.match(header, /slip-display/, "in the display face");
    const back = header.indexOf('data-testid="plan-versions-back"');
    const title = header.indexOf('data-testid="plan-versions-title"');
    assert.ok(back > 0 && back < title, "the way back sits above the name");
    assert.match(header, /Back to your plan/, "the existing sentence, not a new one");
  });

  it("V2 the run line takes the card family's eyebrow metrics", () => {
    const eyebrow = BOARD.slice(BOARD.indexOf('data-testid="versions-run-date"') - 220, BOARD.indexOf('data-testid="versions-run-date"'));
    assert.match(eyebrow, /text-\[11px\]/, "11px, the card family's eyebrow");
    assert.match(eyebrow, /tracking-\[0\.08em\]/, "…and its tracking");
    // The run's own wording is untouched (VB9 pins the label; this pins the source of the label).
    assert.match(BOARD, /Run of \{runDateLabel\(view\.run\.runAt\)\}/);
  });
});

describe("UI-5a — the board's card family", () => {
  it("V3 every day-level surface takes a radius token", () => {
    assert.doesNotMatch(BOARD, /rounded-xl\b/, "no ad-hoc card radius left in the board");
    assert.doesNotMatch(BOARD, /rounded-lg\b/, "no ad-hoc control radius left in the board");
    // The four surfaces this slice converted, each at its own scale.
    assert.match(BOARD, /rounded-\[var\(--slip-radius-card\)\] border p-2\.5 text-xs/, "the desktop day card");
    assert.match(BOARD, /rounded-\[var\(--slip-radius-card\)\] p-2\.5 text-xs/, "Your plan's day card");
    assert.match(BOARD, /min-h-\[44px\] rounded-\[var\(--slip-radius-chip\)\] border text-sm/, "the phone day chip");
    assert.match(BOARD, /rounded-\[var\(--slip-radius-button\)\] border border-\[color:var\(--slip-line-strong\)\]/, "the desktop Adopt all");
    assert.match(BOARD, /rounded-\[var\(--slip-radius-card\)\] border border-\[color:var\(--slip-gold\)\] bg-\[color:var\(--slip-gold-wash\)\] p-3/, "the paid re-time notice");
  });

  it("V4 the board's states use the display face for their headings", () => {
    const displayHeadings = BOARD.match(/<h2 className="slip-display[^"]*">Your plan's versions<\/h2>/g) ?? [];
    assert.equal(displayHeadings.length, 2, "both states — no version passes, and draft-only");
  });

  it("V5 the reveal and re-time wiring this slice must not touch is still there", () => {
    // PLAN-3: the reveal, per day and for every day at once.
    assert.match(BOARD, /data-testid="versions-expand-all"/);
    assert.match(BOARD, /expanded=\{dayExpanded\(c\.variantId, dayNumber\)\}/);
    assert.match(BOARD, /onReveal=\{\(\) => revealDay\(c\.variantId, dayNumber\)\}/);
    assert.match(BOARD, /data-testid=\{`versions-show-\$\{c\.label\}`\}/);
    // The re-time gate still decides before it writes (VB7 pins the copy; this pins the wiring).
    assert.match(BOARD, /if \(!gate\.free\) \{\s*setPaidGate\(\{ dayNumber, line: gate\.line \}\);\s*return;\s*\}/);
    assert.match(BOARD, /data-testid="versions-apply"/);
  });
});
