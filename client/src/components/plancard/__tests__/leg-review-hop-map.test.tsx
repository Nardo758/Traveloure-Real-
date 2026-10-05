/**
 * L2-4 — the leg review's hop map (ledger `2026-10-05-leg-review-stepper`).
 *   H1 inline SVG only: two numbered stops and ONE dashed straight line, captioned "stop order, not a
 *      route" — no tile layer, no map component, no image
 *   H2 an unlocated stop draws nothing at all (the step asks for a location instead — §13)
 *   H3 Slice A1 (ledger `2026-10-05-leg-live-hop-path`): with a live route the SAME inline SVG draws
 *      the route solid, no dashed line, captioned as that mode's route with Google's credit; still no
 *      tiles and no image
 *   H4 a mode switch redraws: a different mode's path changes the drawn line and the caption
 *   H5 a route never places an unlocated stop, and a missing route keeps the dashed stop-order line
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/leg-review-hop-map.test.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { HopMap } from "../../plan/LegReviewDrawer";
import { decodePolyline } from "@shared/leg-route-path";

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

const FROM = { lat: 34.967, lng: 135.773 };
const TO = { lat: 34.995, lng: 135.785 };
const WALK_PATH = [FROM, { lat: 34.975, lng: 135.772 }, { lat: 34.985, lng: 135.779 }, TO];
const DRIVE_PATH = [FROM, { lat: 34.969, lng: 135.79 }, { lat: 34.99, lng: 135.795 }, TO];
const plain = (h: string) => h.replace(/<!-- -->/g, "");

test("H3 a live route draws solid, captioned as the mode's route with Google's credit", () => {
  const html = plain(renderToString(<HopMap from={FROM} to={TO} fromName="Fushimi Inari" toName="Kiyomizu-dera" path={WALK_PATH} modeLabel="Walking" />));
  assert.equal((html.match(/<polyline/g) ?? []).length, 1);
  assert.equal((html.match(/<line/g) ?? []).length, 0, "no dashed stop-order line under a route");
  assert.ok(!html.includes("stroke-dasharray"));
  assert.match(html, /data-hop-kind="route"/);
  assert.match(html, /Walking route · 1 Fushimi Inari → 2 Kiyomizu-dera · Route: Google Maps/);
  assert.ok(!html.includes("stop order, not a route"));
  for (const banned of ["leaflet", "tile", "<img", "mapbox"]) assert.ok(!html.toLowerCase().includes(banned), `no ${banned}`);
});

test("H4 a mode switch redraws the line and the caption", () => {
  const walk = plain(renderToString(<HopMap from={FROM} to={TO} fromName="A" toName="B" path={WALK_PATH} modeLabel="Walking" />));
  const drive = plain(renderToString(<HopMap from={FROM} to={TO} fromName="A" toName="B" path={DRIVE_PATH} modeLabel="Driving" />));
  const pointsOf = (h: string) => /<polyline points="([^"]+)"/.exec(h)?.[1];
  assert.ok(pointsOf(walk) && pointsOf(drive));
  assert.notEqual(pointsOf(walk), pointsOf(drive));
  assert.match(walk, /Walking route/);
  assert.match(drive, /Driving route/);
});

test("H5 no invented point, and no route keeps the dashed line", () => {
  assert.equal(renderToString(<HopMap from={{ lat: null, lng: null }} to={TO} fromName="A" toName="B" path={WALK_PATH} modeLabel="Walking" />), "");
  for (const path of [null, [], [FROM]]) {
    const html = plain(renderToString(<HopMap from={FROM} to={TO} fromName="A" toName="B" path={path} modeLabel="Walking" />));
    assert.match(html, /stroke-dasharray="6 5"/);
    assert.match(html, /stop order, not a route/);
  }
  const decoded = decodePolyline("_p~iF");
  assert.equal(decoded, null);
});
