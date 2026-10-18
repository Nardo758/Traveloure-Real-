/**
 * LG-1 item 5 — "checked" dates in the plan's zone (ledger `2026-10-17-lg1-checked-day-plan-tz`). Pure.
 *
 *   CD1  a fetch at 21:57Z on 17 Oct reads "18 Oct" in Asia/Tokyo and "17 Oct" with no zone (the UTC day)
 *   CD2  the fact provenance line and the public attribution read the same day in the plan's zone as the
 *        routed-leg label does — one day for one instant on every surface
 *   CD3  an unknown zone reads as the UTC day (never a throw)
 *
 * Run: npx tsx --test shared/__tests__/lg1-checked-day.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkedDayLabel, factProvenanceLine, publicFactAttribution } from "../content-facts";
import { routeProvenanceLabel } from "../routing-engine";

const AT = "2026-10-17T21:57:00Z";
const NOW = new Date("2026-10-18T01:00:00Z");

test("CD1: 21:57Z on 17 Oct is 18 Oct in Tokyo, 17 Oct as the UTC day", () => {
  assert.equal(checkedDayLabel(new Date(AT), "Asia/Tokyo"), "18 Oct 2026");
  assert.equal(checkedDayLabel(new Date(AT), null), "17 Oct 2026");
  assert.equal(checkedDayLabel(new Date(AT), "Asia/Tokyo", { year: false }), "18 Oct");
});

test("CD2: facts, public attribution and the routed-leg label read the same day in the plan's zone", () => {
  const line = factProvenanceLine({ origin: "places_api", fetchedAt: AT, expiresAt: "2026-11-16T21:57:00Z" } as any, NOW, "Asia/Tokyo");
  assert.equal(line, "Google Maps · checked 18 Oct 2026");
  const credit = publicFactAttribution(
    {
      origin: "crawled",
      license: "official",
      fetchedAt: AT,
      factType: "hours",
      sourceLicenseClass: "official",
      sourcePublicOk: true,
      sourceName: "Kiyomizu-dera",
      sourceUrl: "https://www.kiyomizudera.or.jp/en/",
    } as any,
    "Asia/Tokyo",
  );
  assert.equal(credit?.checked, "checked 18 Oct 2026");
  assert.equal(routeProvenanceLabel({ source: "osrm", checkedAt: AT }, "Asia/Tokyo"), "© OpenStreetMap contributors · checked 18 Oct");
});

test("CD3: an unknown zone reads as the UTC day", () => {
  assert.equal(checkedDayLabel(new Date(AT), "Not/AZone"), "17 Oct 2026");
});
