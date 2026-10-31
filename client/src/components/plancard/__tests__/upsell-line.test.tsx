/**
 * Row 179 screen (ledger `2026-10-30-row179-upsell-line-screen`): a selected item with an on-trip upsell line shows one
 * line, "Add X for this leg" (approved, Architect Oct 29, 2026). The social-proof line is HELD FOR LEON and never
 * drawn. The legacy gap-fill slot is unchanged.
 *
 *   L1  both row looks draw "Add {title} for this leg" linked to the browse href; an item without a line draws nothing
 *   L2  no social-proof text renders, even when the DTO carried it — that line draws nothing at all
 *   L3  the legacy slot is unchanged: same component, same props, and its query key is the one it always had;
 *       the card reads the lines through that same key (one request, no impressions of its own)
 *   L4  the card asks only on the card surface, never for a viewer, and the hook sits before the early returns
 *   L5  a tap records the existing upsell click event (`POST /api/upsell/click`, on-trip surface, the line's offering);
 *       the client has one call site for that event and no new tracking (decision-maker, Oct 31, 2026)
 *   L6  the line draws no dismiss control (decision-maker, Oct 31, 2026)
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/upsell-line.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { ItemRow } from "../../plan/ItemRow";
import { PlanRowLookProvider } from "../../plan/row-look";
import { UPSELL_LINE_COPY, upsellLineVisible } from "../../plan/UpsellLine";
import { upsellSlotQueryOptions } from "../../UpsellSlot";
import type { UpsellLine } from "@shared/upsell-line";

(globalThis as any).React = React;

const line: UpsellLine = {
  itemId: "i1",
  legId: "leg-1",
  offeringType: "airport_transfer",
  categoryKey: "private_transportation",
  title: "Airport Transfer",
  socialProof: null,
};
const href = "/services?categoryKey=private_transportation&tripId=t1";

function render(upsell: { line: UpsellLine; href: string; onClick?: () => void } | null, look: "plain" | "board") {
  return renderToString(
    <Router ssrPath="/trip/t1">
      <QueryClientProvider client={new QueryClient()}>
        <PlanRowLookProvider look={look}>
          <ItemRow item={{ id: "i1", name: "Fushimi Inari", time: "09:00" } as any} mode="read" role="traveler" upsell={upsell} />
        </PlanRowLookProvider>
      </QueryClientProvider>
    </Router>,
  );
}
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("row 179: UpsellLine under ItemRow", () => {
  it("L1 both looks draw the approved line with its link; no line draws nothing", () => {
    assert.equal(UPSELL_LINE_COPY.addForLeg("Airport Transfer"), "Add Airport Transfer for this leg");
    for (const look of ["plain", "board"] as const) {
      const html = render({ line, href }, look);
      assert.ok(html.includes('data-testid="item-upsell-line-i1"'), look);
      assert.ok(text(html).includes("Add Airport Transfer for this leg"), look);
      assert.ok(html.includes(`href="${href.replace(/&/g, "&amp;")}"`), look);
      const none = render(null, look);
      assert.equal(none.includes("item-upsell-line"), false, look);
      assert.equal(/for this leg/.test(text(none)), false, look);
    }
  });

  it("L2 no social-proof text renders, even when the DTO carried it", () => {
    const carried = { ...line, socialProof: "Most people add a transfer here" } as unknown as UpsellLine;
    assert.equal(upsellLineVisible(carried), false);
    for (const look of ["plain", "board"] as const) {
      const html = render({ line: carried, href }, look);
      assert.equal(/Most people|for this leg|item-upsell-line/.test(html), false, look);
    }
    assert.equal(upsellLineVisible({ title: "  ", socialProof: null }), false);
  });

  it("L3 the legacy slot is unchanged, and the card shares its query", () => {
    const slot = readFileSync("client/src/components/plancard/PlanCardUpsellSlot.tsx", "utf8");
    assert.match(slot, /<UpsellSlot\s+surface=\{surface\}\s+tripId=\{tripId\}\s+destination=\{destination\}\s+contextPayload=\{\{ templateKey: eventType \?\? "travel" \}\}\s+\/>/);
    const opts = upsellSlotQueryOptions("plancard_ontrip", "t1", { templateKey: "travel" });
    assert.deepEqual(opts.queryKey, ["/api/upsell/plancard-ontrip", "t1", JSON.stringify({ templateKey: "travel" })]);
    assert.match(slot, /upsellSlotQueryOptions\("plancard_ontrip", opts\.tripId, \{ templateKey: opts\.eventType \?\? "travel" \}\)/);
    assert.doesNotMatch(slot.slice(slot.indexOf("export function usePlanCardUpsellLines")), /impression/i);
  });

  it("L4 the card asks only on its own surface, never for a viewer, before the early returns", () => {
    const card = readFileSync("client/src/components/plancard/PlanCard.tsx", "utf8");
    const hook = card.indexOf("const upsellLines = usePlanCardUpsellLines(");
    assert.ok(hook > -1);
    assert.ok(hook < card.indexOf('if (stage === "proposal")'), "the hook runs before the early returns");
    assert.match(card, /enabled: routingReadOnly && !embedded && stage === "full" && !!plancardData\?\.tripRole && !isPlanCardViewerRole\(plancardData\.tripRole\)/);
    assert.match(card, /upsellLines=\{upsellLines\}/);
  });
  it("L5 a tap records the existing upsell click event, through its one call site", () => {
    const slot = readFileSync("client/src/components/UpsellSlot.tsx", "utf8");
    const days = readFileSync("client/src/components/plancard/TripCardDays.tsx", "utf8");
    const lineSrc = readFileSync("client/src/components/plan/UpsellLine.tsx", "utf8");
    assert.equal(slot.match(/"\/api\/upsell\/click"/g)?.length, 1, "one call site for the click event");
    assert.match(slot, /export function postUpsellClick\(surface: UpsellSurface, offeringId: string, tripId\?: string\)/);
    assert.match(slot, /mutationFn: \(offeringId: string\) => postUpsellClick\(surface, offeringId, tripId\)/);
    assert.match(days, /postUpsellClick\("plancard_ontrip", line\.offeringType, tripId\)\.catch\(\(\) => \{\}\)/);
    assert.match(lineSrc, /onClick=\{onClick\}/);
    assert.doesNotMatch(days + lineSrc, /\/api\/upsell\/(impression|track)|trackEvent|analytics\./, "no new tracking");
  });

  it("L6 the line draws no dismiss control", () => {
    for (const look of ["plain", "board"] as const) {
      const html = render({ line, href, onClick: () => {} }, look);
      const at = html.indexOf('data-testid="item-upsell-line-i1"');
      assert.ok(at >= 0, look);
      const block = html.slice(at, html.indexOf("</p>", at));
      assert.doesNotMatch(block, /<button|dismiss|aria-label="(Close|Dismiss)/i, look);
    }
  });
});
