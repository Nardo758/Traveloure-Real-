/**
 * Item 2 (ledger `2026-10-10-no-stays-no-promise`): when a market has ZERO rankable stays, the stays block is
 * hidden — no "Hotels coming soon", no promise — and the neighbourhoods line stays.
 *
 *   NS1 chooser, zero stays: every neighbourhood and its reason render; no "Hotels coming soon", no stay card
 *   NS2 chooser, stays in one neighbourhood: the stays render and the empty one keeps its line (unchanged)
 *   NS3 drafted, zero stays: the collapsed neighbourhoods line, no "Hotels coming soon"
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/no-stays-no-promise.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import type { WhereToStayView } from "@shared/where-to-stay";
import { AnchorPanelView, HOTELS_COMING_SOON, type AnchorPanelViewProps } from "../../plan/AnchorPanel";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(React.createElement(AnchorPanelView, { stage: "chooser", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps));
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const nb = (slug: string, hotels: any[] = []) => ({ slug, name: slug[0].toUpperCase() + slug.slice(1), reason: "closest to 2 of your 3 days", hotels, oneLiner: null });
const view = (neighborhoods: any[], stay?: any): WhereToStayView =>
  ({ eligible: true, city: "Bogotá", basis: "straight_line", hotelsAvailable: neighborhoods.some((n) => n.hotels.length), neighborhoods, ...(stay ? { stay } : {}) }) as any;

describe("no stays, no promise", () => {
  it("NS1 chooser with zero rankable stays: neighbourhoods only", () => {
    const html = render({ view: view([nb("chapinero"), nb("usaquen")], { tier: "straight_line", hotels: [] }) });
    const t = text(html);
    assert.match(t, /Chapinero/);
    assert.match(t, /Usaquen/);
    assert.match(t, /closest to 2 of your 3 days/);
    assert.ok(!t.includes(HOTELS_COMING_SOON));
    assert.doesNotMatch(html, /where-to-stay-coming-soon-/);
    assert.doesNotMatch(html, /stay-pick-card/);
  });

  it("NS2 chooser with stays in one neighbourhood: stays render, the other keeps its line", () => {
    const html = render({ view: view([nb("chapinero", [{ kind: "hotel_cache", id: "h1", name: "Hotel Chapinero", starRating: 4 }]), nb("usaquen")]) });
    assert.match(html, /where-to-stay-hotel-hotel_cache-h1/);
    assert.match(html, /where-to-stay-coming-soon-usaquen/);
  });

  it("NS3 drafted with zero stays: the collapsed neighbourhoods line, no promise", () => {
    const html = render({ stage: "drafted", view: view([nb("chapinero"), nb("usaquen")]) });
    assert.match(html, /anchor-panel-collapsed-line/);
    assert.match(text(html), /Best area for these days: Chapinero/);
    assert.ok(!text(html).includes(HOTELS_COMING_SOON));
  });
});
