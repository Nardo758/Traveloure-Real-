/**
 * Row 193 (CB-2026-10-25-A): the Optimize comparison page carries no TravelPulse reads or blocks,
 * and its replacement context line says nothing when the plan has no busy-day flags (row 58) and
 * no stated budget.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUSY_AROUND_DATES_LABEL, busyAroundDatesLine } from "../comparison-context";

const PAGE = readFileSync("client/src/pages/itinerary-comparison.tsx", "utf8");

describe("row 193: the comparison page drops the destination reads", () => {
  it("CC1: the page source names none of travelpulse / pulse / crowd / destination intel", () => {
    assert.doesNotMatch(PAGE, /travelpulse|pulse|crowd|destination intel/i);
  });

  it("CC2: the busy line renders nothing without busy-day data", () => {
    assert.equal(busyAroundDatesLine(undefined), null);
    assert.equal(busyAroundDatesLine([]), null);
    // No flag on any day (no admin window, no holiday) ⇒ nothing.
    assert.equal(busyAroundDatesLine([{ date: "Tue, Oct 13", dateIso: "2026-10-13" }]), null);
    // A flag on a day with no calendar date (unconfirmed dates) ⇒ nothing.
    assert.equal(
      busyAroundDatesLine([{ date: "Day 1", dateIso: null, busyBus: { reason: "Golden Week", cityName: "Kyoto" } }]),
      null,
    );
    // The page omits the whole block when neither line exists — no placeholder.
    assert.match(PAGE, /const busyLine = busyAroundDatesLine\(slipPlancard\?\.days\);/);
    assert.match(PAGE, /const budgetLine = planBudgetLine\(slipPlancard\?\.events\);/);
    assert.match(PAGE, /if \(!busyLine && !budgetLine\) return null;/);
  });

  it("CC3: flagged days read as dated reasons", () => {
    assert.equal(
      busyAroundDatesLine([
        { date: "Wed, Apr 29", dateIso: "2027-04-29", busyBus: { reason: "Golden Week", cityName: "Kyoto" } },
        { date: "Thu, Apr 30", dateIso: "2027-04-30" },
        { date: "Mon, Jul 19", dateIso: "2027-07-19", busyBus: { reason: "national holiday", cityName: "Kyoto" } },
      ]),
      "Busy around your dates: Wed, Apr 29 (Golden Week) · Mon, Jul 19 (national holiday)",
    );
  });

  it("CC4: the new wording names no trending, pulse, crowds, Destination Intelligence or AI", () => {
    assert.doesNotMatch(BUSY_AROUND_DATES_LABEL, /trending|pulse|crowd|destination intelligence|\bAI\b/i);
  });
});
