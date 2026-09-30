/**
 * trend-display.test.ts — TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`): the ONE
 * Trend-number derivation, its 48-hour freshness gate, and `/api/health`'s age block.
 * Run: npx tsx --test shared/__tests__/trend-display.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayCrowdBand, displayTrendScore, isFreshScore, trendScoreAgeReport } from "../trend-display";

const NOW = new Date("2026-09-29T22:00:00Z");
const H = 3_600_000;
const opts = { confidenceFloor: 0.3, maxAgeHours: 48, now: NOW };

test("D1: a fresh, confident score maps clamp(round(score × 50), 0, 100)", () => {
  assert.equal(displayTrendScore({ score: 1.4, confidence: 0.9, computedAt: NOW }, opts), 70);
  assert.equal(displayTrendScore({ score: 2.071, confidence: 0.9, computedAt: NOW }, opts), 100);
});

test("D2: older than the max age shows NO number (never last month's score)", () => {
  assert.equal(displayTrendScore({ score: 1.4, confidence: 0.9, computedAt: new Date(NOW.getTime() - 49 * H) }, opts), null);
  assert.equal(displayTrendScore({ score: 1.4, confidence: 0.9, computedAt: new Date(NOW.getTime() - 47 * H) }, opts), 70);
});

test("D3: unranked, below the floor, absent, undated or mapped 0 ⇒ null, never 0", () => {
  assert.equal(displayTrendScore(null, opts), null);
  assert.equal(displayTrendScore({ score: null, confidence: 0.9, computedAt: NOW }, opts), null);
  assert.equal(displayTrendScore({ score: 1.4, confidence: 0.2, computedAt: NOW }, opts), null);
  assert.equal(displayTrendScore({ score: 1.4, confidence: 0.9, computedAt: null }, opts), null);
  assert.equal(displayTrendScore({ score: 0.004, confidence: 0.9, computedAt: NOW }, opts), null);
});

test("D4: freshness reads ISO strings and refuses garbage", () => {
  assert.equal(isFreshScore(new Date(NOW.getTime() - H).toISOString(), 48, NOW), true);
  assert.equal(isFreshScore("not a date", 48, NOW), false);
  assert.equal(isFreshScore(undefined, 48, NOW), false);
});

test("D5: the health age block — no row ⇒ no age and no freshness claim", () => {
  assert.deepEqual(trendScoreAgeReport(null, 48, NOW), { newestComputedAt: null, ageHours: null, maxAgeHours: 48, fresh: null });
  const r = trendScoreAgeReport(new Date(NOW.getTime() - 50 * H), 48, NOW);
  assert.equal(r.ageHours, 50);
  assert.equal(r.fresh, false);
  assert.equal(trendScoreAgeReport(new Date(NOW.getTime() - 2 * H).toISOString(), 48, NOW).fresh, true);
});

test("D6: a crowd band shows only when it is a real band, confident and fresh (TravelPulse PR 2)", () => {
  assert.equal(displayCrowdBand({ band: "high", confidence: 0.7, computedAt: NOW }, opts), "high");
  assert.equal(displayCrowdBand({ band: null, confidence: 0.7, computedAt: NOW }, opts), null);
  assert.equal(displayCrowdBand({ band: "packed", confidence: 0.7, computedAt: NOW }, opts), null, "a legacy word is not a band");
  assert.equal(displayCrowdBand({ band: "high", confidence: 0.2, computedAt: NOW }, opts), null);
  assert.equal(displayCrowdBand({ band: "high", confidence: null, computedAt: NOW }, opts), null);
  assert.equal(displayCrowdBand({ band: "high", confidence: 0.7, computedAt: new Date(NOW.getTime() - 49 * H) }, opts), null);
  assert.equal(displayCrowdBand(null, opts), null);
});
