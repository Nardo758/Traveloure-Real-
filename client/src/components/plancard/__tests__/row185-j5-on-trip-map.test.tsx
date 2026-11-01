/**
 * Row 185 J5, screen: the Trip Card's on-trip map draws the ONE server projection and computes nothing.
 *
 *   M1 no projection, or one with nothing to draw, renders nothing
 *   M2 three toggleable layers, each shown only when the projection carries it; all start on
 *   M3 the leave-by line shows the server's "HH:MM" verbatim and only with a leg
 *   M4 the screen reads no device position and no Google source; the canvas draws no line and
 *      carries the OpenStreetMap attribution
 *   M5 the Trip Card mounts it on the card surface from `plancardData.onTripMap`; Navigate links stay
 *   M6 every new string is a HELD placeholder
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row185-j5-on-trip-map.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { OnTripMapPanel } from "../OnTripMap";
import { ON_TRIP_MAP_COPY, ON_TRIP_MAP_DEFAULT_LAYERS } from "@/lib/on-trip-map-copy";
import type { OnTripMap } from "@shared/on-trip-map";

(globalThis as any).React = React;
const html = (map: OnTripMap | null | undefined) => renderToString(<OnTripMapPanel map={map} />);
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const full: OnTripMap = {
  day: "2027-05-02",
  stops: [
    { id: "a", lat: 35.0037, lng: 135.7788 },
    { id: "b", lat: 35.0116, lng: 135.7681 },
  ],
  stay: { itemId: "s", lat: 35.0, lng: 135.76 },
  leg: { id: "leg1", fromItemId: "a", toItemId: "b", leaveBy: "13:35" },
};

describe("row 185 J5 on-trip map", () => {
  it("M1 nothing to draw renders nothing", () => {
    assert.equal(html(null), "");
    assert.equal(html(undefined), "");
    assert.equal(html({ day: "2027-05-02", stops: [], stay: null, leg: null }), "");
  });

  it("M2 three layers, present ones only, all on", () => {
    const h = html(full);
    for (const k of ["stops", "stay", "leg"]) assert.match(h, new RegExp(`data-testid="on-trip-map-toggle-${k}"[^>]*`));
    assert.equal((h.match(/aria-pressed="true"/g) ?? []).length, 3);
    assert.deepEqual({ ...ON_TRIP_MAP_DEFAULT_LAYERS }, { stops: true, stay: true, leg: true });
    const noStay = html({ ...full, stay: null, leg: null });
    assert.doesNotMatch(noStay, /on-trip-map-toggle-stay|on-trip-map-toggle-leg/);
    assert.match(noStay, /on-trip-map-toggle-stops/);
  });

  it("M3 leave-by is the server's time, and only with a leg", () => {
    assert.match(html(full), /data-testid="on-trip-map-leave-by"[\s\S]*13:35/);
    assert.doesNotMatch(html({ ...full, leg: null }), /on-trip-map-leave-by/);
  });

  it("M4 no device position, no Google, no line; OSM attribution", () => {
    for (const f of ["client/src/components/plancard/OnTripMap.tsx", "client/src/components/plancard/OnTripMapCanvas.tsx"]) {
      const src = strip(fs.readFileSync(f, "utf8"));
      assert.doesNotMatch(src, /geolocation|watchPosition|getCurrentPosition|google|places|geocode|Polyline/i, f);
    }
    assert.match(fs.readFileSync("client/src/components/plancard/OnTripMapCanvas.tsx", "utf8"), /ON_TRIP_MAP_OSM_ATTRIBUTION/);
    assert.match(fs.readFileSync("client/src/lib/on-trip-map-copy.ts", "utf8"), /© OpenStreetMap contributors/);
  });

  it("M5 mounted on the card surface from the projection; Navigate links kept", () => {
    const card = fs.readFileSync("client/src/components/plancard/PlanCard.tsx", "utf8");
    assert.match(card, /\{cardSurface \? \([\s\S]*?<OnTripMapPanel map=\{plancardData\?\.onTripMap \?\? null\} \/>[\s\S]*?<TripCardDays/);
    const lib = fs.readFileSync("client/src/lib/trip-card.ts", "utf8");
    assert.match(lib, /export function navigateHref/);
    assert.match(lib, /export function dayNavigateHref/);
  });

  it("M6 every new string is HELD", () => {
    for (const v of Object.values(ON_TRIP_MAP_COPY)) assert.equal(v, "[HELD for Leon]");
  });
});
