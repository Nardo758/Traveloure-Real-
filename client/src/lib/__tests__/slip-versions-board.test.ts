/**
 * THE VERSIONS BOARDS (slip conformance, boards rev 15; ledger `2026-10-08-slip-versions-board`): the
 * phone By-day board and the desktop four-column board. Same rails, same pinned testids and words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardDayDateLabel, byDayHeadline, yourPlanSummary } from "../versions-board";

test("V1: the phone headline counts the versions", () => {
  assert.equal(byDayHeadline(3), "One day, three ways");
  assert.equal(byDayHeadline(1), "One day, one way");
});

test("V2: a day is 'Wed 11' only from a machine date, else 'Day N'", () => {
  assert.equal(boardDayDateLabel(1, "2027-11-11"), "Thu 11");
  assert.equal(boardDayDateLabel(2, undefined), "Day 2");
});

test("V3: Your plan says how many days are picked and how many stay the draft's", () => {
  assert.equal(yourPlanSummary(2, 5), "2 days picked · 3 from draft");
  assert.equal(yourPlanSummary(1, 1), "1 day picked · 0 from draft");
  assert.equal(yourPlanSummary(0, 2), "0 days picked · 2 from draft");
});

test("V4: the desktop keeps the golden path's testids and the exact Apply words; the phone apply is the same rail", () => {
  const src = readFileSync(new URL("../../components/plancard/VersionsBoard.tsx", import.meta.url), "utf8");
  for (const id of [
    'data-testid="versions-desktop"',
    "versions-desk-day-handle-${c.label}-${dayNumber}",
    "versions-desk-plan-day-${dayNumber}",
    "versions-desk-plan-pick-${dayNumber}",
    "versions-desk-plan-stop-${st.id}",
    "versions-retime-line-${dayNumber}",
    'data-testid="versions-retime-paid"',
    "versions-take-${c.label}",
  ]) {
    assert.ok(src.includes(id), id);
  }
  // Desktop Apply reads applyLabel verbatim ("Apply 1 day" is pinned); both Apply buttons send apply-days.
  assert.match(src, /data-testid="versions-apply"\s*>\s*\{applyLabel\(picks\)\}/);
  assert.equal((src.match(/onClick=\{\(\) => apply\.mutate\(picks\)\}/g) ?? []).length, 2);
  assert.match(src, /From \{pickedFrom\} · undo/);
  assert.match(src, /Nothing has been changed\./);
});

test("V5: the Trip Pass offer in the Versions header is owner-gated and drawn only with a run", () => {
  const page = readFileSync(new URL("../../pages/plan-versions.tsx", import.meta.url), "utf8");
  assert.match(page, /plan\.data\.tripRole === "owner" \? \(\s*<div data-testid="versions-trip-pass-offer">/);
  const board = readFileSync(new URL("../../components/plancard/VersionsBoard.tsx", import.meta.url), "utf8");
  const draftOnly = board.slice(board.indexOf('data-board-state="draft-only"'), board.indexOf("const mapVersions"));
  assert.ok(!draftOnly.includes("headerOffer"), "no offer on a board with no run");
});
