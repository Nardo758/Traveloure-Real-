/**
 * Lane nav-storefront D4 — StorefrontLink render proofs (DB-free, no jsdom).
 *
 * The component's rule 1 is the load-bearing contract every card-level caller in this
 * lane leans on (expert-card, provider-card, the discover ServiceCard): `users.handle`
 * is nullable (migration 136), and a null/undefined handle must render NOTHING — never
 * a guessed handle, never a disabled-looking link to a 404. These proofs pin that down
 * at the component boundary, plus the positive case (a real /p/:handle href) for both
 * variants.
 *
 * Harness: react-dom/server renderToString, the same DB-free posture as
 * city-feed-card-external-stub.test.tsx. wouter's <Link> needs a location at render
 * time; under node that is <Router ssrPath> (bare renderToString throws
 * "location is not defined").
 *
 * Run: npx tsx --test client/src/components/__tests__/storefront-link.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { StorefrontLink } from "../marketplace/storefront-link";

function render(el: React.ReactElement): string {
  return renderToString(<Router ssrPath="/experts">{el}</Router>);
}

describe("StorefrontLink rule 1 — null handle renders nothing", () => {
  it("null handle, section variant → empty output", () => {
    assert.equal(render(<StorefrontLink handle={null} />), "");
  });

  it("null handle, inline variant → empty output", () => {
    assert.equal(render(<StorefrontLink handle={null} variant="inline" />), "");
  });

  it("undefined handle → empty output", () => {
    assert.equal(render(<StorefrontLink handle={undefined} />), "");
  });

  it("empty-string handle → empty output (falsy, not a claimable handle)", () => {
    assert.equal(render(<StorefrontLink handle="" />), "");
  });
});

describe("StorefrontLink with a real handle", () => {
  it("inline variant links to /p/:handle and shows the handle when no name given", () => {
    const html = render(<StorefrontLink handle="yuki-flowers" variant="inline" />);
    assert.match(html, /href="\/p\/yuki-flowers"/);
    // SSR interleaves text expressions with <!-- --> markers — match the parts.
    assert.match(html, /More from/);
    assert.match(html, /@yuki-flowers/);
  });

  it("inline variant prefers the display name when provided", () => {
    const html = render(<StorefrontLink handle="yuki-flowers" name="Yuki" variant="inline" />);
    assert.match(html, /href="\/p\/yuki-flowers"/);
    assert.match(html, /More from/);
    assert.match(html, /Yuki/);
  });

  it("section variant links to /p/:handle and never fabricates an item count (§13)", () => {
    const html = render(<StorefrontLink handle="yuki-flowers" name="Yuki" sellerNoun="expert" />);
    assert.match(html, /href="\/p\/yuki-flowers"/);
    assert.match(html, /Everything this expert offers/);
    // §13: no "N other offerings" style claim anywhere in the output.
    assert.doesNotMatch(html, /\d+\s+(other\s+)?offerings/i);
  });
});
