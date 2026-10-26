/**
 * TC-4 — the Trip Card leg's live tier (LD 69; ledger `2026-10-11-tc4-live-directions`; rulings 1–5).
 *
 *   CT1 a leg carrying the server's `liveDirections` draws its link (the server's URL, never one built here) and
 *       the last departure near the stop it leaves; a leg without them draws no tier at all
 *   CT2 an unrouted leg prints its mode and no minutes (audit B8); a routed leg keeps the slip's line with its "checked" provenance
 *   CT3 "A better way there" is drawn read-only (no swap control) only when the card passes the owner's suggestion
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/trip-card-live-tier.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { LegLine } from "../TripCardDays";
import { RIDE_SWAP_CTA } from "@/lib/ride-suggestions";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// An opaque URL: the card renders whatever the server built and builds none itself.
const URL_FROM_SERVER = "https://live-directions.example/route?leg=p2&mode=transit";
const PLAIN = { id: "p1", fromActivityId: "a", toActivityId: "b", recommendedMode: "walk", estimatedDurationMinutes: 12 };
const LIVE = {
  ...PLAIN,
  id: "p2",
  liveDirections: { provider: "google_maps", url: URL_FROM_SERVER, transit: true },
  lastService: { operator: "Keihan", line: "Main Line", station: null, lastDeparture: "23:40" },
};
const ROUTED = {
  ...LIVE,
  id: "r1",
  mode: "transit",
  routed: { line: "Keihan Main Line", fare: null, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } },
};
const RIDE = {
  serviceId: "s1", corridorKey: "k", dayNumber: 1, legId: "p2", fromItemId: "a", toItemId: "b",
  title: "Sagano Romantic Train", departure: "10:02", arrival: "10:27", rideMinutes: 25, walkToMinutes: 5, walkFromMinutes: 6,
  extraMinutes: 12, fare: { adult: 880, currency: "JPY" }, boardingName: null, exitName: null,
} as any;

describe("TC-4 card leg live tier", () => {
  it("CT1 the server's link and the last departure; nothing when the server sent neither", () => {
    const html = renderToString(<LegLine leg={LIVE as any} showMinutes={true} timeZone="Asia/Tokyo" />);
    assert.ok(html.includes(URL_FROM_SERVER.replace(/&/g, "&amp;")), "the href is the server's URL");
    assert.match(text(html), /Train & bus times in Google Maps/);
    assert.match(text(html), /Last departure nearby: Keihan Main Line 23:40/);
    const bare = renderToString(<LegLine leg={PLAIN as any} showMinutes={true} timeZone="Asia/Tokyo" />);
    assert.ok(!bare.includes("card-leg-live-"), "no tier without the server's facts");
  });

  it("CT2 an unrouted leg prints its mode, no minutes; a routed leg keeps its checked provenance", () => {
    const plain = text(renderToString(<LegLine leg={PLAIN as any} showMinutes={true} />));
    assert.match(plain, /Walk/);
    assert.doesNotMatch(plain, /\d+ min/);
    const routed = text(renderToString(<LegLine leg={ROUTED as any} showMinutes={true} timeZone="Asia/Tokyo" />));
    assert.match(routed, /checked/);
    assert.ok(!/est\./.test(routed.split("Train & bus")[0]), "the routed line is not relabelled");
  });

  it("CT3 the better-way line is read-only and drawn only when passed", () => {
    const withRide = text(renderToString(<LegLine leg={LIVE as any} showMinutes={false} ride={RIDE} />));
    assert.match(withRide, /A better way there · Sagano Romantic Train 10:02 · \+12 min · ¥880 per adult/);
    assert.ok(!withRide.includes(RIDE_SWAP_CTA), "no swap control on the card");
    assert.ok(!text(renderToString(<LegLine leg={LIVE as any} showMinutes={false} />)).includes("A better way there"));
  });
});
