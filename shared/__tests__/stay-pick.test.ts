/**
 * S1 "one stay on the plan" — the pure rules (ledger `2026-10-09-s1-one-stay`; brief s1-one-stay.md).
 *
 *   SP1  straight-line order and the free short list (top 3)
 *   SP2  the element budget: one element per stop per hotel, whole hotels only, stops at 150
 *   SP3  the ranking: reachability, then closest on most days, then least total time, then name
 *   SP4  ruling 5 — no price or commission field is reachable from either ranking (both tiers)
 *   SP5  the stops fingerprint: order-free, moves when a stop moves
 *   SP6  the stored pick: the reader refuses a malformed value; a re-score replaces it and sets `changed`
 *        only for a different hotel; a first pick is not a change; an unread change survives a same-hotel re-score
 *   SP7  FU-S1-3 closeness: a day is close only when EVERY located stop that day is within the threshold;
 *        an unreachable stop spoils its day; M counts days with a located stop; no stops ⇒ null
 *   SP8  FU-S1-3 straight-line closeness reads the km threshold; the stored pick carries closeness and the
 *        reader refuses a malformed one (an old pick without it reads null — no backfill)
 *   SP9  ruling 5 still holds: neither closeness rule can reach a price or commission field
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  STAY_PICK_CANDIDATE_KEYS,
  STAY_PICK_ELEMENT_BUDGET,
  STAY_PICK_FREE_TOP,
  freeStayShortList,
  nextStayPick,
  planStayScoring,
  rankStays,
  readStayPick,
  stayDayCloseness,
  stayStopsHash,
  straightLineCloseness,
  straightLineOrder,
  toStayPickCandidate,
  type StayPickCandidate,
  type StayPickStop,
} from "../stay-pick";
import { stayCloseRoutedMinutes, stayCloseStraightKm } from "../../server/config/stay-closeness.config";
import { haversineMeters } from "../geo";

const hotel = (id: string, lat: number, lng: number, name = id): StayPickCandidate => ({ kind: "hotel_cache", id, name, lat, lng });
// Kyoto-ish: stops near (35.00, 135.76) on day 1 and (35.02, 135.78) on day 2.
const stops: StayPickStop[] = [
  { dayNumber: 1, lat: 35.0, lng: 135.76 },
  { dayNumber: 1, lat: 35.001, lng: 135.761 },
  { dayNumber: 2, lat: 35.02, lng: 135.78 },
];

test("SP1 straight-line order and the free top 3", () => {
  const near1 = hotel("near1", 35.0005, 135.7605);
  const near2 = hotel("near2", 35.019, 135.779);
  const mid = hotel("mid", 35.01, 135.77);
  const far = hotel("far", 35.2, 135.9);
  const farther = hotel("farther", 35.4, 136.1);
  const order = straightLineOrder([farther, far, mid, near2, near1], stops).map((c) => c.id);
  assert.equal(order[order.length - 1], "farther");
  assert.equal(order[order.length - 2], "far");
  assert.equal(STAY_PICK_FREE_TOP, 3);
  const free = freeStayShortList([farther, far, mid, near2, near1], stops).map((c) => c.id);
  assert.equal(free.length, 3);
  assert.equal(free.includes("far") || free.includes("farther"), false);
  assert.deepEqual(straightLineOrder([near1, near2, mid, far], stops), straightLineOrder([far, mid, near2, near1], stops), "input order does not matter");
});

test("SP2 the element budget counts elements, scores whole hotels, stops at 150", () => {
  assert.equal(STAY_PICK_ELEMENT_BUDGET, 150);
  const many = Array.from({ length: 40 }, (_, i) => hotel(`h${String(i).padStart(2, "0")}`, 35 + i / 1000, 135.76));
  const p = planStayScoring(many, 7);
  assert.equal(p.elementsPerHotel, 7);
  assert.equal(p.toScore.length, Math.floor(150 / 7), "21 hotels × 7 stops = 147 ≤ 150; a 22nd would be 154");
  assert.equal(p.candidateCount, 40);
  assert.deepEqual(p.toScore.map((h) => h.id), many.slice(0, 21).map((h) => h.id), "in the order given (straight line)");
  assert.equal(planStayScoring(many, 151).toScore.length, 0, "one hotel larger than the budget is never half-scored");
  assert.equal(planStayScoring(many, 0).toScore.length, 0, "no stops ⇒ nothing to score");
  assert.equal(planStayScoring(many.slice(0, 3), 7).toScore.length, 3, "fewer hotels than the budget allows ⇒ all scored");
});

test("SP3 rank: reachable first, then most days closest, then least total time, then name", () => {
  const a = hotel("a", 0, 0, "Alpha");
  const b = hotel("b", 0, 0, "Bravo");
  const c = hotel("c", 0, 0, "Charlie");
  // minutes per canonical stop [d1s1, d1s2, d2s1]
  const m: Record<string, Array<number | null>> = { a: [10, 10, 40], b: [20, 20, 5], c: [1, 1, null] };
  const r = rankStays([c, b, a], stops, (h, i) => m[h.id][i]);
  assert.equal(r[r.length - 1].candidate.id, "c", "an unreachable stop puts a hotel behind every fully reachable one");
  assert.equal(r[r.length - 1].unreachable, 1);
  // c is reachable on day 1 and closest there, so it takes that day even though it ranks last overall.
  assert.deepEqual(r.slice(0, 2).map((x) => [x.candidate.id, x.closestDays]), [["b", 1], ["a", 0]]);
  // Without c: a is closest on day 1 (10 vs 20), b on day 2 (5 vs 40) — one day each; total a=60, b=45 ⇒ b first.
  const ab = rankStays([a, b], stops, (h, i) => m[h.id][i]);
  assert.deepEqual(ab.map((x) => [x.candidate.id, x.closestDays, x.total]), [["b", 1, 45], ["a", 1, 60]]);
  // More closest days beats less total time: over three days, a is closest on days 1 and 2 by a minute
  // each, b is closest on day 3 by an hour — b has the lower total, a has more days, a wins.
  const three: StayPickStop[] = [
    { dayNumber: 1, lat: 1, lng: 1 },
    { dayNumber: 2, lat: 2, lng: 2 },
    { dayNumber: 3, lat: 3, lng: 3 },
  ];
  const m3: Record<string, number[]> = { a: [10, 10, 90], b: [11, 11, 30] };
  const r3 = rankStays([b, a], three, (h, i) => m3[h.id][i]);
  assert.deepEqual(r3.map((x) => [x.candidate.id, x.closestDays, x.total]), [["a", 2, 110], ["b", 1, 52]]);
  const tie = rankStays([b, a], stops, () => 10);
  assert.deepEqual(tie.map((x) => x.candidate.name), ["Alpha", "Bravo"], "a full tie falls to the name");
});

test("SP4 no price or commission field is reachable from either ranking (ruling 5)", () => {
  assert.deepEqual([...STAY_PICK_CANDIDATE_KEYS].sort(), ["id", "kind", "lat", "lng", "name"]);
  for (const k of STAY_PICK_CANDIDATE_KEYS) assert.doesNotMatch(k, /price|rate|fee|commission|amount|cost/i);
  const row = { kind: "platform" as const, id: "p1", name: "Ryokan", lat: 35, lng: 135.76, price: "999.00", commissionRate: 0.3, revenueShareRate: "0.9", priceBasis: "per_booking" };
  assert.deepEqual(Object.keys(toStayPickCandidate(row as any)).sort(), ["id", "kind", "lat", "lng", "name"], "the projector drops every money field");
  // The same hotels with wildly different prices rank identically on both tiers.
  const base = [hotel("x", 35.0005, 135.7605), hotel("y", 35.019, 135.779), hotel("z", 35.01, 135.77)];
  const priced = (p: number) => base.map((h, i) => toStayPickCandidate({ ...h, price: String(p * (i + 1)), commission: p } as any));
  assert.deepEqual(straightLineOrder(priced(1), stops), straightLineOrder(priced(1000), stops), "free tier");
  const minutes = (h: StayPickCandidate, i: number) => (h.id.charCodeAt(0) % 7) + i;
  assert.deepEqual(rankStays(priced(1), stops, minutes), rankStays(priced(1000), stops, minutes), "routed tier");
  // The two files the scorer runs in read no money field at all.
  for (const f of ["shared/stay-pick.ts", "server/services/stay-pick.service.ts"]) {
    const code = fs
      .readFileSync(path.join(process.cwd(), f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /\.(price|priceType|pricingUnit|priceBasis|commission\w*|revenueShareRate|rate)\b/i, `${f} reads no money field`);
    assert.doesNotMatch(code, /\b(price|commission)\w*\s*:/i, `${f} carries no money field`);
  }
});

test("SP5 the stops fingerprint is order-free and moves with a stop", () => {
  const h = stayStopsHash(stops);
  assert.equal(stayStopsHash([...stops].reverse()), h);
  assert.notEqual(stayStopsHash([...stops.slice(0, 2), { dayNumber: 2, lat: 35.03, lng: 135.78 }]), h, "a moved stop");
  assert.notEqual(stayStopsHash(stops.slice(0, 2)), h, "a removed stop");
  assert.notEqual(stayStopsHash([...stops.slice(0, 2), { ...stops[2], dayNumber: 1 }]), h, "a stop moved to another day");
});

test("SP6 the stored pick: reader, replace, and the changed flag", () => {
  assert.equal(readStayPick(null), null);
  assert.equal(readStayPick({ hotelId: "x" }), null, "a partial value is no pick");
  assert.equal(readStayPick({ hotelId: "x", hotelKind: "nope", scoredCount: 1, candidateCount: 1, stopsHash: "h", computedAt: "t", tier: "routed" }), null);
  const base = { hotelId: "a", hotelKind: "hotel_cache" as const, scoredCount: 4, candidateCount: 9, stopsHash: "3-x", computedAt: "2026-10-09T00:00:00.000Z" };
  const first = nextStayPick(null, base);
  assert.equal(first.changed, false, "a first pick is not a change");
  assert.deepEqual(readStayPick(first), first);
  const same = nextStayPick(first, { ...base, stopsHash: "3-y" });
  assert.equal(same.changed, false, "the same hotel again is not a change");
  const moved = nextStayPick(first, { ...base, hotelId: "b" });
  assert.equal(moved.changed, true, "a different hotel is a change");
  assert.equal(nextStayPick(moved, { ...base, hotelId: "b", stopsHash: "3-z" }).changed, true, "an unread change survives a same-hotel re-score");
});

test("SP7 closeness: every stop of a day within the threshold, unreachable spoils the day, M = located days", () => {
  const T = stayCloseRoutedMinutes();
  // Canonical order of `stops`: day 1 (two stops), then day 2 (one stop).
  assert.deepEqual(stayDayCloseness(stops, () => T, T, "routed"), { closeDays: 2, locatedDays: 2, basis: "routed" }, "exactly the threshold is close");
  assert.deepEqual(stayDayCloseness(stops, (i) => (i === 1 ? T + 1 : T - 1), T, "routed"), { closeDays: 1, locatedDays: 2, basis: "routed" }, "one far stop spoils day 1");
  assert.deepEqual(stayDayCloseness(stops, (i) => (i === 2 ? null : 1), T, "routed"), { closeDays: 1, locatedDays: 2, basis: "routed" }, "an unreachable stop spoils day 2");
  assert.equal(stayDayCloseness([], () => 1, T, "routed"), null, "no located stop ⇒ unknown, never 0 of 0");
  assert.equal(stayDayCloseness(stops, () => 1, 0, "routed"), null, "an unusable threshold ⇒ unknown");
});

test("SP8 straight-line closeness and the stored pick's closeness", () => {
  const km = stayCloseStraightKm();
  const near = hotel("near", 35.0005, 135.7605);
  const day1Max = Math.max(...stops.filter((s) => s.dayNumber === 1).map((s) => haversineMeters(near.lat, near.lng, s.lat, s.lng)));
  const day2 = haversineMeters(near.lat, near.lng, stops[2].lat, stops[2].lng);
  const expected = (day1Max <= km * 1000 ? 1 : 0) + (day2 <= km * 1000 ? 1 : 0);
  assert.deepEqual(straightLineCloseness(near, stops, km), { closeDays: expected, locatedDays: 2, basis: "straight_line" });
  const base = { hotelId: "a", hotelKind: "hotel_cache" as const, scoredCount: 4, candidateCount: 9, stopsHash: "3-x", computedAt: "2026-10-09T00:00:00.000Z" };
  const withC = nextStayPick(null, { ...base, closeness: { closeDays: 1, locatedDays: 3, basis: "routed" } });
  assert.deepEqual(readStayPick(withC)?.closeness, { closeDays: 1, locatedDays: 3, basis: "routed" });
  assert.equal(readStayPick({ ...base, tier: "routed" })?.closeness, null, "a pick stored before FU-S1-3 reads null");
  for (const bad of [{ closeDays: 4, locatedDays: 3, basis: "routed" }, { closeDays: 1, locatedDays: 0, basis: "routed" }, { closeDays: 1.5, locatedDays: 3, basis: "routed" }, { closeDays: 1, locatedDays: 3, basis: "x" }]) {
    assert.equal(readStayPick({ ...base, tier: "routed", closeness: bad })?.closeness, null, JSON.stringify(bad));
  }
});

test("SP9 neither closeness rule can reach a price or commission field (ruling 5)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "shared/stay-pick.ts"), "utf8");
  const body = src.slice(src.indexOf("export function stayDayCloseness"), src.indexOf("/** Straight-line order over the plan"));
  assert.doesNotMatch(body, /price|commission|rate\b|fee/i);
});
