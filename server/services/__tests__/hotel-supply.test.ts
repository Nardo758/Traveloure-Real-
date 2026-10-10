/**
 * Item 3 (ledger `2026-10-10-health-hotel-supply`): `/api/health` `supply.hotels`, report only.
 *
 *   HS1 a market's line counts the ranker's rows by source and flags `low` under the threshold
 *   HS2 a failed read is `rankable: null`, `low: null` — never "0, low" (§13)
 *   HS3 every operating market is reported, keyed by marketKey, with the configured threshold
 *   HS4 HOTEL_SUPPLY_MIN: default 20; a non-positive or non-integer value reads the default
 *   HS5 source: the count reads the ranker's ONE reader (`cityHotels`) and the health route carries `supply`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { HOTEL_SUPPLY_MIN_DEFAULT, hotelSupplyMin } from "../../config/hotel-supply.config";
import { marketHotelSupply, readHotelSupply } from "../hotel-supply.service";

const rows = (p: number, h: number, a: number) => [
  ...Array.from({ length: p }, () => ({ kind: "platform" as const })),
  ...Array.from({ length: h }, () => ({ kind: "hotel_cache" as const })),
  ...Array.from({ length: a }, () => ({ kind: "affiliate" as const })),
];

test("HS1 counts by source and flags low under the threshold", () => {
  assert.deepEqual(marketHotelSupply(rows(1, 12, 3), 20), { rankable: 16, low: true, bySource: { platform: 1, hotel_cache: 12, affiliate: 3 } });
  assert.equal(marketHotelSupply(rows(0, 20, 0), 20).low, false);
  assert.deepEqual(marketHotelSupply([], 20), { rankable: 0, low: true, bySource: { platform: 0, hotel_cache: 0, affiliate: 0 } });
});

test("HS2 a failed read claims nothing", () => {
  assert.deepEqual(marketHotelSupply(null, 20), { rankable: null, low: null, bySource: null });
});

test("HS3 every operating market, with the configured threshold", async () => {
  const report = await readHotelSupply({
    env: { HOTEL_SUPPLY_MIN: "5" },
    read: async (city) => {
      if (city === "Goa") throw new Error("down");
      return city === "Kyoto" ? rows(0, 30, 0) : rows(0, 2, 0);
    },
  });
  assert.equal(report.min, 5);
  assert.deepEqual(Object.keys(report.markets).sort(), OPERATING_MARKETS.map((m) => m.marketKey).sort());
  assert.equal(report.markets.kyoto.low, false);
  assert.equal(report.markets.goa.rankable, null);
  assert.equal(report.markets.mumbai.low, true);
});

test("HS4 HOTEL_SUPPLY_MIN defaults to 20", () => {
  assert.equal(HOTEL_SUPPLY_MIN_DEFAULT, 20);
  assert.equal(hotelSupplyMin({}), 20);
  assert.equal(hotelSupplyMin({ HOTEL_SUPPLY_MIN: "35" }), 35);
  for (const bad of ["0", "-3", "1.5", "abc", " "]) assert.equal(hotelSupplyMin({ HOTEL_SUPPLY_MIN: bad }), 20, bad);
});

test("HS5 one reader, and the health route reports it", () => {
  const svc = readFileSync(new URL("../hotel-supply.service.ts", import.meta.url), "utf8");
  assert.match(svc, /import \{ cityHotels \} from "\.\/where-to-stay\.service"/);
  assert.doesNotMatch(svc, /hotelCache|hotel_cache\s*WHERE|from\(hotelCache\)/);
  const route = readFileSync(new URL("../../routes/content.routes.ts", import.meta.url), "utf8");
  assert.match(route, /supply = \{ hotels: await readHotelSupply\(\)\.catch\(\(\) => null\) \}/);
});
