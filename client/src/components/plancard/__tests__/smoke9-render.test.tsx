/**
 * Smoke 9 render proofs (ledger `2026-10-04-smoke9-fixes`).
 *
 *   R1 S9-2 the tray's CHANGE form on a plan with a chosen stay: change / I'm deciding / I've got
 *      lodging sorted; with an open set no "change"; a hand-added stay says where to change it
 *   R2 S9-4 OptimizerLead before a draft: "Draft first — Optimize works on a drafted plan", CTA disabled,
 *      no findings and no "already works"
 *   R3 S9-5 the amber line renders its count and nothing when there is no conflict
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/smoke9-render.test.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";
import { OptimizerLead } from "../../plan/OptimizerLead";
import { AnchorConflictLine } from "../../plan/AnchorRow";
import { LEAD_DRAFT_FIRST, LEAD_ZERO } from "@shared/optimizer-lead";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const panel = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(React.createElement(AnchorPanelView, { stage: "change", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps));

test("R1 S9-2: the full chooser once the plan says where it stays", () => {
  const chosen = panel({ lodgingSet: { id: "set1", status: "chosen" }, compareHref: "/plans/t/compare/set1" });
  for (const id of ["where-to-stay-change", "where-to-stay-deciding", "where-to-stay-own"]) assert.match(chosen, new RegExp(`data-testid="${id}"`));
  const t = text(chosen);
  assert.match(t, /Change where I'm staying/);
  assert.match(t, /I'm deciding — compare places/);
  assert.match(t, /I've got lodging sorted/);
  assert.match(chosen, /href="\/plans\/t\/compare\/set1"/);
  const open = panel({ lodgingSet: { id: "set1", status: "open" }, compareHref: "/plans/t/compare/set1" });
  assert.doesNotMatch(open, /where-to-stay-change/, "an open comparison has nothing chosen to change");
  assert.match(open, /where-to-stay-deciding/);
  const hand = panel({ lodgingSet: null, addPlacesControl: React.createElement("button", { "data-testid": "slip-anchor-compare" }, "x") });
  assert.match(hand, /where-to-stay-hand-added/);
  assert.match(hand, /slip-anchor-compare/);
  assert.doesNotMatch(panel({ lodgingSet: { id: "s", status: "chosen" }, canChoose: false }), /where-to-stay-change|where-to-stay-own/);
});

test("R2 S9-4: before a draft the card says Draft first, disabled", () => {
  const html = renderToString(
    React.createElement(OptimizerLead, { findings: [], hasPricedItems: false, fee: { feeCents: 599, currency: "USD" } as any, onClick: () => {}, drafted: false }),
  );
  assert.match(text(html), new RegExp(LEAD_DRAFT_FIRST));
  assert.doesNotMatch(text(html), new RegExp(LEAD_ZERO.slice(0, 20)));
  assert.match(html, /data-testid="slip-action-optimize"[^>]*disabled|disabled=""[^>]*data-testid="slip-action-optimize"/);
  assert.doesNotMatch(html, /optimizer-finding-/);
});

test("R3 S9-5: the amber line", () => {
  const html = renderToString(React.createElement(AnchorConflictLine, { kind: "arrival", text: "1 stop on this day starts before your flight lands" }));
  assert.match(html, /data-testid="slip-anchor-conflict-arrival"/);
  assert.match(html, /amber/);
  assert.equal(renderToString(React.createElement(AnchorConflictLine, { kind: "departure", text: null })), "");
});
