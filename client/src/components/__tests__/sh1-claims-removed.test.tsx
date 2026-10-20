/**
 * SH-1 items 1–3 (ledger `2026-10-19-sh1-banned-copy`).
 *
 *   GC1 a gem card (full and compact) shows its type label — Eat, Do, Stay or Photo spot — and never "Hidden gem",
 *       "Trending" or its gem score, even at a score of 92
 *   GC2 the type label maps onto the five labels: a marquee stay reads "Stay"; a landmark and a day trip read "Do"
 *   TR1 the destination hero's eyebrow is "DESTINATION · <COUNTRY>" with no TREND fragment, whatever the resolver says
 *   CR1 one live city ⇒ the homepage rail renders nothing (even with eight TravelPulse rows)
 *   CR2 two or more live cities ⇒ only the live cities appear, in the tiles and the ticker, with no trend score
 *   CR3 no live-markets answer ⇒ the rail renders nothing
 *
 * Run: npx tsx --test client/src/components/__tests__/sh1-claims-removed.test.tsx
 */
import "./node-navigator";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SignInModalProvider } from "../../contexts/SignInModalContext";
import { CityFeedCardGem } from "../city-feed-card";
import { CitiesRail } from "../landing/cities-rail";
import { heroEyebrowFragments } from "../../lib/hero-eyebrow";
import { LIVE_MARKETS_ROUTE } from "@shared/live-markets";

(globalThis as any).React = React;

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode, seed: Array<[unknown[], unknown]> = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  for (const [key, data] of seed) qc.setQueryData(key, data);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/location/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

const gem = (over: Record<string, unknown> = {}) =>
  ({
    id: "g1",
    placeName: "Kiyomizu slope",
    placeType: "temple",
    description: "A quiet lane.",
    gemScore: 92,
    imageUrl: null,
    ...over,
  }) as any;

describe("gem cards", () => {
  it("GC1 show the type label and never a hidden-gem claim, a trending badge or a score", () => {
    for (const density of ["full", "compact"] as const) {
      const html = render(<CityFeedCardGem gem={gem()} city="kyoto" density={density} />);
      const t = text(html);
      assert.ok(!/hidden gem/i.test(t), `${density}: no "Hidden gem"`);
      assert.ok(!/trending/i.test(t), `${density}: no "Trending"`);
      assert.ok(!t.includes("92"), `${density}: no gem score`);
      assert.ok(!/gem score/i.test(t), `${density}: no "gem score" label`);
      assert.ok(html.includes('data-testid="gem-type-tag-g1"'), `${density}: the type tag`);
      assert.ok(!html.includes("gem-hidden-tag-"), `${density}: the old tag is gone`);
    }
  });

  it("GC2 the label is one of the five", () => {
    const label = (placeType: string) => {
      const html = render(<CityFeedCardGem gem={gem({ placeType })} city="kyoto" />);
      const m = html.match(/data-testid="gem-type-tag-g1"[^>]*>([^<]+)</);
      return m?.[1];
    };
    assert.equal(label("ryokan"), "Stay");
    assert.equal(label("temple"), "Do");
    assert.equal(label("day trip"), "Do");
    assert.equal(label("restaurant"), "Eat");
    assert.ok(["Eat", "Do", "Stay", "Photo spot", "Event"].includes(String(label("viewpoint"))));
  });
});

describe("destination hero", () => {
  it("TR1 no TREND fragment in the eyebrow", () => {
    assert.deepEqual(heroEyebrowFragments("Japan"), ["DESTINATION", "JAPAN"]);
    assert.deepEqual(heroEyebrowFragments(null), ["DESTINATION"]);
  });
});

const PULSE = ["Kyoto", "Tokyo", "Osaka", "Porto", "Mumbai", "Bogotá", "Edinburgh", "Goa"].map((cityName, i) => ({
  cityName,
  country: "X",
  trendingScore: 90 - i,
  imageUrl: null,
}));

describe("homepage rail", () => {
  it("CR1 one live city ⇒ nothing", () => {
    const html = render(<CitiesRail />, [[["/api/travelpulse/cities"], { cities: PULSE }], [[LIVE_MARKETS_ROUTE], { marketKeys: ["kyoto"] }]]);
    assert.ok(!html.includes("section-cities-rail"));
    assert.ok(!text(html).includes("Cities with momentum"));
    assert.ok(!text(html).includes("TravelPulse"));
  });

  it("CR2 two or more live cities ⇒ only those, no trend score", () => {
    const html = render(<CitiesRail />, [[["/api/travelpulse/cities"], { cities: PULSE }], [[LIVE_MARKETS_ROUTE], { marketKeys: ["kyoto", "porto"] }]]);
    const t = text(html);
    assert.ok(html.includes("section-cities-rail"));
    assert.ok(t.includes("Kyoto") && t.includes("Porto"));
    for (const other of ["Tokyo", "Osaka", "Mumbai", "Goa"]) assert.ok(!t.includes(other), `${other} is not live`);
    assert.ok(!/trend \d/i.test(t), "no trend score in the ticker");
    assert.ok(!t.includes("90"), "no score on the tiles");
  });

  it("CR3 no live-markets answer ⇒ nothing", () => {
    const html = render(<CitiesRail />, [[["/api/travelpulse/cities"], { cities: PULSE }]]);
    assert.ok(!html.includes("section-cities-rail"));
  });
});
