/**
 * R3-12 (round 3 ruling, Nov 5, 2026; heading "Recent plans in Kyoto"): the landing rail's occasions, ordered by their most recent plan in the marquee market. The ONE list
 * of slugs the rail may show — the server orders only these, the client draws only these (§18 rule 1). No count, no rank
 * and no timestamp is ever sent: the order is the whole answer.
 */
export const RECENT_PLANS_OCCASION_SLUGS = ["date-night", "wedding", "proposal", "birthday", "travel"] as const;
export type RecentPlansOccasionSlug = (typeof RECENT_PLANS_OCCASION_SLUGS)[number];

/** The rail's heading for the marquee city. */
export const recentPlansHeading = (city: string) => `Recent plans in ${city}`;

/**
 * Pure: the rail's order from (slug, latest plan) rows. Only the listed slugs, newest first; a slug with no plan in the
 * window is left out (§13 — "recent plans" is never said of an occasion nobody planned). Ties keep the list's order.
 */
export function orderRecentPlanOccasions(rows: ReadonlyArray<{ slug: string | null; latest: Date | string | null }>): RecentPlansOccasionSlug[] {
  const allowed = new Set<string>(RECENT_PLANS_OCCASION_SLUGS);
  const latest = new Map<string, number>();
  for (const r of rows) {
    if (!r.slug || !allowed.has(r.slug) || r.latest == null) continue;
    const t = new Date(r.latest).getTime();
    if (!Number.isFinite(t)) continue;
    latest.set(r.slug, Math.max(latest.get(r.slug) ?? -Infinity, t));
  }
  return RECENT_PLANS_OCCASION_SLUGS.filter((s) => latest.has(s)).sort((a, b) => latest.get(b)! - latest.get(a)!);
}
