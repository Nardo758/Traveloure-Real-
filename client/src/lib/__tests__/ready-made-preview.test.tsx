/**
 * Slice B1 — the Ready Made Trip's public preview, pure + render (ledger `2026-10-05-rmt-public-preview`).
 *   V1 the slug is the title in kebab case plus the id's token; the token alone is authoritative
 *   V2 the price line is the purchase's own total, "no fee on this purchase"; no price ⇒ no line
 *   V3 the sample day is an OUTLINE — the stop count and the areas (CP-1 PR 2, ledger
 *      `2026-10-15-cp1-teasers`) — never a title, time, place name, leg minute, coordinate, note or price
 *   V4 the page draws the cover credit, the expert, the verified stamp only when true, the price,
 *      "Get this trip" to the store page, ONE day's outline and the locked-days line; an absent fact draws nothing
 *
 * Run: npx tsx --test client/src/lib/__tests__/ready-made-preview.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import {
  photoSourceName,
  readyMadeBuyerTotalCents,
  readyMadeIdToken,
  readyMadePreviewPath,
  readyMadePriceLine,
  readyMadeSlug,
  readyMadeSlugToken,
  sampleDayOf,
  type ReadyMadePreview,
} from "@shared/ready-made-preview";
import { ReadyMadePreviewView } from "../../pages/ready-made-preview";

(globalThis as any).React = React;

const ID = "3f9a1c2b-7e44-4d1a-9c0e-5b6a7d8e9f01";

describe("V1 slug", () => {
  it("title words + the id token", () => {
    assert.equal(readyMadeIdToken(ID), "3f9a1c2b7e");
    assert.equal(readyMadeSlug({ id: ID, title: "Kyoto: Temples & Tea, Slowly" }), "kyoto-temples-tea-slowly-3f9a1c2b7e");
    assert.equal(readyMadeSlug({ id: ID, title: "Café Crème à Gion" }), "cafe-creme-a-gion-3f9a1c2b7e");
    assert.equal(readyMadeSlug({ id: ID, title: "" }), "3f9a1c2b7e");
    assert.equal(readyMadePreviewPath({ id: ID, title: "Kyoto" }), "/t/kyoto-3f9a1c2b7e");
  });
  it("the token is read back whatever the words say", () => {
    assert.equal(readyMadeSlugToken("kyoto-temples-3f9a1c2b7e"), "3f9a1c2b7e");
    assert.equal(readyMadeSlugToken("an-old-title-3f9a1c2b7e"), "3f9a1c2b7e");
    assert.equal(readyMadeSlugToken("3f9a1c2b7e"), "3f9a1c2b7e");
    assert.equal(readyMadeSlugToken("kyoto-temples"), null);
    assert.equal(readyMadeSlugToken(""), null);
  });
});

describe("V2 price line", () => {
  it("is the purchase's own total", () => {
    assert.equal(readyMadeBuyerTotalCents({ priceCents: 4900 }), 4900);
    assert.equal(readyMadePriceLine({ priceCents: 4900, pricingMode: "fixed" }), "From $49 · no fee on this purchase");
    assert.equal(readyMadePriceLine({ priceCents: 2950, pricingMode: "per_traveler" }), "From $29.50 per traveler · no fee on this purchase");
  });
  it("no price ⇒ no line", () => {
    for (const p of [null, undefined, 0, -5]) {
      assert.equal(readyMadeBuyerTotalCents({ priceCents: p as any }), null);
      assert.equal(readyMadePriceLine({ priceCents: p as any }), null);
    }
  });
});

const items = [
  { id: "a", title: "Fushimi Inari", dayNumber: 1, startTime: "08:00", itemType: "activity", locationName: "Fushimi", latitude: 34.96, notes: "secret", expertNote: "x" },
  { id: "b", title: "Tofuku-ji", dayNumber: 1, startTime: "10:30", itemType: "activity", locationName: null },
  { id: "c", title: "Nishiki Market", dayNumber: 1, startTime: null, itemType: "dining", locationName: "Nakagyo" },
  { id: "d", title: "Day 2 stop", dayNumber: 2, startTime: "09:00", itemType: "activity", locationName: null },
];
// CP-1 PR 2: the caller names each stop's area; "b" sits near no known neighbourhood.
const AREAS: Record<string, string | null> = { a: "Fushimi", b: null, c: "Nakagyo", d: "Arashiyama" };
const areaOf = (i: { id: string }) => AREAS[i.id] ?? null;

describe("V2b photo credit source", () => {
  it("names the library the metadata names, never a default", () => {
    assert.equal(photoSourceName({ unsplashId: "abc" }), "Unsplash");
    assert.equal(photoSourceName({ profileUrl: "https://unsplash.com/@ann" }), "Unsplash");
    assert.equal(photoSourceName({ profileUrl: "https://www.pexels.com/@g-n-403098" }), "Pexels");
    assert.equal(photoSourceName({ profileUrl: "https://commons.wikimedia.org/wiki/User:BM" }), "Wikimedia Commons");
    assert.equal(photoSourceName({ profileUrl: "https://notunsplash.com.evil/x" }), null);
    assert.equal(photoSourceName({ profileUrl: "not a url" }), null);
    assert.equal(photoSourceName({}), null);
  });
  it("a credit with no named source names the photographer alone", () => {
    const html = render(preview({ heroCredit: { photographer: "G N", profileUrl: null, source: null } }));
    assert.match(html, /Photo by G N/);
    assert.ok(!html.includes("on Unsplash"));
  });
});

describe("V3 sample day", () => {
  it("day 1 only, as an outline: the count and the areas, nothing the buyer pays for", () => {
    const day = sampleDayOf(items as any, areaOf)!;
    assert.deepEqual(day, { dayNumber: 1, stopCount: 3, areas: ["Fushimi", "Nakagyo"] });
    const json = JSON.stringify(day);
    for (const banned of ["Fushimi Inari", "Tofuku-ji", "Nishiki Market", "08:00", "latitude", "secret", "expertNote", "notes", "walking"]) {
      assert.ok(!json.includes(banned), banned);
    }
  });
  it("no day-1 stops ⇒ no sample day", () => {
    assert.equal(sampleDayOf([items[3]] as any, areaOf), null);
  });
});

function preview(over: Partial<ReadyMadePreview> = {}): ReadyMadePreview {
  return {
    id: ID,
    slug: "kyoto-3f9a1c2b7e",
    path: "/t/kyoto-3f9a1c2b7e",
    title: "Kyoto, Slowly",
    market: "Kyoto",
    durationDays: 3,
    planLabel: "Cultural trip",
    heroImageUrl: "https://images.unsplash.com/photo-1",
    heroCredit: { photographer: "Ann Lee", profileUrl: "https://unsplash.com/@ann", source: "Unsplash" },
    priceLine: "From $49 · no fee on this purchase",
    expert: { name: "Aiko", handle: "aiko-kyoto", localVerified: true },
    sampleDay: sampleDayOf(items as any, areaOf),
    lockedDays: 2,
    ...over,
  };
}
const render = (p: ReadyMadePreview) => renderToString(<Router ssrPath="/t/x"><ReadyMadePreviewView preview={p} /></Router>).replace(/<!-- -->/g, "");

describe("V4 the page", () => {
  it("draws every true fact", () => {
    const html = render(preview());
    assert.match(html, /Photo by .*Ann Lee.* on Unsplash/);
    assert.match(html, /Kyoto, Slowly/);
    assert.match(html, /3 days/);
    assert.match(html, /href="\/s\/aiko-kyoto"/);
    assert.match(html, /Local in Kyoto/);
    assert.match(html, /From \$49 · no fee on this purchase/);
    assert.match(html, /href="\/ready-made\/3f9a1c2b-7e44-4d1a-9c0e-5b6a7d8e9f01"[^>]*>Get this trip/);
    assert.match(html, /Day 1 · 3 stops · Fushimi, Nakagyo/);
    for (const hidden of ["Fushimi Inari", "Tofuku-ji", "Nishiki Market", "08:00", "min (confirmed)"]) {
      assert.ok(!html.includes(hidden), `the outline never shows ${hidden}`);
    }
    assert.ok(!html.includes("Day 2 stop"), "one day only");
    assert.match(html, /The other 2 days open in your own editable trip/);
  });
  it("draws nothing for an absent fact", () => {
    const html = render(preview({ heroImageUrl: null, heroCredit: null, priceLine: null, expert: { name: "Aiko", handle: null, localVerified: false }, sampleDay: null, lockedDays: 0 }));
    for (const id of ["rm-preview-hero", "rm-preview-price", "rm-preview-verified", "rm-preview-sample-day", "rm-preview-locked"]) {
      assert.ok(!html.includes(`data-testid="${id}"`), id);
    }
    assert.ok(!html.includes("/s/"), "no storefront link without a handle");
  });
});
