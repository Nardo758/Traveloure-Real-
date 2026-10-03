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
 *   W7 smoke 5 — the same plan in any row order ranks the same way (two calls, same order)
 *   W8 smoke 5 — equal closest-day counts break on TOTAL STRAIGHT-LINE distance, then name
 *   W9 smoke 5 — under a travel-time cost the tie-break is still straight line, then name
 *   W10 smoke 5 item 6 — a reason renders only when it distinguishes the option from its neighbours
 *   W11 smoke 5 item 6 — a stored ranking is read back only for its own draft, wording re-derived
 *
 * Run: npx tsx --test shared/__tests__/where-to-stay.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distinguishingReasons,
  readStoredStayRanking,
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

test("W7 same plan, two calls, any row order — same ranking", () => {
  const first = rankStayNeighborhoods({ neighborhoods: N, days: DAYS, top: 4 }).ranked.map((r) => r.slug);
  const shuffled = rankStayNeighborhoods({
    neighborhoods: [...N].reverse(),
    days: [...DAYS].reverse().map((d) => ({ ...d, points: [...d.points].reverse() })),
    top: 4,
  }).ranked.map((r) => r.slug);
  assert.deepEqual(shuffled, first);
  assert.deepEqual(rankStayNeighborhoods({ neighborhoods: N, days: DAYS, top: 4 }).ranked.map((r) => r.slug), first);
});

test("W8 a tie on closest days breaks on total straight-line distance, then name", () => {
  // One day sitting exactly between two mirror-image neighbourhoods; a third is farther away.
  const mid = { lat: 35, lng: 135.75 };
  const pair: StayNeighborhood[] = [
    { slug: "zz-east", name: "Zeta", lat: 35, lng: 135.76 },
    { slug: "aa-west", name: "Alpha", lat: 35, lng: 135.74 },
    { slug: "far", name: "Beta", lat: 35, lng: 135.9 },
  ];
  const days: StayDay[] = [{ dayNumber: 1, points: [mid] }];
  const ranked = rankStayNeighborhoods({ neighborhoods: pair, days }).ranked;
  // Alpha and Zeta are equally near: the day goes to Alpha by name, Zeta beats far Beta on distance.
  assert.deepEqual(ranked.map((r) => r.slug), ["aa-west", "zz-east", "far"]);
  assert.deepEqual(rankStayNeighborhoods({ neighborhoods: [...pair].reverse(), days }).ranked.map((r) => r.slug), ["aa-west", "zz-east", "far"]);
});

test("W9 under a travel-time cost, ties still break on straight line, then name", () => {
  const flat = () => 10;
  const ranked = rankStayNeighborhoods({ neighborhoods: N, days: DAYS, cost: flat, top: 4 }).ranked;
  // Every neighbourhood costs the same, so each day goes to its straight-line nearest and the
  // rest order by total straight-line distance — the same answer as no cost at all.
  assert.deepEqual(ranked.map((r) => r.slug), rankStayNeighborhoods({ neighborhoods: N, days: DAYS, top: 4 }).ranked.map((r) => r.slug));
});

test("W10 tied options show their names alone; distinct counts keep their reason", () => {
  const r = (slug: string, closestDays: number) => ({ slug, name: slug, closestDays, locatedDays: 5, reason: stayReason(closestDays, 5) });
  assert.deepEqual(distinguishingReasons([r("a", 2), r("b", 2), r("c", 1)]).map((x) => x.reason), [null, null, "closest to 1 of your 5 days"]);
  assert.deepEqual(distinguishingReasons([r("a", 4), r("b", 1), r("c", 0)]).map((x) => x.reason), [
    "closest to 4 of your 5 days",
    "closest to 1 of your 5 days",
    "close to your days overall",
  ]);
  assert.deepEqual(distinguishingReasons([r("a", 3), r("b", 0), r("c", 0)]).map((x) => x.reason), ["closest to 3 of your 5 days", null, null]);
});

test("W11 a stored ranking is read only for its own draft", () => {
  const value = { draftId: "d1", computedAt: "2026-10-03T00:00:00Z", basis: "straight_line", ranked: [{ slug: "gion", name: "Gion", closestDays: 4, locatedDays: 5, reason: "stale words" }] };
  const read = readStoredStayRanking(value, "d1")!;
  assert.equal(read.ranked[0].reason, "closest to 4 of your 5 days", "wording has one author");
  assert.equal(readStoredStayRanking(value, "d2"), null, "another draft's ranking is not this draft's");
  assert.equal(readStoredStayRanking(null, "d1"), null);
  assert.equal(readStoredStayRanking({ ...value, ranked: [] }, "d1"), null);
  assert.equal(readStoredStayRanking({ ...value, basis: "minutes" }, "d1"), null);
});
