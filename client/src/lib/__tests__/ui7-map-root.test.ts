/**
 * UI-7 — the map is the third planner container (row 4; Phase 0 §4.1; led 2026-11-09).
 *
 * The ruling for this slice is deliberately narrow: `MapControlCenter.tsx` gains THE ATTRIBUTE and
 * the `slip-surface` hook the canvas block is scoped to — "nothing else in that file changes". So the
 * pin holds the board's own machinery still while it checks the seam.
 *
 *   M1 the map root spreads the token attribute and is a slip surface
 *   M2 it is the ONLY token read in the file — no second surface inside the map
 *   M3 the board's own contract is untouched: its testid, its renderer/layout data and `isolate`
 *   M4 the map's controls are the ones it already had (day tabs, version toggle), not new ones
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui7-map-root.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const MAP = fs.readFileSync("client/src/components/plancard/MapControlCenter.tsx", "utf8");
const ROOT = MAP.slice(MAP.indexOf("data-testid={`map-control-center-${tripId}`}"), MAP.indexOf(">", MAP.indexOf("className={`slip-surface")));

describe("UI-7 — the map's root", () => {
  it("M1 carries the planner attribute, and is a slip surface for the block to apply to", () => {
    assert.match(ROOT, /slipTokensAttr\(readSlipTokensMode\(\)\)/, "the same spread the slip uses");
    assert.match(ROOT, /className=\{`slip-surface /, "the canvas block's own selector hook");
    assert.match(MAP, /import \{ readSlipTokensMode, slipTokensAttr \} from "@\/lib\/slip-tokens-mode";/);
  });

  it("M2 exactly one token read in the file — the map's root, no second surface", () => {
    assert.equal((MAP.match(/readSlipTokensMode\(\)/g) ?? []).length, 1);
    assert.equal((MAP.match(/slipTokensAttr\(/g) ?? []).length, 1);
    // Count the CLASS HOOK, not the word: the comment above the root names it too.
    assert.equal((MAP.match(/className=\{`slip-surface /g) ?? []).length, 1, "one root, not a surface per panel");
  });
});

describe("UI-7 — the board itself is untouched", () => {
  it("M3 the map's own contract survives the seam", () => {
    assert.match(ROOT, /data-testid=\{`map-control-center-\$\{tripId\}`\}/);
    assert.match(ROOT, /data-map-renderer=\{renderer\}/);
    assert.match(ROOT, /data-map-layout=\{layout\}/);
    assert.match(ROOT, /isolate/, "the stacking context that keeps Leaflet under dialogs");
    assert.match(ROOT, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/, "the split layout is unchanged");
  });

  it("M4 the controls the round-5 input names already exist — none is added here", () => {
    // Day tabs and the version toggle were already the board's; the seam adds neither.
    assert.match(MAP, /data-testid=\{`map-day-selector-\$\{tripId\}`\}/);
    assert.match(MAP, /data-testid=\{`map-day-btn-\$\{d\.dayNum\}-\$\{tripId\}`\}/);
    assert.match(MAP, /onVersionChange/, "the version toggle's one read");
    assert.match(MAP, /data-testid=\{`map-toolbar-\$\{tripId\}`\}/);
  });
});
