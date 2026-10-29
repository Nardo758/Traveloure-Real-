/**
 * Row 264 (ledger `2026-10-29-hide-gem-marker-in-notes`): the Billboard gem marker never prints as
 * an expert note in the distribution formats. The filter is read-side only.
 *
 *   GM1  a note made only of the marker renders no note (null, so no empty slot)
 *   GM2  a note with text and the marker renders the text only, on the same line or its own
 *   GM3  a note with no marker is unchanged; an empty or blank note is still null
 *   GM4  the stored marker text and the exact-match compare are untouched; the filter reads the
 *        prefix from pendingPlanItemMarker and restates nothing
 *   GM5  every format view still reads notes through itemNote, and none prints item.notes directly
 *
 * Pure: no DOM, no git, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { itemNote, withoutGemMarker } from "../../build-formats/format-shared";
import { pendingPlanItemMarker } from "@shared/pending-plan-items";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const note = (notes: string | null | undefined) => itemNote({ notes } as any);

test("GM1 a note made only of the marker renders no note", () => {
  assert.equal(note(pendingPlanItemMarker("gem-real-42")), null);
  assert.equal(note(`  ${pendingPlanItemMarker("6f1c2d3e-0000-4000-8000-000000000001")}\n`), null);
});

test("GM2 a note with text and the marker renders the text only", () => {
  const marker = pendingPlanItemMarker("g-1");
  assert.equal(note(`Go early, the line builds by 9.\n${marker}`), "Go early, the line builds by 9.");
  assert.equal(note(`${marker}\nGo early.`), "Go early.");
  assert.equal(note(`Go early. ${marker}`), "Go early.");
  assert.equal(note(`Line one.\n${marker}\n\nLine two.`), "Line one.\n\nLine two.");
});

test("GM3 a note with no marker is unchanged; empty is null", () => {
  assert.equal(note("Shoes off inside.\nBring cash."), "Shoes off inside.\nBring cash.");
  assert.equal(note("Billboard gem"), "Billboard gem", "only the full marker is removed");
  for (const empty of ["", "   ", null, undefined]) assert.equal(note(empty), null);
  assert.equal(withoutGemMarker("plain"), "plain");
});

test("GM4 the stored marker and the exact-match compare are untouched", () => {
  assert.equal(pendingPlanItemMarker("g-1"), "Billboard gem id: g-1");
  assert.match(read("client/src/lib/billboard-gem-planning.ts"), /row\.notes === marker/);
  const shared = read("client/src/components/build-formats/format-shared.ts");
  assert.match(shared, /import \{ pendingPlanItemMarker \} from "@shared\/pending-plan-items";/);
  assert.match(shared, /const GEM_MARKER_PREFIX = pendingPlanItemMarker\(""\);/);
  assert.ok(!shared.replace(/\/\*[\s\S]*?\*\//g, "").includes("Billboard gem id"), "the marker text is not restated");
});

test("GM5 the format views read notes only through itemNote", () => {
  for (const view of ["KyotoCulturalView.tsx", "VenueTimelineView.tsx"]) {
    const src = read(`client/src/components/build-formats/${view}`);
    assert.match(src, /itemNote\(item\)/, view);
    assert.ok(!/\{\s*item\.notes\s*\}/.test(src), `${view} prints item.notes directly`);
  }
});
