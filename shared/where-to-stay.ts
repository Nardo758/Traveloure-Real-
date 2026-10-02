/**
 * WHERE TO STAY — the pure rules (smoke test 4, item 5; ledger `2026-10-02-smoke4-draft-fixes`).
 *
 * Decision-maker, Oct 2, 2026: "Hotel is optional and recommended after the draft, not asked before
 * it." Once a plan spanning two or more days has a draft, the slip recommends where to stay:
 *
 *   · RANKED BY THE PLAN'S OWN DAYS. Each of the city's neighbourhoods (`city_neighborhoods`
 *     centroids) is scored per day as the mean distance from its centroid to that day's LOCATED
 *     items. A day is "closest" to the neighbourhood with the lowest mean. Ranking: most days closest,
 *     then the lowest total, then name — and the reason line says the count ("closest to 4 of your 5
 *     days"). Straight-line by default; the caller may supply a travel-time cost instead (A8, when
 *     the service is on AND the plan has a paid optimizer run). The cost is only ever used to ORDER —
 *     no minute or kilometre value leaves this module, so a Google-restricted travel time is never
 *     printed (R242).
 *   · §13. No located item on any day ⇒ nothing is ranked (an empty list, never a guess). A day with
 *     no located item counts toward nothing and is not in the "of your N days" denominator.
 *   · HOTELS FROM OUR OWN INVENTORY ONLY (census `hotel_cache` anchors + affiliate listings), each
 *     placed in the neighbourhood whose centroid is nearest it. A city with none says so — the panel
 *     shows "hotels coming soon", never a fabricated name.
 */
import { haversineMeters } from "./geo";

export interface StayPoint {
  lat: number;
  lng: number;
}

export interface StayNeighborhood extends StayPoint {
  slug: string;
  name: string;
}

export interface StayDay {
  dayNumber: number;
  points: StayPoint[];
}

export interface RankedStayNeighborhood {
  slug: string;
  name: string;
  /** How many of the plan's located days this neighbourhood is the closest to. */
  closestDays: number;
  /** The plan's days that have at least one located item. */
  locatedDays: number;
  reason: string;
}

/** A cost between a neighbourhood and a point; null ⇒ this cost cannot answer the pair. */
export type StayCost = (n: StayNeighborhood, p: StayPoint) => number | null;

/** Straight-line metres — the default cost. */
export const straightLineCost: StayCost = (n, p) => haversineMeters(n.lat, n.lng, p.lat, p.lng);

/** How many neighbourhoods the panel shows. */
export const WHERE_TO_STAY_TOP = 3;

/** A plan must span at least this many days to be offered the panel. */
export const WHERE_TO_STAY_MIN_DAYS = 2;

export function stayReason(closestDays: number, locatedDays: number): string {
  if (closestDays > 0) {
    return `closest to ${closestDays} of your ${locatedDays} ${locatedDays === 1 ? "day" : "days"}`;
  }
  return "close to your days overall";
}

/**
 * Pure. Ranks the neighbourhoods against the plan's located days. A cost that cannot answer a pair
 * makes the whole ranking fall back to straight line, so two units are never mixed.
 */
export function rankStayNeighborhoods(input: {
  neighborhoods: readonly StayNeighborhood[];
  days: readonly StayDay[];
  cost?: StayCost;
  top?: number;
}): { ranked: RankedStayNeighborhood[]; basis: "straight_line" | "travel_time" } {
  const days = input.days.filter((d) => d.points.length > 0);
  if (!input.neighborhoods.length || !days.length) return { ranked: [], basis: "straight_line" };

  const score = (cost: StayCost): number[][] | null => {
    // mean[d][n]
    const out: number[][] = [];
    for (const d of days) {
      const row: number[] = [];
      for (const n of input.neighborhoods) {
        let sum = 0;
        for (const p of d.points) {
          const c = cost(n, p);
          if (c === null || !Number.isFinite(c)) return null;
          sum += c;
        }
        row.push(sum / d.points.length);
      }
      out.push(row);
    }
    return out;
  };

  let basis: "straight_line" | "travel_time" = "straight_line";
  let means = input.cost ? score(input.cost) : null;
  if (means) basis = "travel_time";
  else means = score(straightLineCost)!;

  const closest = new Array(input.neighborhoods.length).fill(0);
  const total = new Array(input.neighborhoods.length).fill(0);
  for (const row of means) {
    let best = 0;
    for (let i = 0; i < row.length; i++) {
      total[i] += row[i];
      if (row[i] < row[best] || (row[i] === row[best] && input.neighborhoods[i].name < input.neighborhoods[best].name)) best = i;
    }
    closest[best] += 1;
  }

  const ranked = input.neighborhoods
    .map((n, i) => ({ n, closest: closest[i], total: total[i] }))
    .sort((a, b) => b.closest - a.closest || a.total - b.total || a.n.name.localeCompare(b.n.name))
    .slice(0, input.top ?? WHERE_TO_STAY_TOP)
    .map(({ n, closest: c }) => ({
      slug: n.slug,
      name: n.name,
      closestDays: c,
      locatedDays: days.length,
      reason: stayReason(c, days.length),
    }));
  return { ranked, basis };
}

export interface StayHotel {
  kind: "hotel_cache" | "affiliate";
  id: string;
  name: string;
  starRating: number | null;
}

/**
 * Pure. Places each LOCATED hotel in the neighbourhood whose centroid is nearest it and returns, per
 * requested neighbourhood slug, up to `perNeighborhood` hotels nearest its centroid. Hotels without
 * coordinates are never placed (§13).
 */
export function hotelsByNeighborhood<H extends StayHotel & Partial<StayPoint>>(
  hotels: readonly H[],
  neighborhoods: readonly StayNeighborhood[],
  slugs: readonly string[],
  perNeighborhood = 3,
): Record<string, StayHotel[]> {
  const out: Record<string, Array<{ h: StayHotel; m: number }>> = {};
  for (const s of slugs) out[s] = [];
  if (!neighborhoods.length) return Object.fromEntries(slugs.map((s) => [s, []]));
  for (const h of hotels) {
    if (h.lat == null || h.lng == null || !Number.isFinite(h.lat) || !Number.isFinite(h.lng)) continue;
    let best: StayNeighborhood | null = null;
    let bestM = Infinity;
    for (const n of neighborhoods) {
      const m = haversineMeters(n.lat, n.lng, h.lat, h.lng);
      if (m < bestM) {
        bestM = m;
        best = n;
      }
    }
    if (best && out[best.slug]) out[best.slug].push({ h: { kind: h.kind, id: h.id, name: h.name, starRating: h.starRating }, m: bestM });
  }
  return Object.fromEntries(
    Object.entries(out).map(([s, list]) => [
      s,
      list.sort((a, b) => a.m - b.m || a.h.name.localeCompare(b.h.name)).slice(0, perNeighborhood).map((x) => x.h),
    ]),
  );
}

export type WhereToStayIneligible = "not_found" | "single_day" | "no_draft" | "decided";

/** GET /api/trips/:tripId/where-to-stay. Carries an order and words — never a distance or a minute. */
export interface WhereToStayView {
  eligible: boolean;
  reason?: WhereToStayIneligible;
  city: string | null;
  basis: "straight_line" | "travel_time";
  /** True when the city has ANY hotel in our own inventory. False ⇒ "hotels coming soon". */
  hotelsAvailable: boolean;
  neighborhoods: Array<{ slug: string; name: string; reason: string; hotels: StayHotel[] }>;
}
