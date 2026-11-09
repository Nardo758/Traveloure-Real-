/**
 * UI-6a — the Trip Card shells take the canvas tokens, and P2-A is proven BEFORE any new work.
 *
 *   T1 P2-A: `cardProvenanceLine` already states "built from Version A, run 1" from the snapshot's
 *      `builtFrom` — the payload carries it, so P2-A needs no server change
 *   T2 the day chips use the chip radius token and the board's navy selection
 *   T3 the provenance line is set in the display face
 *   T4 the rail's card family uses the board's eyebrow rhythm and 16px padding
 *   T5 P2-B: no bookings section is drawn yet (it needs an approved heading string)
 *   T6 the days root shares the card family's ONE inset, so the column has a single edge
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui6-trip-card-shells.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cardProvenanceLine } from "../trip-card";

const read = (p: string) => fs.readFileSync(p, "utf8");
const DAYS = read("client/src/components/plancard/TripCardDays.tsx");
const RAIL = read("client/src/components/plancard/TripCardRail.tsx");
const CARD = read("client/src/components/plancard/PlanCard.tsx");

describe("UI-6a — Trip Card shells", () => {
  it("T1 P2-A: the provenance already names the version and run", () => {
    const line = cardProvenanceLine({
      finalizedAt: "2026-11-01T12:00:00Z",
      finalVersion: 2,
      builtFrom: { versionLabel: "A", runNumber: 1 },
      timeZone: "UTC",
    });
    assert.match(String(line), /built from Version A, run 1/);
    // …and the Trip Card passes the snapshot's own field, never a re-derivation.
    assert.match(DAYS, /builtFrom: props\.finalCard\?\.builtFrom \?\? null/);
  });

  it("T2 the day chips take the chip token and the navy selection", () => {
    assert.match(DAYS, /rounded-\[var\(--slip-radius-chip\)\]/);
    assert.match(DAYS, /border-\[color:var\(--slip-navy\)\] bg-\[color:var\(--slip-navy\)\]/);
  });

  it("T3 the provenance line is set in the display face", () => {
    assert.match(DAYS, /slip-display text-\[15px\][^"]*" data-testid="card-provenance"/);
  });

  it("T4 the rail card family follows the board's eyebrow rhythm", () => {
    assert.match(RAIL, /tracking-\[0\.08em\]/);
    assert.match(RAIL, /className="space-y-3 p-4"/);
  });

  it("T5 P2-B is not built yet: no bookings section until its heading is approved", () => {
    assert.doesNotMatch(RAIL, /trip-card-rail-bookings/);
    assert.doesNotMatch(RAIL, /Bookings section/);
  });

  it("T6 the days root shares the card family's one inset", () => {
    // Review, 2026-11-09: the days root is a SIBLING of Open in maps / Purchases / Change history,
    // so it takes their inset. UI-6a had moved it to px-4 sm:px-6 and stepped the column 4px on each
    // side; the roots must agree, not merely be close.
    assert.match(DAYS, /className="slip-surface space-y-4 px-3 pt-4[^"]*sm:px-5"/);
    assert.doesNotMatch(DAYS, /className="slip-surface space-y-4 px-4/, "the 4px-stepped inset is gone");
    // …and the rows it sits beside keep the same inset, read in the same file it would drift from.
    assert.ok(CARD.includes("px-3 sm:px-5"), "the sibling rows keep the card's px-3 sm:px-5 inset");
  });
});
