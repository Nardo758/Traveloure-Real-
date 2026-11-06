/**
 * PLAN-2 lane 4 (DeepSeek report finding #5; canvas board 22): the missing read states.
 *
 *   L1 the Optimize preview states a slow read and a failed read, and retry re-reads only
 *   L2 the versions board states loading and error instead of drawing nothing
 *   L3 the restore strip tells a failed read apart from "nothing to restore"
 *
 * Source-level like the repo's other state guards: the strings are the register's (W9–W12) and the
 * invariant is that each surface has a named, retryable failure instead of silence.
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan2-lane4-states.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("PLAN-2 lane 4 — read states", () => {
  it("L1 the Optimize preview says it is checking, and says when it failed", () => {
    const hook = read("client/src/components/plan/use-optimizer-lead-data.ts");
    assert.match(hook, /previewLoading:/);
    assert.match(hook, /previewFailed:/);
    assert.match(hook, /retryPreview: \(\) => void retryPreview\(\)/);
    for (const f of ["client/src/components/plancard/SlipRail.tsx", "client/src/pages/plan-versions.tsx"]) {
      const src = read(f);
      assert.match(src, /optimizer-lead-loading/, `${f}: loading`);
      assert.match(src, /Checking this draft…/, `${f}: W9`);
      assert.match(src, /We couldn't check this draft just now\. Try again\./, `${f}: W10`);
      assert.match(src, /leadData\.retryPreview\(\)/, `${f}: retry re-reads`);
    }
  });

  it("L2 the versions board states loading and error", () => {
    const src = read("client/src/components/plancard/VersionsBoard.tsx");
    assert.match(src, /versions-board-loading/);
    assert.match(src, /Reading your versions…/);
    assert.match(src, /versions-board-error/);
    assert.match(src, /We couldn't read your versions just now\. Nothing on your plan changed\./);
    assert.match(src, /retryBoard\(\)/);
  });

  it("L3 a failed restore read is not 'nothing to restore'", () => {
    const src = read("client/src/components/plancard/VersionsRestoreStrip.tsx");
    assert.match(src, /versions-restore-strip-error/);
    assert.match(src, /We couldn't check for saved drafts just now\./);
    assert.match(src, /retryRead\(\)/);
    assert.match(src, /role="alert"/);
  });
});
