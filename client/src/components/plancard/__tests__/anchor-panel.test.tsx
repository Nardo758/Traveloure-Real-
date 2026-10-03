/**
 * AnchorPanel render (surface step 3, ledger `2026-10-03-surface-step3-anchor-panel`) — the ONE
 * lodging surface, replacing `SlipAnchorQuestion` and `WhereToStayPanel`.
 *
 *   P1 EMPTY: the manifest's question, "Optional", and the three answers — Add places I'm
 *      considering / I've got lodging sorted / Skip for now; a non-chooser sees the question only
 *   P2 EMPTY, fixed-item Trip (M7): asks what is fixed, offers the add control, no lodging answers
 *   P3 DRAFTED, options: each neighbourhood's reason or one-liner, platform stays first with the
 *      "Traveloure stay" badge, Stay here per stay, the two answers below
 *   P4 TIED: when the top two tie on day-count the top shows the tie-break note and the rest nothing
 *   P5 COLLAPSED (R-y): no option has a stay ⇒ ONE line "Best area for these days: <top> · <one-liner>"
 *      and Skip — no list, no coming-soon slots
 *   P6 unranked views say why (§13), and nothing printed is a distance or a minute
 *   P7 pure rules: orderStaysByOrigin (R-o), topWonOnTieBreak, anchorPanelMode, collapsedStayLine
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/anchor-panel.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  PLATFORM_STAY_BADGE,
  STAY_TIE_BREAK_NOTE,
  anchorPanelMode,
  collapsedStayLine,
  orderStaysByOrigin,
  topWonOnTieBreak,
  type WhereToStayView,
} from "@shared/where-to-stay";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(
    React.createElement(AnchorPanelView, { stage: "drafted", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps),
  );
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const nb = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  name: slug[0].toUpperCase() + slug.slice(1),
  reason: `closest to 2 of your 5 days`,
  hotels: [] as any[],
  oneLiner: null as any,
  ...over,
});
const view = (neighborhoods: any[], over: Partial<WhereToStayView> = {}): WhereToStayView => ({
  eligible: true,
  city: "Kyoto",
  basis: "straight_line",
  hotelsAvailable: neighborhoods.some((n) => n.hotels.length),
  neighborhoods,
  ...over,
});

describe("AnchorPanel", () => {
  it("P1 empty state: the manifest question, optional, three answers", () => {
    const html = render({ stage: "empty", addPlacesControl: React.createElement("button", { "data-testid": "slip-anchor-compare" }, "Add places I'm considering") });
    const t = text(html);
    assert.match(html, /data-testid="slip-anchor-question"/);
    assert.match(t, /Where are you staying\?/);
    assert.match(t, /Optional/);
    assert.match(t, /Add places I'm considering/);
    assert.match(t, /I've got lodging sorted/);
    assert.match(t, /Skip for now/);
    const ro = text(render({ stage: "empty", canChoose: false }));
    assert.match(ro, /Where are you staying\?/);
    assert.doesNotMatch(ro, /Skip for now|lodging sorted/);
  });

  it("P2 empty state on a fixed-item Trip asks what is fixed", () => {
    const html = render({ stage: "empty", anchorKind: "fixed_item", addFixedControl: React.createElement("button", { "data-testid": "slip-anchor-add-fixed" }, "Add") });
    assert.match(text(html), /What's fixed on these dates\?/);
    assert.match(html, /slip-anchor-add-fixed/);
    assert.doesNotMatch(text(html), /lodging sorted|Skip for now/);
  });

  it("P3 drafted options: one-liners, platform stays first with their badge", () => {
    const v = view([
      nb("gion", {
        oneLiner: { text: "Lantern-lit lanes by the river", source: "spine" },
        hotels: orderStaysByOrigin([
          { kind: "hotel_cache", id: "h1", name: "Partner Inn", starRating: 3 },
          { kind: "platform", id: "p1", name: "Machiya Stay", starRating: null },
        ]),
      }),
      nb("arashiyama", { reason: "closest to 1 of your 5 days" }),
    ]);
    const html = render({ view: v });
    const t = text(html);
    assert.match(html, /data-anchor-panel="options"/);
    assert.match(t, /Lantern-lit lanes by the river/);
    assert.ok(t.indexOf("Machiya Stay") < t.indexOf("Partner Inn"), "platform first");
    assert.match(html, /where-to-stay-platform-badge-p1/);
    assert.match(t, new RegExp(PLATFORM_STAY_BADGE));
    assert.doesNotMatch(html, /where-to-stay-platform-badge-h1/);
    assert.match(html, /where-to-stay-stay-platform-p1/);
    assert.match(t, /I've got lodging sorted/);
  });

  it("P4 tied: the top option names the tie-break; the rest say nothing", () => {
    const v = view([
      nb("gion", { reason: null, tieBreak: true, hotels: [{ kind: "affiliate", id: "a", name: "A", starRating: null }] }),
      nb("pontocho", { reason: null }),
      nb("arashiyama", { reason: "closest to 1 of your 5 days" }),
    ]);
    const html = render({ view: v });
    assert.match(html, /where-to-stay-tiebreak-gion/);
    assert.equal(text(html).split(STAY_TIE_BREAK_NOTE).length - 1, 1, "said once");
    assert.doesNotMatch(html, /where-to-stay-reason-pontocho|where-to-stay-tiebreak-pontocho/);
  });

  it("P5 collapsed: no option has a stay ⇒ one line and Skip", () => {
    const v = view([nb("gion", { oneLiner: { text: "Lantern-lit lanes", source: "registry" } }), nb("arashiyama")]);
    const html = render({ view: v });
    assert.match(html, /data-testid="anchor-panel-collapsed"/);
    assert.match(text(html), /Best area for these days: Gion · Lantern-lit lanes/);
    assert.match(html, /where-to-stay-skip/);
    assert.doesNotMatch(html, /Arashiyama|coming-soon|where-to-stay-panel/);
  });

  it("P6 unranked says why; no distance or minute anywhere", () => {
    const t1 = text(render({ view: view([], { unranked: "no_located_items" }) }));
    assert.match(t1, /Once some of your stops are on the map/);
    const t2 = text(render({ view: view([], { unranked: "no_neighborhoods" }) }));
    assert.match(t2, /We don't have neighbourhoods for Kyoto yet/);
    const all = text(render({ view: view([nb("gion", { hotels: [{ kind: "platform", id: "p", name: "P", starRating: null }] })]) }));
    assert.doesNotMatch(all, /\b\d+\s*(km|m|min|minutes|mi)\b/);
    assert.equal(render({ view: { ...view([]), eligible: false, reason: "decided" } }), "");
  });

  it("P7 pure rules", () => {
    const stays = [
      { kind: "affiliate" as const, id: "a" },
      { kind: "platform" as const, id: "p1" },
      { kind: "hotel_cache" as const, id: "h" },
      { kind: "platform" as const, id: "p2" },
    ];
    assert.deepEqual(orderStaysByOrigin(stays).map((s) => s.id), ["p1", "p2", "a", "h"], "platform first, each group stable");
    assert.equal(topWonOnTieBreak([{ closestDays: 2 }, { closestDays: 2 }]), true);
    assert.equal(topWonOnTieBreak([{ closestDays: 3 }, { closestDays: 2 }]), false);
    assert.equal(topWonOnTieBreak([{ closestDays: 3 }]), false);
    assert.equal(anchorPanelMode([]), "unranked");
    assert.equal(anchorPanelMode([{ hotels: [] }, { hotels: [] }]), "collapsed");
    assert.equal(anchorPanelMode([{ hotels: [] }, { hotels: [1] }]), "options");
    assert.equal(collapsedStayLine({ name: "Gion", oneLiner: null }), "Best area for these days: Gion");
  });
});
