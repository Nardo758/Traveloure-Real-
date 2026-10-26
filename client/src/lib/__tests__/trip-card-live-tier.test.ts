/**
 * TC-4 — the card leg's live-tier words (LD 69; ledger `2026-10-11-tc4-live-directions`).
 *
 *   LT1 the link's label promises train and bus only when the server's link asks Maps for transit
 *   LT2 the last-departure line names operator, line (else station) and the stated time
 *
 * Run: npx tsx --test client/src/lib/__tests__/trip-card-live-tier.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_DIRECTIONS_LABEL, LIVE_DIRECTIONS_TRANSIT_LABEL, lastServiceLine, liveDirectionsLabel } from "../trip-card";

test("LT1 the link label follows the link's own transit flag", () => {
  assert.equal(liveDirectionsLabel({ transit: true }), LIVE_DIRECTIONS_TRANSIT_LABEL);
  assert.equal(liveDirectionsLabel({ transit: false }), LIVE_DIRECTIONS_LABEL);
});

test("LT2 operator + line (else station) + time", () => {
  assert.equal(lastServiceLine({ operator: "Keihan", line: "Main Line", station: "Gion-Shijo", lastDeparture: "23:40" }), "Last departure nearby: Keihan Main Line 23:40");
  assert.equal(lastServiceLine({ operator: "Kyoto City Bus", line: null, station: "Kiyomizu-michi", lastDeparture: "22:15" }), "Last departure nearby: Kyoto City Bus Kiyomizu-michi 22:15");
});
