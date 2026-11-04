/**
 * WAIT-1 (ledger `2026-11-04-wait1-all-markets`): the ONE market status, from settings.
 *
 *   T1 launch + beta ⇒ beta; in live ⇒ live; a launch month set and not live/beta ⇒ opening with the month label;
 *      else waitlist. The word "coming" is never produced.
 *   R  the readers' parsers: an absent or bad live list is []; absent or bad launch dates are {}; the validators
 *      refuse unknown markets and malformed months.
 *
 * Run: npx tsx --test shared/__tests__/market-status.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKET_STATUS_COPY,
  liveMarketSlugs,
  liveMarketSlugsRefusal,
  marketLaunchDates,
  marketLaunchDatesRefusal,
  marketStatus,
  marketStatusLabel,
  monthYearLabel,
} from "../ticker";
import { OPERATING_MARKETS } from "../operating-markets";

const S = { launch: "kyoto", live: [] as string[], beta: ["kyoto"], dates: { porto: "2027-03" } as Record<string, string> };

test("T1 the status table", () => {
  assert.equal(marketStatus("kyoto", S), "beta", "the marquee is beta, not live");
  assert.equal(marketStatusLabel("kyoto", S), "Beta");
  assert.equal(marketStatus("kyoto", { ...S, live: ["kyoto"] }), "live");
  assert.equal(marketStatusLabel("kyoto", { ...S, live: ["kyoto"] }), "Live");
  assert.equal(marketStatus("porto", S), "opening");
  assert.equal(marketStatusLabel("porto", S), "Opening March 2027");
  assert.equal(marketStatus("porto", { ...S, beta: ["kyoto", "porto"] }), "beta", "beta wins over a launch month");
  assert.equal(marketStatus("goa", S), "waitlist");
  assert.equal(marketStatusLabel("goa", S), "Join the waitlist");
  for (const m of OPERATING_MARKETS) {
    for (const s of [S, { ...S, live: ["kyoto"] }, { launch: null, live: [], beta: [], dates: {} }]) {
      assert.doesNotMatch(marketStatusLabel(m.marketKey, s), /coming/i, m.marketKey);
    }
  }
  assert.equal(monthYearLabel("2027-12"), "December 2027");
  assert.equal(monthYearLabel("2027-13"), null);
  assert.equal(MARKET_STATUS_COPY.waitlist, "Join the waitlist");
});

test("R the parsers default to empty and the validators refuse bad values", () => {
  assert.deepEqual(liveMarketSlugs(null), []);
  assert.deepEqual(liveMarketSlugs("not json"), []);
  assert.deepEqual(liveMarketSlugs(JSON.stringify(["kyoto", "atlantis", "kyoto"])), ["kyoto"]);
  assert.deepEqual(marketLaunchDates(null), {});
  assert.deepEqual(marketLaunchDates("[]"), {});
  assert.deepEqual(marketLaunchDates(JSON.stringify({ porto: "2027-03", goa: "soon", atlantis: "2027-01" })), { porto: "2027-03" });
  assert.equal(liveMarketSlugsRefusal(JSON.stringify(["kyoto"])), null);
  assert.match(String(liveMarketSlugsRefusal(JSON.stringify(["atlantis"]))), /unknown market/);
  assert.match(String(liveMarketSlugsRefusal("nope")), /live_market_slugs/);
  assert.equal(marketLaunchDatesRefusal(JSON.stringify({ porto: "2027-03" })), null);
  assert.match(String(marketLaunchDatesRefusal(JSON.stringify({ porto: "March" }))), /YYYY-MM/);
  assert.match(String(marketLaunchDatesRefusal(JSON.stringify({ atlantis: "2027-03" }))), /unknown market/);
  assert.match(String(marketLaunchDatesRefusal("[1]")), /JSON object/);
});
