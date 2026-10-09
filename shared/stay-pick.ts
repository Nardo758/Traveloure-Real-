/**
 * S1 — "ONE STAY ON THE PLAN" (ledger `2026-10-09-s1-one-stay`; brief docs/planning/briefs/s1-one-stay.md).
 * The pure rules. The server loads rows and makes the calls (`server/services/stay-pick.service.ts`); the
 * where-to-stay read only READS what that writer stored (never computes on read).
 *
 *   · FREE plan: the top 3 hotels by straight line within the top neighbourhoods. No Maps call.
 *   · PAID plan (`planGetsRoutedLegs`): hotels in the plan's neighbourhoods, in straight-line order,
 *     each scored by ONE Route Matrix request (hotel → every located stop on the plan's dates) until the
 *     ELEMENT budget is spent; the pick comes ONLY from scored hotels.
 *   · RANK: reachability, then closest on most days, then least total time — never price or commission.
 *     A candidate is `StayPickCandidate`, which names no money field at all, and every candidate the
 *     server builds goes through `toStayPickCandidate` (an allowlist projector), so no price or commission
 *     field is reachable from either ranking (ruling 5; pinned by the unit test).
 *
 * TEMPORARY, BY RULING: the straight-line prune and the element budget exist only because Google bills per
 * element. They are REMOVED when 9a-ii (self-hosted OSRM as a RoutingAdapter provider for walk/drive) is
 * live — the brief names that as the removal condition.
 */

import { haversineMeters } from "./geo";

/** Elements (hotel × stop pairs) one paid scoring may spend — what Google bills and the cap measures. */
export const STAY_PICK_ELEMENT_BUDGET = 150;
/** The free plan's straight-line short list. */
export const STAY_PICK_FREE_TOP = 3;

/** The ONLY fields a stay candidate carries into a ranking. No price, rate, fee or commission — by design. */
export const STAY_PICK_CANDIDATE_KEYS = ["kind", "id", "name", "lat", "lng"] as const;
export type StayPickCandidateKind = "platform" | "hotel_cache" | "affiliate";
export interface StayPickCandidate {
  kind: StayPickCandidateKind;
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** One located stop on the plan's dates. */
export interface StayPickStop {
  dayNumber: number;
  lat: number;
  lng: number;
}

/** Allowlist projector: whatever row arrives, only the five candidate keys leave (ruling 5). */
export function toStayPickCandidate(row: { kind: StayPickCandidateKind; id: string; name: string; lat: number; lng: number }): StayPickCandidate {
  return { kind: row.kind, id: row.id, name: row.name, lat: row.lat, lng: row.lng };
}

function byNameThenId(a: StayPickCandidate, b: StayPickCandidate): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Stops in canonical order (day, then lat, then lng), so every ranking and the hash are order-free. */
export function canonicalStops(stops: readonly StayPickStop[]): StayPickStop[] {
  return [...stops].sort((a, b) => a.dayNumber - b.dayNumber || a.lat - b.lat || a.lng - b.lng);
}

/**
 * The ONE ranking rule, over a per-stop cost (metres for the straight line, minutes when routed). `null`
 * = the stop is unreachable from that candidate. Order: fewest unreachable stops; then most days on which
 * the candidate's mean cost to that day's stops is the lowest; then least total cost; then name, kind, id.
 */
export function rankStays(
  candidates: readonly StayPickCandidate[],
  stops: readonly StayPickStop[],
  cost: (c: StayPickCandidate, stopIndex: number) => number | null,
): Array<{ candidate: StayPickCandidate; unreachable: number; closestDays: number; total: number }> {
  const ordered = canonicalStops(stops);
  const days = Array.from(new Set(ordered.map((s) => s.dayNumber))).sort((a, b) => a - b);
  const rows = [...candidates].sort(byNameThenId).map((candidate) => {
    const costs = ordered.map((_, i) => cost(candidate, i));
    const unreachable = costs.filter((c) => c === null || !Number.isFinite(c)).length;
    const total = costs.reduce<number>((t, c) => t + (c !== null && Number.isFinite(c) ? c : 0), 0);
    const dayMeans = days.map((d) => {
      const own = ordered.map((s, i) => (s.dayNumber === d ? costs[i] : undefined)).filter((c) => c !== undefined);
      if (own.some((c) => c === null || !Number.isFinite(c as number))) return Infinity;
      return own.reduce<number>((t, c) => t + (c as number), 0) / own.length;
    });
    return { candidate, unreachable, total, dayMeans, closestDays: 0 };
  });
  days.forEach((_, d) => {
    let best: (typeof rows)[number] | null = null;
    for (const r of rows) {
      if (!Number.isFinite(r.dayMeans[d])) continue;
      if (!best || r.dayMeans[d] < best.dayMeans[d]) best = r;
    }
    if (best) best.closestDays += 1;
  });
  return rows
    .sort((a, b) => a.unreachable - b.unreachable || b.closestDays - a.closestDays || a.total - b.total || byNameThenId(a.candidate, b.candidate))
    .map(({ candidate, unreachable, closestDays, total }) => ({ candidate, unreachable, closestDays, total }));
}

/** Straight-line order over the plan's stops (the free list, and the paid scoring order). */
export function straightLineOrder(candidates: readonly StayPickCandidate[], stops: readonly StayPickStop[]): StayPickCandidate[] {
  const ordered = canonicalStops(stops);
  return rankStays(candidates, ordered, (c, i) => haversineMeters(c.lat, c.lng, ordered[i].lat, ordered[i].lng)).map((r) => r.candidate);
}

/** The free plan's list: the top 3 by straight line. */
export function freeStayShortList(candidates: readonly StayPickCandidate[], stops: readonly StayPickStop[]): StayPickCandidate[] {
  return straightLineOrder(candidates, stops).slice(0, STAY_PICK_FREE_TOP);
}

/**
 * The paid scoring plan: candidates in straight-line order, each costing one element per stop, taken
 * while the next one still fits the budget. A hotel is scored whole or not at all — a half-scored hotel
 * would be ranked on a subset of the stops. Zero stops ⇒ nothing to score.
 */
export function planStayScoring(
  ordered: readonly StayPickCandidate[],
  stopCount: number,
  budget = STAY_PICK_ELEMENT_BUDGET,
): { toScore: StayPickCandidate[]; elementsPerHotel: number; candidateCount: number } {
  const out: StayPickCandidate[] = [];
  if (stopCount > 0) {
    let left = budget;
    for (const c of ordered) {
      if (stopCount > left) break;
      out.push(c);
      left -= stopCount;
    }
  }
  return { toScore: out, elementsPerHotel: stopCount, candidateCount: ordered.length };
}

/**
 * A stable fingerprint of the stops the pick was scored against (day + coordinates to 5 decimals, ~1 m).
 * FNV-1a, so it runs the same on the server and in a test with no crypto import.
 */
export function stayStopsHash(stops: readonly StayPickStop[]): string {
  const text = canonicalStops(stops)
    .map((s) => `${s.dayNumber}:${s.lat.toFixed(5)},${s.lng.toFixed(5)}`)
    .join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${canonicalStops(stops).length}-${h.toString(16).padStart(8, "0")}`;
}

/** What `trips.stay_pick` holds (migration 359). */
export interface StayPick {
  hotelId: string;
  hotelKind: StayPickCandidateKind;
  scoredCount: number;
  candidateCount: number;
  stopsHash: string;
  computedAt: string;
  tier: "routed";
  /** True when a re-score REPLACED a different earlier pick; the card reads it once (`/stay-pick/seen`). */
  changed: boolean;
}

const KINDS: readonly string[] = ["platform", "hotel_cache", "affiliate"];

/** Reader: a stored value that is not this shape is no pick (§13 — never guessed into one). */
export function readStayPick(value: unknown): StayPick | null {
  const v = value as Partial<StayPick> | null | undefined;
  if (!v || typeof v !== "object") return null;
  if (typeof v.hotelId !== "string" || !v.hotelId || !KINDS.includes(String(v.hotelKind))) return null;
  if (!Number.isInteger(v.scoredCount) || !Number.isInteger(v.candidateCount) || typeof v.stopsHash !== "string") return null;
  if (typeof v.computedAt !== "string" || v.tier !== "routed") return null;
  return {
    hotelId: v.hotelId,
    hotelKind: v.hotelKind as StayPickCandidateKind,
    scoredCount: v.scoredCount as number,
    candidateCount: v.candidateCount as number,
    stopsHash: v.stopsHash,
    computedAt: v.computedAt,
    tier: "routed",
    changed: v.changed === true,
  };
}

/**
 * The next stored pick: a re-score REPLACES the pick. `changed` is set when the hotel is a different one,
 * and an earlier change the card has not read yet stays set (a same-hotel re-score does not erase it).
 * A first pick is not a change.
 */
export function nextStayPick(
  prev: StayPick | null,
  computed: Omit<StayPick, "changed" | "tier">,
): StayPick {
  const different = !!prev && (prev.hotelId !== computed.hotelId || prev.hotelKind !== computed.hotelKind);
  return { ...computed, tier: "routed", changed: different || (prev?.changed ?? false) };
}
