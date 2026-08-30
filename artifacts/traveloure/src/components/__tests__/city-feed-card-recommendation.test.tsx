/**
 * Raw-key gate for the native recommendation card (Discover Feed Composition
 * Brief, Commit 1): the rendered output must NEVER contain a raw offering
 * key (`aff_*`), the categoryKey, or a tier string — only resolved display
 * fields — and every card must carry an honest disclosure label.
 *
 * Run: npx tsx --test client/src/components/__tests__/city-feed-card-recommendation.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  CityFeedCardRecommendation,
  humanizeOfferingKey,
  resolveRecommendationName,
  type RecommendationCandidate,
} from "../city-feed-card-recommendation";

function render(candidate: RecommendationCandidate, props: Record<string, any> = {}): string {
  return renderToString(
    <CityFeedCardRecommendation
      candidate={candidate}
      city="kyoto"
      position={0}
      onAdd={() => {}}
      onBook={() => {}}
      {...props}
    />,
  );
}

describe("humanizeOfferingKey", () => {
  it("strips the aff_ prefix and title-cases", () => {
    assert.strictEqual(humanizeOfferingKey("aff_guided_tour"), "Guided Tour");
    assert.strictEqual(humanizeOfferingKey("tea_ceremony_host"), "Tea Ceremony Host");
  });
});

describe("zero raw keys in rendered DOM (the Commit-1 gate)", () => {
  // The PR #74 failure case: an affiliate item whose display name arrived as
  // the raw key. The card must humanize it and never emit the key anywhere
  // (text, hrefs, data-testids, class names).
  const unresolvedAffiliate: RecommendationCandidate = {
    offeringId: "aff_guided_tour",
    categoryKey: "aff_activities",
    displayName: "aff_guided_tour",
    tagline: null,
    reason: "popular pick",
    sourceType: "affiliate",
  };

  it("renders no aff_* string, no categoryKey, no offeringId", () => {
    const html = render(unresolvedAffiliate);
    assert.ok(!html.includes("aff_"), `raw aff_ key leaked into DOM: ${html}`);
    assert.ok(!html.includes("aff_activities"), "categoryKey leaked into DOM");
    assert.ok(!html.includes("aff_guided_tour"), "offeringId leaked into DOM");
    assert.ok(html.includes("Guided Tour"), "humanized display name missing");
  });

  it("never renders the categoryKey even for resolved platform candidates", () => {
    const html = render({
      offeringId: "airport_driver",
      categoryKey: "private_transportation",
      displayName: "Airport Driver",
      tagline: "Door-to-door from KIX",
      reason: "recommended for this trip type",
      sourceType: "platform_provider",
    });
    assert.ok(!html.includes("private_transportation"), "categoryKey leaked into DOM");
    assert.ok(!html.includes("airport_driver"), "offeringId leaked into DOM");
    assert.ok(html.includes("Airport Driver"));
    assert.ok(html.includes("Door-to-door from KIX"), "tagline missing");
  });

  it("renders no tier strings", () => {
    const html = render(unresolvedAffiliate);
    for (const tier of ["advisory", "planning", "coordination", "live_support", "specialized"]) {
      assert.ok(!html.toLowerCase().includes(tier), `tier string '${tier}' leaked into DOM`);
    }
  });
});

describe("honest disclosure labels", () => {
  const base: RecommendationCandidate = {
    offeringId: "tea_ceremony_host",
    categoryKey: "cultural_experiences",
    displayName: "Tea Ceremony Host",
    tagline: "A private tea ceremony with a local host",
    reason: "expert-endorsed",
  };

  it("engine picks carry the 'Recommended' label", () => {
    const html = render({ ...base, sourceType: "platform_provider" });
    assert.ok(html.includes("Recommended"), "Recommended label missing");
    assert.ok(!html.includes("Paid partner"), "affiliate marker shown on a platform pick");
  });

  it("paid affiliate placements carry a distinct marker", () => {
    const html = render({ ...base, sourceType: "affiliate" });
    assert.ok(html.includes("Paid partner"), "distinct affiliate marker missing");
    assert.ok(!html.includes(">Recommended<"), "affiliate card shows the plain Recommended label");
  });
});

describe("traveler CTAs (gem-card parity, not the provider CTA)", () => {
  const candidate: RecommendationCandidate = {
    offeringId: "tea_ceremony_host",
    categoryKey: "cultural_experiences",
    displayName: "Tea Ceremony Host",
    tagline: null,
    sourceType: "platform_provider",
  };

  it("renders Add / Ask / Book and never 'I do this'", () => {
    const html = render(candidate);
    assert.ok(html.includes("Book"), "Book CTA missing");
    assert.ok(html.includes("Add"), "Add CTA missing");
    assert.ok(html.includes("Ask"), "Ask CTA missing");
    assert.ok(!html.includes("I do this"), "provider-side CTA leaked onto a traveler card");
  });
});

describe("resolveRecommendationName", () => {
  it("keeps resolved names verbatim", () => {
    assert.strictEqual(
      resolveRecommendationName({
        offeringId: "x",
        categoryKey: "y",
        displayName: "Tea Ceremony Host",
        tagline: null,
      }),
      "Tea Ceremony Host",
    );
  });

  it("humanizes empty / key-shaped names", () => {
    assert.strictEqual(
      resolveRecommendationName({
        offeringId: "aff_guided_tour",
        categoryKey: "aff_activities",
        displayName: "",
        tagline: null,
      }),
      "Guided Tour",
    );
  });
});
