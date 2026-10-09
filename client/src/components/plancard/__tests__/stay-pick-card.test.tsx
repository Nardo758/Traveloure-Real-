/**
 * S1 "one stay on the plan" — the card (Locked Decision 64; brief `docs/planning/briefs/s1-one-stay.md`
 * ruling 6: the card is the Conformance lane's Compare PR). It reads the server's `stay` block and
 * computes nothing.
 *
 *   SC1 pure: "scored N of M nearby" only with both counts and M > 0; the Maps fallback href
 *   SC2 pure: a routed plan with no pick draws nothing; a free plan shows at most three
 *   SC3 render, routed: the ONE pick, its scored line, Stay here (coral), the map link with
 *       "Google Maps" beside it, the swap; no price or commission anywhere
 *   SC4 render, changed: the "Updated" line shows; a non-chooser sees no Stay here and no swap
 *   SC5 render, free: up to three by straight line, each with Stay here and an attributed map link
 *   SC6 source: the container posts the ONE seen read, only for a chooser, once per computed pick
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/stay-pick-card.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import type { WhereToStayView } from "@shared/where-to-stay";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";
import { GOOGLE_MAPS_ATTRIBUTION, stayCardModel, stayMapsHref, stayScoredLine } from "../../../lib/stay-card";
import { buildGoogleMapsDeepLink } from "../../../lib/maps";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(
    React.createElement(AnchorPanelView, { stage: "drafted", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps),
  );
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const hotel = (id: string, name: string, kind: "platform" | "hotel_cache" | "affiliate" = "hotel_cache") => ({ kind, id, name, starRating: 4 });
const base = (stay: WhereToStayView["stay"]): WhereToStayView => ({
  eligible: true,
  city: "Kyoto",
  basis: "travel_time",
  hotelsAvailable: true,
  neighborhoods: [{ slug: "gion", name: "Gion", reason: "closest to 3 of your 5 days", hotels: [hotel("g1", "Gion Inn")], oneLiner: null }],
  stay,
});
const swap = React.createElement("button", { "data-testid": "slip-anchor-compare" }, "Add places I'm considering");

describe("S1 stay card", () => {
  it("SC1 the scored line and the Maps fallback", () => {
    assert.equal(stayScoredLine(21, 34), "Scored 21 of 34 nearby");
    assert.equal(stayScoredLine(null, 34), null);
    assert.equal(stayScoredLine(3, 0), null);
    assert.equal(stayScoredLine(40, 34), "Scored 34 of 34 nearby");
    // Built by the ONE canonical Maps builder (trip-card-honesty), as a name search: hotel, then city.
    assert.equal(stayMapsHref("Hotel Kanra", "Kyoto"), buildGoogleMapsDeepLink([{ name: "Hotel Kanra, Kyoto" }]));
    assert.equal(stayMapsHref("Hotel Kanra", null), buildGoogleMapsDeepLink([{ name: "Hotel Kanra" }]));
    assert.match(stayMapsHref("Hotel Kanra", "Kyoto"), /destination=Hotel(\+|%20)Kanra%2C(\+|%20)Kyoto/);
  });

  it("SC2 no pick draws nothing; the free list is at most three", () => {
    assert.equal(stayCardModel(undefined), null);
    assert.equal(stayCardModel({ tier: "routed", pick: null, scoredCount: null, candidateCount: null, changed: false, computedAt: null }), null);
    assert.equal(stayCardModel({ tier: "straight_line", hotels: [] }), null);
    const four = ["a", "b", "c", "d"].map((x) => hotel(x, x));
    assert.equal(stayCardModel({ tier: "straight_line", hotels: four })!.hotels.length, 3);
    assert.equal(render({ view: base({ tier: "routed", pick: null, scoredCount: null, candidateCount: null, changed: false, computedAt: null }) }).includes("stay-pick-card"), false);
  });

  it("SC3 routed: one pick, scored line, coral Stay here, attributed map link, the swap, no money", () => {
    const pick = hotel("h1", "Hotel Kanra");
    const html = render({
      view: base({ tier: "routed", pick, scoredCount: 21, candidateCount: 34, changed: false, computedAt: "2026-10-09T00:00:00Z" }),
      addPlacesControl: swap,
    });
    const t = text(html);
    assert.match(html, /data-testid="stay-pick-card"[^>]*data-stay-tier="routed"/);
    assert.match(t, /Our pick for your days/);
    assert.match(t, /Scored 21 of 34 nearby/);
    assert.match(html, /data-testid="stay-pick-stay-hotel_cache-h1"/);
    assert.match(html, /bg-\[color:var\(--slip-primary/);
    assert.ok(html.includes(`href="${stayMapsHref("Hotel Kanra", "Kyoto").replace(/&/g, "&amp;")}"`), "the canonical Maps link for the hotel in the plan's city");
    assert.match(html, /data-testid="stay-pick-map-attribution-h1"/);
    assert.match(t, new RegExp(`View on map · ${GOOGLE_MAPS_ATTRIBUTION}`));
    assert.match(html, /data-testid="stay-pick-swap"/);
    assert.doesNotMatch(t, /\$|commission|per night/i);
    assert.doesNotMatch(t, /Updated for your latest stops/);
  });

  it("SC4 changed shows once; a non-chooser gets no Stay here and no swap", () => {
    const v = base({ tier: "routed", pick: hotel("h2", "Ryokan Sawaya"), scoredCount: 9, candidateCount: 9, changed: true, computedAt: "2026-10-09T01:00:00Z" });
    assert.match(text(render({ view: v, addPlacesControl: swap })), /Updated for your latest stops\./);
    const ro = render({ view: v, canChoose: false, addPlacesControl: swap });
    assert.doesNotMatch(ro, /stay-pick-stay-|stay-pick-swap/);
    assert.match(ro, /stay-pick-map-hotel_cache-h2/);
  });

  it("SC5 free: up to three by straight line, each with Stay here and an attributed map link", () => {
    const html = render({ view: base({ tier: "straight_line", hotels: [hotel("a", "A"), hotel("b", "B", "platform"), hotel("c", "C")] }) });
    const t = text(html);
    assert.match(html, /data-stay-tier="straight_line"/);
    assert.match(t, /Closest to your stops/);
    assert.match(t, /By straight line\./);
    assert.equal((html.match(/data-testid="stay-pick-stay-/g) ?? []).length, 3);
    assert.equal((html.match(/data-testid="stay-pick-map-attribution-/g) ?? []).length, 3);
    assert.doesNotMatch(t, /Scored \d+ of/);
  });

  it("SC6 the container posts the one seen read, for a chooser, once per pick", () => {
    const src = readFileSync(new URL("../../plan/AnchorPanel.tsx", import.meta.url), "utf8");
    assert.match(src, /apiRequest\("POST", `\/api\/trips\/\$\{tripId\}\/stay-pick\/seen`, \{\}\)/);
    assert.match(src, /if \(!changedAt \|\| !props\.canChoose \|\| seenSent\.current === changedAt\) return;/);
    assert.equal((src.match(/stay-pick\/seen/g) ?? []).length, 2); // the comment and the call
  });
});
