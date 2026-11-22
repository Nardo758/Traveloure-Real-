/**
 * V1 frame, part 1 (board V1 "Days as a board"; Leon's rulings, Nov 22 2026).
 *
 * Where the strip shows and the plan has stops, four blocks the board does not draw leave the plan page:
 * the header's phase tag (its home is the Trip Card, V15), and the cost strip, the status counts and the Trip
 * Pass offer (their home is the versions page, V8). The Trip Card banner and the header's Trip Card link stay
 * until V15's own entry is built: they are the page's only sign and link for a final plan.
 *
 *   F1 one predicate decides the frame: the strip's own, plus a stop on the plan
 *   F2 each of the four blocks reads that predicate, and nothing else was moved or deleted
 *   F3 the Trip Pass offer still has its home on the versions page
 *   F4 not in this part: the Trip Card banner and link, the action row, the Ask button, the closest-area
 *      line, the optimized badge and "Compare versions" are untouched
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/v1-frame.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(HERE, rel), "utf8");
const view = read("../SlipView.tsx");
const rail = read("../SlipRail.tsx");

describe("V1 frame, part 1", () => {
  it("F1 one predicate: the strip's own, plus a stop on the plan", () => {
    assert.match(view, /const v1Frame = toldStrip && allActivities\.length > 0;/);
    assert.equal((view.match(/const v1Frame =/g) ?? []).length, 1);
    assert.ok(view.indexOf("const toldStrip =") < view.indexOf("const v1Frame ="), "it follows the strip's predicate");
  });

  it("F2 the four blocks read it", () => {
    assert.match(view, /<SlipHeader\s*guest=\{guest\}\s*boardFrame=\{v1Frame\}/, "the header is told");
    assert.match(view, /\{phase && !boardFrame && \(\s*<span[\s\S]{0,260}?data-testid="slip-phase-chip"/, "the phase tag");
    assert.match(view, /\{slipView === "list" && !guest && !v1Frame \? \(\s*<PlanCostStrip /, "the cost strip");
    assert.match(view, /\{v1Frame \? null : allActivities\.length > 0 \? \(\s*<SlipStatusStrip activities=\{allActivities\} \/>/, "the status counts");
    assert.match(view, /<SlipRail\s*trip=\{data\.trip\}\s*tripId=\{tripId\}\s*isOwner=\{isOwner\}\s*tripPassOffer=\{!v1Frame\}/, "the rail is told");
    assert.match(rail, /\{isOwner && tripPassOffer \? \(\s*hasRun \? \(\s*<div data-testid="slip-trip-pass-offer">/, "the Trip Pass offer");
    assert.equal((rail.match(/tripPassOffer = true,/g) ?? []).length, 2, "on by default at both levels of the rail");
    assert.match(view, /boardFrame = false,/, "off by default in the header");
    // Nothing was deleted: each block's component and testid is still in the file.
    for (const id of ["slip-trip-card-primary-banner", "slip-trip-card-finalize-now", "slip-phase-chip", "slip-trip-card-link"]) {
      assert.ok(view.includes(`data-testid="${id}"`), `${id} is still drawn for every other viewer`);
    }
    assert.ok(view.includes("<PlanCostStrip ") && view.includes("<SlipStatusStrip "));
  });

  it("F3 the Trip Pass offer keeps its home on the versions page", () => {
    const versions = read("../../../pages/plan-versions.tsx");
    assert.match(versions, /data-testid="versions-trip-pass-offer"/);
    assert.match(versions, /<TripPassCard\s/);
  });

  it("F4 not in this part", () => {
    assert.match(view, /\{isPrimary && data\.trip && !guest && <TripCardPrimaryBanner trip=\{data\.trip\} \/>\}/, "the Trip Card banner stays");
    assert.match(view, /tripCardHasFinal\(trip\.finalVersion\) && \(\s*<Link\s*href=\{`\/trip\/\$\{trip\.id\}`\}/, "the Trip Card link stays");
    assert.match(view, /<SlipActionRow[\s\S]{0,600}?showOptimize=\{isOwner\}[\s\S]{0,600}?showExpert=\{expertDoorLive\}/, "the action row is untouched");
    assert.match(view, /<AskAiDrawer tripId=\{tripId\} isOwner=\{isOwner\} isExpertViewer=\{isExpertViewer\} aiAction=\{aiAction\} layout="row" \/>/, "the Ask button is untouched");
    assert.match(view, /\{hasOptimized \|\| data\.lastComparisonId \? \(/, "the optimized badge and Compare versions stay: no board gives them another home yet");
    assert.match(view, /data-testid="slip-see-what-changed"/);
    assert.doesNotMatch(view.slice(view.indexOf("const v1Frame ="), view.indexOf("const v1Frame =") + 80), /zoneLine/, "the closest-area line is not part of the predicate");
  });
});
