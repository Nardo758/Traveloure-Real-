/**
 * Row 198 (strings 1–30, approved by Leon Oct 26, 2026; Architect rulings Oct 27, 2026): plain words
 * on the comparison page, the anchor line and the Build-around dialog. Items 6, 10 and the Q8
 * "versions" tail are HELD for Leon. Imports pure modules and reads page and dialog source with fs;
 * runs no git and compares to no ref.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COMPARISON_PAGE_COPY, formatComparisonPerPerson, formatComparisonPrice } from "@/lib/comparison-page-copy";
import { ANCHOR_LINE_COPY, formatAnchorLine } from "@/lib/slip-proposal-preview";
import { OPTIMIZE_RERUN_RULE } from "@/lib/optimization-preview";
import { ANCHOR_CANDIDATE_DISTANCE_COPY, BUILD_AROUND_COPY, formatAnchorCandidateMedian } from "../BuildAroundDialog";
import { siteNeverSayHits } from "@shared/banned-copy";

const PAGE = fs.readFileSync("client/src/pages/itinerary-comparison.tsx", "utf8");
const DIALOG = fs.readFileSync("client/src/components/plancard/BuildAroundDialog.tsx", "utf8");
const PREVIEW = fs.readFileSync("client/src/lib/slip-proposal-preview.ts", "utf8");
const stripComments = (src: string) =>
  src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const PAGE_CODE = stripComments(PAGE);
const DIALOG_CODE = stripComments(DIALOG);

/** Every string the three objects hold; function forms are called with 1 and 2 (and both cart forms). */
function allValues(): string[] {
  const out: string[] = [];
  const walk = (o: Record<string, unknown>) => {
    for (const v of Object.values(o)) {
      if (typeof v === "string") out.push(v);
      else if (typeof v === "function") {
        if (v.length === 2) out.push((v as (a: number, b: number) => string)(1, 2), (v as (a: number, b: number) => string)(2, 2));
        else out.push((v as (a: any) => string)(1), (v as (a: any) => string)(2), (v as (a: any) => string)(true), (v as (a: any) => string)("720 m"));
      }
    }
  };
  walk(COMPARISON_PAGE_COPY as unknown as Record<string, unknown>);
  walk(ANCHOR_LINE_COPY as unknown as Record<string, unknown>);
  walk(BUILD_AROUND_COPY as unknown as Record<string, unknown>);
  return out;
}

describe("row 198 strings pass", () => {
  it("CS1 COMPARISON_PAGE_COPY holds the approved text", () => {
    const C = COMPARISON_PAGE_COPY;
    assert.equal(C.bookedKept(1), "1 booked item is kept in every version");
    assert.equal(C.bookedKept(2), "2 booked items are kept in every version");
    assert.equal(C.leftOut(1), "1 item left out. Your expert has it.");
    assert.equal(C.leftOut(2), "2 items left out. Your expert has them.");
    assert.equal(C.versionsLine(1), "1 version for your remaining items");
    assert.equal(C.versionsLine(2), "2 versions for your remaining items");
    assert.equal(C.adoptedDescription, "Your plan is updated. Nothing was bought.");
    assert.equal(C.applyConfirmKept, "Items you've booked, put in your cart, or sent to your expert stay as they are. Nothing is bought here.");
    assert.equal(C.applyConfirmRevisit, "The other versions stay available to revisit.");
    assert.equal(C.applyFailedTitle, "We couldn't apply that version.");
    assert.equal(C.applyFailedDescription, "Your plan is unchanged.");
    assert.equal(C.actionFailedTitle, "We couldn't do that.");
    assert.equal(C.actionFailedDescription, "Your plan is unchanged.");
    assert.equal(C.noResultBody, "We didn't get a result this time. Your plan is unchanged. You can retry generation or browse your original plan below.");
    assert.equal(C.noAlternativesHeading, "We didn't find any alternatives this time.");
    assert.equal(C.noAlternativesBody(false), "We didn't get a result this time. Your plan is unchanged. You can re-run the optimizer.");
    assert.equal(C.noAlternativesBody(true), "We didn't get a result this time. Your plan is unchanged. You can re-run the optimizer or go back to your cart.");
    assert.equal(C.suggestedVersion, "Suggested version");
    assert.equal(C.lookingForAlternatives, "Looking for alternatives...");
    assert.equal(C.whatsDifferent, "What's different");
    assert.equal(C.extrasThatFit, "Extras that fit your plan");
    assert.equal(C.priceNotAvailable, "Price not available");
  });

  it("CS2 the page code no longer carries the old wording", () => {
    for (const gone of [
      "Traveloure Score", "badge-traveloure-score", "pinned in all", " excluded", "Slip $", "updated in place",
      "stay put", "Failed to apply variant", "Failed to regenerate", "Failed to select", "AI Optimized",
      "Why it's better", "Finding best alternatives", "Optimizing for savings", "Curated extras matched",
      "The AI optimization completed", "or the AI timed out", "Recommended",
    ]) assert.ok(!PAGE_CODE.includes(gone), gone);
    // "Please try again" stays on toasts outside Marketing's list; the three this row changed no longer use it.
    for (const title of ["COMPARISON_PAGE_COPY.applyFailedTitle", "COMPARISON_PAGE_COPY.actionFailedTitle"]) {
      for (const line of PAGE.split("\n").filter((l) => l.includes(title))) assert.ok(!line.includes("Please try again"), line);
    }
  });

  it("CS3 the page reads each new string through COMPARISON_PAGE_COPY and keeps every testid", () => {
    for (const key of [
      "bookedKept(", "leftOut(", "versionsLine(", "adoptedDescription", "applyConfirmKept", "applyConfirmRevisit",
      "applyFailedTitle", "applyFailedDescription", "actionFailedTitle", "actionFailedDescription", "noResultBody",
      "noAlternativesHeading", "noAlternativesBody(", "suggestedVersion", "lookingForAlternatives", "whatsDifferent", "extrasThatFit",
    ]) assert.ok(PAGE.includes(`COMPARISON_PAGE_COPY.${key}`), key);
    for (const id of [
      "review-slip-line", "compare-exclusion-note", "banner-auto-apply-error", "banner-no-proposals-review",
      "dialog-apply-confirm", "section-upsell-suggestions", "dislike-loop-panel", "button-rerun-with-feedback", "proposal-preview-money",
    ]) assert.ok(PAGE.includes(id), id);
  });

  it("CS4 the kept pinned text is untouched", () => {
    assert.ok(PAGE.includes(`setApplyError("We couldn't apply this proposal. Your plan is unchanged. Try again.")`));
    assert.ok(PAGE.includes("busyAroundDatesLine("));
    assert.ok(PAGE.includes("withoutUncheckedTravelMetrics(sortedMetrics.slice(0, 4)).map("));
    assert.ok(PAGE.includes("const modalMetrics = withoutUncheckedTravelMetrics(modalVariant.metrics);"));
    assert.equal((PAGE.match(/modalMetrics\.filter\(/g) ?? []).length, 3);
  });

  it("CS5 never-say sweep over every value in the three objects", () => {
    const values = allValues();
    assert.ok(values.length > 20);
    for (const v of values) {
      assert.doesNotMatch(v, /\bAI\b/, v);
      assert.doesNotMatch(v, /\bslip\b/i, v);
      assert.doesNotMatch(v, /\$|\d+\.\d{2}/, v);
      assert.doesNotMatch(v, /score|estimate/i, v);
      assert.doesNotMatch(v, /pulse|crowd|destination intel/i, v);
      assert.deepEqual(siteNeverSayHits(v), [], v);
    }
  });

  it("CS6 formatAnchorLine returns the five sanctioned strings", () => {
    const lines = [
      [formatAnchorLine({ anchorType: "hotel", anchorName: "Hotel Kanra Kyoto", anchorMedianMeters: 2200, locatedStops: 5, totalStops: 5, within15MinCount: 3 }),
        "Hotel · Hotel Kanra Kyoto · 5 of 5 stops placed on the map · stops are typically 2.2 km apart in a straight line · 3/5 stops ≤ 15 min"],
      [formatAnchorLine({ anchorType: "neighborhood", anchorName: "Gion", anchorMedianMeters: 720, locatedStops: 4, totalStops: 4 }),
        "Neighborhood · Gion · 4 of 4 stops placed on the map · stops are typically 720 m apart in a straight line · stay anywhere in this area"],
      [formatAnchorLine({ anchorType: "activity", anchorName: "Tea ceremony", anchorMedianMeters: 0, locatedStops: 2, totalStops: 2 }),
        "Activity · Tea ceremony · 2 of 2 stops placed on the map · stops are typically 0 m apart in a straight line · the day is built around it"],
      [formatAnchorLine({ anchorType: "activity", anchorName: "Regional base", anchorMedianMeters: 900, locatedStops: 2, totalStops: 10 }),
        "Activity · Regional base · 2 of 10 stops placed on the map · Distance not shown. Some stops aren't placed yet. · the day is built around it"],
      [formatAnchorLine({ anchorType: "hotel", anchorName: "Regional hotel", anchorMedianMeters: 220000, locatedStops: 10, totalStops: 10 }),
        "Hotel · Regional hotel · 10 of 10 stops placed on the map · spread across the region · stops are typically 220.0 km apart in a straight line"],
    ] as const;
    for (const [got, want] of lines) {
      assert.equal(got, want);
      assert.doesNotMatch(got!, /located|median|in-area|pivots|regional spread/);
    }
  });

  it("CS7 the candidate distance is always metres", () => {
    const c = (medianMeters: number | null) => ({ medianMeters }) as any;
    assert.equal(formatAnchorCandidateMedian(c(1240)), "about 1,240 m apart in a straight line");
    assert.equal(formatAnchorCandidateMedian(c(20)), "about 20 m apart in a straight line");
    assert.equal(formatAnchorCandidateMedian(c(4)), "about 10 m apart in a straight line");
    assert.equal(formatAnchorCandidateMedian(c(null)), "—");
    assert.equal(ANCHOR_CANDIDATE_DISTANCE_COPY.tooltip, "A straight-line distance, not a walking route.");
    for (const m of [1240, 20, 4, null]) assert.doesNotMatch(formatAnchorCandidateMedian(c(m)), /min/);
  });

  it("CS8 the dialog's old wording is gone and the raw server error is never shown", () => {
    for (const gone of ["strongest anchors", "best fit", ">recommended<", "or pin your own anchor", "Could not load anchor candidates", " rating`", "${mode} anchors", "scored near"]) {
      assert.ok(!DIALOG_CODE.includes(gone), gone);
    }
    assert.doesNotMatch(DIALOG_CODE, /^\s*recommended\s*$/m);
    for (const key of ["description", "loadError", "autoBody", "chooseYourOwn", "optionsLabel("]) assert.ok(DIALOG.includes(`BUILD_AROUND_COPY.${key}`), key);
    assert.equal(BUILD_AROUND_COPY.description, "Choose what to build your three versions around.");
    assert.equal(BUILD_AROUND_COPY.chooseYourOwn, "Or choose your own");
    assert.equal(BUILD_AROUND_COPY.autoBody, "We suggest a hotel, a neighborhood and an activity to build around, ranked by straight-line distance to your stops.");
    assert.equal(BUILD_AROUND_COPY.loadError, "We couldn't load places to build around. Close and reopen to try again, or choose Auto.");
    assert.equal(BUILD_AROUND_COPY.optionsLabel("Hotel"), "Hotel options");
    for (const type of ["hotel", "neighborhood", "activity"]) {
      assert.ok(DIALOG.includes(`${type}: "No ${type} suggestions near your stops yet. You can type one below."`), type);
    }
    const catchBlock = DIALOG.slice(DIALOG.indexOf("} catch"), DIALOG.indexOf("} finally"));
    assert.ok(!catchBlock.includes("error?.message"));
    assert.ok(!catchBlock.includes(".message"));
    assert.ok(DIALOG.includes("founder comment: #1703 2026-10-26T01:02:00Z"));
  });

  it("CS9 the paid-step line shows only for a priced run on a mount with the pay line", () => {
    assert.equal(BUILD_AROUND_COPY.paidStep, "This is a paid step. You'll see the price before you pay, and nothing runs until you do.");
    assert.match(DIALOG, /\{optimizeRunPriced\(fee\) && !hidePayLine \? <> \{BUILD_AROUND_COPY\.paidStep\}<\/> : null\}/);
    assert.doesNotMatch(BUILD_AROUND_COPY.paidStep, /\d|\$/);
    assert.doesNotMatch(DIALOG, /\$\d|5\.99|599/);
    assert.ok(DIALOG.includes("OPTIMIZE_UNAVAILABLE"));
    assert.ok(DIALOG.includes("optimizePayLine(fee)"));
    assert.ok(DIALOG.includes('data-testid="build-around-pay-line"'));
  });

  it("CS10 the price helpers never show a missing price as $0", () => {
    for (const v of [undefined, null, "", "abc"]) assert.equal(formatComparisonPrice(v as any), "Price not available");
    assert.equal(formatComparisonPrice("0"), "$0");
    assert.equal(formatComparisonPrice("1250"), "$1,250");
    assert.equal(formatComparisonPerPerson(null, 2), null);
    assert.equal(formatComparisonPerPerson("", 2), null);
    assert.equal(formatComparisonPerPerson("1000", 2), "$500/person");
  });

  it("CS11 no price site parses a missing price as zero, and no star rating block remains", () => {
    assert.ok(!PAGE.includes('|| "0"'));
    assert.ok(PAGE.includes("parseTotal"));
    assert.ok(!PAGE.includes("suggestion.rating"));
    assert.ok(PAGE.includes("formatComparisonPrice("));
  });

  it("CS12 no Recommended chip; Suggested version only", () => {
    assert.ok(!PAGE.includes("recommendedVariantId"));
    assert.doesNotMatch(PAGE, /\brecommended=\{/);
    assert.ok(PAGE.includes("COMPARISON_PAGE_COPY.suggestedVersion"));
    assert.ok(!PAGE.includes("AI suggestion"));
  });

  it("CS13 the re-run rule line is gone from the panel and the held sentence is not added", () => {
    assert.ok(!PAGE.includes("OPTIMIZE_RERUN_RULE"));
    assert.ok(!PAGE.includes("text-rerun-rule"));
    assert.ok(!PAGE.includes("A re-run uses a Trip Pass or a payment"));
    assert.equal(OPTIMIZE_RERUN_RULE, "Re-timing a day is free for 24 hours.");
  });

  it("CS14 #21 is held: the 15-minute fragment stays", () => {
    assert.ok(PREVIEW.includes("stops ≤ 15 min"));
    assert.ok(PREVIEW.includes("export function formatAnchorLine("));
  });
});
