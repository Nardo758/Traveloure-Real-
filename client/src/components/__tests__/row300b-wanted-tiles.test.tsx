/**
 * Row 300b (ledger `2026-10-31-wanted-tiles-no-demand`): a Wanted tile makes no crowd or demand
 * claim. Fixtures are synthetic.
 *
 *   W1 demandCount 0, 3 and 12: no traveler count, no "want this", no high-demand badge, no "Wanted here"; the
 *      no-count line "Be the first to offer …" shows on every tile.
 *   W2 the neighbourhood Wanted panel has no "Wanted here" eyebrow.
 *   W3 the empty-market card has no "Travelers are looking" line.
 *   W4 neither component uses "trending", "popular", "best", "founding" or "PayPal".
 *
 * Run: npx tsx --test client/src/components/__tests__/row300b-wanted-tiles.test.tsx
 */
import "./node-navigator";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SignInModalProvider } from "../../contexts/SignInModalContext";
import { FeedWantedSlotCard } from "../feed/wanted-slot-card";
import type { FeedItem } from "../../lib/feed-stream";

(globalThis as any).React = React;

function render(node: React.ReactNode): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["/api/auth/user"], null);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/location/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const slot = (demandCount: number): FeedItem => ({
  kind: "wanted-slot",
  id: `wanted-gion-${demandCount}`,
  data: {
    offeringLabel: "Local guide",
    offeringKey: "guide",
    neighborhoodName: "Gion",
    neighborhoodSlug: "gion",
    neighborhoodId: "gion",
    city: "Kyoto",
    demandCount,
    dateContext: "Nov 12",
  } as any,
});

const page = fs.readFileSync("client/src/pages/discover-location.tsx", "utf8");
const between = (src: string, start: string, end: string) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));
const panelSrc = between(page, "function NeighbourhoodWantedPanel(", "\n}\n");
const emptyMarketSrc = between(page, 'data-testid="section-expert-recruitment-generic"', "</div>");

describe("row 300b — Wanted tiles make no demand claim", () => {
  it("W1: no count, no 'want this', no badge, no eyebrow, at demandCount 0, 3 and 12", () => {
    for (const n of [0, 3, 12]) {
      const html = render(<FeedWantedSlotCard item={slot(n)} density="compact" />);
      const t = text(html);
      assert.equal(/\d+\s+travelers?\b/i.test(t), false, `count at ${n}: ${t}`);
      assert.equal(/want this/i.test(t), false, `want this at ${n}`);
      assert.equal(/high demand/i.test(t), false, `badge text at ${n}`);
      assert.equal(html.includes("badge-high-demand"), false, `badge testid at ${n}`);
      assert.equal(t.includes("Nov 12"), false, `date context at ${n}`);
      assert.equal(/wanted here/i.test(t), false, `eyebrow at ${n}`);
      assert.ok(t.includes("Be the first to offer local guide for travelers in Gion"), `no-count line at ${n}`);
    }
  });

  it("W2: the neighbourhood Wanted panel has no 'Wanted here' eyebrow", () => {
    assert.ok(panelSrc.length > 0, "panel found");
    assert.equal(panelSrc.includes("Wanted here"), false);
  });

  it("W3: the empty-market card has no 'Travelers are looking' line", () => {
    assert.ok(emptyMarketSrc.length > 0, "empty-market card found");
    assert.equal(/Travelers are looking/i.test(emptyMarketSrc), false);
  });

  it("W4: no trending, popular, best, founding or PayPal in either component", () => {
    const card = fs.readFileSync("client/src/components/feed/wanted-slot-card.tsx", "utf8");
    const rendered = [0, 3, 12].map((n) => text(render(<FeedWantedSlotCard item={slot(n)} />))).join(" ");
    for (const banned of [/trending/i, /popular/i, /\bbest\b/i, /founding/i, /paypal/i]) {
      assert.equal(banned.test(rendered), false, `rendered: ${banned}`);
      assert.equal(banned.test(panelSrc), false, `panel: ${banned}`);
      assert.equal(banned.test(card.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), false, `card source: ${banned}`);
    }
  });
});
