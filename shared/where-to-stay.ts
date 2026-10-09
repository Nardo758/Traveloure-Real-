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
import { mentionsLodging } from "./ai-place-text";
import type { StayLink } from "./stay-link";

/**
 * Smoke 9 S9-2 amendment (ledger `2026-10-04-smoke9-addendum`): is this item a place to stay? An
 * `accommodation` row, or a row whose title names lodging (a traveler typing "Hotel Granvia Kyoto" as
 * an activity). ONE predicate, read by the server's "Set as where you're staying" and by the ⋯ menu
 * that offers it (§18 rule 1).
 */
export function isLodgingItem(item: { type?: string | null; title?: string | null }): boolean {
  return item.type === "accommodation" || mentionsLodging(item.title);
}

/** S10-6: the confirmation before a lodging item replaces the plan's current stay. */
export function replaceStayQuestion(current: string, next: string): string {
  return `Replace ${current.trim()} with ${next.trim()}?`;
}

/** The refusal when a plan's stay was added by hand — it now points at the ⋯ entry that converts it. */
export const SET_AS_STAY_LABEL = "Set as where you're staying";
export const HAND_ADDED_STAY_LINE = `Your stay was added by hand — open its ⋯ menu and choose "${SET_AS_STAY_LABEL}" to change it from here.`;

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
 * Pure and DETERMINISTIC (smoke 5, item 1). The same plan ranks the same way on every call, whatever
 * order the rows arrive in: neighbourhoods and each day's points are put in a canonical order first,
 * so a floating-point sum never depends on query order. Ranking: most days closest, then the LOWEST
 * TOTAL STRAIGHT-LINE DISTANCE (always straight line, even when a travel-time cost decides "closest"),
 * then neighbourhood name, then slug. A cost that cannot answer a pair makes the whole ranking fall
 * back to straight line, so two units are never mixed.
 */
export function rankStayNeighborhoods(input: {
  neighborhoods: readonly StayNeighborhood[];
  days: readonly StayDay[];
  cost?: StayCost;
  top?: number;
}): { ranked: RankedStayNeighborhood[]; basis: "straight_line" | "travel_time" } {
  const byPoint = (a: StayPoint, b: StayPoint) => a.lat - b.lat || a.lng - b.lng;
  const days = input.days
    .filter((d) => d.points.length > 0)
    .map((d) => ({ dayNumber: d.dayNumber, points: [...d.points].sort(byPoint) }))
    .sort((a, b) => a.dayNumber - b.dayNumber);
  const neighborhoods = [...input.neighborhoods].sort(compareNeighborhoodNames);
  if (!neighborhoods.length || !days.length) return { ranked: [], basis: "straight_line" };

  const score = (cost: StayCost): number[][] | null => {
    // mean[d][n]
    const out: number[][] = [];
    for (const d of days) {
      const row: number[] = [];
      for (const n of neighborhoods) {
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

  const straight = score(straightLineCost)!;
  let basis: "straight_line" | "travel_time" = "straight_line";
  let means = input.cost ? score(input.cost) : null;
  if (means) basis = "travel_time";
  else means = straight;

  const closest = new Array(neighborhoods.length).fill(0);
  const total = new Array(neighborhoods.length).fill(0);
  for (let d = 0; d < means.length; d++) {
    const row = means[d];
    let best = 0;
    for (let i = 0; i < row.length; i++) {
      total[i] += straight[d][i];
      if (i === 0) continue;
      // A tie on the deciding cost goes to the shorter straight line, then the earlier name.
      if (row[i] < row[best] || (row[i] === row[best] && straight[d][i] < straight[d][best])) best = i;
    }
    closest[best] += 1;
  }

  const ranked = neighborhoods
    .map((n, i) => ({ n, closest: closest[i], total: total[i] }))
    .sort((a, b) => b.closest - a.closest || a.total - b.total || compareNeighborhoodNames(a.n, b.n))
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

/** Name, then slug — a total order, so two rows with one name still sort the same way every time. */
function compareNeighborhoodNames(a: StayNeighborhood, b: StayNeighborhood): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export interface StayHotel {
  /**
   * `platform` (surface step 3, R-o): a stay LISTED ON TRAVELOURE — an approved, active
   * `provider_services` row in the accommodation category — badged "Traveloure stay".
   * `hotel_cache` / `affiliate`: partner inventory, booked via the concierge or a deep link.
   */
  kind: "platform" | "hotel_cache" | "affiliate";
  id: string;
  name: string;
  starRating: number | null;
  /** Step 6 R-aq: the option card's thumbnail — a platform listing's own image only; absent ⇒ none. */
  photo?: { source: "ours"; url: string; licence: null; attribution: string; sourceUrl: null } | null;
  /**
   * FU-S1-2 (ledger `2026-10-09-fu-s1-2-stay-link`): the stay card's ONE link — on the S1 `stay` block
   * only. `own` = the provider's own site; `google` = Google's website for the hotel; `maps` = "View on
   * Google Maps". `google`/`maps` carry the "Google Maps" attribution wherever drawn. Absent ⇒ no link.
   */
  stayLink?: StayLink;
}

/** R-o: the badge a platform-listed stay carries. */
export const PLATFORM_STAY_BADGE = "Traveloure stay";

/**
 * R-o (surface step 3). Pure and STABLE: within one plan-fit band — the stays of ONE ranked
 * neighbourhood, which share that neighbourhood's fit — platform-listed stays come before partner
 * stays; each group keeps the order it arrived in (distance, then name). Never re-ranks across bands.
 */
export function orderStaysByOrigin<H extends Pick<StayHotel, "kind">>(stays: readonly H[]): H[] {
  return [...stays.filter((h) => h.kind === "platform"), ...stays.filter((h) => h.kind !== "platform")];
}

/** The top option's note when it tied on day-count and won on total distance (surface step 3). */
export const STAY_TIE_BREAK_NOTE = "shortest overall distance to your stops (est.)";

/**
 * Surface step 3: was the TOP option decided by the tie-break? True when the first two options are
 * closest to the same number of days — the order then came from total straight-line distance
 * (`rankStayNeighborhoods`), which the top option says once and the rest say nothing about.
 */
export function topWonOnTieBreak(ranked: ReadonlyArray<{ closestDays: number }>): boolean {
  return ranked.length >= 2 && ranked[0].closestDays === ranked[1].closestDays;
}

/**
 * R-y (surface step 3). How the drafted panel renders: `options` (up to three neighbourhoods with
 * their stays) only when AT LEAST ONE option has a stay; with none — zero own inventory near any of
 * them — it collapses to one line naming the top area. Nothing ranked ⇒ `unranked` (the panel says
 * why, §13).
 */
export function anchorPanelMode(neighborhoods: ReadonlyArray<{ hotels: readonly unknown[] }>): "options" | "collapsed" | "unranked" {
  if (!neighborhoods.length) return "unranked";
  return neighborhoods.some((n) => n.hotels.length > 0) ? "options" : "collapsed";
}

/** R-y: the collapsed panel's one line. The one-liner is omitted when there is none (§13). */
export function collapsedStayLine(top: { name: string; oneLiner?: { text: string } | null }): string {
  return ["Best area for these days: " + top.name, top.oneLiner?.text ?? null].filter(Boolean).join(" · ");
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
      list.sort((a, b) => a.m - b.m || (a.h.name < b.h.name ? -1 : a.h.name > b.h.name ? 1 : a.h.id < b.h.id ? -1 : a.h.id > b.h.id ? 1 : 0)).slice(0, perNeighborhood).map((x) => x.h),
    ]),
  );
}

/**
 * Smoke 5 item 6. Pure. The reason line renders only when it DISTINGUISHES an option from its
 * neighbours: two options closest to the same number of days are tied, and a tied option shows its
 * neighbourhood name alone (§13 — "closest to 2 of your 5 days" on two rows says nothing about
 * either). Order and every other field are unchanged.
 */
export function distinguishingReasons<R extends { closestDays: number; reason: string }>(ranked: readonly R[]): Array<Omit<R, "reason"> & { reason: string | null }> {
  return ranked.map((r, i) => {
    const tiedPrev = i > 0 && ranked[i - 1].closestDays === r.closestDays;
    const tiedNext = i < ranked.length - 1 && ranked[i + 1].closestDays === r.closestDays;
    return { ...r, reason: tiedPrev || tiedNext ? null : r.reason };
  });
}

/**
 * Smoke 5 item 6 (migration 340, `ai_generated_itineraries.where_to_stay`). The ranking is computed
 * ONCE per draft and stored on the draft's row; every reload reads it back, so the order a traveler
 * saw is the order they see again. A new draft is a new row and ranks afresh.
 */
export interface StoredStayRanking {
  draftId: string;
  computedAt: string;
  basis: "straight_line" | "travel_time";
  ranked: RankedStayNeighborhood[];
}

/** Pure. A stored ranking for THIS draft, or null (absent, another draft's, or unreadable — never guessed). */
export function readStoredStayRanking(value: unknown, draftId: string): StoredStayRanking | null {
  const v = value as Partial<StoredStayRanking> | null;
  if (!v || v.draftId !== draftId || !Array.isArray(v.ranked) || !v.ranked.length) return null;
  if (v.basis !== "straight_line" && v.basis !== "travel_time") return null;
  const ok = v.ranked.every(
    (r) => r && typeof r.slug === "string" && typeof r.name === "string" && Number.isInteger(r.closestDays) && Number.isInteger(r.locatedDays),
  );
  if (!ok) return null;
  // The reason is re-derived from the stored counts, so its wording has ONE author (`stayReason`).
  return { ...(v as StoredStayRanking), ranked: v.ranked.map((r) => ({ ...r, reason: stayReason(r.closestDays, r.locatedDays) })) };
}

export type WhereToStayIneligible = "not_found" | "single_day" | "no_draft" | "decided";

/** GET /api/trips/:tripId/where-to-stay. Carries an order and words — never a distance or a minute. */
export interface WhereToStayView {
  eligible: boolean;
  reason?: WhereToStayIneligible;
  /**
   * Smoke 8 item 1: the traveler pressed "Skip for now" in the plan's CURRENT state — before the
   * draft (`reason: "no_draft"`) or on this draft's ranking. The slip draws no panel; the tray's
   * "Where to stay" chip still opens the full chooser from the same view. A skip before the draft
   * does not dismiss the drafted panel: it appears once after the draft. Absent ⇒ not skipped.
   */
  dismissed?: true;
  city: string | null;
  basis: "straight_line" | "travel_time";
  /** True when the city has ANY hotel in our own inventory. False ⇒ "hotels coming soon". */
  hotelsAvailable: boolean;
  /** `reason` is null when the option is tied with a neighbour (smoke 5 item 6) — the name stands alone. */
  neighborhoods: Array<{
    slug: string;
    name: string;
    reason: string | null;
    hotels: StayHotel[];
    /**
     * R-x (surface step 3): the neighbourhood's one line — a registry `neighbourhood` fact when one
     * exists (`source: "registry"`), else the spine's own description (`city_neighborhoods.description`,
     * `source: "spine"`). Null when neither says anything (§13 — no invented line).
     */
    oneLiner: { text: string; source: "registry" | "spine" } | null;
    /** Present (true) on the TOP option only, when it won the day-count tie on total distance. */
    tieBreak?: true;
  }>;
  /**
   * Why `neighborhoods` is empty on an eligible view — two different facts, said differently (§13):
   * the city has no neighbourhood rows, or none of the plan's items is on the map yet. Absent when
   * the ranking has rows.
   */
  unranked?: "no_neighborhoods" | "no_located_items";
  /**
   * S1 "one stay on the plan" (ledger `2026-10-09-s1-one-stay`; brief s1-one-stay.md). Present on an
   * eligible view. FREE: the top 3 hotels by straight line within the top neighbourhoods. ROUTED (the plan
   * passes `planGetsRoutedLegs`): the ONE stay Optimize's routed scoring picked, READ from `trips.stay_pick`
   * — never computed on read. Never ranked by price or commission, either tier.
   */
  stay?: WhereToStayStay;
}

export type WhereToStayStay =
  | { tier: "straight_line"; hotels: StayHotel[] }
  | {
      tier: "routed";
      /** The picked hotel, or null when nothing has been scored yet or it has left our inventory (§13). */
      pick: StayHotel | null;
      /** Hotels scored by routed time / hotels in the plan's neighbourhoods. Null before any pick. */
      scoredCount: number | null;
      candidateCount: number | null;
      /** A re-score replaced an earlier, different pick and the card has not shown it yet. */
      changed: boolean;
      computedAt: string | null;
    };

/**
 * Smoke 8 item 1 — WHERE the lodging surface draws, from the server's view alone (§18 rule 1; the
 * slip restates nothing). `slip`: the drafted panel for an undismissed eligible view, the empty
 * panel for an undismissed `no_draft`, else nothing. `tray`: the tools tray's "Where to stay"
 * opens the full chooser whenever the stay is undecided — dismissed or not.
 */
export function anchorSurfaces(
  view: WhereToStayView | null | undefined,
  hasStayItem: boolean,
): { slip: "drafted" | "empty" | null; trayChooser: boolean; trayChange: boolean } {
  // Smoke 9 S9-2: a plan that ALREADY says where it stays still gets the full chooser in the tray —
  // the CHANGE form (change where I'm staying / I'm deciding / I've got lodging sorted).
  const decided = hasStayItem || view?.reason === "decided";
  if (hasStayItem || !view) return { slip: null, trayChooser: false, trayChange: decided };
  const undecided = view.eligible || view.reason === "no_draft";
  const slip = view.dismissed ? null : view.eligible ? "drafted" : view.reason === "no_draft" ? "empty" : null;
  return { slip, trayChooser: undecided, trayChange: decided };
}
