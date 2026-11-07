/**
 * PLAN-2 Lane C3 (ledger `2026-11-06-plan2-c3-copy`): W7 and W14 — Wording approved — Leon (Nov 6, 2026).
 *   C1  W7: the map's list fallback says why the day is a list
 *   C3  W14: the adopt note
 * (W13 is held until #1918's lane and PLAN-3 merge; W15 is DeepSeek's, in VersionsBoard.tsx.)
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/__tests__/plan2-c3-copy.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { VERSIONS_RESTORE_COPY } from "@/lib/versions-board";

describe("PLAN-2 C3 copy", () => {
  it("C1 W7", () => {
    // Read from source: importing MapControlCenter needs Vite's import.meta.env.
    const mcc = fs.readFileSync("client/src/components/plancard/MapControlCenter.tsx", "utf8");
    assert.ok(mcc.includes(`export const MAP_FALLBACK_LIST_NOTICE = "This day's stops can't be drawn on this map, so they're listed.";`));
    assert.match(mcc, /<p className="mb-2 text-xs text-muted-foreground">\{MAP_FALLBACK_LIST_NOTICE\}<\/p>/);
  });
  it("C3 W14", () => {
    assert.equal(VERSIONS_RESTORE_COPY.keepNote, "Adopting a version replaces each of its days in Your plan.");
  });
});
