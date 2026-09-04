/**
 * OPERATING_MARKET_DESTINATIONS — gap 6 of the Ways-to-Earn audit
 * (ledger `2026-09-04-earn-contained-fixes`).
 *
 * WHY THIS EXISTS. The expert application's destination picker carried its own
 * hardcoded ten cities and **Kyoto — the flagship launch market — was not among
 * them**, so an applicant literally could not say they cover the city the platform
 * most needs covered. The fix is not a corrected second list; it is READING the one
 * that already exists. This test holds that it stays derived: a market added or
 * renamed in `OPERATING_MARKETS` must appear here with no second edit, and nothing
 * may appear here that is not an operating market.
 *
 * Run: npx tsx --test shared/__tests__/operating-market-destinations.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OPERATING_MARKETS, OPERATING_MARKET_DESTINATIONS } from "../operating-markets";

describe("operating-market destinations", () => {
  it("has exactly one entry per operating market, in the same order", () => {
    assert.equal(OPERATING_MARKET_DESTINATIONS.length, OPERATING_MARKETS.length);
    OPERATING_MARKETS.forEach((m, i) => {
      assert.equal(OPERATING_MARKET_DESTINATIONS[i], `${m.cityName}, ${m.country}`);
    });
  });

  it("includes Kyoto — the omission the audit found", () => {
    assert.ok(
      OPERATING_MARKET_DESTINATIONS.includes("Kyoto, Japan"),
      "the flagship launch market must be offerable",
    );
  });

  it("names no city that is not an operating market", () => {
    const known = new Set(OPERATING_MARKETS.map((m) => `${m.cityName}, ${m.country}`));
    for (const d of OPERATING_MARKET_DESTINATIONS) {
      assert.ok(known.has(d), `"${d}" is not an operating market`);
    }
  });

  it("has no duplicates and no blank labels", () => {
    const seen = new Set<string>();
    for (const d of OPERATING_MARKET_DESTINATIONS) {
      assert.ok(d.trim().length > 0, "blank destination label");
      assert.ok(!seen.has(d), `duplicate destination "${d}"`);
      seen.add(d);
    }
  });
});
