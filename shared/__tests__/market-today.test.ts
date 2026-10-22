/**
 * SH-1 Launch PR 5 (ledger `2026-10-22-sh1-launch-pr5`): the market's today and the one clamp.
 *
 *   MT1 today is the market's own calendar day; an unknown or absent market reads UTC (Q14.2)
 *   MT2 the clamp keeps a future date and moves a past one to the market's today (Q14.2/Q15.3)
 *   MT3 an event has ended only when every last day (every show, for a series) is before the market's today (Q14.3)
 *   MT4 the server's MARKET_TIMEZONES is this map (one copy, re-exported)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKET_TIMEZONES, clampToMarketToday, eventHasEnded, marketToday } from "../market-today";
import { MARKET_TIMEZONES as SERVER_MAP } from "../../server/services/trend-engine/operating-markets";

// 2027-03-10 23:30 UTC: already 2027-03-11 in Kyoto, still 2027-03-10 in Bogotá.
const NOW = new Date("2027-03-10T23:30:00Z");

test("MT1 the market's own calendar day; UTC without a market", () => {
  assert.equal(marketToday("kyoto", NOW), "2027-03-11");
  assert.equal(marketToday("bogota", NOW), "2027-03-10");
  assert.equal(marketToday(null, NOW), "2027-03-10");
  assert.equal(marketToday("atlantis", NOW), "2027-03-10");
});

test("MT2 the clamp", () => {
  assert.equal(clampToMarketToday("2027-03-09", "kyoto", NOW), "2027-03-11");
  assert.equal(clampToMarketToday("2027-03-11", "kyoto", NOW), "2027-03-11");
  assert.equal(clampToMarketToday("2027-04-01", "kyoto", NOW), "2027-04-01");
  assert.equal(clampToMarketToday("2027-03-09", null, NOW), "2027-03-10");
});

test("MT3 ended means every last day is past in the market", () => {
  assert.equal(eventHasEnded(["2027-03-10"], "kyoto", NOW), true, "yesterday in Kyoto");
  assert.equal(eventHasEnded(["2027-03-10"], "bogota", NOW), false, "still today in Bogotá");
  assert.equal(eventHasEnded(["2027-03-05", "2027-03-20"], "kyoto", NOW), false, "a show still to come");
  assert.equal(eventHasEnded([], "kyoto", NOW), true);
});

test("MT4 one map", () => {
  assert.equal(SERVER_MAP, MARKET_TIMEZONES);
});
