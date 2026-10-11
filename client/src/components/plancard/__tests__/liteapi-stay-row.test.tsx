/**
 * S1-d-1 — a LiteAPI stay on the card (ledger `2026-10-10-s1-d1-liteapi`). A `liteapi` row draws exactly
 * what a partner row draws: no badge, Stay here, and the Maps link with its attribution. No rate, no
 * price and no "See rates" in d-1 (that is S1-d-2). No existing pin is edited.
 *
 *   SC7 routed pick of kind liteapi: Stay here keyed `liteapi`, the attributed Maps link, no badge, no money.
 *       AMENDED by S1-d-2 (sanctioned, ledger `2026-10-10-s1-d2-liteapi-rates`): the default card still shows
 *       no `$`, `¥` or "per night", and now carries the "See rates" control — with no price text until tapped
 *   SC8 free list mixing kinds: only the platform row is badged; the liteapi row keeps its Maps link
 *   P10 ranked options: a liteapi stay in a neighbourhood has no "Traveloure stay" badge and a Stay here
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/liteapi-stay-row.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { PLATFORM_STAY_BADGE, type StayHotel, type WhereToStayView } from "@shared/where-to-stay";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";
import { GOOGLE_MAPS_ATTRIBUTION, stayMapsHref } from "../../../lib/stay-card";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(
    React.createElement(AnchorPanelView, { stage: "drafted", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps),
  );
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hotel = (id: string, name: string, kind: StayHotel["kind"] = "liteapi"): StayHotel => ({ kind, id, name, starRating: 4 });
const base = (over: Partial<WhereToStayView>): WhereToStayView => ({
  eligible: true,
  city: "Kyoto",
  basis: "travel_time",
  hotelsAvailable: true,
  neighborhoods: [{ slug: "gion", name: "Gion", reason: "closest to 3 of your 5 days", hotels: [hotel("g1", "Gion Inn")], oneLiner: null }],
  ...over,
});

describe("LiteAPI stay row", () => {
  it("SC7 a routed liteapi pick: Stay here, the attributed Maps link, no badge, no money", () => {
    const html = render({
      view: base({ stay: { tier: "routed", pick: hotel("lt1", "Hotel Kanra"), scoredCount: 21, candidateCount: 34, changed: false, computedAt: "2026-10-10T00:00:00Z" } }),
    });
    const t = text(html);
    assert.match(html, /data-testid="stay-pick-stay-liteapi-lt1"/);
    assert.match(html, /data-testid="stay-pick-map-liteapi-lt1"/);
    assert.ok(html.includes(`href="${stayMapsHref("Hotel Kanra", "Kyoto").replace(/&/g, "&amp;")}"`));
    assert.match(t, new RegExp(`View on map · ${GOOGLE_MAPS_ATTRIBUTION}`));
    assert.doesNotMatch(t, new RegExp(PLATFORM_STAY_BADGE));
    assert.doesNotMatch(t, /\$|¥|per night|commission/i);
    // S1-d-2: the control is present on the default card, and no price is drawn until it is tapped.
    assert.match(html, /data-testid="stay-rates-open-lt1"/);
    assert.match(t, /See rates/);
    assert.doesNotMatch(html, /data-testid="stay-rates-panel-/);
  });

  it("SC8 a free list mixing kinds badges only the platform row", () => {
    const html = render({ view: base({ stay: { tier: "straight_line", hotels: [hotel("p1", "Our Inn", "platform"), hotel("lt2", "Sakura Hotel")] } }) });
    assert.equal((html.match(new RegExp(PLATFORM_STAY_BADGE, "g")) ?? []).length, 1);
    assert.match(html, /data-testid="stay-pick-map-liteapi-lt2"/);
    assert.match(html, /data-testid="stay-pick-stay-liteapi-lt2"/);
  });

  it("P10 ranked options: a liteapi stay has no badge and a Stay here", () => {
    const html = render({ view: base({ neighborhoods: [{ slug: "gion", name: "Gion", reason: "closest to 3 of your 5 days", hotels: [hotel("lt3", "Gion Lite")], oneLiner: null }] }) });
    assert.match(html, /data-testid="where-to-stay-hotel-liteapi-lt3"/);
    assert.doesNotMatch(html, /where-to-stay-platform-badge-lt3/);
    assert.doesNotMatch(text(html), new RegExp(PLATFORM_STAY_BADGE));
    assert.match(text(html), /Stay here/);
  });
});
