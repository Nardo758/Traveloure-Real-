/**
 * Row 188: the two paid taps that skipped the dates gate.
 *   DG1  the Versions page's Trip Pass gets the plan's dates, so its DatesGate asks before any purchase request.
 *   DG2  the slip's `?optimize=1` landing goes through the Optimize DatesGate before the build-around step,
 *        so no requestOptimizationGate call happens on a plan with unconfirmed dates.
 *
 * Run: npx tsx --test client/src/lib/__tests__/dates-gate-gaps.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { datesGateBlocks } from "../../components/plan/SlipAnchorPanels";

const read = (rel: string) => readFileSync(rel, "utf8");
const VERSIONS = read("client/src/pages/plan-versions.tsx");
const CARD = read("client/src/components/plancard/TripPassCard.tsx");
const RAIL = read("client/src/components/plancard/SlipRail.tsx");

describe("row 188: the dates gate covers every paid tap", () => {
  it("DG1: the Versions Trip Pass asks for dates before any purchase request", () => {
    // The page hands the card the plan's own dates (it passed none before, so the gate never blocked).
    assert.match(
      VERSIONS,
      /<TripPassCard\s+tripId=\{tripId\}[\s\S]{0,300}trip=\{\{\s*id: tripId,\s*startDate: plan\.data\.trip\?\.startDate \?\? null,\s*endDate: plan\.data\.trip\?\.endDate \?\? null,\s*datesConfirmed: plan\.data\.trip\?\.datesConfirmed,\s*\}\}/,
    );
    // The card's only purchase request is inside the gate's guard.
    assert.match(CARD, /<DatesGate trip=\{trip \?\? \{ id: tripId \}\} action="The Trip Pass"/);
    assert.match(CARD, /onClick=\{\(\) => guard\(\(\) => void startPurchase\(\)\)\}/);
    assert.equal((CARD.match(/startPurchase\(\)/g) ?? []).length, 1, "startPurchase is called from the guarded click only");
    // Unconfirmed dates block; a confirmed plan and a pre-field payload pass.
    assert.equal(datesGateBlocks(false), true);
    assert.equal(datesGateBlocks(true), false);
  });

  it("DG2: the ?optimize=1 landing runs the Optimize gate before the build-around step", () => {
    const effect = RAIL.slice(RAIL.indexOf('if (params.get("optimize") !== "1") return;'), RAIL.indexOf("}, []);", RAIL.indexOf('params.get("optimize")')));
    assert.match(effect, /setOptimizeLanding\(true\);/);
    assert.doesNotMatch(effect, /setBuildAroundOpen\(true\)/, "the landing no longer opens the dialog directly");
    // Inside the Optimize DatesGate, the landing calls the SAME guard as the click.
    const gate = RAIL.slice(RAIL.indexOf('<DatesGate trip={trip} action="Optimize"'), RAIL.indexOf("</DatesGate>", RAIL.indexOf('<DatesGate trip={trip} action="Optimize"')));
    assert.match(gate, /<RunWhen\s+when=\{optimizeLanding\}\s+run=\{\(\) => \{\s*setOptimizeLanding\(false\);\s*if \(optimizing \|\| creatingComparison \|\| optimizeDisabledReason\) return;\s*guard\(\(dates\) => \{\s*gatedWindow\.current = dates;\s*setBuildAroundOpen\(true\);/);
    // Every other path that opens the dialog is guarded: the only unguarded opens are refusal reopens
    // after a gate answer, and the gate request itself is reached only from the dialog's confirm.
    const opens = RAIL.match(/setBuildAroundOpen\(true\)/g) ?? [];
    const guarded = RAIL.match(/guard\(\(dates\) => \{\s*gatedWindow\.current = dates;\s*setBuildAroundOpen\(true\);/g) ?? [];
    assert.equal(guarded.length, 2, "the click and the landing");
    assert.ok(opens.length >= guarded.length);
    assert.equal((RAIL.match(/void startOptimization\(/g) ?? []).length, 1, "startOptimization runs from the dialog's confirm only");
    assert.match(RAIL, /onConfirm=\{\(pinnedAnchor\) => \{\s*confirmedPinnedAnchor\.current = pinnedAnchor;\s*setBuildAroundOpen\(false\);\s*void startOptimization\(pinnedAnchor\);/);
  });
});
