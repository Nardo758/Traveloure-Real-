/**
 * Company pages (Lane B, Sep 27, 2026): the market list is the operating markets, and the stats
 * strips are gone.
 *
 * F1 the display order is exactly the operating markets — a market added or dropped there fails
 * here until it is placed deliberately. F2 the rendered list and count. F3 About and Press no longer
 * read `/api/platform/stats`. F4 Careers carries no form.
 *
 * Run: npx tsx --test client/src/lib/__tests__/company-facts.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { MARKET_DISPLAY_ORDER, marketCountWord, marketNameList, marketsInDisplayOrder } from "../company-facts";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("F1 display order is a permutation of the operating markets", () => {
  assert.deepEqual([...MARKET_DISPLAY_ORDER].sort(), OPERATING_MARKETS.map((m) => m.marketKey).sort());
  assert.equal(MARKET_DISPLAY_ORDER[0], "kyoto");
});

test("F2 the list reads from the operating markets", () => {
  assert.equal(marketsInDisplayOrder().length, OPERATING_MARKETS.length);
  assert.equal(marketCountWord(), "eight");
  assert.equal(marketNameList(), "Kyoto, Edinburgh, Porto, Bogotá, Cartagena, Mumbai, Goa and Jaipur");
});

test("F3 About and Press carry no stats strip", () => {
  for (const rel of ["client/src/pages/about.tsx", "client/src/pages/press.tsx"]) {
    assert.doesNotMatch(read(rel), /\/api\/platform\/stats/, `${rel} must not read platform stats`);
  }
});

test("F4 Careers carries no form", () => {
  assert.doesNotMatch(read("client/src/pages/careers.tsx"), /<form|useMutation|apiRequest/);
});
