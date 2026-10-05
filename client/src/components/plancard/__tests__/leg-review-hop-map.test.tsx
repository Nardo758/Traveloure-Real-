/**
 * L2-4 — the leg review's hop map (ledger `2026-10-05-leg-review-stepper`).
 *   H1 inline SVG only: two numbered stops and ONE dashed straight line, captioned "stop order, not a
 *      route" — no tile layer, no map component, no image
 *   H2 an unlocated stop draws nothing at all (the step asks for a location instead — §13)
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/leg-review-hop-map.test.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { HopMap } from "../../plan/LegReviewDrawer";

(globalThis as any).React = React;

test("H1 two stops, one dashed straight line, labelled as order", () => {
  const html = renderToString(
    <HopMap from={{ lat: 34.967, lng: 135.773 }} to={{ lat: 34.995, lng: 135.785 }} fromName="Fushimi Inari" toName="Kiyomizu-dera" />,
  );
  assert.match(html, /<svg/);
  assert.equal((html.match(/<line/g) ?? []).length, 1);
  assert.match(html, /stroke-dasharray="6 5"/);
  assert.equal((html.match(/<circle/g) ?? []).length, 2);
  assert.match(html.replace(/<!-- -->/g, ""), /stop order, not a route/);
  for (const banned of ["leaflet", "tile", "<img", "mapbox", "google"]) {
    assert.ok(!html.toLowerCase().includes(banned), `no ${banned}`);
  }
});

test("H2 an unlocated stop draws no map", () => {
  assert.equal(renderToString(<HopMap from={{ lat: null, lng: null }} to={{ lat: 34.99, lng: 135.78 }} fromName="A" toName="B" />), "");
  assert.equal(renderToString(<HopMap from={{ lat: 0, lng: 0 }} to={{ lat: 34.99, lng: 135.78 }} fromName="A" toName="B" />), "");
});
