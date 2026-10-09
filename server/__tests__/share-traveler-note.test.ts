/**
 * SH-1 (ledger `2026-10-09-sh1-share-traveler-note`) — the ONE rule for the expert's traveler note
 * on a share rail, proven with no database. The per-endpoint proofs are
 * share-traveler-note.http.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shareViewerIsPlanTraveler, travelerNoteForShareViewer } from "../utils/share-traveler-note";

test("T1 — the plan's traveler receives the note", () => {
  assert.equal(travelerNoteForShareViewer("hello", "u1", "u1"), "hello");
  assert.equal(shareViewerIsPlanTraveler("u1", "u1"), true);
});

test("T2 — an anonymous viewer receives null", () => {
  assert.equal(travelerNoteForShareViewer("hello", undefined, "u1"), null);
  assert.equal(travelerNoteForShareViewer("hello", null, "u1"), null);
  assert.equal(travelerNoteForShareViewer("hello", "", "u1"), null);
});

test("T3 — any other signed-in viewer receives null", () => {
  assert.equal(travelerNoteForShareViewer("hello", "u2", "u1"), null);
});

test("T4 — a plan with no owner gives nobody the note, and an empty id never matches", () => {
  assert.equal(travelerNoteForShareViewer("hello", "u1", null), null);
  assert.equal(shareViewerIsPlanTraveler("", ""), false);
});

test("T5 — an absent note stays null for the traveler (§13)", () => {
  assert.equal(travelerNoteForShareViewer(undefined, "u1", "u1"), null);
  assert.equal(travelerNoteForShareViewer(null, "u1", "u1"), null);
});
