/**
 * Row 185 J6 (client half): the airport ↔ stay row on the Trip Card, from the trip_finals snapshot only
 * (`plancard.finalAirportLeg`, #1701), through the shared LegRow — no live read, no recompute, no Book.
 *   TA1 cardAirportLegs: arrival only, departure only, both; no stay; absent; non-owner
 *   TA2 modes follow platformCarFits; minutes only when the frozen minutes are positive
 *   TA3 the card renders slip-leg-airport-arrival before day 1's first stop and -departure after the last
 *       day's last stop, owner only, with no Book
 *   TA4 the card reads no anchors or airport-leg route of its own
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/trip-card-airport-row.test.tsx
 */
import "./node-navigator-stub";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { cardAirportLegs } from "@/lib/trip-card";
import { TripCardDays } from "../TripCardDays";
import type { FinalAirportLeg, FrozenFlight } from "@shared/trip-card-final";

(globalThis as any).React = React;

const flight = (over: Partial<FrozenFlight> = {}): FrozenFlight => ({ time: "09:35", airport: "KIX", description: "JL 61", airportLegMinutes: 75, ...over });
const leg = (over: Partial<FinalAirportLeg> = {}): FinalAirportLeg => ({ flightArrival: flight(), flightDeparture: flight({ time: "18:10", airportLegMinutes: 80 }), platformCarFits: false, ...over });

const act = (id: string, name: string, type = "activity", extra: Record<string, unknown> = {}) => ({ id, name, type, time: "10:00", ...extra });
const DAYS = [
  { dayNum: 1, date: "Wed, Nov 11", dateIso: "2026-11-11", activities: [act("s1", "Hotel Kanra", "accommodation"), act("a1", "Fushimi Inari"), act("a2", "Tofuku-ji")], transports: [] },
  { dayNum: 2, date: "Thu, Nov 12", dateIso: "2026-11-12", activities: [act("b1", "Kinkaku-ji"), act("b2", "Nishiki Market")], transports: [] },
];
const NO_STAY = DAYS.map((d) => ({ ...d, activities: d.activities.filter((a) => a.type !== "accommodation") }));

describe("cardAirportLegs", () => {
  it("TA1 arrival only, departure only, both; no stay, absent or non-owner ⇒ none", () => {
    const both = cardAirportLegs(DAYS, leg(), { isOwner: true });
    assert.deepEqual(both.arrival, { stayName: "Hotel Kanra", airport: "KIX", modes: ["rail", "affiliate_transfer"], routedMinutes: 75 });
    assert.deepEqual(both.departure, { stayName: "Hotel Kanra", airport: "KIX", modes: ["rail", "affiliate_transfer"], routedMinutes: 80 });

    const arrOnly = cardAirportLegs(DAYS, leg({ flightDeparture: null }), { isOwner: true });
    assert.ok(arrOnly.arrival);
    assert.equal(arrOnly.departure, null);
    const depOnly = cardAirportLegs(DAYS, leg({ flightArrival: null }), { isOwner: true });
    assert.equal(depOnly.arrival, null);
    assert.ok(depOnly.departure);

    for (const [label, out] of [
      ["no stay", cardAirportLegs(NO_STAY, leg(), { isOwner: true })],
      ["absent", cardAirportLegs(DAYS, undefined, { isOwner: true })],
      ["null", cardAirportLegs(DAYS, null, { isOwner: true })],
      ["non-owner", cardAirportLegs(DAYS, leg(), { isOwner: false })],
    ] as const) {
      assert.deepEqual(out, { arrival: null, departure: null }, label);
    }
  });

  it("TA2 modes follow platformCarFits; minutes are the frozen value or null", () => {
    assert.deepEqual(cardAirportLegs(DAYS, leg({ platformCarFits: true }), { isOwner: true }).arrival?.modes, ["private_car", "rail", "affiliate_transfer"]);
    assert.deepEqual(cardAirportLegs(DAYS, leg({ platformCarFits: false }), { isOwner: true }).arrival?.modes, ["rail", "affiliate_transfer"]);
    assert.equal(cardAirportLegs(DAYS, leg({ flightArrival: flight({ airportLegMinutes: null }) }), { isOwner: true }).arrival?.routedMinutes, null);
    assert.equal(cardAirportLegs(DAYS, leg({ flightArrival: flight({ airport: null }) }), { isOwner: true }).arrival?.airport, null);
  });
});

function renderCard(props: Record<string, unknown>): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToString(
    React.createElement(
      Router as any,
      { ssrPath: "/" },
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(TripCardDays, {
          tripId: "t",
          destination: "Kyoto",
          days: DAYS,
          timeZone: "Asia/Tokyo",
          optimized: true,
          showTravelMinutes: true,
          advisorName: null,
          // Day 1 open by default (today is before the trip), so its rows render; day 2 is checked via open state below.
          now: new Date("2026-11-01T01:00:00Z"),
          ...props,
        } as any),
      ),
    ),
  );
}

describe("the Trip Card rows", () => {
  it("TA3 owner: arrival before day 1's first stop; departure after the last day's last stop; no Book", () => {
    const html = renderCard({ isOwner: true, finalAirportLeg: leg() });
    assert.match(html, /data-testid="slip-leg-airport-arrival"/);
    const arrivalAt = html.indexOf('data-testid="slip-leg-airport-arrival"');
    const firstStopAt = html.indexOf("Fushimi Inari");
    assert.ok(arrivalAt >= 0 && firstStopAt > arrivalAt, "the arrival row comes before day 1's first stop");
    assert.match(html, /data-testid="slip-leg-airport-arrival-minutes"/);
    assert.doesNotMatch(html, /slip-leg-book-/, "no Book on the card");
    // The departure row is in day 2's block, after its last stop (rendered when that day is open).
    const day2 = renderCard({ isOwner: true, finalAirportLeg: leg(), now: new Date("2026-11-12T01:00:00Z") });
    assert.match(day2, /data-testid="slip-leg-airport-departure"/);
    assert.ok(day2.indexOf('data-testid="slip-leg-airport-departure"') > day2.indexOf("Nishiki Market"), "after the last day's last stop");
    // No minutes when the frozen value is null.
    const noMin = renderCard({ isOwner: true, finalAirportLeg: leg({ flightArrival: flight({ airportLegMinutes: null }) }) });
    assert.match(noMin, /data-testid="slip-leg-airport-arrival"/);
    assert.doesNotMatch(noMin, /slip-leg-airport-arrival-minutes/);
  });

  it("TA3b non-owner, absent finalAirportLeg or no stay ⇒ no airport row", () => {
    for (const props of [
      { isOwner: false, finalAirportLeg: leg() },
      { isOwner: true },
      { isOwner: true, finalAirportLeg: null },
    ]) {
      assert.doesNotMatch(renderCard(props), /slip-leg-airport-/, JSON.stringify(props));
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const noStay = renderToString(
      React.createElement(Router as any, { ssrPath: "/" }, React.createElement(QueryClientProvider, { client: qc }, React.createElement(TripCardDays, { tripId: "t", destination: "Kyoto", days: NO_STAY, timeZone: "Asia/Tokyo", optimized: true, showTravelMinutes: true, advisorName: null, isOwner: true, finalAirportLeg: leg(), now: new Date("2026-11-01T01:00:00Z") } as any))),
    );
    assert.doesNotMatch(noStay, /slip-leg-airport-/);
  });

  it("TA4 the card adds no read: no anchors or airport-leg query, and the frozen value comes from the plancard", () => {
    const src = fs.readFileSync("client/src/components/plancard/TripCardDays.tsx", "utf8");
    assert.doesNotMatch(src, /\/anchors|airport-leg|flightAnchorFor/, "no anchors or airport-leg read on the card");
    assert.equal((src.match(/useQuery</g) ?? []).length, 2, "the card's two existing reads only");
    assert.match(src, /cardAirportLegs\(days, props\.finalAirportLeg, \{ isOwner: props\.isOwner \}\)/);
    assert.equal((src.match(/canBook=\{false\}/g) ?? []).length, 2);
    assert.doesNotMatch(src, /onRequest=|driversHref=/);
    assert.match(fs.readFileSync("client/src/components/plancard/PlanCard.tsx", "utf8"), /finalAirportLeg=\{plancardData\?\.finalAirportLeg \?\? null\}/);
  });
});
