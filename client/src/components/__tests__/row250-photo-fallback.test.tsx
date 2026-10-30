/**
 * Row 250 — a card or city tile with a null or failed image renders a fallback,
 * not an empty image area. The Arashiyama wanted tile uses the approved lines
 * and leaves out crowd and trending language.
 *
 * Run: npx tsx --test client/src/components/__tests__/row250-photo-fallback.test.tsx
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
import { GemPhotoMedia } from "../gem-photo-band";
import { CityTileFace } from "../city-tile-face";
import { FeedWantedSlotCard } from "../feed/wanted-slot-card";
import type { FeedItem } from "../../lib/feed-stream";
import {
  ARASHIYAMA_ITINERARY_EXPERT_HREF,
  ARASHIYAMA_ITINERARY_EXPERT_LINK,
  ARASHIYAMA_ITINERARY_TRAVELER_LINE,
} from "../../lib/arashiyama-wanted-copy";

(globalThis as any).React = React;

function render(node: React.ReactNode): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("gem photo fallback", () => {
  it("a null image renders the place name and no img", () => {
    const html = render(
      <CityFeedCardGem
        gem={{
          id: "ginkaku",
          placeName: "Ginkaku-ji",
          placeType: "temple",
          description: "The Silver Pavilion.",
          imageUrl: null,
          sourceUrl: "https://www.shokoku-ji.jp/en/ginkakuji/",
        } as any}
        city="Kyoto"
      />,
    );
    assert.match(html, /data-testid="gem-photo-fallback-ginkaku"/);
    assert.match(html, /Ginkaku-ji/);
    assert.equal(html.includes("<img"), false);
    const compact = render(
      <CityFeedCardGem
        gem={{
          id: "yoshida",
          placeName: "Yoshida Sanso Ryokan",
          placeType: "ryokan",
          imageUrl: null,
          sourceUrl: "https://example.traveloure-qa.test/yoshida",
        } as any}
        city="Kyoto"
        density="compact"
      />,
    );
    assert.match(compact, /data-testid="gem-photo-fallback-yoshida"/);
    assert.equal(compact.includes("<img"), false);
  });

  it("a failed image renders the place name and no img", () => {
    const html = renderToString(
      <GemPhotoMedia
        photoUrl="https://images.unsplash.com/photo-missing"
        loading={false}
        failed
        placeName="Philosopher's Path Canal in Autumn"
        id="canal"
        loaded={false}
        onLoad={() => {}}
        onError={() => {}}
      />,
    );
    assert.match(html, /data-testid="gem-photo-fallback-canal"/);
    assert.match(html, /Philosopher&#x27;s Path Canal in Autumn|Philosopher's Path Canal in Autumn/);
    assert.equal(html.includes("<img"), false);
    const shown = renderToString(
      <GemPhotoMedia
        photoUrl="https://upload.wikimedia.org/wikipedia/commons/example.jpg"
        loading={false}
        failed={false}
        placeName="Tenryu-ji"
        id="tenryu"
        loaded
        onLoad={() => {}}
        onError={() => {}}
      />,
    );
    assert.match(shown, /<img /);
    assert.equal(shown.includes("gem-photo-fallback-tenryu"), false);
  });
});

describe("city tile fallback", () => {
  it("a city with no photo renders the name on the painted ground and no img", () => {
    for (const city of ["Goa", "Mumbai", "Jaipur", "Edinburgh", "Porto", "Cartagena"]) {
      const html = renderToString(<CityTileFace cityName={city} photo={null} />);
      assert.match(html, /data-testid="city-tile-fallback"/, city);
      assert.match(html, new RegExp(city));
      assert.match(html, /--landing-tile-ground/);
      assert.equal(html.includes("<img"), false, city);
    }
  });

  it("a failed photo renders the same fallback", () => {
    const html = renderToString(
      <CityTileFace
        cityName="Kyoto"
        photo={{ src: "/images/landing/hero-kyoto-temple.jpg", credit: "Photo: Alec Doualetas / Pexels" }}
        failed
      />,
    );
    assert.match(html, /data-testid="city-tile-fallback"/);
    assert.match(html, /Kyoto/);
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes("Alec Doualetas"), false);
  });

  it("a loaded photo keeps the image and the credit", () => {
    const html = renderToString(
      <CityTileFace
        cityName="Bogotá"
        photo={{ src: "/images/landing/hero-bogota.jpg", credit: "Photo: Daniel Sarmiento / Pexels" }}
      />,
    );
    assert.match(html, /src="\/images\/landing\/hero-bogota.jpg"/);
    assert.match(html, /Daniel Sarmiento/);
    assert.equal(html.includes("city-tile-fallback"), false);
  });
});

describe("Arashiyama wanted tile", () => {
  const item = (over: Record<string, unknown> = {}): FeedItem => ({
    kind: "wanted-slot",
    id: "wanted-arashiyama",
    data: {
      offeringLabel: "Local City Itinerary",
      offeringKey: "local_city_itinerary",
      neighborhoodName: "Arashiyama",
      city: "Kyoto",
      neighborhoodId: "arashiyama",
      demandCount: 12,
      ...over,
    },
  });

  it("uses the approved traveler line and expert link, with no crowd language", () => {
    const html = render(<FeedWantedSlotCard item={item()} />);
    const t = text(html);
    assert.match(html, /data-testid="wanted-arashiyama-traveler-line"/);
    assert.ok(t.includes(ARASHIYAMA_ITINERARY_TRAVELER_LINE));
    assert.match(html, new RegExp(`href="${ARASHIYAMA_ITINERARY_EXPERT_HREF}"`));
    assert.ok(t.includes(ARASHIYAMA_ITINERARY_EXPERT_LINK));
    assert.equal(/high demand/i.test(t), false);
    assert.equal(/trending/i.test(t), false);
    assert.equal(/traveler/i.test(t), false);
    assert.equal(t.includes("12"), false);
    assert.equal(t.includes("wanted in"), false);
    assert.equal(html.includes("badge-high-demand"), false);
    assert.equal(html.includes("link-wanted-apply"), false);
  });

  it("leaves every other wanted tile on the existing line", () => {
    const html = render(
      <FeedWantedSlotCard
        item={item({
          offeringLabel: "Local guide",
          offeringKey: "guide",
          neighborhoodName: "Gion",
          neighborhoodId: "gion",
          demandCount: 0,
        })}
      />,
    );
    const t = text(html);
    assert.ok(t.includes("Local guide wanted in Gion"));
    assert.equal(t.includes(ARASHIYAMA_ITINERARY_TRAVELER_LINE), false);
    assert.match(html, /data-testid="link-wanted-apply"/);
  });
});
