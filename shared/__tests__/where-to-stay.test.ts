/**
 * "Where to stay" scoring — pure (smoke test 4, item 5; ledger `2026-10-02-smoke4-draft-fixes`).
 *
 * Fixture: a five-day Kyoto plan. Days 1, 2, 4 and 5 sit around Gion and Higashiyama; day 3 is in
 * Arashiyama. Four neighbourhood centroids.
 *
 *   W1 Gion ranks first, "closest to 4 of your 5 days"; Arashiyama second, "closest to 1 of your 5 days"
 *   W2 only the top three are returned, and the third is the nearest overall with no day of its own
 *   W3 §13 — a day with no located item is not in the denominator; no located day ⇒ nothing ranked
 *   W4 a travel-time cost orders the ranking and is reported as such; the output carries no number
 *   W5 a cost that cannot answer a pair falls back to straight line for the whole ranking
 *   W6 hotels land in the neighbourhood nearest them, nearest first, unlocated hotels never placed
 *
 * Run: npx tsx --test shared/__tests__/where-to-stay.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hotelsByNeighborhood,
  rankStayNeighborhoods,
  stayReason,
  type StayDay,
  type StayNeighborhood,
} from "../where-to-stay";

const N: StayNeighborhood[] = [
  { slug: "gion", name: "Gion", lat: 35.0037, lng: 135.7788 },
  { slug: "arashiyama", name: "Arashiyama", lat: 35.0094, lng: 135.6668 },
  { slug: "kyoto-station", name: "Kyoto Station", lat: 34.9858, lng: 135.7588 },
  { slug: "kurama", name: "Kurama", lat: 35.117, lng: 135.77 },
];

const gionish = (dLat: number, dLng: number) => ({ lat: 35.0037 + dLat, lng: 135.7788 + dLng });
const DAYS: StayDay[] = [
  { dayNumber: 1, points: [gionish(0.002, 0.001), gionish(-0.003, 0.002), gionish(0.001, -0.002)] },
  { dayNumber: 2, points: [gionish(0.004, 0.003), gionish(-0.002, -0.001)] },
  { dayNumber: 3, points: [{ lat: 35.0156, lng: 135.6774 }, { lat: 35.0094, lng: 135.6668 }] },
  { dayNumber: 4, points: [gionish(-0.001, 0.004)] },
  { dayNumber: 5, points: [gionish(0.003, -0.003), gionish(0.002, 0.002)] },
];

test("W1 Gion is closest to 4 of the 5 days, Arashiyama to 1", () => {
  const { ranked, basis } = rankStayNeighborhoods({ neighborhoods: N, days: DAYS });
  assert.equal(basis, "straight_line");
  assert.deepEqual(ranked.map((r) => r.slug).slice(0, 2), ["gion", "arashiyama"]);
  assert.equal(ranked[0].reason, "closest to 4 of your 5 days");
  assert.equal(ranked[1].reason, "closest to 1 of your 5 days");
});

test("W2 the top three; the third has no day of its own and is the nearest overall", () => {
  const { ranked } = rankStayNeighborhoods({ neighborhoods: N, days: DAYS });
  assert.equal(ranked.length, 3);
  assert.equal(ranked[2].slug, "kyoto-station");
  assert.equal(ranked[2].closestDays, 0);
  assert.equal(ranked[2].reason, "close to your days overall");
});

test("W3 §13 — unlocated days are not counted; nothing located ⇒ nothing ranked", () => {
  const withEmpty = [...DAYS, { dayNumber: 6, points: [] }];
  assert.equal(rankStayNeighborhoods({ neighborhoods: N, days: withEmpty }).ranked[0].reason, "closest to 4 of your 5 days");
  assert.deepEqual(rankStayNeighborhoods({ neighborhoods: N, days: [{ dayNumber: 1, points: [] }] }).ranked, []);
  assert.deepEqual(rankStayNeighborhoods({ neighborhoods: [], days: DAYS }).ranked, []);
  assert.equal(stayReason(1, 1), "closest to 1 of your 1 day");
});

test("W4 a travel-time cost orders the ranking; no number leaves the module", () => {
  // A cost that makes Kurama fastest from everywhere (an artificially good line).
  const cost = (n: StayNeighborhood) => (n.slug === "kurama" ? 5 : 30);
  const { ranked, basis } = rankStayNeighborhoods({ neighborhoods: N, days: DAYS, cost });
  assert.equal(basis, "travel_time");
  assert.equal(ranked[0].slug, "kurama");
  assert.equal(ranked[0].reason, "closest to 5 of your 5 days");
  for (const r of ranked) assert.deepEqual(Object.keys(r).sort(), ["closestDays", "locatedDays", "name", "reason", "slug"]);
  assert.doesNotMatch(JSON.stringify(ranked), /min|km|\bm\b/);
});

test("W5 a cost that cannot answer every pair falls back to straight line", () => {
  const cost = (n: StayNeighborhood) => (n.slug === "kurama" ? null : 5);
  const { ranked, basis } = rankStayNeighborhoods({ neighborhoods: N, days: DAYS, cost });
  assert.equal(basis, "straight_line");
  assert.equal(ranked[0].slug, "gion");
});

test("W6 hotels go to their nearest neighbourhood, nearest first; unlocated never placed", () => {
  const hotels = [
    { kind: "hotel_cache" as const, id: "h1", name: "Gion Far", starRating: 4, lat: 35.0037 + 0.006, lng: 135.7788 },
    { kind: "hotel_cache" as const, id: "h2", name: "Gion Near", starRating: null, lat: 35.0037 + 0.001, lng: 135.7788 },
    { kind: "affiliate" as const, id: "a1", name: "Arashiyama Inn", starRating: null, lat: 35.0094, lng: 135.6669 },
    { kind: "hotel_cache" as const, id: "h3", name: "Nowhere", starRating: null, lat: null as any, lng: null as any },
  ];
  const placed = hotelsByNeighborhood(hotels, N, ["gion", "arashiyama", "kyoto-station"]);
  assert.deepEqual(placed.gion.map((h) => h.id), ["h2", "h1"]);
  assert.deepEqual(placed.arashiyama.map((h) => h.id), ["a1"]);
  assert.deepEqual(placed["kyoto-station"], []);
  assert.deepEqual(Object.keys(placed.gion[0]).sort(), ["id", "kind", "name", "starRating"], "no coordinates leave");
});
