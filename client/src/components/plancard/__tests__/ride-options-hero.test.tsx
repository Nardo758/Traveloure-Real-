/**
 * Row 2 ruling (Nov 1, 2026): the Trip Card's Up Next hero reads "Ride options" (approved by Leon) and opens the
 * leg's existing travel-options sheet, read-only; it sends no booking-agent request (that lane is parked behind
 * row 298). The request code is kept, unreachable from the Trip Card.
 *
 *   RO1 the label is the approved string, from one constants object
 *   RO2 the hero mounts RideOptionsButton, not BookRideButton
 *   RO3 the button opens LegSheet read-only (no pick, no booking) and draws only for a routed leg
 *   RO4 BookRideButton and its agent request are kept in the file
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/ride-options-hero.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { UP_NEXT_HERO_COPY } from "@/lib/up-next-hero-copy";

const hero = fs.readFileSync("client/src/components/plancard/UpNextHero.tsx", "utf8");
const button = hero.slice(hero.indexOf("function RideOptionsButton"), hero.indexOf("function HeroLeaveByCells"));
const heroBody = hero.slice(hero.indexOf("export function UpNextHero("));

describe("ride options hero", () => {
  it("RO1 approved label", () => {
    assert.deepEqual({ ...UP_NEXT_HERO_COPY }, { rideOptions: "Ride options" });
    assert.match(button, /\{UP_NEXT_HERO_COPY\.rideOptions\}/);
    assert.doesNotMatch(button + heroBody, /Book this ride/);
  });

  it("RO2 the hero mounts RideOptionsButton only", () => {
    assert.match(heroBody, /<RideOptionsButton tripId=\{tripId\} day=\{day\} leg=\{action\.leg\}/);
    assert.doesNotMatch(heroBody, /<BookRideButton/);
  });

  it("RO3 read-only LegSheet, routed legs only", () => {
    assert.match(button, /<LegSheet/);
    assert.match(button, /canEditItems=\{false\}/);
    assert.match(button, /isOwner=\{false\}/);
    assert.match(button, /if \(!view \|\| view\.kind !== "routed"\) return null;/);
    assert.doesNotMatch(button, /affiliate-booking-requests|mutate\(/);
  });

  it("RO4 the request code is kept", () => {
    assert.match(hero, /export function BookRideButton\(/);
    assert.match(hero, /\/api\/affiliate-booking-requests/);
  });
});
