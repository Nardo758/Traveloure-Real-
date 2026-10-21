/**
 * G-02: a rendered supply activity card never shows hidden gem, secret, or geisha.
 *
 * Run: npx tsx --test client/src/components/__tests__/partner-activity-card.test.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SignInModalProvider } from "../../contexts/SignInModalContext";
import { CityFeedCardSupply } from "../city-feed-card";
import { partnerPlaces, viatorLiveCards } from "@/lib/browse-supply";

(globalThis as any).React = React;

const PHRASE = /\bhidden\s+gems?\b|\bsecrets?\b|\bgeishas?\b/i;

function render(item: Record<string, unknown>): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        Router as React.ComponentType<{ ssrPath: string; children?: React.ReactNode }>,
        { ssrPath: "/discover/location/Kyoto" },
        React.createElement(
          SignInModalProvider,
          null,
          React.createElement(CityFeedCardSupply, {
            item,
            kind: "supply-activity",
            city: "Kyoto",
          }),
        ),
      ),
    ),
  );
}

test("G02 a supply activity card renders the phrases away, and hides a label that is only one", () => {
  const html = render({
    id: "walk",
    title: "Hidden gems of Kyoto",
    description: "A secret walk through geisha culture.",
    highlights: ["secret lanes"],
  });
  assert.match(html, /Kyoto/);
  assert.match(html, /Walk through culture/);
  assert.equal(PHRASE.test(html), false, html);
  assert.equal(render({ id: "gone", title: "Hidden gem", description: "A secret." }), "");
});

test("G02 browse partner places and live Viator cards drop the phrases", () => {
  const places = partnerPlaces([
    { id: "1", name: "Secret Garden Tour", category: "tour" },
    { id: "2", name: "Hidden gem", category: "tour" },
    { id: "3", name: "Geisha culture evening", category: "tour" },
  ]);
  assert.deepEqual(places.map((p) => p.name), ["Garden Tour", "Culture evening"]);
  assert.equal(PHRASE.test(JSON.stringify(places)), false);

  const cards = viatorLiveCards({
    status: "ok",
    asOf: "2026-10-18T06:00:00Z",
    items: [
      { productCode: "A", title: "Hidden gems of Kyoto" },
      { productCode: "B", title: "Secret" },
    ],
  });
  assert.deepEqual(cards.map((c) => c.title), ["Kyoto"]);
  assert.equal(PHRASE.test(JSON.stringify(cards)), false);
});
