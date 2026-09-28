/**
 * Landing hero — the curated billboard and the "Where do you want to begin?" pills (landing
 * reorder, ledger `2026-09-28-landing-reorder`, items 1 and 5).
 *
 * B1 CURATED CASE: the billboard's data file never reads `users` or `provider_services`, and never
 *    says "Demo" (narrowed to the curated case by follow-up 4 — the override reads a live listing).
 * B2 every rendered tile carries a credit resolved from ATTRIBUTION.json; a photo with no entry is
 *    not rendered at all.
 * B3 a tile shows no expert name, price, "Plan with" or avatar — "Representative photo · <market>".
 * B4 the hero no longer paints billboard images from the live payload (provider_services legs).
 * B6 Start this plan opens a new plan with the tile's occasion and market, as door "billboard".
 * B5 a byline-gated expert takes the tile: the initial appears, and only then.
 * P1 the pill set is exactly the old eight-tile set — no destination lost.
 * W1 the Wanted strip still renders from the live payload, and is omitted when coverage is unknown.
 *
 * Run: npx tsx --test client/src/components/__tests__/landing-hero-representative.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { LandingHeroContent, billboardOverridePlanSource, billboardPlanSource, heroBeginRows, resolveBillboardTiles } from "../landing/landing-hero";
import type { BillboardOverride } from "@shared/landing-billboard-override";
import { BILLBOARD_TILES, type PhotoAttribution } from "@shared/landing-billboard";
import type { LandingHeroPayload } from "@shared/landing-hero";

(globalThis as any).React = React;

const ROOT = process.cwd();
const ATTRIBUTION: PhotoAttribution[] = JSON.parse(
  fs.readFileSync(path.join(ROOT, "client/public/images/landing/ATTRIBUTION.json"), "utf8"),
);

const PAYLOAD = {
  city: "Goa",
  trend: 100,
  crowd: "moderate",
  anchorExpert: { name: "Demo Expert", handle: "demo", fromPriceCents: 4500, imageUrl: "/fixture/expert.jpg" } as any,
  gem: { name: "Tito’s Lane", score: 85, imageUrl: "/fixture/gem.jpg" },
  service: { name: "Demo Tour", priceCents: 1200, imageUrl: "/fixture/service.jpg" } as any,
  wanted: [
    { title: "Local City Itinerary", city: "Goa" },
    { title: "Event Photographer", city: "Goa" },
  ],
} satisfies LandingHeroPayload;

function render(payload: LandingHeroPayload | null, overrides: BillboardOverride[] = []): string {
  return renderToString(
    <Router ssrPath="/">
      <LandingHeroContent hero={payload} onPlanTrip={() => {}} overrides={overrides} />
    </Router>,
  ).replace(/<!--.*?-->/g, "");
}

describe("landing hero billboard", () => {
  it("B1 the billboard data never comes from users or provider_services, and never says Demo", () => {
    const src = fs.readFileSync(path.join(ROOT, "shared/landing-billboard.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /from\s+["'][^"']*schema["']/, "the billboard imports no table");
    assert.doesNotMatch(code, /\busers\b|providerServices|provider_services/, "no users / provider_services read");
    assert.doesNotMatch(src, /Demo/, "no demo listing");
    for (const tile of BILLBOARD_TILES) {
      assert.match(tile.imagePath, /^\/images\/landing\/[\w-]+\.jpg$/, `${tile.key} uses a repo photo`);
      assert.doesNotMatch(JSON.stringify(tile), /Demo|\$\d|Plan with/);
    }
  });

  it("B2 every tile renders with a credit from ATTRIBUTION.json; an uncredited photo is not used", () => {
    const tiles = resolveBillboardTiles(ATTRIBUTION);
    assert.equal(tiles.length, BILLBOARD_TILES.length, "every curated tile has an ATTRIBUTION.json entry");
    const html = render(PAYLOAD);
    for (const tile of tiles) {
      const entry = ATTRIBUTION.find((a) => tile.imagePath.endsWith(a.file))!;
      assert.ok(html.includes(`data-testid="hero-billboard-${tile.key}"`), `${tile.key} renders`);
      assert.ok(html.includes(`Photo: ${entry.creator} · Pexels`), `${tile.key} is credited to ${entry.creator}`);
    }
    // A photo with no entry is dropped, not rendered uncredited.
    const withoutOne = ATTRIBUTION.filter((a) => a.file !== "hero-fushimi-inari.jpg");
    assert.deepEqual(
      resolveBillboardTiles(withoutOne).map((t) => t.key),
      BILLBOARD_TILES.filter((t) => !t.imagePath.endsWith("hero-fushimi-inari.jpg")).map((t) => t.key),
    );
  });

  it("B3 a curated tile names no expert, price or avatar — it says it is a representative photo", () => {
    const html = render(PAYLOAD);
    assert.ok(html.includes("Representative photo · Kyoto"));
    assert.ok(html.includes("Start this plan"));
    assert.ok(!html.includes("Plan with"));
    assert.ok(!html.includes("from $"));
    assert.ok(!html.includes("Demo"));
    assert.ok(!html.includes('data-testid="hero-billboard-expert-'), "no initial without a real expert");
  });

  it("B4 a curated tile paints no image from the live payload, and its code reads no listing", () => {
    const html = render(PAYLOAD);
    for (const url of ["/fixture/expert.jpg", "/fixture/gem.jpg", "/fixture/service.jpg"]) {
      assert.ok(!html.includes(url), `${url} must not be painted`);
    }
    const src = fs.readFileSync(path.join(ROOT, "client/src/components/landing/landing-hero.tsx"), "utf8");
    // The live hero payload's old billboard legs are never read, by either tile.
    assert.doesNotMatch(src, /anchorExpert|hero\?\.gem|hero\?\.service/, "no live billboard leg is read");
    // Narrowed to the curated case: the curated tile's own code names no listing, price or expert.
    const start = src.indexOf("function CuratedTileCard(");
    const end = src.indexOf(" * An OVERRIDDEN tile");
    assert.ok(start > 0 && end > start, "the curated and override tiles are separate components");
    assert.doesNotMatch(src.slice(start, end), /listing|price|handle|imageUrl|override/i, "a curated tile reads no listing data");
  });

  const OVERRIDE: BillboardOverride = {
    tileKey: "early-start",
    marketKey: "kyoto",
    handle: "aiko",
    roleLabel: "Local expert",
    listing: {
      id: "svc-1",
      title: "Dawn at Fushimi Inari with Aiko",
      lines: ["Up the mountain before the tour buses, with tea after."],
      price: "120",
      priceType: "fixed",
      pricingUnit: null,
      showPrice: true,
      imageUrl: "/fixture/listing.jpg",
    },
  };

  it("B5 an override renders the expert's live listing on THAT tile; the rest stay curated", () => {
    const html = render(PAYLOAD, [OVERRIDE]);
    // Tiles render in order weekend-away, early-start, date-night: the early-start tile's markup is
    // everything from its own wrapper to the next tile's.
    const from = html.indexOf('data-testid="hero-billboard-early-start"');
    const to = html.indexOf('data-testid="hero-billboard-date-night"');
    assert.ok(from > 0 && to > from);
    const tileHtml = html.slice(from, to);
    assert.ok(tileHtml.includes('data-override="listing"'));
    assert.ok(tileHtml.includes("Local expert · @aiko"));
    assert.ok(tileHtml.includes("Dawn at Fushimi Inari with Aiko"));
    assert.ok(tileHtml.includes("Up the mountain before the tour buses, with tea after."));
    assert.ok(tileHtml.includes("$120"), "the price as the storefront card renders it");
    assert.ok(tileHtml.includes("Plan with @aiko"));
    assert.ok(tileHtml.includes('href="/s/aiko"'), "View listing goes to the storefront");
    assert.ok(tileHtml.includes("/fixture/listing.jpg"), "the listing's own photo");
    assert.ok(!tileHtml.includes("Photo: "), "the owner's own photo carries no third-party credit");
    assert.ok(!tileHtml.includes("Demo"));
    // Per tile: the other Kyoto tiles are still curated and still credited.
    assert.ok(html.includes('data-testid="hero-billboard-weekend-away"'));
    assert.equal((html.match(/Representative photo · Kyoto/g) ?? []).length, 2);
    // No listing photo ⇒ the tile keeps its repo photo AND that photo's credit.
    const noPhoto = render(PAYLOAD, [{ ...OVERRIDE, listing: { ...OVERRIDE.listing, imageUrl: null } }]);
    assert.ok(noPhoto.includes('data-testid="hero-billboard-credit-early-start"'));
    // A listing that hides its price shows none.
    const hidden = render(PAYLOAD, [{ ...OVERRIDE, listing: { ...OVERRIDE.listing, showPrice: false } }]);
    assert.ok(!hidden.includes('data-testid="hero-billboard-price-early-start"'));
  });
});

const OVERRIDE_FOR_SOURCE: BillboardOverride = {
  tileKey: "early-start",
  marketKey: "kyoto",
  handle: "aiko",
  roleLabel: "Local expert",
  listing: { id: "x", title: "T", lines: [], price: null, priceType: null, pricingUnit: null, showPrice: true, imageUrl: null },
};

describe("billboard doors", () => {
  it("B6 each tile's Start this plan opens a NEW plan with its occasion and market pre-set", () => {
    for (const tile of BILLBOARD_TILES) {
      const source = billboardPlanSource(tile);
      assert.ok(source, `${tile.key} resolves to a market`);
      assert.equal(source!.door, "billboard", "the billboard names its funnel door");
      assert.equal(source!.experienceSlug, tile.occasionSlug);
      assert.equal(source!.city, "Kyoto");
      assert.equal(source!.country, "Japan");
      assert.equal(source!.tripId, undefined, "a new plan, never an existing one");
    }
  });

  it("B6b Plan with @handle opens a new plan, finished with that expert, as door billboard", () => {
    const tile = BILLBOARD_TILES.find((t) => t.key === "early-start")!;
    const source = billboardOverridePlanSource(tile, OVERRIDE_FOR_SOURCE)!;
    assert.equal(source.door, "billboard");
    assert.equal(source.experienceSlug, tile.occasionSlug);
    assert.equal(source.city, "Kyoto");
    assert.equal(source.branch, "local", "finished as plan-with-a-local, which mints the slip first");
    assert.deepEqual(source.returnTo, { kind: "expert", handle: "aiko" }, "returned to that expert by handle");
    assert.equal(source.tripId, undefined, "a new plan");
  });

  it("B7 every occasion a landing door pre-sets is a seeded slug (billboard tiles and Plan around it's show)", () => {
    const seed = fs.readFileSync(path.join(ROOT, "server/seeds/experience-template-tabs.seed.ts"), "utf8");
    for (const slug of Array.from(new Set([...BILLBOARD_TILES.map((t) => t.occasionSlug), "show"]))) {
      assert.match(seed, new RegExp(`slug: "${slug}"`), `"${slug}" must be seeded`);
    }
  });
});

describe("hero pills", () => {
  it("P1 the pill set equals the old eight-tile set — no destination lost", () => {
    const rows = heroBeginRows();
    assert.deepEqual(rows.map((r) => r.key), ["browse", "findHelp"]);
    assert.deepEqual(
      rows.flatMap((r) => r.items.map((i) => i.href)),
      [
        "/destinations",
        "/events",
        "/ready-made",
        "/services",
        "/providers",
        "/experts?role=local_expert",
        "/experts?role=travel_expert",
        "/experts?role=event_planner",
      ],
    );
    const html = render(PAYLOAD);
    assert.ok(html.includes("Where do you want to begin?"));
    for (const href of rows.flatMap((r) => r.items.map((i) => i.href))) {
      assert.ok(html.includes(`href="${href.replace(/&/g, "&amp;")}"`), `${href} is a pill`);
    }
  });
});

describe("hero wanted strip (unchanged)", () => {
  it("W1 renders from the live payload and is omitted when coverage is unknown", () => {
    const html = render(PAYLOAD);
    assert.ok(html.includes("Wanted in Goa"));
    assert.ok(html.includes('href="/earn"'));
    assert.ok(!render({ ...PAYLOAD, wanted: null }).includes('data-testid="hero-tile-wanted"'));
  });
});
