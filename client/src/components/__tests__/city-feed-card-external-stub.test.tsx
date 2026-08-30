/**
 * Operation Trailhead LANE T3.4 — external-stub card CTA switching (DB-free render proofs).
 *
 * The card's booking-path CTA switches on the resolution PASS's stored class (T3.4). The proofs:
 *   • provider  → an INTERNAL listing link (href=/services/:ref), NO window.open, class-distinct label.
 *   • affiliate → a partner CTA that does NOT render a raw source/partner URL (§16).
 *   • external  → the T4.3 source-link CTA (the born/default behavior — the inert mechanism).
 * Renders with react-dom/server (no jsdom / no DATABASE), the same harness as the recommendation card.
 *
 * Run: npx tsx --test client/src/components/__tests__/city-feed-card-external-stub.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  CityFeedCardExternalStub,
  resolveStubCta,
  type ExternalStubData,
} from "../city-feed-card-external-stub";

function baseStub(over: Partial<ExternalStubData> = {}): ExternalStubData {
  return {
    id: "s1",
    inventoryClass: "external",
    name: "Camellia Tea Ceremony",
    city: "Kyoto",
    country: "Japan",
    neighborhood: "Gion",
    contentType: "attraction",
    shortDescription: "A tea ceremony.",
    primaryImageUrl: null,
    sourceUrl: "https://example.org/tea",
    sourcePageTitle: "Example",
    license: "osm",
    places: [],
    placeCount: 0,
    ...over,
  };
}

function render(stub: ExternalStubData): string {
  return renderToString(<CityFeedCardExternalStub stub={stub} city="kyoto" />);
}

describe("T3.4 resolveStubCta — the pure switch", () => {
  it("defaults to the external CTA when no resolution class is present (inert / born state)", () => {
    assert.deepEqual(resolveStubCta(baseStub()), { kind: "external", label: "View source", href: null });
  });

  it("provider class with a ref → internal route, no outbound", () => {
    const cta = resolveStubCta(baseStub({ resolutionClass: "provider", resolutionRef: "svc-42" }));
    assert.equal(cta.kind, "provider");
    assert.equal(cta.href, "/services/svc-42");
  });

  it("provider class WITHOUT a ref degrades safely to external (never a broken internal CTA)", () => {
    const cta = resolveStubCta(baseStub({ resolutionClass: "provider", resolutionRef: null }));
    assert.equal(cta.kind, "external");
  });

  it("affiliate class with a ref → partner CTA, no internal href", () => {
    const cta = resolveStubCta(baseStub({ resolutionClass: "affiliate", resolutionRef: "viator:v-9" }));
    assert.equal(cta.kind, "affiliate");
    assert.equal(cta.href, null);
  });

  it("unknown class degrades to external", () => {
    const cta = resolveStubCta(baseStub({ resolutionClass: "wat" as any, resolutionRef: "x" }));
    assert.equal(cta.kind, "external");
  });
});

describe("T3.4 render — provider CTA is an INTERNAL link with NO outbound (the R-T3-a guarantee)", () => {
  it("renders an anchor to /services/:ref and never the source URL", () => {
    const html = render(baseStub({ resolutionClass: "provider", resolutionRef: "svc-42", sourceUrl: "https://leak.example/x" }));
    assert.ok(html.includes('href="/services/svc-42"'), "expected an internal /services link");
    assert.ok(html.includes('data-cta-kind="provider"'));
    assert.ok(html.includes("View on Traveloure"));
    assert.ok(html.includes("Available on Traveloure"));
    // The source URL must NOT appear anywhere in a provider card (no outbound, no leak).
    assert.ok(!html.includes("https://leak.example/x"), "provider card must not carry the source URL");
    // No provider href should ever point off-platform.
    assert.ok(!html.includes('href="https://'), "provider card must have no off-site href");
  });
});

describe("T3.4 render — affiliate CTA carries no raw partner/source URL (§16)", () => {
  it("renders the partner label and no off-site href", () => {
    const html = render(baseStub({ resolutionClass: "affiliate", resolutionRef: "viator:v-9", sourceUrl: "https://partner.example/x" }));
    assert.ok(html.includes('data-cta-kind="affiliate"'));
    assert.ok(html.includes("Book via partner"));
    assert.ok(html.includes("Bookable through a partner"));
    assert.ok(!html.includes('href="https://'), "affiliate CTA must not render an off-site href");
  });
});

describe("T3.4 render — external CTA is the born/default behavior", () => {
  it("renders the source CTA and label for an unresolved stub", () => {
    const html = render(baseStub());
    assert.ok(html.includes('data-cta-kind="external"'));
    assert.ok(html.includes("View source"));
    assert.ok(html.includes("From the web"));
  });

  it("attribution travels with the card (OSM licence)", () => {
    const html = render(baseStub({ license: "osm" }));
    assert.ok(html.includes("© OpenStreetMap contributors"));
  });
});
