/**
 * "Where to stay" panel render (smoke test 4, item 5; ledger `2026-10-02-smoke4-draft-fixes`).
 *
 *   R1 a city with NO hotels in our inventory shows the neighbourhood ranking with its reasons and a
 *      "Hotels coming soon" slot under each — and no hotel name, no "Stay here" button
 *   R2 the owner still gets the two answers that need no inventory ("I've got lodging sorted", Skip)
 *   R3 a non-owner sees the ranking and no buttons
 *   R4 an ineligible view (single-day plan, nothing drafted, already decided) renders nothing
 *   R5 nothing printed is a distance or a travel time
 *   R6 §13 — a city that HAS neighbourhoods but a plan with nothing on the map says the latter, never
 *      "no neighbourhoods for Kyoto"; a city with none says that
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/where-to-stay-panel.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import type { WhereToStayView } from "@shared/where-to-stay";
import { HOTELS_COMING_SOON, NO_LOCATED_ITEMS, WhereToStayPanelView } from "../WhereToStayPanelView";

(globalThis as any).React = React;

const NO_INVENTORY: WhereToStayView = {
  eligible: true,
  city: "Kyoto",
  basis: "straight_line",
  hotelsAvailable: false,
  neighborhoods: [
    { slug: "gion", name: "Gion", reason: "closest to 4 of your 5 days", hotels: [] },
    { slug: "arashiyama", name: "Arashiyama", reason: "closest to 1 of your 5 days", hotels: [] },
    { slug: "kyoto-station", name: "Kyoto Station", reason: "close to your days overall", hotels: [] },
  ],
};

const render = (view: WhereToStayView, canChoose = true) =>
  renderToString(React.createElement(WhereToStayPanelView, { view, canChoose }));
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("Where to stay panel", () => {
  it("R1 no inventory: ranking + reasons + 'Hotels coming soon', no hotel and no Stay here", () => {
    const html = render(NO_INVENTORY);
    assert.match(html, /data-testid="where-to-stay-panel"/);
    for (const n of NO_INVENTORY.neighborhoods) {
      assert.match(html, new RegExp(`data-testid="where-to-stay-neighborhood-${n.slug}"`));
      assert.match(html, new RegExp(`data-testid="where-to-stay-coming-soon-${n.slug}"`));
      assert.ok(text(html).includes(n.reason));
    }
    assert.equal(text(html).split(HOTELS_COMING_SOON).length - 1, 3);
    assert.doesNotMatch(html, /where-to-stay-stay-/);
    assert.doesNotMatch(text(html), /Stay here/);
  });

  it("R2 the owner still gets 'I've got lodging sorted' and Skip", () => {
    const t = text(render(NO_INVENTORY));
    assert.ok(t.includes("I've got lodging sorted"));
    assert.ok(t.includes("Skip — start each day at its first stop"));
  });

  it("R3 a non-owner sees the ranking and no buttons", () => {
    const html = render(NO_INVENTORY, false);
    assert.match(html, /where-to-stay-neighborhood-gion/);
    assert.doesNotMatch(html, /<button/);
  });

  it("R4 an ineligible view renders nothing", () => {
    assert.equal(render({ ...NO_INVENTORY, eligible: false, reason: "single_day", neighborhoods: [] }), "");
  });

  it("R5 no distance or travel time is printed", () => {
    assert.doesNotMatch(text(render(NO_INVENTORY)), /\d+\s*(min|mins|minutes|km|m)\b/);
  });

  it("R6 §13 — an empty ranking names its real reason", () => {
    const noStops = text(render({ ...NO_INVENTORY, neighborhoods: [], unranked: "no_located_items" }));
    assert.ok(noStops.includes(NO_LOCATED_ITEMS));
    assert.doesNotMatch(noStops, /don't have neighbourhoods/);
    const noRows = text(render({ ...NO_INVENTORY, neighborhoods: [], unranked: "no_neighborhoods" }));
    assert.ok(noRows.includes("We don't have neighbourhoods for Kyoto yet."));
  });
});
