/**
 * R-i (surface step 3): the airport ↔ lodging LegRow, rendered with fake anchors.
 *   L1 it renders only with a flight in that direction AND a stay
 *   L2 modes in order — platform private car only when one fits the party, then rail, then transfer
 *   L3 the line names the airport the anchor names (or "Airport") and the stay, direction-aware
 *   L4 the owner gets Book (agent request for rail/transfer, the drivers browse for a private car);
 *      a reader gets none; no minutes or distance are printed
 *   L5 listingFitsParty: no cap fits; a cap below the party does not; an unstated party fits
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/airport-leg.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { airportLegLine, airportLegModes, listingFitsParty, showsAirportLeg } from "@shared/airport-leg";
import { LegRow } from "../../plan/LegRow";
import { flightAnchorFor } from "../../plan/AnchorRow";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const ANCHORS = [
  { anchorType: "flight_arrival", anchorDatetime: "2026-11-11T09:35:00", location: "KIX", description: "JL 61 · HND → KIX" },
];

describe("airport leg", () => {
  it("L1 renders only with a flight AND a stay", () => {
    const arr = flightAnchorFor(ANCHORS, "flight_arrival");
    const dep = flightAnchorFor(ANCHORS, "flight_departure");
    assert.equal(showsAirportLeg({ hasFlight: !!arr, stayName: "Hotel Kanra" }), true);
    assert.equal(showsAirportLeg({ hasFlight: !!dep, stayName: "Hotel Kanra" }), false, "no departure flight");
    assert.equal(showsAirportLeg({ hasFlight: !!arr, stayName: null }), false, "no stay");
    assert.equal(showsAirportLeg({ hasFlight: !!arr, stayName: "  " }), false);
  });

  it("L2 modes in R-i's order", () => {
    assert.deepEqual(airportLegModes({ platformCarFits: true }), ["private_car", "rail", "affiliate_transfer"]);
    assert.deepEqual(airportLegModes({ platformCarFits: false }), ["rail", "affiliate_transfer"]);
  });

  it("L3 the line", () => {
    assert.equal(airportLegLine("arrival", "Hotel Kanra", "KIX"), "KIX → Hotel Kanra");
    assert.equal(airportLegLine("departure", "Hotel Kanra", null), "Hotel Kanra → Airport");
  });

  it("L4 owner Book vs reader; no minutes", () => {
    const props = {
      direction: "arrival" as const,
      stayName: "Hotel Kanra",
      airport: "KIX",
      modes: airportLegModes({ platformCarFits: true }),
      driversHref: "/discover?category=private_transportation",
    };
    const owner = renderToString(React.createElement(Router, { ssrPath: "/" }, React.createElement(LegRow, { ...props, canBook: true })));
    assert.match(owner, /data-testid="slip-leg-airport-arrival"/);
    assert.match(text(owner), /KIX → Hotel Kanra/);
    assert.ok(text(owner).indexOf("Private car") < text(owner).indexOf("Train"));
    assert.ok(text(owner).indexOf("Train") < text(owner).indexOf("Airport transfer"));
    assert.match(owner, /slip-leg-book-arrival-private_car[^>]*href="\/discover\?category=private_transportation"|href="\/discover\?category=private_transportation"[^>]*slip-leg-book-arrival-private_car/);
    assert.match(owner, /<button[^>]*data-testid="slip-leg-book-arrival-rail"/);
    assert.match(owner, /<button[^>]*data-testid="slip-leg-book-arrival-affiliate_transfer"/);
    assert.doesNotMatch(text(owner), /\b\d+\s*(min|minutes|km|mi)\b/);
    const reader = renderToString(React.createElement(Router, { ssrPath: "/" }, React.createElement(LegRow, { ...props, canBook: false })));
    assert.doesNotMatch(reader, /slip-leg-book-/);
  });

  it("L5 listingFitsParty", () => {
    assert.equal(listingFitsParty(null, 4), true);
    assert.equal(listingFitsParty(3, 4), false);
    assert.equal(listingFitsParty(6, 4), true);
    assert.equal(listingFitsParty(3, null), true);
  });
});
