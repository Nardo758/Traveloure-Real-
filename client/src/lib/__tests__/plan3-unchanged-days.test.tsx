/**
 * PLAN-3 item 1 (P2-D): unchanged days are collapsed in the by-day compare, with a per-day reveal and
 * one "Expand all". The copy is held for Leon; the behaviour is what this pins.
 *
 *   U1 the collapsed day keeps its "Same as draft" note and offers the reveal
 *   U2 the reveal is per day and per version (keyed by variant + day), never a global toggle
 *   U3 "Expand all" is drawn only when some day actually matches the draft
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan3-unchanged-days.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("PLAN-3 — unchanged days collapse", () => {
  const board = read("client/src/components/plancard/VersionsBoard.tsx");

  it("U1 a matching day can be revealed, desktop and phone", () => {
    assert.match(board, /data-testid={`versions-desk-show-\$\{c\.label\}-\$\{dayNumber\}`}/);
    assert.match(board, /data-testid={`versions-show-\$\{c\.label\}`}/);
    assert.match(board, /Show the day anyway/);
    assert.match(board, /c\.identical && !dayExpanded\(c\.variantId, dayNumber\)/);
    assert.match(board, /c\.identical && !dayExpanded\(c\.variantId, activePhoneDay\)/);
  });

  it("U2 the reveal is keyed by version and day", () => {
    assert.match(board, /expandedDays\.has\(`\$\{variantId\}:\$\{dayNumber\}`\)/);
    assert.match(board, /setExpandedDays\(\(prev\) => new Set\(prev\)\.add\(`\$\{variantId\}:\$\{dayNumber\}`\)\)/);
  });

  it("U3 Expand all exists and is drawn only when a day matches", () => {
    assert.match(board, /data-testid="versions-expand-all"/);
    assert.match(board, /Expand all/);
    assert.match(board, /view\.versions\.some\(\(v\) => v\.days\.some\(\(d\) => d\.identical\)\)/);
  });
});
