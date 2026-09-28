/**
 * Landing hero — the curated billboard and the "Where do you want to begin?" pills (landing
 * reorder, ledger `2026-09-28-landing-reorder`, items 1 and 5).
 *
 * B1 the billboard's data file never reads `users` or `provider_services`, and never says "Demo".
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
import { LandingHeroContent, billboardPlanSource, heroBeginRows, resolveBillboardTiles } from "../landing/landing-hero";
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

function render(payload: LandingHeroPayload | null, experts: any[] = []): string {
  return renderToString(
    <Router ssrPath="/">
      <LandingHeroContent hero={payload} onPlanTrip={() => {}} experts={experts} />
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

  it("B4 the hero paints no billboard image from the live payload", () => {
    const html = render(PAYLOAD);
    for (const url of ["/fixture/expert.jpg", "/fixture/gem.jpg", "/fixture/service.jpg"]) {
      assert.ok(!html.includes(url), `${url} must not be painted`);
    }
    const src = fs.readFileSync(path.join(ROOT, "client/src/components/landing/landing-hero.tsx"), "utf8");
    assert.doesNotMatch(src, /anchorExpert|hero\?\.gem|hero\?\.service|\.imageUrl/, "no live billboard leg is read");
  });

  it("B5 a byline-gated expert takes their market's tiles: the initial appears, linked by handle", () => {
    const html = render(PAYLOAD, [{ marketKey: "kyoto", handle: "aiko", initial: "A" }]);
    assert.ok(html.includes('href="/s/aiko"'));
    assert.ok(html.includes("Local expert · Kyoto"));
    assert.ok(!html.includes("Representative photo · Kyoto"));
  });
});

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
