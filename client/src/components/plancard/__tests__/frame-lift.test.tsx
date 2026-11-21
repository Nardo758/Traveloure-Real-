/**
 * Frame lift (Leon, Nov 19, 2026): the page frame's action row carries the ONE Optimize control and the ONE
 * expert door, and the optimizer card on the slip draws no buttons of its own.
 *
 * Before this the row's Optimize button only scrolled to the card (`optimizerSlot.scrollIntoView`), and the
 * card kept a second Optimize and a second "Local expert" directly above the row.
 *
 *   L1 `OptimizeAction` follows the card's three rules: no draft -> disabled, "Draft first" as its reason;
 *      Optimize unavailable -> nothing drawn; otherwise enabled with the server's fee on the label
 *   L2 it is disabled, with the reason as its title, while a disabled reason is set, and while busy it shows
 *      the busy label
 *   L3 the board card with `actions="none"` draws NO button - not the CTA, not "Local expert" - and keeps
 *      its findings and its other lines; with the default it still draws both
 *   L4 the action row draws a slot for Optimize and no Optimize button of its own; the expert door is the
 *      one button it draws, with the testid the card's button had; with neither action it draws nothing
 *   L5 source: the rail has ONE guarded open (`openOptimize`), the row control and the card CTA both call
 *      it, the control is portalled into the row's slot, and the card is told to draw no buttons whenever
 *      that slot exists
 *   L6 source: the slip hands the row's slot to the rail, and no longer scrolls from the row
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/frame-lift.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { OptimizeAction, OptimizerLead, optimizeBoardCtaLabel, type OptimizerLeadProps } from "../../plan/OptimizerLead";
import { SlipActionRow } from "../SlipActionRow";
import { LEAD_DRAFT_FIRST, type Finding } from "@shared/optimizer-lead";

(globalThis as any).React = React;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(HERE, rel), "utf8");
const FEE = { complexityTier: "standard", feeCents: 599, currency: "USD", aiDisabled: false, coveredByTripPass: false };
const OFF = { ...FEE, aiDisabled: true };
const buttons = (html: string) => html.match(/<button\b[^>]*>/g) ?? [];
const FINDINGS: Finding[] = [{ kind: "closed_on_arrival", count: 2, days: [1, 2] }];

const action = (p: Partial<React.ComponentProps<typeof OptimizeAction>>) =>
  renderToString(React.createElement(OptimizeAction, { fee: FEE as any, onClick: () => {}, ...p }));
const card = (p: Partial<OptimizerLeadProps>) =>
  renderToString(
    React.createElement(OptimizerLead, {
      findings: FINDINGS,
      hasPricedItems: false,
      fee: FEE,
      onClick: () => {},
      tone: "board",
      onLocalExpert: () => {},
      localExpertTestId: "slip-action-hire-expert",
      ...p,
    } as OptimizerLeadProps),
  );

describe("frame lift", () => {
  it("L1 the control follows the card's three rules", () => {
    const draftFirst = action({ drafted: false });
    assert.equal(buttons(draftFirst).length, 1);
    assert.match(buttons(draftFirst)[0]!, /\bdisabled\b/);
    assert.ok(draftFirst.includes(`title="${LEAD_DRAFT_FIRST}"`), "the reason a draft-less plan cannot optimize is on the control");

    assert.equal(action({ fee: OFF as any }), "", "Optimize unavailable draws nothing in the row; the card says why");

    const ready = action({});
    assert.equal(buttons(ready).length, 1);
    assert.doesNotMatch(buttons(ready)[0]!, /\bdisabled\b/);
    assert.ok(ready.includes('data-testid="slip-action-optimize"'), "it keeps the testid the real control has always had");
    assert.ok(ready.includes(optimizeBoardCtaLabel(FEE as any)), "the label is the card's own label rule");
    assert.match(ready, /\$5\.99/, "and that label carries the server's fee");
  });

  it("L2 disabled with its reason, and busy with its label", () => {
    const blocked = action({ disabledReason: "Add a destination first" });
    assert.match(buttons(blocked)[0]!, /\bdisabled\b/);
    assert.ok(blocked.includes('title="Add a destination first"'));

    const busy = action({ busy: true, ctaLabelOverride: "Building…" });
    assert.match(buttons(busy)[0]!, /\bdisabled\b/);
    assert.match(busy, /Building…/);
    assert.doesNotMatch(busy, /\$5\.99/, "the busy label replaces the fee label");
  });

  it("L3 the slip's card draws no buttons, and keeps what it says", () => {
    const bare = card({ actions: "none" });
    assert.equal(buttons(bare).length, 0, "no CTA and no Local expert");
    assert.ok(!bare.includes('data-testid="slip-action-optimize"'));
    assert.ok(!bare.includes('data-testid="slip-action-hire-expert"'));
    assert.ok(bare.includes('data-testid="optimizer-finding-closed_on_arrival"'), "the findings stay");
    assert.ok(bare.includes('data-testid="optimizer-lead-versions"'), "the versions line stays");

    const bareDraftFirst = card({ actions: "none", drafted: false });
    assert.equal(buttons(bareDraftFirst).length, 0);
    assert.ok(bareDraftFirst.includes('data-testid="optimizer-lead-draft-first"'), "the draft-first sentence stays");

    const unavailable = card({ actions: "none", fee: OFF });
    assert.ok(unavailable.includes('data-testid="optimize-unavailable"'), "the card still says Optimize is unavailable");

    const inline = card({});
    assert.equal(buttons(inline).length, 2, "a mount with no row keeps the CTA and Local expert");
  });

  it("L4 the row offers a slot for Optimize and draws the one expert door", () => {
    const row = (p: Partial<React.ComponentProps<typeof SlipActionRow>>) =>
      renderToString(
        React.createElement(SlipActionRow, { showOptimize: true, showExpert: true, optimizeSlotRef: () => {}, onExpert: () => {}, ...p }),
      );
    const both = row({});
    assert.ok(both.includes('data-testid="slip-action-optimize-slot"'));
    assert.equal(buttons(both).length, 1, "the row draws no Optimize button of its own; the rail portals the real one in");
    assert.ok(both.includes('data-testid="slip-action-hire-expert"'));
    assert.match(both, /Get help from a local expert/);
    assert.ok(both.includes(":has(button)"), "a row with no button in it hides itself");

    const optimizeOnly = row({ showExpert: false });
    assert.equal(buttons(optimizeOnly).length, 0);
    assert.ok(optimizeOnly.includes('data-testid="slip-action-optimize-slot"'));

    const expertOnly = row({ showOptimize: false });
    assert.ok(!expertOnly.includes('data-testid="slip-action-optimize-slot"'));
    assert.equal(buttons(expertOnly).length, 1);

    assert.equal(row({ showOptimize: false, showExpert: false }), "");
  });

  it("L5 the rail has one guarded open, and both controls call it", () => {
    const rail = read("../SlipRail.tsx");
    const open = rail.match(/const openOptimize = \(\) => \{([\s\S]*?)\n          \};/);
    assert.ok(open, "the guarded open is one named function");
    const body = open![1].replace(/\s+/g, " ");
    assert.ok(body.includes("if (optimizing || creatingComparison || optimizeDisabledReason) return;"), "the in-flight early return");
    assert.ok(body.includes("guard((dates) => { gatedWindow.current = dates; setBuildAroundOpen(true); });"), "the dates gate, then the build-around step");
    const block = rail.slice(rail.indexOf('data-testid="slip-action-optimize-wrap"'), rail.indexOf("slip-trip-pass-offer"));
    assert.equal(
      (block.match(/guard\(\(dates\) =>/g) ?? []).length,
      2,
      "the Optimize dates gate is entered by the ?optimize=1 landing (pinned by dates-gate-gaps DG2) and by openOptimize, nowhere else",
    );

    assert.match(rail, /createPortal\(\s*<OptimizeAction[\s\S]{0,700}?optimizeActionSlot,\s*\)/, "the control is portalled into the row's slot");
    const mount = rail.match(/<OptimizeAction[\s\S]*?\/>/)![0];
    for (const prop of [
      "fee={leadData.fee}",
      'testId="slip-action-optimize"',
      'drafted={aiAction === "optimize"}',
      "busy={optimizing || creatingComparison}",
      "disabledReason={optimizeDisabledReason}",
      'ctaLabelOverride={creatingComparison ? "Building…" : null}',
    ]) {
      assert.ok(mount.includes(prop), `the row control carries ${prop}`);
    }
    assert.ok(mount.includes("openOptimize();"), "the row control runs the guarded open");
    assert.ok(rail.includes("onClick={openOptimize}"), "the card's own CTA runs the same one");
    assert.ok(rail.includes('actions={optimizeActionSlot ? "none" : "inline"}'), "the card draws no buttons whenever the row has the slot");
    assert.ok(
      rail.includes("{isOwner && !optimizerWaitlist ? (optimizerSlot ? createPortal(optimizerBlock, optimizerSlot) : optimizerBlock) : null}"),
      "the control sits inside the optimizer block, so waitlist mode hides it with the card",
    );
  });

  it("L6 the slip hands the row's slot to the rail and no longer scrolls from the row", () => {
    const view = read("../SlipView.tsx");
    assert.ok(view.includes("optimizeSlotRef={setOptimizeActionSlot}"));
    assert.ok(view.includes("optimizeActionSlot={optimizeActionSlot}"));
    const row = view.match(/<SlipActionRow[\s\S]*?\/>/)![0];
    assert.ok(!row.includes("scrollIntoView"), "the row's Optimize is not a scroll any more");
    assert.ok(!row.includes("onOptimize"));
    assert.ok(row.includes("showExpert={expertDoorLive}"), "the expert door keeps its gate");
    assert.ok(row.includes("onExpert={() => openHandoffChooser({})}"), "and its one chooser");
  });
});
