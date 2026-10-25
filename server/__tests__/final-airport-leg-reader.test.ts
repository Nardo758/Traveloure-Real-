/**
 * Row 185 J6 — `readFinalAirportLeg` is the one pure reader of the frozen airport leg.
 * No database. Wrong types become null; the function never throws.
 *
 * Run: npx tsx --test --test-force-exit server/__tests__/final-airport-leg-reader.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFinalAirportLeg, type FinalAirportLeg } from "@shared/trip-card-final";

const flight = {
  time: "14:30",
  airport: "KIX",
  description: "NH 123",
  airportLegMinutes: 47,
};

function good(): FinalAirportLeg {
  return readFinalAirportLeg({
    anchors: { flightArrival: flight, flightDeparture: null },
    airportLeg: { platformCarFits: true },
  })!;
}

test("null for a missing snapshot, a non-object, and anchors that are absent or both null", () => {
  for (const value of [undefined, null, {}, [], "x", 0, { anchors: null }, { anchors: [] }, { anchors: "nope" }]) {
    assert.equal(readFinalAirportLeg(value), null, `expected null for ${JSON.stringify(value)}`);
  }
  assert.equal(
    readFinalAirportLeg({ anchors: { flightArrival: null, flightDeparture: null }, airportLeg: { platformCarFits: true } }),
    null,
    "both directions null is no row, even when airportLeg says true",
  );
});

test("returns the typed value for a good snapshot", () => {
  assert.deepEqual(good(), {
    flightArrival: flight,
    flightDeparture: null,
    platformCarFits: true,
  });
  assert.deepEqual(
    readFinalAirportLeg({
      anchors: {
        flightArrival: null,
        flightDeparture: { time: "18:05", airport: null, description: null, airportLegMinutes: null },
      },
    }),
    {
      flightArrival: null,
      flightDeparture: { time: "18:05", airport: null, description: null, airportLegMinutes: null },
      platformCarFits: false,
    },
  );
});

test("coerces bad field types to null and never throws", () => {
  const read = readFinalAirportLeg({
    anchors: {
      flightArrival: { time: 1400, airport: { code: "KIX" }, description: false, airportLegMinutes: "47" },
      flightDeparture: "nope",
    },
    airportLeg: { platformCarFits: true },
  });
  assert.deepEqual(read, {
    flightArrival: { time: null, airport: null, description: null, airportLegMinutes: null },
    flightDeparture: null,
    platformCarFits: true,
  });
  for (const minutes of [0, -3, 1.5, Number.NaN, true, "12"]) {
    const row = readFinalAirportLeg({
      anchors: { flightArrival: { ...flight, airportLegMinutes: minutes }, flightDeparture: null },
    });
    assert.equal(row?.flightArrival?.airportLegMinutes, null, `minutes ${String(minutes)} is not a positive integer`);
  }
  const evil: Record<string, unknown> = {};
  Object.defineProperty(evil, "anchors", {
    get() {
      throw new Error("boom");
    },
  });
  assert.equal(readFinalAirportLeg(evil), null, "a throwing snapshot reads as absent");
});

test("platformCarFits is true only for boolean true", () => {
  const snap = (platformCarFits: unknown) =>
    readFinalAirportLeg({ anchors: { flightArrival: flight, flightDeparture: null }, airportLeg: { platformCarFits } });
  assert.equal(snap(true)?.platformCarFits, true);
  for (const value of [false, "true", 1, 0, null, undefined, "yes"]) {
    assert.equal(snap(value)?.platformCarFits, false, `not true for ${String(value)}`);
  }
  assert.equal(
    readFinalAirportLeg({ anchors: { flightArrival: flight, flightDeparture: null } })?.platformCarFits,
    false,
    "a missing airportLeg is false",
  );
});
