/**
 * Production-shaped landing hero proof: absent live expert/service legs retain the full
 * three-photo composition through clearly representative, non-bookable cards.
 *
 * Run: npx tsx --test client/src/components/__tests__/landing-hero-representative.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { LandingHeroContent } from "../landing/landing-hero";
import type { LandingHeroPayload } from "@shared/landing-hero";

(globalThis as any).React = React;

const PRODUCTION_SHAPED_PAYLOAD = {
  city: "Goa",
  trend: 100,
  crowd: "moderate",
  anchorExpert: null,
  gem: { name: "Tito’s Lane", score: 85, imageUrl: "/fixture/gem.jpg" },
  service: null,
  wanted: [
    { title: "Local City Itinerary", city: "Goa" },
    { title: "Event Photographer", city: "Goa" },
  ],
} satisfies LandingHeroPayload;

function render(payload: LandingHeroPayload): string {
  return renderToString(
    <Router ssrPath="/">
      <LandingHeroContent hero={payload} onPlanTrip={() => {}} />
    </Router>,
  ).replace(/<!--.*?-->/g, "");
}

describe("LandingHero representative fallbacks", () => {
  it("keeps all three photo tiles without fabricating expert or service inventory", () => {
    const html = render(PRODUCTION_SHAPED_PAYLOAD);

    assert.ok(html.includes('data-testid="hero-tile-anchor"'));
    assert.ok(html.includes('data-testid="hero-tile-gem"'));
    assert.ok(html.includes('data-testid="hero-tile-service"'));
    assert.ok(html.includes("/images/landing/hero-generic-expert.jpg"));
    assert.ok(html.includes("/images/landing/hero-kyoto-temple.jpg"));
    assert.ok(html.includes("Representative photo"));
    assert.ok(html.includes("Representative destination"));
    assert.ok(html.includes("Ways to explore Goa"));
    assert.ok(html.includes("Browse Goa"));
    assert.ok(!html.includes("Plan with"));
    assert.ok(!html.includes("Book on Traveloure"));
    assert.ok(!html.includes("from $"));
  });

  it("uses city-level Wanted copy and the shared Ways to earn vocabulary", () => {
    const html = render(PRODUCTION_SHAPED_PAYLOAD);

    assert.ok(html.includes("Wanted in Goa"));
    assert.ok(html.includes("Ways to earn"));
    assert.ok(html.includes('href="/earn"'));
    assert.ok(!html.includes("Offer this"));
    assert.ok(!html.includes("Wanted in Anjuna"));
  });

  it("omits the wanted strip when coverage is unknown", () => {
    const html = render({ ...PRODUCTION_SHAPED_PAYLOAD, wanted: null });
    assert.ok(!html.includes('data-testid="hero-tile-wanted"'));
    assert.ok(!html.includes("Wanted in"));
  });

  it("renders one known need without inventing additional copy", () => {
    const html = render({
      ...PRODUCTION_SHAPED_PAYLOAD,
      wanted: [{ title: "Event Photographer", city: "Goa" }],
    });
    assert.ok(html.includes("Event Photographer"));
    assert.ok(!html.includes("Local City Itinerary"));
  });
});