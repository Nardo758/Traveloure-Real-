/**
 * TC-4 — the last departure near the stop a leg leaves (LD 69; ledger `2026-10-11-tc4-live-directions`; ruling 1).
 *
 *   LV1 among stations within 1.2 km of the stop LEFT, the earliest last departure that day wins; a farther
 *       station, an off-weekday row and an out-of-validity row are never read
 *   LV2 no station qualifies ⇒ null (§13 — nothing is guessed)
 *
 * Run: npx tsx --test shared/__tests__/live-directions.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leavingLastService } from "../live-directions";

const FROM = { lat: 35.0, lng: 135.78 };
const row = (dLat: number, v: Record<string, unknown>) => ({
  lat: FROM.lat + dLat,
  lng: FROM.lng,
  value: { operator: "Keihan", line: "Main Line", station: null, lastDeparture: "23:40", weekdays: [1], validFrom: "2027-01-01", validTo: "2027-12-31", ...v },
});
const MONDAY = "2027-11-08";

test("LV1 the earliest last departure within walking range of the stop left, that day", () => {
  const services = [
    row(0.002, { lastDeparture: "23:40" }),
    row(0.004, { operator: "Kyoto City Bus", line: "206", lastDeparture: "22:15" }),
    row(0.05, { lastDeparture: "21:00" }), // ~5.5 km away: never read
    row(0.001, { lastDeparture: "20:00", weekdays: [2] }), // a Tuesday-only row
    row(0.001, { lastDeparture: "19:00", validTo: "2027-06-30" }), // expired by that date
  ];
  assert.deepEqual(leavingLastService(services, FROM, MONDAY), { operator: "Kyoto City Bus", line: "206", station: null, lastDeparture: "22:15" });
  assert.deepEqual(
    leavingLastService([row(0.001, { lastDeparture: "00:20" }), row(0.002, { lastDeparture: "23:50" })], FROM, MONDAY)?.lastDeparture,
    "23:50",
    "a departure after midnight counts as later than one before it",
  );
});

test("LV2 no qualifying station ⇒ null", () => {
  assert.equal(leavingLastService([], FROM, MONDAY), null);
  assert.equal(leavingLastService([row(0.05, {})], FROM, MONDAY), null);
  assert.equal(leavingLastService([row(0.001, { operator: "" })], FROM, MONDAY), null, "an unparseable row is not read");
});
