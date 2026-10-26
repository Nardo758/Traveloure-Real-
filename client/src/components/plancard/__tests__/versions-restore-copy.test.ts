/**
 * Audit D3, step 0 (architect dispatch CB-L; rulings 2026-10-25 21:10 ET and Oct 26 08:30 ET; ledger
 * `2026-10-25-d3-step0-versions-restore-copy`): the Versions board stops saying the draft is kept. Adopting a
 * day replaces that day of the plan, and no restore exists until D3 restore ships. Strings only.
 *   (a) the keep note is exactly the ruled interim string
 *   (b) VersionsBoard.tsx carries none of the old claims and reads the copy object at the three sites
 *   (c) versions-board.ts no longer says the draft is never deleted
 *   (d) the copy object holds only the three interim strings: no "AI", nothing about restoring
 *   (e) no restore button, test id or route ships in this step
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/versions-restore-copy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { VERSIONS_RESTORE_COPY } from "@/lib/versions-board";

const BOARD = fs.readFileSync("client/src/components/plancard/VersionsBoard.tsx", "utf8");
const LIB = fs.readFileSync("client/src/lib/versions-board.ts", "utf8");

describe("audit D3 step 0: the Versions board says adopting replaces a day", () => {
  it("(a) the keep note is the ruled interim string", () => {
    assert.equal(VERSIONS_RESTORE_COPY.keepNote, "Adopting a version replaces that day.");
    assert.equal(VERSIONS_RESTORE_COPY.adoptToastDescription, "The run's versions are kept.");
    assert.equal(VERSIONS_RESTORE_COPY.chooseNoteTail, "Each day you adopt replaces that day in Your plan.");
  });

  it("(b) the board carries no old claim and reads the copy object at the three sites", () => {
    for (const old of ["never deletes", "Your draft is kept", "Your draft and the run", "draft is never deleted", "Versions are kept with the run"]) {
      assert.ok(!BOARD.includes(old), old);
    }
    assert.match(BOARD, /data-testid="versions-keep-note">\s*\{VERSIONS_RESTORE_COPY\.keepNote\}\s*<\/p>/);
    assert.ok(BOARD.includes('toast({ title: n === 1 ? "1 day adopted" : `${n} days adopted`, description: VERSIONS_RESTORE_COPY.adoptToastDescription });'));
    assert.ok(
      BOARD.includes('`${allAnchored ? "Each version is built around one place to stay. " : ""}Adopt a whole version, or take single days from different ones. ${VERSIONS_RESTORE_COPY.chooseNoteTail}`'),
      "the allAnchored prefix is unchanged",
    );
  });

  it("(c) versions-board.ts no longer says the draft is never deleted", () => {
    assert.ok(!LIB.includes("the draft is never deleted"));
  });

  it("(d) the copy object holds only the three interim strings", () => {
    assert.deepEqual(Object.keys(VERSIONS_RESTORE_COPY).sort(), ["adoptToastDescription", "chooseNoteTail", "keepNote"]);
    for (const v of Object.values(VERSIONS_RESTORE_COPY)) {
      assert.doesNotMatch(v, /\bAI\b|Restore|Reopen|restor/i);
    }
  });

  it("(e) no restore button, test id or route ships in this step", () => {
    assert.ok(!BOARD.includes("versions-restore-day"));
    assert.doesNotMatch(BOARD, /\/restorable|\/restore\b/);
    assert.ok(!BOARD.includes("Restore my draft"));
  });
});
